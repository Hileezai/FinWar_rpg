# 金融王國：Formosa Ledger Online - PostgreSQL + Socket.IO + 自訂像素素材版

這是早期網頁 RPG 風格的台灣金融業題材 MVP。此版本已把使用者提供的 8-bit 素材切圖後整合到遊戲介面，並新增每日任務題庫。

## 本版新增內容

- `public/assets/images/`：已放入職業、BOSS、裝備、道具、怪物、UI、場景等像素圖片。
- 角色與 BOSS 頁面改用圖片，不再只用 emoji。
- 戰鬥訊息改為 3～5 句敘述，包含戰鬥過程、技能、傷害、反擊與獎勵。
- 每個職業擴充為 5 個技能，包含攻擊、防禦、控制、輔助、偵查等定位。
- 新增每日任務：台灣銀行業知識問答，每日 5 題，每天只能作答一次。
- 每日任務題庫會 seed 到 PostgreSQL 的 `quiz_questions` 表，答題紀錄存到 `daily_quiz_attempts`。

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

1. GitHub 上傳整個專案。
2. Railway 建立 New Project，選 Deploy from GitHub repo。
3. 在同一個 Railway Project 新增 PostgreSQL。
4. 在 Web Service 的 Variables 設定：

```env
NODE_ENV=production
JWT_SECRET=請改成至少 32 字元以上的隨機字串
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

5. 不需要 SQLite Volume，也不需要 DB_PATH。
6. Railway 會自動提供 PORT，程式已讀取 `process.env.PORT`。

## 圖片替換方式

圖片都放在：

```text
public/assets/images/
```

常用資料夾：

```text
classes/      職業角色圖
bosses/       世界 BOSS 圖
monsters/     地下城怪物圖
equipment/    裝備圖示
items/        商店道具圖示
ui/           導覽與 UI 圖示
scenes/       場景圖
source/       原始合成圖備份
```

若要換圖，保持檔名不變直接覆蓋即可。若要改檔名，請同步修改 `server.js` 或 `public/app.js` 中對應的 image 路徑。

## Socket.IO 即時功能

目前支援：

- 世界 BOSS 即時房：玩家攻擊後會廣播 BOSS HP 與戰鬥紀錄。
- 即時競技場：玩家可進入 arena room 並廣播攻擊紀錄。
- 攻城戰 API 完成後會推播到 guild-war room。

前端已引用：

```html
<script src="/socket.io/socket.io.js"></script>
```

並透過 JWT 建立 Socket 連線：

```js
io({ auth: { token } })
```

## 每日任務資料庫

初始化時會自動建立：

```sql
quiz_questions
daily_quiz_attempts
```

`quiz_questions` 會自動寫入原創題庫。題庫參考範圍包含公平待客、洗錢防制、資訊安全社交工程防護、金融消保、內控法遵與市場風險概念。

## 注意

這仍是 MVP。若正式營運，建議再補：

- DB migration 工具，例如 Prisma / Knex
- Rate limit
- 防刷與伺服器端完整戰鬥狀態驗證
- Redis 排行榜與房間狀態快取
- HTTPS / Domain / WAF
- 題庫後台管理介面


## v1.3 更新重點

- 地下城與 BOSS 掉落裝備時，跳出「目前裝備 vs 新裝備」比較介面，可直接選擇替換或保留。
- 裝備圖示改為依部位對應：頭、衣服、褲子、鞋子分別使用獨立像素圖示，避免衣服顯示成頭盔。
- 新增 `guilds` 資料表並修正公會建立/加入流程。
- 角色介面與上方狀態列顯示目前 EXP 與升級所需 EXP。
- 新增右側 Socket.IO 即時聊天室，分為「大眾聊天室」與「公會聊天室」。
- 世界 BOSS HP 調整為原本 20 倍，並下修碎片掉落率。

### PostgreSQL 新增資料表

本版啟動時會自動建立：

```sql
guilds
chat_messages
```

不需要手動 migration；Railway 重新部署後，`server.js` 會透過 `CREATE TABLE IF NOT EXISTS` 自動建立。
