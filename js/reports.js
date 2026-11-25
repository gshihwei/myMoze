// 帳小簿 V26.77 — 自訂統計報表與比較報表.
// Bundled after js/rewards.js. Function declarations / var only. Definitions are per device (prefs.reports / prefs.compares).
// report: { id, name, type: cycle|range|today, unit: day|week|month|year, from, to, filter }
// filter: { accounts|projects|categories|names|merchants|tags|rewards|kinds|events|exec: { mode, list }, min, max }

function rptKeys() { return [...projRuleKeys(), ['rewards', '紅利回饋'], ['kinds', '記錄類型'], ['events', '事件類型'], ['exec', '執行方式']]; }
function rptKindLabel(k) { return { expense: '支出', income: '收入', transfer: '轉帳', loan: '借還款', loanPayment: '收還款' }[k] || ''; }
function rptEvent(t) { return t.recurringId ? 'recurring' : t.installment || t.stmtInst ? 'installment' : 'single'; }
function rptExec(t) { return t.pending ? 'remind' : t.postDate ? 'postpone' : 'now'; }
function rptHit(k, list, t) {
  if (k === 'kinds') return list.includes(t.kind); if (k === 'events') return list.includes(rptEvent(t)); if (k === 'exec') return list.includes(rptExec(t));
  if (k === 'rewards') return (t.rewards || []).some(x => list.includes(x));
  if (k === 'projects') return list.map(String).some(pid => { const p = (state.projects || []).find(x => String(x.id) === pid); return p?.rules ? projMatch(p, t) : String(t.project || '') === pid; });
  return projRuleHit(k, list, t);
}
function rptMatch(f, t) {
  if (!rptKindLabel(t.kind) || isUnappliedPending(t)) return false;
  for (const [k] of rptKeys()) { const r = f?.[k]; if (r?.list?.length && rptHit(k, r.list, t) !== (r.mode !== 'ex')) return false; }
  const a = Math.abs(Number(t.amount || 0)); if (f?.min !== undefined && f.min !== '' && a < Number(f.min)) return false; if (f?.max !== undefined && f.max !== '' && a > Number(f.max)) return false;
  return true;
}
// Period `off` units away from the one containing `today`.
function rptUnit(unit, today, off) {
  const [y, m, d] = today.split('-').map(Number);
  if (unit === 'day') { const x = isoDate(new Date(y, m - 1, d + off)); return { start: x, end: x }; }
  if (unit === 'week') { const wd = (new Date(y, m - 1, d).getDay() - (prefs().weekStart || 0) + 7) % 7; return { start: isoDate(new Date(y, m - 1, d - wd + off * 7)), end: isoDate(new Date(y, m - 1, d - wd + off * 7 + 6)) }; }
  if (unit === 'year') return { start: `${y + off}-01-01`, end: `${y + off}-12-31` };
  return periodBounds(addMonths(periodKeyOf(today), off));
}
function rptPeriod(def, off, today) {
  const t = today || isoDate(new Date());
  if (def.type === 'range') return { start: def.from || '0000-01-01', end: def.to || '9999-12-31' };
  if (def.type === 'today') return def.last ? rptLast(def, t) : { start: def.from || rptUnit(def.unit || 'month', t, 0).start, end: t };
  if (Number(def.every) > 1 || def.startDay !== undefined || def.startMonth) return rptCycle(def, t, off || 0);
  return rptUnit(def.unit || 'month', t, off || 0);
}
function rptTxs(def, off, today) { const p = rptPeriod(def, off, today); return (state.transactions || []).filter(t => t.date >= p.start && t.date <= p.end && rptMatch(def.filter, t)); }
function rptDefaults() { return [{ id: 'w', name: '每週報表', type: 'cycle', unit: 'week', filter: {} }, { id: 'm', name: '每月報表', type: 'cycle', unit: 'month', filter: {} }, { id: 'y', name: '年度報表', type: 'cycle', unit: 'year', filter: {} }]; }
function rptList() { const l = rptAll().filter(r => !r.hidden); return l.length ? l : rptAll(); }
function rptTabs() { return [['ov', '總覽'], ['tx', '明細'], ['cat', '類別'], ['rank', '排行'], ['acct', '帳戶'], ['proj', '專案'], ['grp', '帳戶分組'], ['name', '名稱'], ['mer', '商家'], ['tag', '標籤'], ['per', '對象']]; }
function rptGroup(txs, kind, keyOf, limit) { const map = new Map(); for (const t of txs) if (t.kind === kind) for (const k of keyOf(t)) if (k) anAdd(map, k, { id: k, name: k }, anValue(t)); return anRank(map, limit || 30); }
function rptCats(txs, kind, drill) {
  const map = new Map();
  for (const t of txs) if (t.kind === kind) for (const [cid, v] of anParts(t)) { const top = anTopCategory(cid); if (drill && top !== String(drill)) continue; const key = drill ? String(cid) : top, c = cat(key); anAdd(map, key, { id: key, name: c.name, icon: c.icon, drillable: !drill }, v); }
  return anRank(map, 40);
}
function rptTotals(txs) {
  const o = {}; for (const t of txs) { const k = t.kind; o[k] = o[k] || { amount: 0, count: 0 }; o[k].amount += anValue(t); o[k].count++; }
  for (const k of Object.keys(o)) o[k].amount = Math.round(o[k].amount); return o;
}
function rptSt() { return window.__rpt || (window.__rpt = { id: 'm', off: 0, tab: 'ov', kind: 'expense', drill: null, asc: false, menu: false, edit: null }); }
function rptRowHTML(t) { const v = txEffect(t); return `<button type="button" class="notice-row" data-tx-open="${esc(t.id)}"><div class="notice-ico">${catIconHTML(cat(t.category))}</div><div class="day-main"><b>${esc(t.name)}</b><small>${fmtDate(t.date)} ${esc(t.merchant || t.person || '')} · ${acctName(acct(t.account))}</small></div><div class="day-side"><b class="${v < 0 ? 'expense-text' : v > 0 ? 'income-text' : ''}">${acctMoney(v || t.amount, acct(t.account))}</b></div></button>`; }
function rptFilterHTML(f) {
  const opts = { accounts: (state.accounts || []).map(a => [a.id, a.name]), projects: (state.projects || []).map(p => [p.id, p.name]), categories: catOrdered().map(c => [c.id, (c.parentId ? '└ ' : '') + c.name]), rewards: (state.accounts || []).flatMap(a => rewardRules(a).map(r => [r.id, `${a.name}・${r.name}`])), kinds: ['expense', 'income', 'transfer', 'loan', 'loanPayment'].map(k => [k, rptKindLabel(k)]), events: [['single', '單次'], ['recurring', '週期'], ['installment', '分期']], exec: [['now', '立即入帳'], ['postpone', '延後入帳']] };
  return rptKeys().map(([k, l]) => { const r = f[k] || { mode: 'in', list: [] }, sel = r.list.map(String); return `<div class="proj-rule"><span>${l}</span><select name="pr_${k}_mode"><option value="in">包含</option><option value="ex"${r.mode === 'ex' ? ' selected' : ''}>排除</option></select>${opts[k] ? `<details><summary>${sel.length ? `已選 ${sel.length}` : '不限'}</summary><div class="mode-checks">${opts[k].map(([v, n]) => `<label><input type="checkbox" name="pr_${k}" value="${esc(v)}"${sel.includes(String(v)) ? ' checked' : ''}> ${esc(n)}</label>`).join('')}</div></details>` : `<input name="pr_${k}" value="${esc(r.list.join('、'))}" placeholder="以、分隔，留空＝不限">`}</div>`; }).join('') + `<div class="form-grid"><label>金額下限<input name="pr_min" type="number" min="0" step="any" value="${esc(f.min ?? '')}"></label><label>金額上限<input name="pr_max" type="number" min="0" step="any" value="${esc(f.max ?? '')}"></label></div>`;
}
function rptFilterFromForm(f) {
  const out = {}, text = ['names', 'merchants', 'tags'];
  for (const [k] of rptKeys()) { const list = text.includes(k) ? String(f.get('pr_' + k) || '').split(/[、,，\n]+/).map(x => x.trim().replace(/^#/, '')).filter(Boolean) : f.getAll('pr_' + k).map(String); if (list.length) out[k] = { mode: f.get(`pr_${k}_mode`) === 'ex' ? 'ex' : 'in', list }; }
  for (const k of ['min', 'max']) { const v = String(f.get('pr_' + k) ?? '').trim(); if (v !== '' && Number(v) >= 0) out[k] = Number(v); } return out;
}
function rptUnitOpts(cur) { return [['day', '每日'], ['week', '每週'], ['month', '每月'], ['year', '每年']].map(([v, l]) => `<option value="${v}"${cur === v ? ' selected' : ''}>${l}</option>`).join(''); }
function renderReport() {
  const el = document.getElementById('rptBg'); if (!el || el.hidden) return;
  const s = rptSt(), l = rptList(), def = l.find(x => x.id === s.id) || l[0]; s.id = def.id;
  const p = rptPeriod(def, s.off), txs = rptTxs(def, s.off);
  el.innerHTML = `<div class="recon-sheet fc-sheet">${sheetHead(`<select id="rptPick" aria-label="報表">${l.map(x => `<option value="${esc(x.id)}"${x.id === def.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`, '<span><button type="button" class="icon" data-rv-pick aria-label="選擇報表">▦</button><button type="button" class="icon" data-rpt-menu aria-label="選單">⋯</button></span>')}${s.menu ? '<div class="recon-menu"><button type="button" data-rpt-act="new">新增報表</button><button type="button" data-rpt-act="edit">編輯報表</button><button type="button" data-rpt-act="copy">複製報表</button><button type="button" data-rpt-act="up">往前移</button><button type="button" data-rpt-act="csv">匯出 CSV</button><button type="button" data-rpt-act="del">刪除報表</button></div>' : ''}${s.edit ? `<div class="recon-list notice-list">${rptFormHTML(s.edit)}</div>` : `<div class="recon-period"><button type="button" data-rpt-off="-1" ${def.type === 'cycle' ? '' : 'disabled'} aria-label="上一期">‹</button><button type="button" class="tx-link" data-rv-periods><strong>${p.start} ～ ${p.end}</strong></button><button type="button" data-rpt-off="1" ${def.type === 'cycle' ? '' : 'disabled'} aria-label="下一期">›</button></div><div class="entry-tabs">${rptTabs().map(([k, n]) => `<button type="button" data-rpt-tab="${k}" class="${k === s.tab ? 'active' : ''}">${n}</button>`).join('')}</div><div class="recon-list notice-list">${rptBodyHTML(def, s, txs)}</div>`}</div>`;
}

// ---- 比較報表 ----
function cmpDefaults() { return [{ id: 'k', name: '記錄類型', by: 'kind', unit: 'month', count: 12, filter: {} }, { id: 'e', name: '支出類別', by: 'expense', unit: 'month', count: 12, filter: {} }, { id: 'i', name: '收入類別', by: 'income', unit: 'month', count: 12, filter: {} }, { id: 's', name: '所有支出子類別', by: 'sub', unit: 'month', count: 12, filter: {} }]; }
function cmpList() { const l = cmpAll().filter(r => !r.hidden); return l.length ? l : cmpAll(); }
function cmpByLabel() { return [['kind', '記錄類型'], ['expense', '支出類別'], ['income', '收入類別'], ['sub', '支出子類別'], ['project', '專案（支出）'], ['group', '帳戶分組（支出）'], ['account', '帳戶（支出）'], ['merchant', '商家（支出）'], ['tag', '標籤（支出）']]; }
// [[column key, column name, amount]] of one transaction.
function cmpCells(by, t) {
  if (by === 'kind') { const k = rptType(t); return [[k, k, anValue(t)]]; }
  if (by === 'income' ? t.kind !== 'income' : t.kind !== 'expense') return [];
  if (by === 'expense' || by === 'income') return anParts(t).map(([c, v]) => { const k = anTopCategory(c); return [k, cat(k).name, v]; });
  if (by === 'sub') return anParts(t).map(([c, v]) => [String(c), cat(c).name, v]);
  if (by === 'project') { const l = (state.projects || []).filter(p => projMatch(p, t)); return l.length ? l.map(p => [String(p.id), p.name, anValue(t)]) : [['', '無專案', anValue(t)]]; }
  if (by === 'group') { const g = acct(t.account).group || acctTypeLabel(acct(t.account)); return [[g, g, anValue(t)]]; } if (by === 'account') return [[String(t.account), acct(t.account).name, anValue(t)]];
  if (by === 'merchant') return t.merchant ? [[t.merchant, t.merchant, anValue(t)]] : []; return (t.tags || []).map(x => [x, '#' + x, anValue(t)]);
}
function cmpPeriodLabel(unit, p) { return unit === 'year' ? p.start.slice(0, 4) : unit === 'month' ? p.start.slice(0, 7).replace('-', '/') : unit === 'week' ? p.start.slice(5).replace('-', '/') + '～' : p.start.slice(5).replace('-', '/'); }
// { periods:[{start,end,label}], cols:[{key,name,total,count}], cell: { 'i|key': amount } } — oldest period first.
function cmpBuild(def, today) {
  const t0 = today || isoDate(new Date()), n = Math.min(60, Math.max(2, Number(def.count) || 12)), periods = [];
  for (let k = n - 1; k >= 0; k--) { const p = rptUnit(def.unit || 'month', t0, -k); periods.push({ ...p, label: cmpPeriodLabel(def.unit || 'month', p) }); }
  const cols = new Map(), cell = {};
  for (const t of (state.transactions || [])) {
    if (t.date < periods[0].start || t.date > periods[n - 1].end || !rptMatch(def.filter, t)) continue;
    const i = periods.findIndex(p => t.date >= p.start && t.date <= p.end); if (i < 0) continue;
    for (const [key, name, v] of cmpCells(def.by, t)) { const c = cols.get(key) || { key, name, total: 0, count: 0 }; c.total += v; c.count++; cols.set(key, c); const ck = i + '|' + key; cell[ck] = (cell[ck] || 0) + v; }
  }
  for (const k of Object.keys(cell)) cell[k] = Math.round(cell[k]);
  return { periods, cols: [...cols.values()].map(c => ({ ...c, total: Math.round(c.total) })).sort((a, b) => b.total - a.total), cell };
}
// Totals over the selected rows / columns (empty selection = all).
function cmpCalc(m, rows, cols) {
  const R = m.periods.map((_, i) => i).filter(i => !rows?.length || rows.includes(i)), C = m.cols.filter(c => !cols?.length || cols.includes(c.key));
  const rowTotal = m.periods.map((_, i) => C.reduce((s, c) => s + (m.cell[i + '|' + c.key] || 0), 0));
  return { rowTotal, growth: rowTotal.map((v, i) => i && rowTotal[i - 1] ? (v - rowTotal[i - 1]) / Math.abs(rowTotal[i - 1]) : null), colTotal: Object.fromEntries(m.cols.map(c => [c.key, R.reduce((s, i) => s + (m.cell[i + '|' + c.key] || 0), 0)])), n: R.length, R, C };
}
function cmpSt() { return window.__cmp || (window.__cmp = { id: 'k', rows: [], cols: [], menu: false, edit: null, view: 'table', cell: null, sort: 'order', cum: false }); }
function cmpColors() { return ['#3f86e6', '#e8c88c', '#9a63c9', '#d4706e', '#6f8f5e', '#f5a623', '#d99ac9', '#40c0b0', '#aaa88f', '#e24c4c']; }
function cmpStackSVG(m, K, w) {
  const W = w || 700, H = 220, top = K.C.slice(0, 9), max = Math.max(1, ...K.R.map(i => K.rowTotal[i])), bw = W / Math.max(1, K.R.length), col = cmpColors(), avg = K.R.reduce((s, i) => s + K.rowTotal[i], 0) / Math.max(1, K.R.length);
  return `<svg class="cmp-svg" viewBox="0 0 ${W} ${H + 24}" role="img" aria-label="區間統計">${K.R.map((i, x) => { let y = H, rest = K.rowTotal[i]; const seg = top.map((c, j) => [m.cell[i + '|' + c.key] || 0, col[j]]); for (const s of seg) rest -= s[0]; if (rest > 0) seg.push([rest, '#5b6b7a']); return `<g data-cmp-bar="${i}"><rect x="${x * bw}" y="0" width="${bw}" height="${H}" fill="transparent"/>${seg.map(([v, c]) => { const h = Math.max(0, v / max * (H - 10)); y -= h; return h ? `<rect x="${(x * bw + bw * 0.18).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" fill="${c}"/>` : ''; }).join('')}<text x="${x * bw + bw / 2}" y="${H + 16}" text-anchor="middle" font-size="11" fill="#8194a7">${m.periods[i].label.slice(-5)}</text></g>`; }).join('')}<line x1="0" x2="${W}" y1="${(H - avg / max * (H - 10)).toFixed(1)}" y2="${(H - avg / max * (H - 10)).toFixed(1)}" stroke="#eef4fa" stroke-dasharray="4 4" opacity=".6"/></svg><div class="an-legend">${top.map((c, j) => `<span><i style="background:${col[j]}"></i>${esc(c.name)}</span>`).join('')}<span>┄ 平均 ${money(Math.round(avg))}</span></div>`;
}
function cmpTxs(def, m, R, C) {
  const keys = new Set(C.map(c => c.key)); return (state.transactions || []).filter(t => R.some(i => t.date >= m.periods[i].start && t.date <= m.periods[i].end) && rptMatch(def.filter, t) && cmpCells(def.by, t).some(([k]) => keys.has(k))).sort((a, b) => b.date.localeCompare(a.date));
}
function cmpViewHTML(def, s, m) {
  const K = cmpCalc(m, s.rows, s.cols), pc = v => v === null ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`, f = v => v ? money(v) : '—';
  const colMax = Object.fromEntries(m.cols.map(c => [c.key, Math.max(0, ...m.periods.map((_, i) => m.cell[i + '|' + c.key] || 0))]));
  if (s.view === 'table') return `<div class="cmp-wrap"><table class="cmp"><thead><tr><th></th>${m.cols.map(c => `<th><button type="button" data-cmp-col="${esc(c.key)}" class="${s.cols.includes(c.key) ? 'on' : ''}">${esc(c.name)}</button></th>`).join('')}<th>總計</th><th>${def.unit === 'month' ? '月增率' : '增率'}</th></tr></thead><tbody>${m.periods.map((p, i) => `<tr class="${s.rows.length && !s.rows.includes(i) ? 'dim' : ''}${s.anchor === i ? ' anchor' : ''}"><th><button type="button" data-cmp-row="${i}" class="${s.rows.includes(i) ? 'on' : ''}">${p.label}</button></th>${m.cols.map(c => `<td style="${cmpHeat(m.cell[i + '|' + c.key], colMax[c.key], cmpIncomeKey(def, c.key) ? 'in' : 'out')}" class="${s.cols.length && !s.cols.includes(c.key) ? 'dim' : ''}"><button type="button" data-cmp-cell="${i}" data-key="${esc(c.key)}">${f(m.cell[i + '|' + c.key])}</button></td>`).join('')}<td><b>${f(K.rowTotal[i])}</b></td><td class="${K.growth[i] > 0 ? 'expense-text' : 'income-text'}">${pc(K.growth[i])}</td></tr>`).reverse().join('')}</tbody><tfoot><tr><th>合計</th>${m.cols.map(c => `<td>${f(K.colTotal[c.key])}</td>`).join('')}<td><b>${f(K.R.reduce((x, i) => x + K.rowTotal[i], 0))}</b></td><td></td></tr><tr><th>平均</th>${m.cols.map(c => `<td>${f(Math.round(K.colTotal[c.key] / Math.max(1, K.n)))}</td>`).join('')}<td><b>${f(Math.round(K.R.reduce((x, i) => x + K.rowTotal[i], 0) / Math.max(1, K.n)))}</b></td><td></td></tr></tfoot></table></div><p class="hint">點期間或項目標題可多選，合計、平均、總計依所選重算；長按期間可選一段範圍，長按項目可全選；點格子看交易。</p>`;
  const tot = K.C.reduce((x, c) => x + K.colTotal[c.key], 0);
  if (s.view === 'stat' || s.view === 'share') { const l = [...K.C]; if (s.sort === 'amount' || s.view === 'share') l.sort((a, b) => K.colTotal[b.key] - K.colTotal[a.key]); if (s.sort === 'count') l.sort((a, b) => b.count - a.count); return `${s.view === 'stat' ? `<select id="cmpSort"><option value="order">依欄位順序</option><option value="amount"${s.sort === 'amount' ? ' selected' : ''}>依金額</option><option value="count"${s.sort === 'count' ? ' selected' : ''}>依次數</option></select>` : ''}${l.map(c => `<div class="cmp-stat"><span>${esc(c.name)}</span><small>${c.count} 筆 · 平均 ${money(Math.round(K.colTotal[c.key] / Math.max(1, K.n)))}</small><b>${money(K.colTotal[c.key])}</b><small>${tot ? (K.colTotal[c.key] / tot * 100).toFixed(1) : 0}%</small>${s.view === 'share' ? `<i style="width:${tot ? Math.max(1, K.colTotal[c.key] / tot * 100) : 0}%"></i>` : ''}</div>`).join('')}`; }
  if (s.view === 'bars') { const i = s.cell?.row; return cmpStackSVG(m, K) + (i !== undefined ? `<h3 class="notice-h">${m.periods[i].label}　${money(K.rowTotal[i])}（${pc(K.growth[i])}）</h3>${K.C.map(c => [c, m.cell[i + '|' + c.key] || 0]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).map(([c, v]) => infoRow(c.name, money(v))).join('')}` : '<p class="hint">點長條看該區間統計。</p>'); }
  if (s.view === 'lines') return `<label class="check"><input type="checkbox" id="cmpCum"${s.cum ? ' checked' : ''}> 累積顯示</label>` + K.C.slice(0, 8).map((c, j) => { let a = 0; return `<h3 class="notice-h">${esc(c.name)}</h3>${anLineSVG(K.R.map(i => { const v = m.cell[i + '|' + c.key] || 0; a += v; return { v: s.cum ? a : v, label: m.periods[i].label.slice(-5) }; }), cmpColors()[j], 700)}`; }).join('');
  const l = cmpTxs(def, m, s.cell ? [s.cell.row] : K.R, s.cell?.key !== undefined ? m.cols.filter(c => c.key === s.cell.key) : K.C); return `<div class="notice-total">${l.length} 筆 · ${money(Math.round(l.reduce((x, t) => x + anValue(t), 0)))}</div>${l.slice(0, 300).map(rptRowHTML).join('') || '<div class="recon-empty">沒有記錄</div>'}`;
}
function cmpFormHTML(d) { return `<form id="cmpForm"><div class="form-grid"><label>名稱<input name="name" required maxlength="20" value="${esc(d.name || '')}"></label><label>比較項目<select name="by">${cmpByLabel().map(([v, l]) => `<option value="${v}"${d.by === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label>結算週期<select name="unit">${rptUnitOpts(d.unit || 'month')}</select></label><label>期數<input name="count" type="number" min="2" max="60" value="${esc(d.count || 12)}"></label></div><h3 class="notice-h">篩選條件</h3>${rptFilterHTML(d.filter || {})}<div class="form-actions"><button type="button" class="secondary" data-rpt-cancel>取消</button><button class="primary">儲存</button></div></form>`; }
function renderCompare() {
  const el = document.getElementById('cmpBg'); if (!el || el.hidden) return;
  const s = cmpSt(), l = cmpList(), def = l.find(x => x.id === s.id) || l[0]; s.id = def.id; const m = s.edit ? null : cmpBuild(def);
  el.innerHTML = `<div class="recon-sheet fc-sheet">${sheetHead(`<select id="cmpPick" aria-label="比較報表">${l.map(x => `<option value="${esc(x.id)}"${x.id === def.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`, '<button type="button" class="icon" data-cmp-menu aria-label="選單">⋯</button>')}${s.menu ? '<div class="recon-menu"><button type="button" data-cmp-act="new">新增報表</button><button type="button" data-cmp-act="edit">編輯報表</button><button type="button" data-cmp-act="all">全選所有欄位</button><button type="button" data-cmp-act="none">取消選取</button><button type="button" data-cmp-act="del">刪除報表</button></div>' : ''}${s.edit ? `<div class="recon-list notice-list">${cmpFormHTML(s.edit)}</div>` : `<div class="recon-list notice-list">${s.view === 'all' ? `<button type="button" class="ghost" data-ca-back>← 比較表</button>${cmpAnalysisHTML(def, s, m)}` : cmpViewHTML(def, { ...s, view: 'table' }, m)}</div>${s.view === 'all' ? '' : `<div class="recon-bar"><div class="recon-bar-row"><span>區間：${s.rows.length ? `已選 ${s.rows.length} 個` : `共 ${m.periods.length} 個`}　項目：${s.cols.length ? `已選 ${s.cols.length} 個` : `共 ${m.cols.length} 個`}</span><button type="button" class="primary" data-ca-open>分析</button></div></div>`}`}</div>`;
}
document.addEventListener('click', e => {
  const c = s => e.target.closest?.(s), R = rptSt(), C = cmpSt();
  if (c('#openReports')) { sheetEl('rptBg').hidden = false; R.edit = null; R.menu = false; renderReport(); return; }
  if (c('#openCompare')) { sheetEl('cmpBg').hidden = false; C.edit = null; C.menu = false; renderCompare(); return; }
  if (c('[data-rpt-cancel]')) { R.edit = C.edit = null; renderReport(); renderCompare(); return; }
  const go = fn => { fn(); renderReport(); }, g2 = fn => { fn(); renderCompare(); };
  let b;
  if ((b = c('[data-rpt-menu]'))) return go(() => { R.menu = !R.menu; });
  if ((b = c('[data-rpt-off]'))) return go(() => { R.off = Math.min(0, R.off + Number(b.dataset.rptOff)); R.drill = null; });
  if ((b = c('[data-rpt-tab]'))) return go(() => { R.tab = b.dataset.rptTab; R.drill = null; });
  if ((b = c('[data-rpt-asc]'))) return go(() => { R.asc = !R.asc; });
  if ((b = c('#rptBg [data-an-drill]')) || (b = c('[data-rpt-drill]'))) return go(() => { R.drill = b.dataset.anDrill || b.dataset.rptDrill || null; });
  if ((b = c('[data-rpt-act]'))) {
    const a = b.dataset.rptAct, l = rptAll(), i = l.findIndex(x => x.id === R.id), d = l[i]; R.menu = false;
    if (a === 'new') R.edit = { filter: {} }; else if (a === 'edit') R.edit = d; else if (a === 'copy') { const n = { ...JSON.parse(JSON.stringify(d)), id: id(), name: `${d.name} 複製`.slice(0, 20) }; setPref('reports', [...l, n]); R.id = n.id; }
    else if (a === 'up' && i > 0) { const x = [...l]; [x[i - 1], x[i]] = [x[i], x[i - 1]]; setPref('reports', x); }
    else if (a === 'del') { if (l.length < 2) alert('至少要保留一個報表'); else if (confirm(`刪除「${d.name}」？`)) { setPref('reports', l.filter(x => x !== d)); R.id = ''; } }
    else if (a === 'csv') { const blob = new Blob(['﻿' + txExportCsv(rptTxs(d, R.off))], { type: 'text/csv;charset=utf-8' }), u = URL.createObjectURL(blob), x = document.createElement('a'); x.href = u; x.download = `${d.name}-${rptPeriod(d, R.off).start}.csv`; x.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); }
    renderReport(); return;
  }
  if ((b = c('[data-cmp-menu]'))) return g2(() => { C.menu = !C.menu; });
  if ((b = c('[data-cmp-view]'))) return g2(() => { C.view = b.dataset.cmpView; C.cell = null; });
  const tog = (l, v) => l.includes(v) ? l.filter(x => x !== v) : [...l, v];
  if ((b = c('[data-cmp-row]'))) return g2(() => { const i = Number(b.dataset.cmpRow); if (e.shiftKey && C.rows.length) { const a = C.rows.at(-1), lo = Math.min(a, i), hi = Math.max(a, i); C.rows = [...new Set([...C.rows, ...Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)])]; } else C.rows = tog(C.rows, i); });
  if ((b = c('[data-cmp-col]'))) return g2(() => { C.cols = tog(C.cols, b.dataset.cmpCol); });
  if ((b = c('[data-cmp-cell]'))) return g2(() => { C.view = 'tx'; C.cell = { row: Number(b.dataset.cmpCell), key: b.dataset.key }; });
  if ((b = c('[data-cmp-bar]'))) return g2(() => { C.cell = { row: Number(b.dataset.cmpBar) }; });
  if ((b = c('[data-cmp-act]'))) return g2(() => {
    const a = b.dataset.cmpAct, l = cmpAll(), d = l.find(x => x.id === C.id); C.menu = false;
    if (a === 'new') C.edit = { by: 'kind', filter: {} }; else if (a === 'edit') C.edit = d; else if (a === 'all') C.cols = cmpBuild(d).cols.map(x => x.key); else if (a === 'none') { C.rows = []; C.cols = []; }
    else if (a === 'del') { if (l.length < 2) alert('至少要保留一個報表'); else if (confirm(`刪除「${d.name}」？`)) { setPref('compares', l.filter(x => x !== d)); C.id = ''; } }
  });
});
document.addEventListener('change', e => {
  const t = e.target, R = rptSt(), C = cmpSt();
  if (t?.id === 'rptPick') { R.id = t.value; R.off = 0; R.drill = null; renderReport(); } if (t?.name === 'rptKind') { R.kind = t.value; R.drill = null; renderReport(); }
  if (t?.id === 'cmpPick') { C.id = t.value; C.rows = []; C.cols = []; C.cell = null; C.view = 'table'; renderCompare(); } if (t?.id === 'cmpSort') { C.sort = t.value; renderCompare(); } if (t?.id === 'cmpCum') { C.cum = t.checked; renderCompare(); }
});
document.addEventListener('submit', e => {
  if (e.target?.id === 'rptForm') { e.preventDefault(); const RS = rptSt(), l = rptAll(), r = rptFromForm(new FormData(e.target), RS.edit); if (r.error) { alert(r.error); return; } setPref('reports', RS.edit.id ? l.map(x => x.id === r.def.id ? r.def : x) : [...l, r.def]); RS.id = r.def.id; RS.off = 0; RS.edit = null; renderReport(); }
  if (e.target?.id === 'cmpForm') { e.preventDefault(); const f = new FormData(e.target), C = cmpSt(), l = cmpAll(), d = { id: C.edit.id || id(), name: String(f.get('name')).trim(), by: f.get('by'), unit: f.get('unit'), count: Number(f.get('count')) || 12, filter: rptFilterFromForm(f) }; setPref('compares', C.edit.id ? l.map(x => x.id === d.id ? d : x) : [...l, d]); C.id = d.id; C.rows = []; C.cols = []; C.edit = null; C.view = 'table'; renderCompare(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.querySelector('.modal-bg.open')) for (const i of ['rptBg', 'cmpBg']) { const el = document.getElementById(i); if (el) el.hidden = true; } });
