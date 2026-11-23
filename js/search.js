// 帳小簿 V26.8 — 交易進階搜尋（V26.27：搜尋結果匯出 CSV）.
// Bundled after js/categories.js; uses app.js / analysis.js / categories.js globals
// (state, esc, money, anRange, anValue, anTopCategory, catOrdered, isUnappliedPending).
// Function declarations / var only (hoisted).

var txLimit = 300;

// Filters read from the transactions page. Every field is optional.
function txFilterState() {
  const v = id => document.getElementById(id)?.value ?? '';
  return {
    q: String(v('txSearch')).trim().toLowerCase(), type: v('txType') || 'all', category: v('txCategory') || 'all', account: v('txAccount') || 'all',
    range: v('txRange') || 'all', from: v('txFrom'), to: v('txTo'), min: v('txMin'), max: v('txMax'),
    tag: v('txTag') || 'all', project: v('txProject') || 'all', status: v('txStatus') || 'all', sort: v('txSort') || 'dateDesc',
  };
}

function txRangeBounds(f, today = new Date()) {
  if (!f.range || f.range === 'all') return null;
  if (f.range === 'custom' && !f.from && !f.to) return null;
  if (f.range === 'custom') return { start: f.from || '0000-01-01', end: f.to || '9999-12-31' };
  const R = anRange(f.range, f.from, f.to, today);
  return { start: R.start, end: R.end };
}

// One transaction against the filters (pure; covered by tests/search.test.js).
function txMatches(t, f, bounds = txRangeBounds(f)) {
  if (f.q) {
    const hay = [t.name, t.merchant, t.note, t.person, ...(Array.isArray(t.tags) ? t.tags.map(x => '#' + x) : [])].filter(Boolean).join(' ').toLowerCase();
    if (!hay.includes(f.q)) return false;
  }
  if (f.type && f.type !== 'all') {
    if (f.type === 'loan') { if (t.kind !== 'loan' && t.kind !== 'loanPayment') return false; }
    else if (t.kind !== f.type) return false;
  }
  if (f.category && f.category !== 'all') {
    const want = String(f.category), ids = [t.category, ...(Array.isArray(t.splits) ? t.splits.map(s => s.category) : [])].filter(x => x !== undefined && x !== null);
    if (!ids.some(id => String(id) === want || anTopCategory(id) === want)) return false;
  }
  if (f.account && f.account !== 'all' && String(t.account) !== String(f.account) && String(t.toAccount ?? '') !== String(f.account)) return false;
  if (bounds && (t.date < bounds.start || t.date > bounds.end)) return false;
  const amt = Math.abs(Number(t.amount || 0));
  if (f.min !== '' && f.min !== undefined && Number.isFinite(Number(f.min)) && amt < Number(f.min)) return false;
  if (f.max !== '' && f.max !== undefined && Number.isFinite(Number(f.max)) && amt > Number(f.max)) return false;
  if (f.tag && f.tag !== 'all' && !(Array.isArray(t.tags) && t.tags.includes(f.tag))) return false;
  if (f.project && f.project !== 'all') {
    if (f.project === 'none' ? !!t.project : String(t.project) !== String(f.project)) return false;
  }
  if (f.status === 'pending' && !t.pending) return false;
  if (f.status === 'done' && t.pending) return false;
  if (f.status === 'imported' && !t.imported) return false;
  return true;
}

function txSort(list, sort) {
  const byDate = (a, b) => String(b.date).localeCompare(String(a.date)) || String(b.time || '').localeCompare(String(a.time || ''));
  if (sort === 'dateAsc') return list.sort((a, b) => -byDate(a, b));
  if (sort === 'amountDesc') return list.sort((a, b) => Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0)) || byDate(a, b));
  if (sort === 'amountAsc') return list.sort((a, b) => Math.abs(Number(a.amount || 0)) - Math.abs(Number(b.amount || 0)) || byDate(a, b));
  return list.sort(byDate);
}

function txSearchRun(f) { const b = txRangeBounds(f); return txSort((state.transactions || []).filter(t => txMatches(t, f, b)), f.sort); }

// Totals of a result set in TWD; unapplied pending transactions are counted separately.
function txSearchSummary(list) {
  let out = 0, inc = 0, pending = 0;
  for (const t of list) {
    if (isUnappliedPending(t)) { pending++; continue; }
    if (t.kind === 'expense') out += anValue(t); else if (t.kind === 'income') inc += anValue(t);
  }
  return { count: list.length, out: Math.round(out), inc: Math.round(inc), net: Math.round(inc - out), pending };
}

function txActiveFilterCount(f) {
  return ['range', 'tag', 'project', 'status'].filter(k => f[k] && f[k] !== 'all').length + (f.min !== '' ? 1 : 0) + (f.max !== '' ? 1 : 0);
}

// Fill the advanced filter selects (tags / projects) keeping the current choice.
function txFillAdvanced() {
  const tagSel = document.getElementById('txTag'), projSel = document.getElementById('txProject');
  if (tagSel) {
    const cur = tagSel.value || 'all', tags = [...new Set((state.transactions || []).flatMap(t => Array.isArray(t.tags) ? t.tags : []))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    tagSel.innerHTML = '<option value="all">全部標籤</option>' + tags.map(x => `<option value="${esc(x)}" ${x === cur ? 'selected' : ''}>#${esc(x)}</option>`).join('');
  }
  if (projSel) {
    const cur = projSel.value || 'all';
    projSel.innerHTML = '<option value="all">全部專案</option><option value="none">無專案</option>' + (state.projects || []).map(p => `<option value="${esc(p.id)}" ${String(p.id) === String(cur) ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    if (cur === 'none') projSel.value = 'none';
  }
  const custom = document.getElementById('txCustomRange'); if (custom) custom.hidden = (document.getElementById('txRange')?.value || 'all') !== 'custom';
}

function txSummaryHTML(s, shown, f) {
  const n = txActiveFilterCount(f);
  return `<div class="tx-toolbar"><div class="tx-summary"><span>共 <b>${s.count.toLocaleString()}</b> 筆${shown < s.count ? `（顯示 ${shown.toLocaleString()}）` : ''}</span><span>支出 <b class="expense-text">${money(s.out)}</b></span><span>收入 <b class="income-text">${money(s.inc)}</b></span><span>淨額 <b>${s.net < 0 ? '−' : '+'}${money(Math.abs(s.net))}</b></span>${s.pending ? `<span>${s.pending} 筆待完成未計入</span>` : ''}</div><span class="tx-toolbar-actions">${n ? `<button type="button" class="ghost" id="txClearFilters">清除 ${n} 個進階條件</button>` : ''}<button type="button" class="ghost" id="txExport">匯出結果 CSV</button><button type="button" class="ghost" id="txBulkToggle" aria-pressed="${bulkMode ? 'true' : 'false'}">${bulkMode ? '結束批次編輯' : '批次編輯'}</button></span></div>`;
}

function txClearAdvanced() {
  for (const id of ['txRange', 'txTag', 'txProject', 'txStatus']) { const el = document.getElementById(id); if (el) el.value = 'all'; }
  for (const id of ['txFrom', 'txTo', 'txMin', 'txMax']) { const el = document.getElementById(id); if (el) el.value = ''; }
}

// ---------- export the current search result as CSV (V26.27) ----------
function txExportHeaders() { return ['日期', '時間', '類型', '帳戶', '轉入帳戶', '幣種', '金額', '手續費', '主類別', '子類別', '名稱', '商家', '專案', '標籤', '對象', '備註', '狀態']; }
function txExportRows(list) {
  const accName = id => (state.accounts || []).find(a => String(a.id) === String(id));
  return list.map(t => {
    const a = accName(t.account), to = t.toAccount != null ? accName(t.toAccount) : null, [main, sub] = (t.kind === 'transfer' || t.kind === 'loan' || t.kind === 'loanPayment') && !t.mainCategory && !t.category ? ['', ''] : mozeCats(t);
    const type = typeof txTypeLabel === 'function' ? txTypeLabel(t) : t.kind;
    return [t.date || '', t.time || '', type, a?.name || '', to?.name || '', a ? acctCur(a) : '', String(Math.abs(Number(t.amount || 0))), t.fee ? String(Math.abs(Number(t.fee))) : '', main, sub, t.name || '', t.merchant || '', mozeProject(t), Array.isArray(t.tags) ? t.tags.join(';') : '', t.person && t.person !== '不限定對象' ? t.person : '', t.note || '', t.pending ? '待完成' : ''];
  });
}
function txExportCsv(list) {
  const cell = v => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + [txExportHeaders(), ...txExportRows(list)].map(r => r.map(cell).join(',')).join('\r\n');
}
function downloadTxExport() {
  const list = txSearchRun(txFilterState()); if (!list.length) { alert('目前沒有符合條件的交易可匯出'); return; }
  const a = document.createElement('a'), d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  a.href = URL.createObjectURL(new Blob([txExportCsv(list)], { type: 'text/csv;charset=utf-8' }));
  a.download = `帳小簿-搜尋結果-${stamp}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
