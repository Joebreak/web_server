# Cloudflare Workers API

一個使用 Cloudflare Workers 建立的 REST API 伺服器，提供用戶管理功能。

## 🚀 功能特色

- ✅ 完整的 CRUD 操作 (創建、讀取、更新、刪除)
- ✅ RESTful API 設計
- ✅ JSON 資料格式
- ✅ CORS 支援
- ✅ 錯誤處理
- ✅ 中文介面

## 📋 API 端點

### 基本端點
- `GET /` - 首頁 (簡潔歡迎訊息)
- `GET /api/docs` - API 文檔
- `GET /api/health` - 健康檢查

### 用戶管理
- `GET /api/users` - 獲取所有用戶
- `GET /api/users/:id` - 獲取特定用戶
- `POST /api/users` - 創建新用戶
- `PUT /api/users/:id` - 更新用戶
- `DELETE /api/users/:id` - 刪除用戶

## 🛠️ 本地開發

### 前置需求
- Node.js (版本 16 或更高)
- npm 或 yarn

### 安裝依賴
```bash
npm install
```

### 啟動開發伺服器
```bash
npm run dev
```

伺服器將在 `http://localhost:8787` 啟動

### 部署到 Cloudflare
```bash
npm run deploy
```

## 📝 使用範例

### 創建新用戶
```bash
curl -X POST http://localhost:8787/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "張三",
    "email": "zhang@example.com",
    "age": 25
  }'
```

### 獲取所有用戶
```bash
curl http://localhost:8787/api/users
```

### 更新用戶
```bash
curl -X PUT http://localhost:8787/api/users/1 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "張三更新",
    "age": 30
  }'
```

## 🔧 專案結構

```
web_server/
├── worker.js          # 主要程式碼
├── package.json       # 專案配置
├── wrangler.toml      # Cloudflare Workers 配置
├── README.md          # 專案說明
└── .gitignore         # Git 忽略檔案
```

## 🌐 部署到 GitHub

1. 將程式碼推送到 GitHub
2. 在 Cloudflare Dashboard 中設定 GitHub 整合
3. 設定環境變數 (如需要)
4. 自動部署將在每次推送時觸發

## 📄 授權

MIT License

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

