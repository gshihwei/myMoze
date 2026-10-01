MOZE PWA V24

目標：桌面 + 手機共用同一份資料，支援離線本機記帳與 Supabase 雲端同步。

1. 本機離線
- 交易資料仍保存在 IndexedDB（DB=moze-v7 / STORE=state）。
- 沒有網路時仍可新增、修改、刪除交易。

2. 雲端同步
- V24 使用 Supabase Auth + PostgreSQL JSON snapshot。
- 同一個帳號在桌面與手機登入即可共用資料。
- 每次本機儲存後約 1.2 秒自動同步；重新開啟、切回視窗、恢復網路、每 20 秒也會檢查。
- 若兩台裝置同時修改，V24 不會默默覆蓋：偵測到雲端較新版本時會詢問要使用雲端或保留本機。

3. Supabase 設定
- 建立一個 Supabase project。
- 在 SQL Editor 執行 supabase/schema.sql。
- Auth 使用 Email + Password。
- 取得 Project URL 與 Publishable Key（不要把 service_role key 放進前端）。
- 在 MOZE「設定 → 雲端同步」填入兩者並儲存。
- 每台裝置使用相同的 Supabase 設定與同一個帳號即可同步。

4. 正式手機使用
- 直接雙擊 index.html 仍可作為本機工具；但 PWA 安裝與 Service Worker 需要 HTTP/HTTPS。
- 建議部署到 HTTPS 網址後，把網址加入手機主畫面。

5. 第一次同步
- 雲端沒有資料：目前裝置的本機資料會上傳。
- 雲端已有資料：V24 會詢問使用雲端或上傳本機，避免無聲覆蓋。

6. 備份
- 仍保留 JSON 匯出／匯入。正式開始長期記帳後，建議定期保留 JSON 備份。
