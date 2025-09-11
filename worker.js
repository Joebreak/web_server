
// 匯入多隊列排隊管理器
import { MultiQueueManager } from './queue-manager.js';

// 全域多隊列排隊管理器
const queueManager = new MultiQueueManager();

// 輔助函數：解析 URL 路徑
function parseUrl(url) {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    return { path };
}

// 輔助函數：解析路徑參數
function parsePathParams(pattern, path) {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');
    
    if (patternParts.length !== pathParts.length) {
        return null;
    }
    
    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith('{') && patternParts[i].endsWith('}')) {
            const paramName = patternParts[i].slice(1, -1); // 移除 { }
            params[paramName] = pathParts[i];
        } else if (patternParts[i] !== pathParts[i]) {
            return null; // 路徑不匹配
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
            method: 'GET', // 預設為 GET
            headers: {
                'User-Agent': 'Cloudflare-Worker-API/1.0',
                'Accept': 'application/json'
            },
            timeout: 10000 // 10 秒超時
        };
        // 合併選項，確保 method 和 body 都正確傳遞
        const fetchOptions = { 
            ...defaultOptions, 
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };
        const response = await fetch(url, fetchOptions);

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
        const { path } = parseUrl(request.url);
        const method = request.method;

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
        if (path === '/api/user' && method === 'GET') {
            const url = new URL(request.url);
            const authToken = url.searchParams.get('token') || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwiZXhwIjoxNzU2OTc1MzYzfQ.cZNU2QHetZR2Jps9o-035mAntpE6SmnsovxzQ0ob4Mc';
            const internalAPI = `https://voter.dev.box70000.com/api/admin/voter/visitRecord/2`;
            try {
               
                const result = await callExternalAPI(internalAPI, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    }
                });
                if (result && result.data && result.data.description) {
                    try {
                        return jsonResponse(JSON.parse(result.data.description));
                    } catch (parseError) {
                        return jsonResponse({
                            error: '資料解析失敗',
                            raw: result.data.description,
                            parseError: parseError.message
                        });
                    }
                }

                return jsonResponse(result);
            } catch (apiError) {
                console.error('用戶 API 錯誤:', apiError);
                return jsonResponse({
                    error: '用戶 API 呼叫失敗',
                    message: apiError.message
                });
            }
        }
        
        // 用戶 API - 支援路徑參數 /api/user/{id}
        const userParams = parsePathParams('/api/user/{id}', path);
        if (userParams && method === 'POST') {
            try {
                return await queueManager.addToQueue('user-api', request, env, ctx, async (req, env, ctx, queueKey) => {
                    // 解析請求 body
                    const body = await parseRequestBody(req);
                    
                    // 從路徑參數獲取 id，從 body 或 query 參數獲取 token
                    const url = new URL(req.url);
                    const authToken = body.token || url.searchParams.get('token') || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwiZXhwIjoxNzU2OTc1MzYzfQ.cZNU2QHetZR2Jps9o-035mAntpE6SmnsovxzQ0ob4Mc';
                    const internalAPI = `https://voter.dev.box70000.com/api/admin/voter/visitRecord/${userParams.id}`;
                    
                    try {
                        const transformedBody = {
                            "description": JSON.stringify(body)
                        };
                        
                        const apiOptions = {
                            method: 'PATCH',
                            headers: {
                                'Authorization': `Bearer ${authToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(transformedBody)
                        };

                        const result = await callExternalAPI(internalAPI, apiOptions);

                        return jsonResponse(result);
                    } catch (apiError) {
                        console.error('用戶 API 錯誤:', apiError);
                        return jsonResponse({
                            error: '用戶 API 呼叫失敗',
                            message: apiError.message
                        });
                    }
                }, {
                    maxConcurrent: 1,
                    processingDelay: 1000,
                    maxQueueSize: 50,
                    timeout: 30000
                });
            } catch (error) {
                console.error('用戶 API 排隊處理錯誤:', error);
                return errorResponse('用戶 API 排隊處理失敗', 500);
            }
        }
        try {
            if (path === '/') {
                return jsonResponse({
                    message: '歡迎使用 Cloudflare Workers API',
                    version: '1.0.0',
                    status: 'running'
                });
            }

            return errorResponse('端點不存在', 404);

        } catch (error) {
            console.error('API 錯誤:', error);
            return errorResponse('伺服器內部錯誤', 500);
        }
    }
};