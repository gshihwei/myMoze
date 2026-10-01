MOZE PWA V25.4

V25.4 將 V24 的整份 Snapshot 同步升級為逐筆資料同步。每個帳戶、分類、專案、交易、預算、週期交易與借貸都是獨立雲端記錄；每筆記錄有 version 與 updated_at，使用 optimistic concurrency 防止兩台裝置覆蓋彼此的同一筆資料。

多使用者：每筆記錄都帶 user_id，Supabase Auth + RLS 僅允許登入使用者存取自己的資料。前端只使用 Publishable Key，不要放 service_role / sb_secret。

V25.4：一般使用者不需要輸入 Supabase URL 或 Publishable Key。正式部署時，管理者只需要在 js/sync-config.js 填入一次 Project URL 與 Publishable Key，再把整個專案部署到 GitHub Pages / HTTPS。使用者看到的設定頁只提供登入、登出與同步狀態。

相容性：若內建 sync-config.js 留白，V25.4 會暫時讀取 V24/V25 舊版 localStorage 設定，方便開發測試；正式部署建議填入內建設定。

V24 升級：V25 第一次登入時會檢查舊 moze_snapshots，使用者可選擇把舊雲端 Snapshot 升級為 V25 逐筆資料，或保留本機資料建立 V25 雲端資料。舊 Snapshot 不會自動刪除。

部署前：先在 Supabase SQL Editor 執行 supabase/schema.sql；確認 RLS；將 js/sync-config.js 的 url / publishableKey 填好；Publishable Key 可以放前端，但絕對不要把 service_role / sb_secret 放進前端。

本機測試：python -m http.server 5500
正式使用：GitHub Pages / 其他 HTTPS 靜態主機。


V25.4.2
- 修正同步初始化呼叫 renderAuth 未定義導致的同步失敗。
- 補回登入、建立帳號、登出、從雲端載入、上傳本機等同步帳號 UI。
- 保留 V25.4 的內建 Supabase 設定，不讓一般使用者輸入 URL / Publishable Key。

V25.4 CSV 匯入
==============
設定 > 資料 > 匯入 MOZE CSV

匯入格式依 MOZE_CHT.xlsx：
帳戶, 幣種, 記錄類型＊, 主類別＊, 子類別＊, 金額＊, 手續費, 折扣, 名稱, 商家, 日期＊, 時間, 專案, 描述, 標籤, 對象

支援：
- UTF-8 / UTF-8 BOM / Big5 CSV
- 日期 YYYY/M/D、YYYY-MM-DD 與常見日期格式
- 時間 HH:mm；空白預設 09:00
- 帳戶不存在自動建立
- 主類別／子類別不存在自動建立
- 專案不存在自動建立
- 轉帳必須為相鄰的「轉出」＋「轉入」，且日期與時間一致
- 相同 CSV 重複匯入會自動略過
- 匯入前顯示預覽、錯誤與格式提醒
- 新建立帳戶依匯入紀錄計算餘額；已存在帳戶不重複調整餘額


V25.4 CSV Import
- MOZE CSV supports 2 modes: append records or full overwrite.
- Full overwrite clears transactions/accounts/categories/projects/budgets/recurring/loans and rebuilds supported data from CSV.
- Before overwrite, the app automatically downloads a JSON backup and asks for confirmation.
