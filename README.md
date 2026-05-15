# 金融王國：Formosa Ledger Online - PostgreSQL + Socket.IO 版

這是早期網頁 RPG 風格的台灣金融業題材 MVP。

## 技術

- Frontend: HTML / CSS / JavaScript
- Backend: Node.js / Express
- Realtime: Socket.IO
- Database: PostgreSQL
- Auth: bcryptjs + JWT

## 本機啟動

1. 安裝 Node.js 20+
2. 準備 PostgreSQL，建立資料庫 `finance_rpg`
3. 複製 `.env.example` 成 `.env`
4. 設定：

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=change_this_to_a_long_random_secret
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/finance_rpg
```

5. 執行：

```bash
npm install
npm run dev
```

6. 打開：

```text
http://localhost:3000
```

## Railway 部署重點

1. GitHub 上傳整個專案
2. Railway 建立 New Project，選 Deploy from GitHub repo
3. 在同一個 Railway Project 新增 PostgreSQL
4. 在 Web Service 的 Variables 設定：

```env
NODE_ENV=production
JWT_SECRET=請改成至少 32 字元以上的隨機字串
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

5. 不需要 SQLite Volume，也不需要 DB_PATH。
6. Railway 會自動提供 PORT，程式已讀取 `process.env.PORT`。

## Socket.IO 即時功能

目前支援：

- 世界 BOSS 即時房：玩家攻擊後會廣播 BOSS HP 與戰鬥紀錄
- 即時競技場：玩家可進入 arena room 並廣播攻擊紀錄
- 攻城戰 API 完成後會推播到 guild-war room

前端已引用：

```html
<script src="/socket.io/socket.io.js"></script>
```

並透過 JWT 建立 Socket 連線：

```js
io({ auth: { token } })
```

## 注意

這仍是 MVP。若正式營運，建議再補：

- DB migration 工具，例如 Prisma / Knex
- Rate limit
- 防刷與伺服器端完整戰鬥狀態驗證
- Redis 排行榜與房間狀態快取
- HTTPS / Domain / WAF
