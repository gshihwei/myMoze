// 帳小簿 V26.105 — 搜尋頁、報表編輯欄位與報表設定、記帳模式頁、發票與草稿同步.
// Bundled after js/event-view.js. Function declarations / var only.

// ---- 搜尋 ----
function fvSt() { return window.__fv || (window.__fv = { q: '', field: 'all', cond: false, f: fvReset(), pick: null }); }
function fvReset() { return { from: '', to: '', min: '', max: '', types: [], events: [], exec: [], sort: 'dateDesc' }; }
function fvFields() { return [['all', '全部'], ['name', '名稱'], ['note', '備註'], ['category', '類別'], ['account', '帳戶'], ['project', '專案'], ['merchant', '商家'], ['tag', '標籤'], ['person', '對象'], ['amount', '金額']]; }
function fvHit(t, q, k) {
  const has = v => String(v ?? '').toLowerCase().includes(q), cats = [t.category, ...(t.splits || []).map(s => s.category)];
  if (k === 'name') return has(t.name); if (k === 'note') return has(t.note); if (k === 'merchant') return has(t.merchant); if (k === 'person') return has(t.person); if (k === 'tag') return (t.tags || []).some(x => has(x) || ('#' + x).toLowerCase().includes(q));
  if (k === 'category') return cats.some(c => { const x = cat(c); return x.name !== '未分類' && (has(x.name) || (x.parentId && has(cat(x.parentId).name))); }); if (k === 'account') return has(acct(t.account).name) || (t.toAccount !== undefined && has(acct(t.toAccount).name));
  if (k === 'project') { const p = (state.projects || []).find(x => String(x.id) === String(t.project)); return !!p && has(p.name); } if (k === 'amount') return String(Math.abs(Number(t.amount || 0))).includes(q.replace(/,/g, '')) || (t.orig && String(t.orig.amount).includes(q)) || has(t.invoiceNo);
  return fvFields().slice(1).some(([x]) => fvHit(t, q, x));
}
function fvTypeOf(t) { return isLoanTx(t) ? ((t.direction || t.loanDirection) === 'payable' ? '應付款項' : '應收款項') : t.kind === 'transfer' ? '轉帳' : t.kind === 'income' ? '收入' : t.kind === 'balance_adjustment' ? '餘額調整' : '支出'; }
function fvCond(t, f) {
  if (f.from && t.date < f.from) return false; if (f.to && t.date > f.to) return false; const a = Math.abs(Number(t.amount || 0)); if (f.min !== '' && a < Number(f.min)) return false; if (f.max !== '' && a > Number(f.max)) return false;
  if (f.types.length && !f.types.includes(fvTypeOf(t))) return false; if (f.events.length && !f.events.includes(t.kind === 'loanPayment' || t.cardPayment ? 'repay' : rptEvent(t))) return false; return !f.exec.length || f.exec.includes(rptExec(t));
}
// { list (after field), counts } for the query + conditions.
function fvRun(s) {
  const q = String(s.q || '').trim().toLowerCase(), base = (state.transactions || []).filter(t => fvCond(t, s.f)), counts = {}; if (!q && !fvActive(s.f)) return { list: [], counts: {}, total: 0 };
  for (const [k] of fvFields()) counts[k] = !q ? (k === 'all' ? base.length : 0) : base.reduce((n, t) => n + (fvHit(t, q, k) ? 1 : 0), 0);
  const list = txSort(base.filter(t => !q || fvHit(t, q, s.field)), s.f.sort); return { list, counts, total: Math.round(list.reduce((a, t) => a + (t.kind === 'income' ? 1 : t.kind === 'expense' ? -1 : 0) * anValue(t), 0)) };
}
function fvActive(f) { return !!(f.from || f.to || f.min !== '' || f.max !== '' || f.types.length || f.events.length || f.exec.length); }
function fvChips(k, list, sel) { return `<div class="fv-chips"><button type="button" data-fv-set="${k}" data-v="" class="${sel.length ? '' : 'on'}">無限制</button>${list.map(([v, l]) => `<button type="button" data-fv-set="${k}" data-v="${v}" class="${sel.includes(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`; }
function fvCondHTML(f) {
  return `<div class="recon-list notice-list fv-cond"><div class="form-grid"><label>日期區間從<input type="date" id="fvFrom" value="${f.from}"></label><label>到<input type="date" id="fvTo" value="${f.to}"></label></div><div class="fv-chips">${[['', '無限制'], ['7', '最近一週'], ['30', '最近一個月'], ['90', '最近三個月'], ['365', '最近一年']].map(([v, l]) => `<button type="button" data-fv-days="${v}">${l}</button>`).join('')}</div><div class="form-grid"><label>金額下限<input type="number" id="fvMin" min="0" step="any" value="${f.min}" placeholder="無限制"></label><label>金額上限<input type="number" id="fvMax" min="0" step="any" value="${f.max}" placeholder="無限制"></label></div><h4>記錄類型</h4>${fvChips('types', ['支出', '收入', '轉帳', '應收款項', '應付款項', '餘額調整'].map(x => [x, x]), f.types)}<h4>事件類型</h4>${fvChips('events', [['single', '單次'], ['recurring', '週期'], ['installment', '分期'], ['repay', '還款']], f.events)}<h4>交易執行</h4>${fvChips('exec', [['now', '立即入帳'], ['remind', '提醒入帳'], ['postpone', '延後入帳']], f.exec)}<h4>搜尋結果</h4><div class="fv-chips">${[['dateDesc', '依日期排序 ▼'], ['dateAsc', '依日期排序 ▲'], ['amountDesc', '依金額排序 ▼'], ['amountAsc', '依金額排序 ▲']].map(([v, l]) => `<button type="button" data-fv-sort="${v}" class="${f.sort === v ? 'on' : ''}">${l}</button>`).join('')}</div><div class="form-actions"><button type="button" class="ghost" data-fv-reset>重置條件</button><button type="button" class="primary" data-fv-ok>套用</button></div></div>`;
}
function fvBodyHTML(s) {
  const r = fvRun(s), hist = prefs().searchHist || []; if (!s.q && !fvActive(s.f)) return `<div class="recon-list notice-list"><h3 class="notice-h">歷史搜尋</h3>${hist.map(x => `<div class="ev-row"><button type="button" class="notice-row" data-fv-hist="${esc(x)}"><b>${esc(x)}</b></button><button type="button" class="ghost" data-fv-unhist="${esc(x)}" aria-label="移除">⊖</button></div>`).join('') || '<div class="recon-empty">輸入關鍵字開始搜尋</div>'}</div>`;
  let last = ''; const rows = r.list.slice(0, 400).map(t => { const d = `${fmtDate(t.date)} ${WEEKDAYS[new Date(t.date + 'T00:00:00').getDay()]}`, h = d !== last ? `<div class="rv-day"><b>${d}</b></div>` : ''; last = d; return h + (s.pick ? `<label class="fv-pick"><input type="checkbox" data-fv-pick="${esc(t.id)}"${s.pick.has(String(t.id)) ? ' checked' : ''}><span>${esc(t.name)}　${acctMoney(t.amount, acct(t.account))}</span></label>` : rptRowHTML(t)); }).join('');
  return `<div class="fv-tabs">${fvFields().map(([k, l]) => `<button type="button" data-fv-field="${k}" class="${s.field === k ? 'on' : ''}">${l}（${r.counts[k] ?? 0}）</button>`).join('')}</div><div class="recon-list notice-list">${rows || '<div class="recon-empty">沒有符合的記錄</div>'}${r.list.length > 400 ? `<p class="hint">只列出前 400 筆</p>` : ''}</div><div class="recon-bar"><div class="recon-bar-row"><span>${s.pick ? `已選擇 <b>${s.pick.size}</b> 筆記錄` : `全部 <b>${r.list.length}</b> 筆記錄`}</span><span>總額 <b class="${r.total < 0 ? 'expense-text' : 'income-text'}">${r.total < 0 ? '−' : ''}${money(Math.abs(r.total))}</b></span></div>${s.pick ? `<div class="form-actions"><button type="button" class="ghost" data-fv-all>全部選取</button><button type="button" class="secondary" data-fv-edit>修改</button><button type="button" class="secondary danger-btn" data-fv-del>刪除</button></div>` : ''}</div>`;
}
function renderFind(keep) {
  const el = document.getElementById('findBg'); if (!el || el.hidden) return; const s = fvSt();
  el.innerHTML = `<div class="recon-sheet"><div class="fv-head"><button type="button" class="icon" data-sheet-close aria-label="關閉">×</button><input id="fvQ" type="search" placeholder="搜尋" value="${esc(s.q)}" autocomplete="off"><button type="button" class="icon" data-fv-mode aria-label="選取">☑</button><button type="button" class="icon" data-fv-cond aria-label="搜尋條件">☷${fvActive(s.f) ? '•' : ''}</button></div>${s.cond ? fvCondHTML(s.f) : fvBodyHTML(s)}</div>`;
  if (keep) { const i = document.getElementById('fvQ'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }
}
function openFind() { sheetEl('findBg').hidden = false; fvSt().cond = false; renderFind(true); }
async function fvBulkEdit(ids) {
  const k = await uiAsk({ icon: '✎', title: `修改 ${ids.length} 筆`, options: [['category', '類別'], ['account', '帳戶'], ['project', '專案'], ['name', '名稱'], ['merchant', '商家'], ['date', '日期'], ['time', '時間'], ['tag', '加上標籤']] }); if (!k) return; let r;
  if (k === 'name' || k === 'merchant' || k === 'date' || k === 'time') { const v = prompt(k === 'date' ? '日期（YYYY-MM-DD）' : k === 'time' ? '時間（HH:MM）' : k === 'name' ? '名稱' : '商家', k === 'date' ? isoDate(new Date()) : k === 'time' ? nowTime() : ''); if (v === null || (k === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) || (k === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v))) return; r = bulkSetField(ids, k, v); }
  else if (k === 'tag') { const v = prompt('標籤'); if (!v) return; const g = parseTags(v); let n = 0; for (const t of bulkPick(ids)) { if (isLoanTx(t)) continue; t.tags = [...new Set([...(t.tags || []), ...g])]; n++; } r = { changed: n, skipped: ids.length - n }; }
  else { const l = k === 'category' ? catOrdered().filter(c => !catSpecialKind(c.kind)).map(c => [c.id, catLabel(c)]) : k === 'account' ? acctActive(acctOrdered(state.accounts)).map(a => [a.id, a.name]) : [['', '無專案'], ...(state.projects || []).filter(p => !p.archived).map(p => [p.id, p.name])], n = prompt(`輸入編號：\n${l.map(([, x], i) => `${i + 1}. ${x}`).join('\n')}`); const x = l[Number(n) - 1]; if (!x) return; r = k === 'account' ? bulkSetAccount(ids, x[0]) : k === 'category' ? bulkSetCategory(ids, x[0]) : bulkSetProject(ids, x[0]); }
  await save(); render(); toast(`已修改 ${r?.changed ?? 0} 筆${r?.skipped ? `，略過 ${r.skipped} 筆` : ''}`); renderFind();
}
document.addEventListener('click', async e => {
  const c = s => e.target.closest?.(s), s = fvSt(); let b; if (c('#openFind') || c('[data-qa=find]')) { openFind(); return; } if (!c('#findBg')) return;
  if (c('[data-fv-cond]')) { s.cond = !s.cond; renderFind(); return; } if (c('[data-fv-mode]')) { s.pick = s.pick ? null : new Set(); s.cond = false; renderFind(); return; }
  if ((b = c('[data-fv-field]'))) { s.field = b.dataset.fvField; renderFind(); return; } if ((b = c('[data-fv-hist]'))) { s.q = b.dataset.fvHist; renderFind(true); return; }
  if ((b = c('[data-fv-unhist]'))) { setPref('searchHist', (prefs().searchHist || []).filter(x => x !== b.dataset.fvUnhist)); renderFind(); return; }
  const read = () => { for (const [i, k] of [['fvFrom', 'from'], ['fvTo', 'to'], ['fvMin', 'min'], ['fvMax', 'max']]) { const x = document.getElementById(i); if (x) s.f[k] = x.value; } };
  if ((b = c('[data-fv-set]'))) { read(); const k = b.dataset.fvSet, v = b.dataset.v; s.f[k] = !v ? [] : s.f[k].includes(v) ? s.f[k].filter(x => x !== v) : [...s.f[k], v]; renderFind(); return; }
  if ((b = c('[data-fv-days]'))) { read(); const n = Number(b.dataset.fvDays); s.f.to = n ? isoDate(new Date()) : ''; s.f.from = n ? addDaysIso(isoDate(new Date()), -n) : ''; renderFind(); return; }
  if ((b = c('[data-fv-sort]'))) { read(); s.f.sort = b.dataset.fvSort; renderFind(); return; } if (c('[data-fv-reset]')) { s.f = fvReset(); renderFind(); return; } if (c('[data-fv-ok]')) { read(); s.cond = false; renderFind(); return; }
  if (c('[data-fv-all]')) { const l = fvRun(s).list; s.pick = s.pick.size >= l.length ? new Set() : new Set(l.map(t => String(t.id))); renderFind(); return; }
  if (c('[data-fv-edit]')) { if (s.pick.size) fvBulkEdit([...s.pick]); return; }
  if (c('[data-fv-del]')) { const l = (state.transactions || []).filter(t => s.pick.has(String(t.id)) && bulkEditable(t) && !t.stmtInst); if (!l.length || !confirm(`確定要批次刪除所選擇的 ${l.length} 筆記錄嗎？帳戶餘額會還原。如果不確定，請先備份後再進行相關操作。`)) return; const ids = new Set(l.map(t => t.id)); for (const t of l) { adjust(t, -1); txAfterDelete(t); } state.transactions = state.transactions.filter(t => !ids.has(t.id)); s.pick = new Set(); await save(); render(); renderFind(); return; }
  if (c('[data-tx-open]')) { searchRemember(s.q); document.getElementById('findBg').hidden = true; }
});
document.addEventListener('change', e => { const b = e.target; if (b?.dataset?.fvPick) { const s = fvSt(); if (b.checked) s.pick.add(b.dataset.fvPick); else s.pick.delete(b.dataset.fvPick); renderFind(); } if (b?.id === 'fvQ') searchRemember(b.value); });
document.addEventListener('input', e => { if (e.target?.id === 'fvQ') { fvSt().q = e.target.value; fvSt().cond = false; renderFind(true); } });
// ---- 報表: start day, interval, 截至今天 ----
// def.every = units per period, def.startDay (month: 1–28, week: 0–6), def.startMonth (year: 1–12); today: def.last = how many units back, or def.from
function rptCycle(def, today, off) {
  const n = Math.max(1, Math.floor(Number(def.every) || 1)), [y, m, d] = today.split('-').map(Number), u = def.unit || 'month', D = (a, b, c) => isoDate(new Date(a, b, c));
  if (u === 'day') { const k = Math.floor(new Date(y, m - 1, d, 12) / 864e5 / n) * n, st = new Date(k * 864e5 + 432e5), s = new Date(st.getFullYear(), st.getMonth(), st.getDate() + off * n); return { start: isoDate(s), end: D(s.getFullYear(), s.getMonth(), s.getDate() + n - 1) }; }
  if (u === 'week') { const ws = def.startDay === undefined || def.startDay === '' ? Number(prefs().weekStart || 0) : Number(def.startDay) % 7, wd = (new Date(y, m - 1, d).getDay() - ws + 7) % 7, base = new Date(y, m - 1, d - wd), wk = Math.floor(Math.round(new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12) / 864e5) / 7), sh = n > 1 ? wk % n : 0; return { start: D(base.getFullYear(), base.getMonth(), base.getDate() - 7 * sh + 7 * n * off), end: D(base.getFullYear(), base.getMonth(), base.getDate() - 7 * sh + 7 * n * (off + 1) - 1) }; }
  if (u === 'year') { const sm = Math.min(12, Math.max(1, Number(def.startMonth) || 1)); let yy = m >= sm ? y : y - 1; yy = Math.floor(yy / n) * n + off * n; return { start: D(yy, sm - 1, 1), end: D(yy + n, sm - 1, 0) }; }
  const sd = def.startDay === undefined || def.startDay === '' ? monthStartDay() : Math.min(28, Math.max(1, Number(def.startDay) || 1)); let mi = y * 12 + m - 1 - (d < sd ? 1 : 0); mi = Math.floor(mi / n) * n + off * n; return { start: D(Math.floor(mi / 12), mi % 12, sd), end: D(Math.floor((mi + n) / 12), (mi + n) % 12, sd - 1) };
}
function rptLast(def, today) { const n = Math.max(1, Math.floor(Number(def.last) || 1)), [y, m, d] = today.split('-').map(Number), u = def.unit || 'month'; return { start: isoDate(u === 'day' ? new Date(y, m - 1, d - n + 1) : u === 'week' ? new Date(y, m - 1, d - 7 * n + 1) : u === 'year' ? new Date(y - n, m - 1, d + 1) : new Date(y, m - 1 - n, d + 1)), end: today }; }
function rptFormHTML(d) {
  const row = (k, l, h, on) => `<label data-rf="${k}"${on ? '' : ' hidden'}>${l}${h}</label>`, t = d.type || 'cycle';
  return `<form id="rptForm"><div class="adv-rows"><label>名稱<input name="name" required maxlength="20" value="${esc(d.name || '')}" placeholder="尚未設定"></label><label>圖示<input name="icon" maxlength="4" value="${esc(d.icon || '')}" placeholder="📊"></label><label>週期類型<select name="type">${[['range', '單一區間'], ['cycle', '重複循環'], ['today', '截至今天']].map(([v, l]) => `<option value="${v}"${t === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>${row('cycle', '結算週期', `<span class="adv-inline">每 <input name="every" type="number" min="1" max="24" value="${esc(d.every || 1)}"><select name="unit">${[['day', '日'], ['week', '週'], ['month', '月'], ['year', '年']].map(([v, l]) => `<option value="${v}"${(d.unit || 'month') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></span>`, t !== 'range')}${row('start', '起始日期（月：第幾天 1～28；週：0＝日…6＝六；年：幾月）', `<input name="startAt" type="number" min="0" max="28" value="${esc((d.unit === 'year' ? d.startMonth : d.startDay) ?? '')}" placeholder="依偏好">`, t === 'cycle')}${row('mode', '截至今天', `<select name="todayMode"><option value="last">最近 n 個週期</option><option value="from"${d.from && t === 'today' && !d.last ? ' selected' : ''}>指定起始日期</option></select>`, t === 'today')}${row('from', '起始日期', `<input type="date" name="from" value="${esc(d.from || '')}">`, t === 'range' || t === 'today')}${row('to', '結束日期', `<input type="date" name="to" value="${esc(d.to || '')}">`, t === 'range')}</div><h3 class="notice-h">篩選條件</h3>${rptFilterHTML(d.filter || {})}<div class="form-actions"><button type="button" class="secondary" data-rpt-cancel>取消</button><button class="primary">儲存</button></div></form>`;
}
// → { def } or { error }
function rptFromForm(f, old) {
  const t = f.get('type'), unit = f.get('unit') || 'month', every = Math.max(1, Math.floor(Number(f.get('every')) || 1)), at = String(f.get('startAt') ?? '').trim(), d = { id: old?.id || id(), name: String(f.get('name') || '').trim(), type: t, unit, from: f.get('from') || '', to: f.get('to') || '', filter: rptFilterFromForm(f) }; const ic = String(f.get('icon') || '').trim(); if (ic) d.icon = ic; if (old?.hidden) d.hidden = true;
  if (t === 'range') { if (!(d.from && d.to && d.from <= d.to)) return { error: '請輸入正確的起訖日期' }; } else if (t === 'today') { if (f.get('todayMode') === 'from') { if (!d.from) return { error: '請選擇起始日期' }; } else { d.last = every; d.from = ''; } }
  else { if (every > 1) d.every = every; if (at !== '') { if (unit === 'year') d.startMonth = Math.min(12, Math.max(1, Number(at) || 1)); else if (unit !== 'day') d.startDay = unit === 'week' ? Number(at) % 7 : Math.min(28, Math.max(1, Number(at) || 1)); } } return { def: d };
}
document.addEventListener('change', e => { const f = e.target?.closest?.('#rptForm'); if (!f || e.target.name !== 'type') return; const t = e.target.value; for (const x of f.querySelectorAll('[data-rf]')) x.hidden = !({ cycle: t !== 'range', start: t === 'cycle', mode: t === 'today', from: t !== 'cycle', to: t === 'range' })[x.dataset.rf]; });
// 報表設定: hide, order, delete.
function renderRptSettings() {
  const el = document.getElementById('rptSetBg'); if (!el || el.hidden) return; const k = window.__rptSet || 'reports', l = k === 'reports' ? rptAll() : cmpAll();
  el.innerHTML = `<div class="recon-sheet">${sheetHead('報表')}<div class="entry-tabs"><button type="button" data-rs-kind="reports" class="${k === 'reports' ? 'active' : ''}">統計（${rptAll().length}）</button><button type="button" data-rs-kind="compares" class="${k === 'compares' ? 'active' : ''}">比較（${cmpAll().length}）</button></div><div class="recon-list notice-list">${l.map((r, i) => `<div class="cat-srow${r.hidden ? ' off' : ''}"><span>${esc(r.icon || (k === 'reports' ? '📊' : '📈'))}</span><b>${esc(r.name)}</b><span class="cat-sact"><button type="button" class="ghost" data-rs-hide="${i}" aria-label="隱藏">${r.hidden ? '🙈' : '👁'}</button><button type="button" class="ghost" data-rs-del="${i}" aria-label="刪除">🗑</button><button type="button" class="ghost" data-rs-up="${i}" ${i ? '' : 'disabled'} aria-label="上移">↑</button></span></div>`).join('')}</div></div>`;
}
function rptAll() { return Array.isArray(prefs().reports) && prefs().reports.length ? prefs().reports : rptDefaults(); }
function cmpAll() { return Array.isArray(prefs().compares) && prefs().compares.length ? prefs().compares : cmpDefaults(); }
document.addEventListener('click', e => {
  const c = s => e.target.closest?.(s); let b; if (c('#openRptSet')) { sheetEl('rptSetBg').hidden = false; renderRptSettings(); return; } if (!c('#rptSetBg')) return; const k = window.__rptSet || 'reports', l = [...(k === 'reports' ? rptAll() : cmpAll())];
  if ((b = c('[data-rs-kind]'))) { window.__rptSet = b.dataset.rsKind; renderRptSettings(); return; }
  if ((b = c('[data-rs-hide]'))) { const i = Number(b.dataset.rsHide); if (!l[i].hidden && l.filter(x => !x.hidden).length < 2) { alert('至少要顯示一個報表'); return; } l[i] = { ...l[i], hidden: !l[i].hidden }; setPref(k, l); renderRptSettings(); return; }
  if ((b = c('[data-rs-del]'))) { const i = Number(b.dataset.rsDel); if (l.length < 2) { alert('至少要保留一個報表'); return; } if (confirm(`刪除「${l[i].name}」？`)) { const x = l.filter((_, j) => j !== i); if (!x.some(y => !y.hidden)) x[0] = { ...x[0], hidden: false }; setPref(k, x); } renderRptSettings(); return; }
  if ((b = c('[data-rs-up]'))) { const i = Number(b.dataset.rsUp); [l[i - 1], l[i]] = [l[i], l[i - 1]]; setPref(k, l); renderRptSettings(); }
});
// ---- 記帳模式 ----
function modeCats(kind) { const m = modeActive(), l = (m?.categories || []).map(String); if (!l.length) return []; return catOrdered(kind).filter(c => l.includes(String(c.id)) && catVisible(c)); }
function modeSummary(m) { const n = k => (m[k] || []).length; return [m.cur, acct(m.account).id !== undefined ? acct(m.account).name : '', (state.projects || []).find(p => String(p.id) === String(m.project))?.name, n('accounts') ? `${n('accounts')} 組帳戶` : '', n('projects') ? `${n('projects')} 組專案` : '', n('categories') ? `${n('categories')} 組類別` : ''].filter(Boolean).join('・') || '未設定'; }
// ---- 發票與草稿同步: one hidden record like the preferences (id __inbox__); newest change of each item wins ----
function inboxHost() { return (state?.categories || []).find(c => c.id === '__inbox__') || null; }
function inboxData() { const d = draftDb(), v = invDb(); return { drafts: d.list, rules: d.rules, accts: d.accts, invoices: v.list, win: v.win, gone: (prefs().inboxGone || []).slice(-300) }; }
function inboxPush() {
  if (!prefSyncOn() || !state) return false; const d = JSON.parse(JSON.stringify(inboxData())), h = inboxHost(); if (h && JSON.stringify(h.data) === JSON.stringify(d)) return false;
  const rec = { id: '__inbox__', kind: 'prefs', name: '通知草稿與發票（同步用）', icon: '⚙', hidden: true, order: 1e9, data: d, at: Date.now() }; if (h) Object.assign(h, rec); else (state.categories = state.categories || []).push(rec); inboxSeen(rec.at); return true;
}
function inboxSeen(at) { prefs().inboxAt = at; try { localStorage.setItem(prefsKey(), JSON.stringify(prefsCache)); } catch { } }
// Merges the shared inbox: items of both sides, minus everything either side finished.
function inboxMerge(local, remote) {
  const gone = [...new Set([...(local.gone || []), ...(remote.gone || [])])].slice(-300), g = new Set(gone), key = x => x.no ? 'i' + x.no : 'd' + x.at + '|' + String(x.text).slice(0, 40), join = (a, b) => { const m = new Map(); for (const x of [...(b || []), ...(a || [])]) if (!g.has(key(x))) m.set(key(x), x); return [...m.values()].sort((x, y) => (y.at || 0) - (x.at || 0)); };
  return { drafts: join(local.drafts, remote.drafts), invoices: join(local.invoices, remote.invoices), rules: { ...local.rules, ...remote.rules }, accts: { ...local.accts, ...remote.accts }, win: { ...local.win, ...remote.win }, gone };
}
function inboxPull() {
  const h = inboxHost(); if (!prefSyncOn() || !h?.data || !(Number(h.at) > Number(prefs().inboxAt || 0))) return false; const m = inboxMerge(inboxData(), h.data), d = draftDb(), v = invDb();
  d.list = m.drafts.map(x => ({ ...x, id: x.id && d.list.some(y => y.id === x.id && y.at === x.at) ? x.id : 'd' + (++d.seq) })); d.rules = m.rules; d.accts = m.accts; v.list = m.invoices; v.win = m.win; prefs().inboxGone = m.gone; window.__inboxQuiet = true; draftStore(); invStore(); window.__inboxQuiet = false; inboxSeen(Number(h.at)); return true;
}
function inboxGone(x) { const k = x.no ? 'i' + x.no : 'd' + x.at + '|' + String(x.text).slice(0, 40), l = [...(prefs().inboxGone || []).filter(y => y !== k), k].slice(-300); prefs().inboxGone = l; try { localStorage.setItem(prefsKey(), JSON.stringify(prefsCache)); } catch { } }
function inboxTouch() { if (window.__inboxQuiet || !prefSyncOn()) return; clearTimeout(window.__inboxTimer); window.__inboxTimer = setTimeout(async () => { if (inboxPush()) await save(); }, 1200); }
