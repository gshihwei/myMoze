// 帳小簿 V26.16 — 自動備份（本機每日快照）.
// Bundled after js/bulk.js; uses app.js globals (state, esc, money, isoDate). Function declarations / var only.
//
// Once per day, after a successful save, a full JSON snapshot of the data is stored in its own
// IndexedDB database ('moze-backups', separate from the app's database so its schema never changes).
// The newest 7 days are kept. Snapshots stay on this device and are never synced.

var backupLastDay = '', backupBusy = false;
function backupKeep() { return 7; }
function backupDbName() { return 'moze-backups'; }

function backupSummary(st) {
  const s = st || {};
  return { transactions: (s.transactions || []).length, accounts: (s.accounts || []).length, loans: (s.loans || []).length };
}
// Which stored days to delete so that only the newest `keep` remain.
function backupPrune(days, keep = backupKeep()) { return [...days].sort().reverse().slice(keep); }
function backupShouldRun(lastDay, today) { return !!today && lastDay !== today; }

function backupOpen() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB?.open) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(backupDbName(), 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('snap')) req.result.createObjectStore('snap', { keyPath: 'day' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function backupTx(db, mode, fn) {
  return new Promise((resolve, reject) => { const tx = db.transaction('snap', mode), store = tx.objectStore('snap'); let out; Promise.resolve(fn(store, v => { out = v; })).catch(reject); tx.oncomplete = () => resolve(out); tx.onerror = () => reject(tx.error); });
}
function backupList() {
  return backupOpen().then(db => backupTx(db, 'readonly', (store, done) => { const r = store.getAll(); r.onsuccess = () => done((r.result || []).map(({ day, at, summary }) => ({ day, at, summary })).sort((a, b) => b.day.localeCompare(a.day))); }));
}
function backupGet(day) { return backupOpen().then(db => backupTx(db, 'readonly', (store, done) => { const r = store.get(day); r.onsuccess = () => done(r.result || null); })); }

// Called after every successful save; does real work at most once per day.
async function backupMaybe() {
  const today = isoDate(new Date());
  if (backupBusy || !backupShouldRun(backupLastDay, today) || !state) return;
  backupBusy = true;
  try {
    const db = await backupOpen();
    const existing = await backupTx(db, 'readonly', (store, done) => { const r = store.getAllKeys(); r.onsuccess = () => done(r.result || []); });
    if (!existing.includes(today)) {
      const data = JSON.stringify(state);
      await backupTx(db, 'readwrite', store => { store.put({ day: today, at: new Date().toISOString(), summary: backupSummary(state), data }); });
      for (const day of backupPrune([...existing, today])) await backupTx(db, 'readwrite', store => { store.delete(day); });
    }
    backupLastDay = today;
  } catch (e) { console.warn('backup', e); }
  finally { backupBusy = false; }
}

function backupDownload(name, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function renderBackups() {
  const box = document.getElementById('backupList'); if (!box) return;
  let list = [];
  try { list = await backupList(); } catch { box.innerHTML = '<div class="empty">這個瀏覽器無法使用本機備份</div>'; return; }
  box.innerHTML = list.length ? list.map(b => `<div class="backup-row"><div><b>${esc(b.day)}</b><small>${b.summary?.transactions ?? 0} 筆交易 · ${b.summary?.accounts ?? 0} 個帳戶</small></div><span><button type="button" class="ghost" data-backup-dl="${esc(b.day)}">下載</button><button type="button" class="secondary" data-backup-restore="${esc(b.day)}">還原</button></span></div>`).join('')
    : '<div class="empty">還沒有備份；下次存檔時會自動建立今天的備份。</div>';
}

document.addEventListener('click', async e => {
  const dl = e.target.closest?.('[data-backup-dl]');
  if (dl) { const b = await backupGet(dl.dataset.backupDl); if (b) backupDownload(`帳小簿-自動備份-${b.day}.json`, b.data); return; }
  const rs = e.target.closest?.('[data-backup-restore]');
  if (rs) {
    const b = await backupGet(rs.dataset.backupRestore); if (!b) return;
    if (!confirm(`還原 ${b.day} 的備份？\n\n目前的資料會被這份備份取代（${b.summary?.transactions ?? 0} 筆交易）。還原前會先下載目前資料的 JSON。\n已登入雲端時，還原後的差異也會同步到雲端。`)) return;
    backupDownload(`帳小簿-還原前-${isoDate(new Date())}.json`, JSON.stringify(state));
    try { await window.MozeApp.setState(JSON.parse(b.data), { persist: true, markDirty: true }); alert('已還原。'); } catch (err) { alert('還原失敗：' + (err.message || err)); }
  }
});
