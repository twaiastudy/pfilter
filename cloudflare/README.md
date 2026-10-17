# Cloudflare Pages + D1

## 部署

```sh
npx wrangler d1 migrations apply prompt-vault --remote
npx wrangler pages deploy public --project-name <your-project>
```

## 必要的 secrets（只用 `wrangler pages secret put` 設定，不要寫進程式或 commit）

| 名稱 | 用途 |
|---|---|
| `GOOGLE_CLIENT_ID` | 管理後台 Google 登入的 OAuth Client ID |
| `SESSION_SECRET` | 簽署登入 session / extension token，請用 32 字元以上隨機字串 |
| `ADMIN_EMAILS` | 可登入管理後台的 email，逗號分隔 |
| `INGEST_TOKEN`（選用） | 固定的上傳 token，16 字元以上；未設定則只接受使用者登入取得的 token |

本機開發可放在 `.dev.vars`（已列入 `.gitignore`）。
