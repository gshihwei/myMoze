// 帳小簿 V26.15 — 交易批次編輯.
// Bundled after js/installments.js; uses app.js / search.js / categories.js globals (state, esc,
// adjust, save, render, renderTransactions, txFilterState, txSearchRun, catOptionsHTML, parseTags,
// isLoanTx). Function declarations / var only.

var bulkMode = false, bulkSel = new Set();

function bulkIds() { return [...bulkSel]; }
function bulkPick(ids) { const set = new Set(ids.map(String)); return (state.transactions || []).filter(t => set.has(String(t.id))); }
function bulkEditable(t) { return t && !isLoanTx(t); }

// Category: only plain expense/income rows of the matching kind without split lines.
function bulkSetCategory(ids, cid) {
  const c = (state.categories || []).find(x => String(x.id) === String(cid)); if (!c) return { changed: 0, skipped: ids.length };
  let changed = 0, skipped = 0;
  for (const t of bulkPick(ids)) {
    if (!bulkEditable(t) || (t.kind !== 'expense' && t.kind !== 'income') || (c.kind || 'expense') !== t.kind || (Array.isArray(t.splits) && t.splits.length)) { skipped++; continue; }
    t.category = c.id; changed++;
  }
  return { changed, skipped };
}
function bulkSetProject(ids, pid) {
  let changed = 0, skipped = 0;
  for (const t of bulkPick(ids)) { if (!bulkEditable(t)) { skipped++; continue; } t.project = pid || ''; changed++; }
  return { changed, skipped };
}
function bulkAddTags(ids, raw) {
  const add = parseTags(raw); let changed = 0, skipped = 0;
  if (!add.length) return { changed, skipped: ids.length };
  for (const t of bulkPick(ids)) {
    if (!bulkEditable(t)) { skipped++; continue; }
    const cur = Array.isArray(t.tags) ? t.tags : [], next = [...cur, ...add.filter(x => !cur.includes(x))];
    if (next.length !== cur.length) { t.tags = next; changed++; }
  }
  return { changed, skipped };
}
// Delete reverses each transaction's balance effect; loan transactions are left alone.
function bulkDelete(ids) {
  const del = bulkPick(ids).filter(bulkEditable), drop = new Set(del.map(t => String(t.id)));
  for (const t of del) adjust(t, -1);
  state.transactions = state.transactions.filter(t => !drop.has(String(t.id)));
  return { changed: del.length, skipped: ids.length - del.length };
}

function bulkBarHTML() {
  const n = bulkSel.size;
  const projOpts = '<option value="">（無專案）</option>' + (state.projects || []).filter(p => !p.archived).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  return `<div class="bulk-bar" role="toolbar" aria-label="批次編輯">
    <b>已選 ${n.toLocaleString()} 筆</b>
    <button type="button" class="ghost" data-bulk="all">全選搜尋結果</button>
    <button type="button" class="ghost" data-bulk="none" ${n ? '' : 'disabled'}>取消選取</button>
    <span class="bulk-group"><select id="bulkCat" aria-label="改分類"><option value="">改分類…</option>${catOptionsHTML('', '')}</select><button type="button" class="secondary" data-bulk="cat" ${n ? '' : 'disabled'}>套用</button></span>
    <span class="bulk-group"><select id="bulkProj" aria-label="改專案">${projOpts}</select><button type="button" class="secondary" data-bulk="proj" ${n ? '' : 'disabled'}>改專案</button></span>
    <span class="bulk-group"><input id="bulkTags" placeholder="#標籤" aria-label="加標籤"><button type="button" class="secondary" data-bulk="tags" ${n ? '' : 'disabled'}>加標籤</button></span>
    <span class="bulk-group"><select id="bulkAcct" aria-label="改帳戶"><option value="">改帳戶…</option>${acctActive(acctOrdered(state.accounts)).map(a => `<option value="${esc(a.id)}">${acctName(a)}</option>`).join('')}</select><button type="button" class="secondary" data-bulk="acct" ${n ? '' : 'disabled'}>套用</button></span>
    <span class="bulk-group"><select id="bulkField" aria-label="欄位"><option value="name">名稱</option><option value="merchant">商家</option><option value="date">日期 (YYYY-MM-DD)</option></select><input id="bulkValue" aria-label="新內容"><button type="button" class="secondary" data-bulk="field" ${n ? '' : 'disabled'}>修改</button></span>
    <button type="button" class="secondary danger-btn" data-bulk="del" ${n ? '' : 'disabled'}>刪除</button>
    <button type="button" class="primary" data-bulk="done">完成</button>
  </div>`;
}
function renderBulkBar() {
  let el = document.getElementById('bulkBar');
  const view = document.getElementById('view-transactions');
  if (!bulkMode || !view?.classList?.contains('active')) { if (el) el.remove(); return; }
  if (!el && document.body) { el = document.createElement('div'); el.id = 'bulkBar'; document.body.appendChild(el); }
  if (el) el.innerHTML = bulkBarHTML();
}

async function bulkRun(action) {
  const ids = bulkIds();
  let res = null, label = '';
  if (action === 'cat') { const v = document.getElementById('bulkCat')?.value; if (!v) return alert('請先選擇分類'); res = bulkSetCategory(ids, v); label = '改分類'; }
  else if (action === 'proj') { res = bulkSetProject(ids, document.getElementById('bulkProj')?.value || ''); label = '改專案'; }
  else if (action === 'tags') { res = bulkAddTags(ids, document.getElementById('bulkTags')?.value || ''); if (!res.changed && !res.skipped) return; label = '加標籤'; }
  else if (action === 'acct') { const v = document.getElementById('bulkAcct')?.value; if (!v) return alert('請先選擇帳戶'); res = bulkSetAccount(ids, v); label = '改帳戶'; }
  else if (action === 'field') { const k = document.getElementById('bulkField')?.value, v = document.getElementById('bulkValue')?.value || ''; if (k === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return alert('日期請輸入 YYYY-MM-DD'); res = bulkSetField(ids, k, v); label = '修改'; }
  else if (action === 'del') { if (!confirm(`刪除 ${ids.length} 筆交易？\n\n帳戶餘額會一併還原；借還款交易不會被刪除（請到借還款頁處理）。`)) return; res = bulkDelete(ids); label = '刪除'; bulkSel.clear(); }
  if (!res) return;
  await save(); render(); renderBulkBar();
  alert(`${label}：完成 ${res.changed} 筆${res.skipped ? `，略過 ${res.skipped} 筆（借還款、轉帳、拆帳或分類收支類型不符）` : ''}。`);
}

document.addEventListener('click', e => {
  const tg = e.target.closest?.('#txBulkToggle'); if (tg) { bulkMode = !bulkMode; bulkSel.clear(); renderTransactions(); renderBulkBar(); return; }
  const b = e.target.closest?.('[data-bulk]'); if (!b) return;
  const a = b.dataset.bulk;
  if (a === 'done') { bulkMode = false; bulkSel.clear(); renderTransactions(); renderBulkBar(); return; }
  if (a === 'all') { for (const t of txSearchRun(txFilterState())) bulkSel.add(String(t.id)); renderTransactions(); renderBulkBar(); return; }
  if (a === 'none') { bulkSel.clear(); renderTransactions(); renderBulkBar(); return; }
  bulkRun(a);
});
