MOZE PWA V25.1

V25.1 將 V24 的整份 Snapshot 同步升級為逐筆資料同步。每個帳戶、分類、專案、交易、預算、週期交易與借貸都是獨立雲端記錄；每筆記錄有 version 與 updated_at，使用 optimistic concurrency 防止兩台裝置覆蓋彼此的同一筆資料。

多使用者：每筆記錄都帶 user_id，Supabase Auth + RLS 僅允許登入使用者存取自己的資料。前端只使用 Publishable Key，不要放 service_role / sb_secret。

V25.1：一般使用者不需要輸入 Supabase URL 或 Publishable Key。正式部署時，管理者只需要在 js/sync-config.js 填入一次 Project URL 與 Publishable Key，再把整個專案部署到 GitHub Pages / HTTPS。使用者看到的設定頁只提供登入、登出與同步狀態。

相容性：若內建 sync-config.js 留白，V25.1 會暫時讀取 V24/V25 舊版 localStorage 設定，方便開發測試；正式部署建議填入內建設定。

V24 升級：V25 第一次登入時會檢查舊 moze_snapshots，使用者可選擇把舊雲端 Snapshot 升級為 V25 逐筆資料，或保留本機資料建立 V25 雲端資料。舊 Snapshot 不會自動刪除。

部署前：先在 Supabase SQL Editor 執行 supabase/schema.sql；確認 RLS；將 js/sync-config.js 的 url / publishableKey 填好；Publishable Key 可以放前端，但絕對不要把 service_role / sb_secret 放進前端。

本機測試：python -m http.server 5500
正式使用：GitHub Pages / 其他 HTTPS 靜態主機。
