# Cloudflare Pages + D1 伺服器

提供擴充功能的同步 API 與管理後台。

## 功能

- `/api/extension-login`：擴充功能以使用者 ID / 密碼換取 7 天有效的上傳 token
- `/api/ingest`：接收擴充功能上傳的紀錄
- `/admin`：管理頁（Google 登入，限 `ADMIN_EMAILS`）
  - 搜尋、依網站 / 類型篩選所有紀錄，匯出 JSON
  - 新增、更新密碼、停用、刪除同步帳號（停用或改密碼會讓舊 token 失效）

## 部署步驟

需要 Node.js 18 以上與 Cloudflare 帳號。以下指令在 `cloudflare/` 目錄執行。

1. 登入 Cloudflare

   ```sh
   npx wrangler login
   ```

2. 建立 D1 資料庫，並把輸出的 `database_id` 填入 [wrangler.toml](wrangler.toml)

   ```sh
   npx wrangler d1 create prompt-vault
   ```

3. 建立資料表

   ```sh
   npx wrangler d1 migrations apply prompt-vault --remote
   ```

4. 建立 Google OAuth Client ID
   - 到 [Google Cloud Console → 憑證](https://console.cloud.google.com/apis/credentials) 建立「OAuth 用戶端 ID」，類型選「網頁應用程式」
   - 「已授權的 JavaScript 來源」填入你的網址，例如 `https://<your-project>.pages.dev`

5. 首次部署（會建立 Pages 專案）

   ```sh
   npx wrangler pages deploy public --project-name <your-project>
   ```

6. 設定 secrets（見下表），設定後再部署一次讓設定生效

   ```sh
   npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name <your-project>
   openssl rand -base64 48   # 產生 SESSION_SECRET 用的隨機字串
   npx wrangler pages secret put SESSION_SECRET --project-name <your-project>
   npx wrangler pages secret put ADMIN_EMAILS --project-name <your-project>
   ```

7. 開啟 `https://<your-project>.pages.dev/admin`，以 Google 登入後建立使用者帳號
8. 將擴充功能的 `DEFAULT_SYNC_ORIGIN` 改為你的網址（見 [chrome-extension/README.md](../chrome-extension/README.md)）

## Secrets（只用 `wrangler pages secret put` 設定，不要寫進程式或 commit）

| 名稱 | 用途 |
|---|---|
| `GOOGLE_CLIENT_ID` | 管理後台 Google 登入的 OAuth Client ID |
| `SESSION_SECRET` | 簽署登入 session / extension token，請用 32 字元以上隨機字串 |
| `ADMIN_EMAILS` | 可登入管理後台的 email，逗號分隔 |
| `INGEST_TOKEN`（選用） | 固定的上傳 token，16 字元以上；未設定則只接受使用者登入取得的 token |

本機開發可放在 `.dev.vars`（已列入 `.gitignore`）。
