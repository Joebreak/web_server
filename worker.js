
// 資料庫操作函數 - 使用 Cloudflare D1
async function initDatabase(db) {
  try {
    // 創建用戶表
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        age INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 創建索引
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `);
    
    return true;
  } catch (error) {
    console.error('資料庫初始化失敗:', error);
    return false;
  }
}

async function getAllUsers(db) {
  try {
    const result = await db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
    return result.results || [];
  } catch (error) {
    console.error('獲取用戶資料失敗:', error);
    return [];
  }
}

async function getUserById(db, id) {
  try {
    const result = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    return result;
  } catch (error) {
    console.error('獲取用戶資料失敗:', error);
    return null;
  }
}

async function createUser(db, userData) {
  try {
    const result = await db.prepare(`
      INSERT INTO users (name, email, age) 
      VALUES (?, ?, ?)
    `).bind(userData.name, userData.email, userData.age).run();
    
    return {
      id: result.meta.last_row_id,
      ...userData,
      created_at: new Date().toISOString()
    };
  } catch (error) {
    console.error('創建用戶失敗:', error);
    throw error;
  }
}

async function updateUser(db, id, userData) {
  try {
    const result = await db.prepare(`
      UPDATE users 
      SET name = COALESCE(?, name), 
          email = COALESCE(?, email), 
          age = COALESCE(?, age),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(userData.name, userData.email, userData.age, id).run();
    
    return result.meta.changes > 0;
  } catch (error) {
    console.error('更新用戶失敗:', error);
    throw error;
  }
}

async function deleteUser(db, id) {
  try {
    const result = await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return result.meta.changes > 0;
  } catch (error) {
    console.error('刪除用戶失敗:', error);
    throw error;
  }
}

// 輔助函數：解析 URL 路徑
function parseUrl(url) {
  const urlObj = new URL(url);
  const path = urlObj.pathname;
  const method = urlObj.method || 'GET';
  return { path, method };
}

// 輔助函數：解析路由參數
function parseRoute(route, path) {
    const routeParts = route.split('/');
    const pathParts = path.split('/');

    if (routeParts.length !== pathParts.length) return null;

    const params = {};
    for (let i = 0; i < routeParts.length; i++) {
        if (routeParts[i].startsWith(':')) {
            const paramName = routeParts[i].substring(1);
            params[paramName] = pathParts[i];
        } else if (routeParts[i] !== pathParts[i]) {
            return null;
        }
    }

    return params;
}

// 輔助函數：JSON 回應
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
    });
}

// 輔助函數：錯誤回應
function errorResponse(message, status = 400) {
    return jsonResponse({ error: message }, status);
}

// 輔助函數：解析請求體
async function parseRequestBody(request) {
    try {
        const contentType = request.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await request.json();
        }
        return {};
    } catch (error) {
        return {};
    }
}

// 輔助函數：呼叫外部 API
async function callExternalAPI(url, options = {}) {
  try {
    const defaultOptions = {
      method: 'GET',
      headers: {
        'User-Agent': 'Cloudflare-Worker-API/1.0',
        'Accept': 'application/json',
        ...options.headers
      },
      timeout: 10000 // 10 秒超時
    };

    const response = await fetch(url, { ...defaultOptions, ...options });
    
    if (!response.ok) {
      throw new Error(`外部 API 錯誤: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // 直接回傳原始資料，不包裝額外資訊
    return data;
  } catch (error) {
    console.error('外部 API 呼叫失敗:', error);
    return {
      success: false,
      error: error.message,
      status: 500
    };
  }
}

export default {
    async fetch(request, env, ctx) {
        const { path, method } = parseUrl(request.url);

        // 處理 CORS 預檢請求
        if (method === 'OPTIONS') {
            return new Response(null, {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                }
            });
        }
        try {
            // 初始化資料庫
            await initDatabase(env.DB);

            // 外部 API 代理端點
            if (path.startsWith('/api/external')) {
                if (path === '/api/external/weather' && method === 'GET') {
                    const url = new URL(request.url);
                    const recordId = url.searchParams.get('id') || '2';
                    const authToken = url.searchParams.get('token') || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwiZXhwIjoxNzU2OTc1MzYzfQ.cZNU2QHetZR2Jps9o-035mAntpE6SmnsovxzQ0ob4Mc';
                    const internalAPI = `http://192.168.0.213:20218/api/admin/voter/visitRecord/${recordId}`;

                    const result = await callExternalAPI(internalAPI, {
                        headers: {
                            'Authorization': `Bearer ${authToken}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    // console.log(JSON.parse(json.data.description ?? "{}"));
                    return jsonResponse(JSON.parse(result.data.description ?? "{}"));
                }
            }

            // 根路徑 - 簡潔歡迎頁面
            if (path === '/') {
                return jsonResponse({
                    message: '歡迎使用 Cloudflare Workers API',
                    version: '1.0.0',
                    status: 'running',
                });
            }


            // 404 - 未找到路由
            return errorResponse('端點不存在', 404);

        } catch (error) {
            console.error('API 錯誤:', error);
            return errorResponse('伺服器內部錯誤', 500);
        }
    }
};