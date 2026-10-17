# Chrome 擴充功能

需要 Chrome 111 以上（Manifest V3）。

## 安裝

1. 下載或 `git clone` 本專案
2. Chrome 開啟 `chrome://extensions`
3. 開啟右上角「開發人員模式」
4. 點「載入未封裝項目」，選擇這個 `chrome-extension/` 目錄
5. 安裝後會自動開啟同意頁；按「開始使用並登入」才會開始記錄
6. **已開著的 ChatGPT / Claude / Gemini 分頁請重新整理一次**

## 使用

- **工具列圖示**：顯示已保存筆數；可開關記錄、開啟歷史紀錄、登入同步
- **歷史紀錄頁**：搜尋、依網站篩選、匯出 JSON（可含檔案內容）、清空本機紀錄
- **同步登入**：輸入管理者發給你的使用者 ID 與密碼。登入後只保存 token，不保存密碼；token 7 天後需重新登入

## 支援網站

| 網站 | 記錄方式 |
|---|---|
| ChatGPT（chatgpt.com） | `/backend-api/conversation` 的 JSON 請求 |
| Claude（claude.ai） | `/chat_conversations/{id}/completion` 的 JSON 請求 |
| Gemini（gemini.google.com） | `processSession` 請求中的 protobuf 欄位 |
| NotebookLM | 實驗性，尚未完整驗證 |

網站改版時記錄可能失效，需更新 [inject.js](inject.js) 的比對規則。

## 注意事項

- 在 `chrome://extensions` 重新載入擴充功能後，**必須重新整理各 AI 網站分頁**，否則舊分頁不會被記錄
- 預設同步伺服器寫在 [popup.js](popup.js) 與 [onboarding.js](onboarding.js) 的 `DEFAULT_SYNC_ORIGIN`；自架伺服器時請改成你的網址
- 30 MB 以上的檔案只記錄 metadata，不保存內容

## 除錯

在 AI 網站分頁按 F12 開 Console（第一次貼上需先輸入「允許貼上」）：

```js
__pvDebug.events.slice(-20)
```

可看到攔截到的請求（`fetch-hook`、`xhr-send`）、比對成功（`prompt-body-matched`）與送出紀錄（`emit`）。背景頁 log 可在 `chrome://extensions` 點擴充功能的「Service Worker」查看。

## 檔案說明

| 檔案 | 用途 |
|---|---|
| `manifest.json` | 擴充功能設定 |
| `relay.js` | content script，請 background 注入 `inject.js`，並轉送紀錄 |
| `inject.js` | 在頁面環境攔截 fetch / XHR，解析 prompt 與上傳檔案 |
| `background.js` | 檢查同意狀態、存入 IndexedDB、同步到伺服器 |
| `db.js` | IndexedDB 存取 |
| `popup.*` / `onboarding.*` / `history.*` | 工具列彈窗、同意頁、歷史紀錄頁 |
