/**
 * Cloudflare Workers API Server
 * 
 * 提供多個 REST API 端點
 * - GET /api/users - 獲取所有用戶
 * - GET /api/users/:id - 獲取特定用戶
 * - POST /api/users - 創建新用戶
 * - PUT /api/users/:id - 更新用戶
 * - DELETE /api/users/:id - 刪除用戶
 * - GET /api/health - 健康檢查
 */

// 模擬資料庫
let users = [
  { id: 1, name: "張三", email: "zhang@example.com", age: 25 },
  { id: 2, name: "李四", email: "li@example.com", age: 30 },
  { id: 3, name: "王五", email: "wang@example.com", age: 28 }
];

let nextId = 4;

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
    
    // 路由處理
    try {
      // 健康檢查端點
      if (path === '/api/health') {
        return jsonResponse({ 
          status: 'healthy', 
          timestamp: new Date().toISOString(),
          uptime: 'running'
        });
      }
      
      // 用戶相關端點
      if (path.startsWith('/api/users')) {
        // GET /api/users - 獲取所有用戶
        if (path === '/api/users' && method === 'GET') {
          return jsonResponse({ 
            users, 
            total: users.length 
          });
        }
        
        // POST /api/users - 創建新用戶
        if (path === '/api/users' && method === 'POST') {
          const body = await parseRequestBody(request);
          
          if (!body.name || !body.email) {
            return errorResponse('姓名和電子郵件為必填欄位', 400);
          }
          
          const newUser = {
            id: nextId++,
            name: body.name,
            email: body.email,
            age: body.age || null
          };
          
          users.push(newUser);
          return jsonResponse({ 
            message: '用戶創建成功', 
            user: newUser 
          }, 201);
        }
        
        // 解析帶參數的路由
        const userParams = parseRoute('/api/users/:id', path);
        if (userParams) {
          const userId = parseInt(userParams.id);
          const user = users.find(u => u.id === userId);
          
          if (!user) {
            return errorResponse('用戶不存在', 404);
          }
          
          // GET /api/users/:id - 獲取特定用戶
          if (method === 'GET') {
            return jsonResponse({ user });
          }
          
          // PUT /api/users/:id - 更新用戶
          if (method === 'PUT') {
            const body = await parseRequestBody(request);
            
            const updatedUser = {
              ...user,
              name: body.name || user.name,
              email: body.email || user.email,
              age: body.age !== undefined ? body.age : user.age
            };
            
            const userIndex = users.findIndex(u => u.id === userId);
            users[userIndex] = updatedUser;
            
            return jsonResponse({ 
              message: '用戶更新成功', 
              user: updatedUser 
            });
          }
          
          // DELETE /api/users/:id - 刪除用戶
          if (method === 'DELETE') {
            users = users.filter(u => u.id !== userId);
            return jsonResponse({ 
              message: '用戶刪除成功' 
            });
          }
        }
      }
      
      // 根路徑 - 簡潔歡迎頁面
      if (path === '/') {
        return jsonResponse({
          message: '歡迎使用 Cloudflare Workers API',
          version: '1.0.0',
          status: 'running',
          documentation: '/api/docs'
        });
      }
      
      // API 文檔端點
      if (path === '/api/docs') {
        return jsonResponse({
          title: 'API 文檔',
          version: '1.0.0',
          endpoints: {
            'GET /api/health': '健康檢查',
            'GET /api/users': '獲取所有用戶',
            'GET /api/users/:id': '獲取特定用戶',
            'POST /api/users': '創建新用戶',
            'PUT /api/users/:id': '更新用戶',
            'DELETE /api/users/:id': '刪除用戶'
          },
          examples: {
            'POST /api/users': {
              method: 'POST',
              url: '/api/users',
              headers: {
                'Content-Type': 'application/json'
              },
              body: {
                name: '新用戶',
                email: 'new@example.com',
                age: 25
              }
            },
            'GET /api/users': {
              method: 'GET',
              url: '/api/users'
            }
          }
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