# 帳小簿：從財政部下載電子發票（Supabase Edge Function）

瀏覽器不能直接連到財政部電子發票服務：跨網域限制會擋下，也無法送出 App 用的請求標頭。所以帳小簿透過你自己 Supabase 專案裡的這支 Edge Function 代為連線。

- 只有登入你這個 Supabase 專案的人能呼叫（預設的 JWT 檢查，不要關掉）。
- 它不保存任何資料，也不記錄手機號碼、密碼或憑證。
- 帳號與密碼只存在你的裝置上：密碼用瀏覽器內不可匯出的金鑰加密，不會同步。

> ⚠️ 這不是財政部公開的 API，而是依照「統一發票兌獎」App 的通訊方式實作（參考 [ALL SET](https://github.com/TedLin1993/all-set-tw)，MIT 授權，見 LICENSE-ALLSET）。App 改版後可能失效，屆時需要更新程式。只用在自己的帳號。

## 部署（只需要做一次）

1. 安裝 Supabase CLI：`npm i -g supabase`（或參考 https://supabase.com/docs/guides/cli）
2. 登入：`supabase login`
3. 在帳小簿資料夾（`D:\下載\moze-pwa`）連結你的專案：`supabase link --project-ref <你的專案 ref>`
   - ref 是 Supabase 網址 `https://<ref>.supabase.co` 中的那一段。
4. 部署：`supabase functions deploy einvoice`
5. 打開帳小簿 → 發票 → 下載鈕 →「從財政部下載」，第一次會要求輸入：
   - 手機號碼、財政部電子發票平台的驗證碼（密碼）、手機條碼（例如 /ABC1234）

## 下載範圍
- 每天第一次開 App 自動下載本期與上一期（兩個月一期）。
- 手動下載的範圍可在「財政部帳號」設定：本期與上一期，或財政部保留的全部。
- 財政部只保留最近 4–5 期（雙月 4 期、單月 5 期）的載具發票；更早的期別不會報錯，只會回傳空清單。2026-11 實測：查回 18 期，只有 3–4 月以後有資料。
- ⚠️ 帳小簿登入時，手機上的「統一發票兌獎」App 會被登出（同一帳號一次只能登入一台裝置）。只改範圍或自動下載設定時不會重新登入。
- 已經記帳的發票會略過；已在「未歸帳」清單的發票會補上明細。
- 只支援手機條碼載具（不含自然人憑證、會員載具）。

## 出問題時
- 「找不到 Edge Function」：還沒部署，或部署到別的專案。
- 「登入失敗」：手機號碼或驗證碼錯誤；或財政部 App 改版，協定已變更。
- Supabase 後台 → Edge Functions → einvoice → Logs 可以看到錯誤訊息（不含帳密）。
