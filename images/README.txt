預設帳戶圖示放這裡：
  images/<銀行>/<銀行>.png     銀行本身的圖示（檔名要和資料夾同名）
  images/<銀行>/<卡名>.png     該銀行的信用卡（或其他商品）圖示
  images/aliases.json          選填，{ "檔名": ["中文關鍵字", ...] }；檔名本身一定算關鍵字（不分大小寫）
帳戶名稱含關鍵字就會自動套用；多個符合時取最長的關鍵字，同長度時卡片優先於銀行。
支援 png / jpg / webp，不必裁成方形（會置中補透明邊、縮成 128px）。檔名不可重複。
新增或更換圖片後執行：python tools/build-icons.py ，再執行 node tools/build-bundle.js
