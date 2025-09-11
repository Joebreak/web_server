// 多隊列排隊管理器 - 通用排隊系統
class MultiQueueManager {
    constructor() {
        this.queues = new Map(); // 存儲多個排隊隊伍
        this.processing = new Map(); // 追蹤每個隊伍的處理狀態
        this.processors = new Map(); // 存儲每個隊伍的處理函數
        this.defaultConfig = {
            maxConcurrent: 1,
            processingDelay: 1000, // 處理間隔
            maxQueueSize: 100, // 最大排隊長度
            timeout: 30000 // 請求超時時間
        };
    }

    // 註冊隊伍的處理函數
    registerProcessor(queueKey, processorFunction, config = {}) {
        const queueConfig = { ...this.defaultConfig, ...config };
        this.queues.set(queueKey, {
            queue: [],
            config: queueConfig,
            stats: {
                totalProcessed: 0,
                totalErrors: 0,
                averageWaitTime: 0
            }
        });
        this.processing.set(queueKey, false);
        this.processors.set(queueKey, processorFunction);
        console.log(`隊伍 ${queueKey} 已註冊，配置:`, queueConfig);
    }

    // 建立或獲取排隊隊伍
    getQueue(queueKey, config = {}) {
        if (!this.queues.has(queueKey)) {
            const queueConfig = { ...this.defaultConfig, ...config };
            this.queues.set(queueKey, {
                queue: [],
                config: queueConfig,
                stats: {
                    totalProcessed: 0,
                    totalErrors: 0,
                    averageWaitTime: 0
                }
            });
            this.processing.set(queueKey, false);
        }
        return this.queues.get(queueKey);
    }

    // 添加請求到指定隊伍 (動態創建隊伍)
    async addToQueue(queueKey, request, env, ctx, processorFunction, config = {}) {
        // 如果隊伍不存在，動態創建
        if (!this.queues.has(queueKey)) {
            this.registerProcessor(queueKey, processorFunction, config);
        }

        const queue = this.queues.get(queueKey);
        
        // 檢查排隊長度限制
        if (queue.queue.length >= queue.config.maxQueueSize) {
            throw new Error(`排隊隊伍 ${queueKey} 已滿，最大長度: ${queue.config.maxQueueSize}`);
        }

        return new Promise((resolve, reject) => {
            const queueItem = {
                id: `${queueKey}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                request,
                env,
                ctx,
                resolve,
                reject,
                timestamp: Date.now(),
                queueKey
            };

            queue.queue.push(queueItem);
            console.log(`請求已加入隊伍 ${queueKey}，目前排隊長度: ${queue.queue.length}`);

            // 開始處理這個隊伍
            this.processQueue(queueKey);
        });
    }

    // 處理指定隊伍的排隊
    async processQueue(queueKey) {
        const queue = this.queues.get(queueKey);
        if (!queue || this.processing.get(queueKey) || queue.queue.length === 0) {
            return;
        }

        this.processing.set(queueKey, true);
        console.log(`開始處理隊伍 ${queueKey}`);

        while (queue.queue.length > 0) {
            const queueItem = queue.queue.shift();
            const startTime = Date.now();
            
            console.log(`處理請求 ID: ${queueItem.id} (隊伍: ${queueKey})`);

            try {
                // 根據配置設定處理間隔
                if (queue.config.processingDelay > 0) {
                    await new Promise(resolve => setTimeout(resolve, queue.config.processingDelay));
                }

                // 設定超時
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('請求處理超時')), queue.config.timeout);
                });

                // 執行外部傳入的處理函數
                const processor = this.processors.get(queueKey);
                if (!processor) {
                    throw new Error(`隊伍 ${queueKey} 沒有註冊處理函數`);
                }

                const processPromise = processor(queueItem.request, queueItem.env, queueItem.ctx, queueKey);
                const result = await Promise.race([processPromise, timeoutPromise]);
                
                queueItem.resolve(result);
                
                // 更新統計資料
                const processingTime = Date.now() - startTime;
                queue.stats.totalProcessed++;
                queue.stats.averageWaitTime = (queue.stats.averageWaitTime + processingTime) / 2;

            } catch (error) {
                console.error(`處理請求 ${queueItem.id} 失敗:`, error);
                queue.stats.totalErrors++;
                queueItem.reject(error);
            }
        }

        this.processing.set(queueKey, false);
        console.log(`隊伍 ${queueKey} 處理完成`);
    }

    // 獲取隊伍狀態
    getQueueStatus(queueKey = null) {
        if (queueKey) {
            const queue = this.queues.get(queueKey);
            if (!queue) return null;
            
            return {
                queueKey,
                queueLength: queue.queue.length,
                processing: this.processing.get(queueKey),
                config: queue.config,
                stats: queue.stats
            };
        }

        // 返回所有隊伍狀態
        const allStatus = {};
        for (const [key, queue] of this.queues) {
            allStatus[key] = {
                queueLength: queue.queue.length,
                processing: this.processing.get(key),
                config: queue.config,
                stats: queue.stats
            };
        }
        return allStatus;
    }

    // 清空指定隊伍
    clearQueue(queueKey) {
        const queue = this.queues.get(queueKey);
        if (queue) {
            queue.queue.length = 0;
            console.log(`隊伍 ${queueKey} 已清空`);
        }
    }

    // 清空所有隊伍
    clearAllQueues() {
        for (const [key, queue] of this.queues) {
            queue.queue.length = 0;
        }
        console.log('所有隊伍已清空');
    }

    // 輔助函數：JSON 回應
    jsonResponse(data, status = 200) {
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
    errorResponse(message, status = 400) {
        return this.jsonResponse({ error: message }, status);
    }

    // 獲取所有隊伍的配置資訊
    getQueueConfigs() {
        const configs = {};
        for (const [key, queue] of this.queues) {
            configs[key] = {
                maxConcurrent: queue.config.maxConcurrent,
                processingDelay: `${queue.config.processingDelay}ms`,
                maxQueueSize: queue.config.maxQueueSize,
                timeout: `${queue.config.timeout}ms`
            };
        }
        return configs;
    }
}

// 匯出排隊管理器
export { MultiQueueManager };
