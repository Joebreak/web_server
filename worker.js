
// 匯入多隊列排隊管理器
import { MultiQueueManager } from './queue-manager.js';
// 匯入資料庫管理器
import { DatabaseManager } from './database.js';

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

// 資料庫操作輔助函數已移至 database.js

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
        const d1Params = parsePathParams('/api/{db}/list', path);
        if (d1Params && method === 'GET') {
            try {
                if (!env.DB) {
                    console.error('D1 資料庫未配置');
                    return errorResponse('D1 資料庫未配置', 500);
                }
                // 解析查詢參數
                const url = new URL(request.url);
                const searchParams = url.searchParams;

                // 建立 WHERE 條件
                let whereConditions = [];
                let params = [];
                let searchFields = [];

                // 只有當有查詢參數時才去取得欄位資訊
                if (searchParams.size > 0) {
                    const db = new DatabaseManager(env);
                    let columnTypes = {};

                    try {
                        // 取得資料表結構
                        const schemaResult = await db.query(`PRAGMA table_info(${d1Params.db})`, []);
                        searchFields = schemaResult.results.map(column => column.name);

                        // 建立欄位類型對應表
                        columnTypes = {};
                        schemaResult.results.forEach(column => {
                            columnTypes[column.name] = column.type.toUpperCase();
                        });

                        console.log(`資料表 ${d1Params.db} 的欄位:`, searchFields);
                        console.log(`欄位類型:`, columnTypes);
                    } catch (error) {
                        console.warn(`無法取得資料表 ${d1Params.db} 的欄位資訊:`, error);
                        // 如果無法取得欄位資訊，使用預設欄位
                        searchFields = ['id'];
                        columnTypes = { id: 'INTEGER' };
                    }

                    for (const field of searchFields) {
                        const value = searchParams.get(field);
                        if (value !== null && value !== '') {
                            whereConditions.push(`${field} = ?`);

                            // 根據資料庫欄位類型決定是否轉為數值
                            const fieldType = columnTypes[field] || '';
                            const isNumericField = fieldType.includes('INT') ||
                                fieldType.includes('REAL') ||
                                fieldType.includes('NUMERIC') ||
                                fieldType.includes('DECIMAL');

                            console.log(`欄位 ${field} 類型: ${fieldType}, 是否為數值: ${isNumericField}`);
                            params.push(isNumericField ? parseFloat(value) : value);
                        }
                    }
                }
                let sql = `SELECT * FROM ${d1Params.db}`;
                if (whereConditions.length > 0) {
                    sql += ' WHERE ' + whereConditions.join(' AND ');
                }

                const db = new DatabaseManager(env);
                const result = await db.query(sql, params);

                const processedData = (result.results || result).map(item => {
                    const processedItem = { ...item };
                    if (processedItem.list && typeof processedItem.list === 'string') {
                        try {
                            processedItem.list = JSON.parse(processedItem.list);
                        } catch (e) {
                            console.warn('list 欄位 JSON 解析失敗:', e);
                        }
                    }
                    if (processedItem.data && typeof processedItem.data === 'string') {
                        try {
                            processedItem.data = JSON.parse(processedItem.data);
                        } catch (e) {
                            console.warn('data 欄位 JSON 解析失敗:', e);
                        }
                    }
                    return processedItem;
                });
                let columnTypes = {};
                if (searchParams.size > 0) {
                    try {
                        const schemaResult = await db.query(`PRAGMA table_info(${d1Params.db})`, []);
                        schemaResult.results.forEach(column => {
                            columnTypes[column.name] = column.type.toUpperCase();
                        });
                    } catch (error) {
                        console.warn('無法取得欄位類型資訊:', error);
                    }
                }
                return jsonResponse({
                    success: true,
                    data: processedData,
                });
            } catch (error) {
                console.error('D1 查詢錯誤:', error);
                return errorResponse(`資料庫查詢失敗: ${error.message}`, 500);
            }
        }
        const d4Params = parsePathParams('/api/{db}', path);
        if (d4Params && method === 'POST') {
            try {
                if (!env.DB) {
                    console.error('D1 資料庫未配置');
                    return errorResponse('D1 資料庫未配置', 500);
                }
                const body = await parseRequestBody(request);
                if (!body || Object.keys(body).length === 0) {
                    return errorResponse('請提供要新增的資料', 400);
                }
                const processedBody = { ...body };
                if (processedBody.list && Array.isArray(processedBody.list)) {
                    processedBody.list = JSON.stringify(processedBody.list);
                }
                if (processedBody.data && typeof processedBody.data === 'object') {
                    processedBody.data = JSON.stringify(processedBody.data);
                }

                const db = new DatabaseManager(env);
                await db.insert(d4Params.db, processedBody);

                return jsonResponse({
                    success: true,
                    message: '資料新增成功'
                });
            } catch (error) {
                console.error('D1 新增錯誤:', error);
                return errorResponse(`資料新增失敗: ${error.message}`, 500);
            }
        }
        const d2Params = parsePathParams('/api/{db}/{id}', path);
        if (d2Params && method === 'PUT') {
            try {
                if (!env.DB) {
                    console.error('D1 資料庫未配置');
                    return errorResponse('D1 資料庫未配置', 500);
                }

                const body = await parseRequestBody(request);
                if (!body || Object.keys(body).length === 0) {
                    return errorResponse('請提供要更新的資料', 400);
                }
                const processedBody = { ...body };
                if (processedBody.list && Array.isArray(processedBody.list)) {
                    processedBody.list = JSON.stringify(processedBody.list);
                }
                if (processedBody.data && typeof processedBody.data === 'object') {
                    processedBody.data = JSON.stringify(processedBody.data);
                }

                const db = new DatabaseManager(env);
                await db.update(d2Params.db, processedBody, { id: parseInt(d2Params.id) });
                return jsonResponse({
                    success: true,
                    message: '資料更新成功'
                });
            } catch (error) {
                console.error('D1 更新錯誤:', error);
                return errorResponse(`資料更新失敗: ${error.message}`, 500);
            }
        }
        const d3Params = parsePathParams('/api/{db}/{id}', path);
        if (d3Params && method === 'DELETE') {
            try {
                if (!env.DB) {
                    console.error('D1 資料庫未配置');
                    return errorResponse('D1 資料庫未配置', 500);
                }

                const db = new DatabaseManager(env);
                await db.delete(d3Params.db, { id: parseInt(d3Params.id) });

                return jsonResponse({
                    success: true,
                    message: '資料刪除成功',
                });
            } catch (error) {
                console.error('D1 刪除錯誤:', error);
                return errorResponse(`資料刪除失敗: ${error.message}`, 500);
            }
        }
        const d5Params = parsePathParams('/api/{db}/{id}', path);
        if (d5Params && method === 'GET') {
            try {
                if (!env.DB) {
                    console.error('D1 資料庫未配置');
                    return errorResponse('D1 資料庫未配置', 500);
                }

                const db = new DatabaseManager(env);
                const result = await db.query(`SELECT * FROM ${d5Params.db} WHERE id = ?`, [parseInt(d5Params.id)]);

                if (!result.results || result.results.length === 0) {
                    return errorResponse('找不到指定的資料', 404);
                }
                const processedData = result.results.map(item => {
                    const processedItem = { ...item };
                    if (processedItem.list && typeof processedItem.list === 'string') {
                        try {
                            processedItem.list = JSON.parse(processedItem.list);
                        } catch (e) {
                            console.warn('list 欄位 JSON 解析失敗:', e);
                        }
                    }
                    if (processedItem.data && typeof processedItem.data === 'string') {
                        try {
                            processedItem.data = JSON.parse(processedItem.data);
                        } catch (e) {
                            console.warn('data 欄位 JSON 解析失敗:', e);
                        }
                    }
                    return processedItem;
                });

                return jsonResponse(processedData[0]);
            } catch (error) {
                console.error('D1 查詢錯誤:', error);
                return errorResponse(`資料查詢失敗: ${error.message}`, 500);
            }
        }
        const d6Params = parsePathParams('/api/{db}/room/{room}', path);
        if (d6Params && method === 'GET') {
            try {
                if (!env.DB) {
                    console.error('D1 資料庫未配置');
                    return errorResponse('D1 資料庫未配置', 500);
                }

                const db = new DatabaseManager(env);
                // 查詢 room 欄位等於指定數字的記錄
                const result = await db.query(`SELECT * FROM ${d6Params.db} WHERE room = ?`, [parseInt(d6Params.room)]);

                if (!result.results || result.results.length === 0) {
                    return errorResponse('找不到指定的資料', 404);
                }
                const processedData = result.results.map(item => {
                    const processedItem = { ...item };
                    if (processedItem.list && typeof processedItem.list === 'string') {
                        try {
                            processedItem.list = JSON.parse(processedItem.list);
                        } catch (e) {
                            console.warn('list 欄位 JSON 解析失敗:', e);
                        }
                    }
                    if (processedItem.data && typeof processedItem.data === 'string') {
                        try {
                            processedItem.data = JSON.parse(processedItem.data);
                        } catch (e) {
                            console.warn('data 欄位 JSON 解析失敗:', e);
                        }
                    }
                    return processedItem;
                });

                return jsonResponse(processedData);
            } catch (error) {
                console.error('D1 查詢錯誤:', error);
                return errorResponse(`資料查詢失敗: ${error.message}`, 500);
            }
        }
        const d7Params = parsePathParams('/api/{db}/room/{room}/{round}', path);
        if (d7Params && method === 'GET') {
            try {
                if (!env.DB) {
                    console.error('D1 資料庫未配置');
                    return errorResponse('D1 資料庫未配置', 500);
                }

                const db = new DatabaseManager(env);
                // 查詢 room 和 round 欄位都等於指定值的記錄
                const result = await db.query(`SELECT * FROM ${d7Params.db} WHERE room = ? AND round = ?`, [parseInt(d7Params.room), parseInt(d7Params.round)]);

                if (!result.results || result.results.length === 0) {
                    return errorResponse('找不到指定的資料', 404);
                }
                const processedData = result.results.map(item => {
                    const processedItem = { ...item };
                    if (processedItem.list && typeof processedItem.list === 'string') {
                        try {
                            processedItem.list = JSON.parse(processedItem.list);
                        } catch (e) {
                            console.warn('list 欄位 JSON 解析失敗:', e);
                        }
                    }
                    if (processedItem.data && typeof processedItem.data === 'string') {
                        try {
                            processedItem.data = JSON.parse(processedItem.data);
                        } catch (e) {
                            console.warn('data 欄位 JSON 解析失敗:', e);
                        }
                    }
                    return processedItem;
                });

                return jsonResponse(processedData[0]);
            } catch (error) {
                console.error('D1 查詢錯誤:', error);
                return errorResponse(`資料查詢失敗: ${error.message}`, 500);
            }
        }
        const d8Params = parsePathParams('/api/{db}/room/{room}', path);
        if (d8Params && method === 'POST') {
            try {
                if (!env.DB) {
                    console.error('D1 資料庫未配置');
                    return errorResponse('D1 資料庫未配置', 500);
                }
                const body = await parseRequestBody(request);
                if (!body || Object.keys(body).length === 0) {
                    return errorResponse('請提供要新增的資料', 400);
                }
                
                // 將 room 參數添加到請求體中
                const processedBody = { ...body, room: parseInt(d8Params.room) };
                
                // 處理其他欄位的 JSON 轉換
                if (processedBody.list && Array.isArray(processedBody.list)) {
                    processedBody.list = JSON.stringify(processedBody.list);
                }
                if (processedBody.data && typeof processedBody.data === 'object') {
                    processedBody.data = JSON.stringify(processedBody.data);
                }

                const db = new DatabaseManager(env);
                await db.insert(d8Params.db, processedBody);

                return jsonResponse({
                    success: true,
                    message: '資料新增成功'
                });
            } catch (error) {
                console.error('D1 新增錯誤:', error);
                return errorResponse(`資料新增失敗: ${error.message}`, 500);
            }
        }
        const d9Params = parsePathParams('/api/{db}/room/{room}/{round}', path);
        if (d9Params && method === 'DELETE') {
            try {
                if (!env.DB) {
                    console.error('D1 資料庫未配置');
                    return errorResponse('D1 資料庫未配置', 500);
                }

                const db = new DatabaseManager(env);
                await db.delete(d9Params.db, { 
                    room: parseInt(d9Params.room), 
                    round: parseInt(d9Params.round) 
                });

                return jsonResponse({
                    success: true,
                    message: '資料刪除成功'
                });
            } catch (error) {
                console.error('D1 刪除錯誤:', error);
                return errorResponse(`資料刪除失敗: ${error.message}`, 500);
            }
        }
        const d10Params = parsePathParams('/api/{db}/room/{room}', path);
        if (d10Params && method === 'DELETE') {
            try {
                if (!env.DB) {
                    console.error('D1 資料庫未配置');
                    return errorResponse('D1 資料庫未配置', 500);
                }

                const db = new DatabaseManager(env);
                await db.delete(d10Params.db, { 
                    room: parseInt(d10Params.room), 
                });

                return jsonResponse({
                    success: true,
                    message: '資料刪除成功'
                });
            } catch (error) {
                console.error('D1 刪除錯誤:', error);
                return errorResponse(`資料刪除失敗: ${error.message}`, 500);
            }
        }
        if (path === '/api/db/query' && method === 'POST') {
            try {
                const body = await parseRequestBody(request);
                if (!env.DB) {
                    console.error('D1 資料庫未配置');
                    return errorResponse('D1 資料庫未配置', 500);
                }
                const db = new DatabaseManager(env);
                const result = await db.query(body.sql, body.params || []);
                return jsonResponse({
                    success: true,
                    data: result.results || result,
                    meta: result.meta || {},
                    raw: result
                });
            } catch (error) {
                console.error('D1 查詢錯誤:', error);
                return errorResponse(`資料庫查詢失敗: ${error.message}`, 500);
            }
        }
        // if (path === '/api/db/execute' && method === 'POST') {
        //     try {
        //         const body = await parseRequestBody(request);
        //         const db = new DatabaseManager(env);
        //         const result = await db.execute(body.sql, body.params || []);
        //         return jsonResponse({
        //             success: true,
        //             data: result
        //         });
        //     } catch (error) {
        //         console.error('D1 執行錯誤:', error);
        //         return errorResponse('資料庫執行失敗', 500);
        //     }
        // }
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