# Cloudflare Workers API

## 事前準備

1. 安裝 [Node.js](https://nodejs.org/)（建議 LTS）
2. 安裝依賴：

```bash
npm install
```

3. **初始化本地 D1 資料表**

```bash
npx wrangler d1 execute data --local --file=./schema.sql
```

## 啟動

```bash
npm start
```

或雙擊 `run.bat`。
