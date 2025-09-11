// 資料庫操作模組
export class DatabaseManager {
    constructor(env) {
        this.env = env;
    }

    // 查詢資料
    async query(sql, params = []) {
        try {
            return await this.env.DB.prepare(sql).bind(...params).all();
        } catch (error) {
            console.error('D1 查詢錯誤:', error);
            throw error;
        }
    }

    // 執行 SQL (INSERT, UPDATE, DELETE)
    async execute(sql, params = []) {
        try {
            return await this.env.DB.prepare(sql).bind(...params).run();
        } catch (error) {
            console.error('D1 執行錯誤:', error);
            throw error;
        }
    }

    // 新增資料
    async insert(table, data) {
        const columns = Object.keys(data);
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map(col => data[col]);
        
        const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
        console.log('執行 INSERT SQL:', sql, '參數:', values);
        
        const result = await this.execute(sql, values);
        return {
            success: true,
            message: '資料新增成功',
            data: result,
            inserted_id: result.meta?.last_row_id
        };
    }

    // 更新資料
    async update(table, data, where) {
        const setClause = Object.keys(data).map(col => `${col} = ?`).join(', ');
        const whereClause = Object.keys(where).map(col => `${col} = ?`).join(' AND ');
        
        const values = [
            ...Object.values(data),
            ...Object.values(where)
        ];
        
        const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
        console.log('執行 UPDATE SQL:', sql, '參數:', values);
        
        const result = await this.execute(sql, values);
        return {
            success: true,
            message: '資料更新成功',
            data: result,
            changes: result.meta?.changes
        };
    }

    // 刪除資料
    async delete(table, where) {
        const whereClause = Object.keys(where).map(col => `${col} = ?`).join(' AND ');
        const values = Object.values(where);
        
        const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
        console.log('執行 DELETE SQL:', sql, '參數:', values);
        
        const result = await this.execute(sql, values);
        return {
            success: true,
            message: '資料刪除成功',
            data: result,
            changes: result.meta?.changes
        };
    }

    // 檢查資料表是否存在
    async tableExists(tableName) {
        const result = await this.query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
            [tableName]
        );
        return result.results.length > 0;
    }

    // 取得所有資料表名稱
    async getTables() {
        const result = await this.query("SELECT name FROM sqlite_master WHERE type='table'");
        return result.results.map(row => row.name);
    }

    // 取得資料表結構
    async getTableSchema(tableName) {
        const result = await this.query(`PRAGMA table_info(${tableName})`);
        return result.results;
    }
}
