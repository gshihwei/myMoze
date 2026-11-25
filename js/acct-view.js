// 帳小簿 V26.91 — 帳戶總覽與帳戶明細 (依 MOZE「帳戶總覽」)：總額圖表、分組／幣種佔比、自訂分組、主帳戶、其他群組、每期統計、一般帳戶對帳.
// Bundled after js/entry-items.js. Function declarations / var only.

// ---- numbers ----
function bigMoney(n) {
  if (privacyOn()) return '••••'; const u = prefs().bigUnit, a = Math.abs(n), s = n < 0 ? '−' : '', f = v => +v.toFixed(2);
  if (u === 'wan' && a >= 1e4) return a >= 1e8 ? `${s}${f(a / 1e8)} 億` : `${s}${f(a / 1e4)} 萬`;
  if (u === 'k' && a >= 1e3) return a >= 1e6 ? `${s}${f(a / 1e6)}M` : `${s}${f(a / 1e3)}K`;
  return `${s}${money(a)}`;
}
// Effects of records dated after `today`, per account id. The account list shows balances as of now (MOZE: 不包含未來尚未入帳的交易).
function acctFuture(today) {
  const t0 = today || isoDate(new Date()), m = new Map();
  for (const t of (state.transactions || [])) if (t.date > t0) for (const [k, v] of ledgerEffects(t)) m.set(String(k), (m.get(String(k)) || 0) + v);
  return m;
}
function acctNow(a, fut) { return Math.round((Number(a.balance || 0) - ((fut || acctFuture()).get(String(a.id)) || 0)) * 100) / 100; }
// 其他 group: 應收應付款項 and 分期帳款 (instalments still to come, TWD).
function acctOtherTotals(today) {
  const t0 = today || isoDate(new Date()); let loans = 0, inst = 0;
  for (const l of (state.loans || [])) if (!l.excludeNet) loans += (loanDirection(l) === 'receivable' ? 1 : -1) * loanOutstanding(l);
  for (const t of (state.transactions || [])) if (t.installment && t.date > t0) inst += txTWD(Math.abs(Number(t.amount || 0)), t.account) ?? Number(t.amount || 0);
  return { loans: Math.round(loans), inst: Math.round(inst) };
}
function acctOtherHTML(collapsed) {
  const o = acctOtherTotals(); return `<button type="button" class="acct-group-head" data-acct-group="other" aria-expanded="${collapsed ? 'false' : 'true'}"><span>${collapsed ? '＋' : '−'} 其他</span><span class="acct-group-total">${acctSignedMoney(o.loans)}</span></button>${collapsed ? '' : `<div class="normal-accounts"><button type="button" class="account-tile acct-virtual" data-goto="loans"><div class="account-tile-icon">🤝</div><div class="account-tile-main"><b>應收應付款項</b><span>追蹤你的借還款歷史</span></div><strong class="${o.loans < 0 ? 'expense-text' : 'income-text'}">${acctSignedMoney(o.loans)}</strong></button><button type="button" class="account-tile acct-virtual" data-goto="recurring"><div class="account-tile-icon">💳</div><div class="account-tile-main"><b>分期帳款</b><span>統計你的分期未入帳金額</span></div><strong>${money(o.inst)}</strong></button></div>`}`;
}
function cardTileInfo(a) {
  const bills = (window.__tileBills || billNotices()).filter(b => b.card.id === a.id), owed = bills.reduce((s, b) => s + b.owed, 0), u = a.limit ? creditUsage(a) : null, due = bills[0]?.due;
  return `${u ? `可用額度 ${acctMoney(u.available, a)}` : '信用卡'}${owed > 0 ? `<br>待繳帳款 ${acctMoney(owed, a)}` : ''}${due ? `<em class="due-pill${bills[0].days < 0 ? ' over' : ''}">${Number(due.slice(5, 7))}/${Number(due.slice(8))} ${bills[0].days < 0 ? '已過期' : '繳費截止'}</em>` : ''}`;
}
// ---- overview chart ----
function acctPeriods(unit, n, today) {
  const t0 = today || isoDate(new Date()), [y, m, d] = t0.split('-').map(Number), out = [];
  for (let i = n - 1; i >= 0; i--) {
    let s, e, label;
    if (unit === 'day') { s = e = new Date(y, m - 1, d - i); label = `${s.getMonth() + 1}/${s.getDate()}`; }
    else if (unit === 'week') { const ws = Number(prefs().weekStart || 0), b = new Date(y, m - 1, d - 7 * i), k = (b.getDay() - ws + 7) % 7; s = new Date(b.getFullYear(), b.getMonth(), b.getDate() - k); e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6); label = `${s.getMonth() + 1}/${s.getDate()}`; }
    else if (unit === 'year') { s = new Date(y - i, 0, 1); e = new Date(y - i, 11, 31); label = String(y - i); }
    else { s = new Date(y, m - 1 - i, 1); e = new Date(y, m - i, 0); label = s.getMonth() ? `${s.getMonth() + 1}月` : String(s.getFullYear()); }
    out.push({ start: isoDate(s), end: isoDate(e), label });
  }
  return out;
}
function acctChartData(unit, n, cur, today) {
  const t0 = today || isoDate(new Date()), ps = acctPeriods(unit, n, t0).map(p => ({ ...p, inc: 0, out: 0, net: 0, later: 0 })), ok = a => a && a.id !== undefined && !a.excludeNet && (!cur || acctCur(a) === cur), val = (v, id) => cur ? v : (txTWD(v, id) ?? 0);
  let now = 0; for (const a of (state.accounts || [])) if (ok(a)) now += cur ? Number(a.balance || 0) : acctCur(a) === 'TWD' ? Number(a.balance || 0) : (toTWD(a.balance, acctCur(a)) ?? 0);
  for (const t of (state.transactions || [])) {
    let e = 0; for (const [k, v] of ledgerEffects(t)) if (ok(acct(k))) e += val(v, k);
    if (e) for (const p of ps) if (t.date > (p.end < t0 ? p.end : t0)) p.later += e;
    if ((t.kind === 'expense' || t.kind === 'income') && !isUnappliedPending(t) && ok(acct(t.account))) { const p = ps.find(x => t.date >= x.start && t.date <= x.end); if (p) p[t.kind === 'income' ? 'inc' : 'out'] += Math.abs(val(Number(t.amount || 0), t.account)); }
  }
  return ps.map(p => ({ ...p, inc: Math.round(p.inc), out: Math.round(p.out), net: Math.round(now - p.later) }));
}
function acctChartSVG(l, sel, W, H) {
  const L = 44, R = 50, T = 10, B = 22, iw = W - L - R, ih = H - T - B, slot = iw / l.length, bt = niceTicks(0, Math.max(1, ...l.flatMap(p => [p.inc, p.out]))), nt = niceTicks(Math.min(...l.map(p => p.net)), Math.max(...l.map(p => p.net)), 3), yb = v => T + ih - v / bt.hi * ih, yl = v => T + ih - (v - nt.lo) / (nt.hi - nt.lo) * ih, x = i => L + slot * i + slot / 2, bw = Math.max(2, Math.min(16, slot / 2 - 3));
  let g = bt.ticks.map(v => `<text class="cg-axis" x="${L - 5}" y="${yb(v) + 4}" text-anchor="end">${compactNum(v)}</text>`).join('') + nt.ticks.map(v => `<text class="cg-axis" x="${W - R + 5}" y="${yl(v) + 4}">${compactNum(v)}</text>`).join('');
  const pts = l.map((p, i) => `${x(i).toFixed(1)},${yl(p.net).toFixed(1)}`).join(' '); g += `<polygon class="av-area" points="${x(0)},${T + ih} ${pts} ${x(l.length - 1)},${T + ih}"/>`;
  l.forEach((p, i) => { g += `<rect class="av-out" x="${x(i) - bw - 1}" y="${yb(p.out)}" width="${bw}" height="${Math.max(0, T + ih - yb(p.out))}"/><rect class="av-in" x="${x(i) + 1}" y="${yb(p.inc)}" width="${bw}" height="${Math.max(0, T + ih - yb(p.inc))}"/>`; });
  g += `<polyline class="av-line" points="${pts}"/>`; const every = Math.max(1, Math.ceil(l.length * 44 / iw));
  l.forEach((p, i) => { if ((l.length - 1 - i) % every === 0) g += `<text class="cg-label" x="${x(i)}" y="${H - 5}" text-anchor="middle">${p.label}</text>`; g += `<rect class="av-hit${i === sel ? ' on' : ''}" data-av-i="${i}" x="${L + slot * i}" y="${T}" width="${slot}" height="${ih}"/>`; });
  return `<svg class="av-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="收支與總額">${g}</svg>`;
}
function avSt() { return window.__av || (window.__av = { unit: 'month', sel: null, full: false }); }
function acctChartHTML(full) {
  const s = avSt(), n = { day: full ? 31 : 10, week: full ? 26 : 10, month: full ? 24 : 10, year: full ? 10 : 6 }[s.unit], l = acctChartData(s.unit, n, window.__acctCur || ''), i = s.sel === null || s.sel >= l.length ? l.length - 1 : s.sel, p = l[i];
  return `${full ? acctChartSVG(l, i, Math.max(600, window.innerWidth - 40), Math.max(260, window.innerHeight - 150)) : acctChartSVG(l, i, 360, 170)}<div class="av-foot"><span>● ${s.unit === 'day' ? efDateText(p.start) : s.unit === 'month' ? `${p.start.slice(0, 4)}年${Number(p.start.slice(5, 7))}月` : s.unit === 'year' ? `${p.label} 年` : `${p.start.slice(5).replace('-', '/')}～${p.end.slice(5).replace('-', '/')}`}</span><span class="expense-text">● −${bigMoney(p.out)}</span><span class="income-text">● +${bigMoney(p.inc)}</span><span>總額 ${bigMoney(p.net)}</span><select data-av-unit aria-label="檢視單位">${[['day', '按日'], ['week', '按週'], ['month', '按月'], ['year', '按年']].map(([v, t]) => `<option value="${v}"${v === s.unit ? ' selected' : ''}>${t}</option>`).join('')}</select></div>`;
}
function donutSVG(rows, centre) {
  const tot = rows.reduce((s, r) => s + r.v, 0) || 1; let a0 = -Math.PI / 2; const col = ['#a9cf89', '#7fb3d5', '#b8a6ff', '#f0b27a', '#e88c9a', '#76d7c4', '#c39bd3', '#f7dc6f', '#85c1e9', '#aab7b8'];
  const seg = rows.map((r, i) => { const f = r.v / tot, a1 = a0 + f * 2 * Math.PI * 0.99999, p = (rad, an) => `${(100 + rad * Math.cos(an)).toFixed(2)},${(100 + rad * Math.sin(an)).toFixed(2)}`, big = a1 - a0 > Math.PI ? 1 : 0, mid = (a0 + a1) / 2, d = `M${p(90, a0)} A90,90 0 ${big} 1 ${p(90, a1)} L${p(56, a1)} A56,56 0 ${big} 0 ${p(56, a0)} Z`; a0 = a1; return `<path d="${d}" fill="${col[i % col.length]}"><title>${esc(r.k)} ${(f * 100).toFixed(1)}%</title></path>${f > 0.06 ? `<text x="${(100 + 73 * Math.cos(mid)).toFixed(1)}" y="${(104 + 73 * Math.sin(mid)).toFixed(1)}" text-anchor="middle" class="dn-l">${(f * 100).toFixed(1)}%</text>` : ''}`; }).join('');
  return `<svg class="donut" viewBox="0 0 200 200">${seg}<text x="100" y="106" text-anchor="middle" class="dn-c">${esc(centre)}</text></svg><div class="dn-legend">${rows.map((r, i) => `<span><i style="background:${col[i % col.length]}"></i>${esc(r.k)} ${(r.v / tot * 100).toFixed(1)}%</span>`).join('')}</div>`;
}
function openAcctShare(kind) {
  const T = acctTotals(null, window.__acctCur || ''), list = kind === 'cur' ? T.curs : T.groups, el = sheetEl('shareBg'), s = el.dataset.side || 'assets', rows = list.map(x => ({ k: x.key, v: x[s] })).filter(r => r.v > 0); el.dataset.kind = kind; el.hidden = false;
  el.innerHTML = `<div class="recon-sheet">${sheetHead(kind === 'cur' ? '幣種統計' : '分組統計')}<div class="recon-list notice-list">${rows.length ? donutSVG(rows, bigMoney(s === 'assets' ? T.assets : T.debts)) : '<div class="empty">沒有資料</div>'}<div class="seg share-seg"><button type="button" class="${s === 'assets' ? 'primary' : 'secondary'}" data-share-side="assets">資產</button><button type="button" class="${s === 'debts' ? 'primary' : 'secondary'}" data-share-side="debts">負債</button></div>${list.map(x => infoRow(x.key, `${acctSignedMoney(x.assets - x.debts)}`, x.assets - x.debts < 0 ? 'expense-text' : 'income-text')).join('')}${infoRow('總額', acctSignedMoney(T.total))}</div></div>`;
}
function openCurPick() {
  const m = new Map(), fut = acctFuture(); for (const a of state.accounts) if (!a.excludeNet) m.set(acctCur(a), (m.get(acctCur(a)) || 0) + acctNow(a, fut)); const el = sheetEl('curBg'); el.hidden = false;
  el.innerHTML = `<div class="recon-sheet">${sheetHead('指定幣種')}<div class="recon-list notice-list">${[...m].sort().map(([c, v]) => `<button type="button" class="ef-row${window.__acctCur === c ? ' on' : ''}" data-cur-pick="${esc(c)}"><span class="ef-name">${esc(c)}</span><b class="${v < 0 ? 'expense-text' : 'income-text'}">${acctMoney(v, { currency: c })}</b></button>`).join('')}<button type="button" class="ef-row${window.__acctCur ? '' : ' on'}" data-cur-pick=""><span class="ef-name">總額</span><b>${acctSignedMoney(acctTotals().total)}</b></button></div></div>`;
}
function acctTotalsView() {
  const cur = window.__acctCur || '', T = acctTotals(null, cur);
  return `<div class="av-head"><button type="button" class="ghost" data-av-full aria-label="全螢幕圖表">⛶</button><button type="button" class="av-total" data-av-cur><small>總額 ${esc(cur || 'TWD')}</small><strong class="${T.total < 0 ? 'expense-text' : 'income-text'}">${bigMoney(T.total)}</strong></button></div><div class="av-sub">總資產 <b class="income-text">${bigMoney(T.assets)}</b>　總負債 <b class="expense-text">${bigMoney(T.debts)}</b></div><div class="av-links"><button type="button" class="tx-link" data-av-share="group">◔ 各分組佔比</button><button type="button" class="tx-link" data-av-share="cur">◔ 各幣種佔比</button></div>${cur ? `<p class="hint">目前只顯示 ${esc(cur)} 帳戶 <button type="button" class="tx-link" data-cur-pick="">切換回總額</button></p>` : ''}${acctChartHTML(false)}`;
}
// ---- account detail: one period at a time ----
function apSt(a) { const s = window.__ap && window.__ap.id === a.id ? window.__ap : (window.__ap = { id: a.id, off: 0, asc: false }); return s; }
function apPeriod(a, off, today) { const d = Math.min(28, Math.max(1, Number(a.cycleStart || 1))); return periodBounds(addMonths(periodKeyOf(today || isoDate(new Date()), d), off), d); }
function apKind(t, effect, a) {
  if (t.kind === 'transfer') return String(t.toAccount) === String(a.id) && effect > 0 ? '轉入' : '轉出';
  if (t.kind === 'loan' || t.kind === 'loanPayment') return (t.direction || t.loanDirection) === 'payable' ? '應付' : '應收';
  return t.kind === 'income' ? (t.refundOf !== undefined ? '退款' : '收入') : t.kind === 'balance_adjustment' ? '餘額調整' : '支出';
}
function apStats(a, rows) {
  const m = new Map(); for (const r of rows) { const k = apKind(r.t, r.effect, a), x = m.get(k) || { k, n: 0, v: 0 }; x.n++; x.v = Math.round((x.v + r.effect) * 100) / 100; m.set(k, x); }
  const order = ['支出', '收入', '退款', '轉出', '轉入', '應收', '應付', '餘額調整'], l = order.map(k => m.get(k)).filter(Boolean); return { list: l, total: { n: rows.length, v: Math.round(rows.reduce((s, r) => s + r.effect, 0) * 100) / 100 } };
}
function apRow(r, a) { const t = r.t, c = cat(t.category); return `<button type="button" class="account-detail-row" data-tx-open="${esc(t.id)}" data-pb-date="${t.date}"><span class="account-detail-date">${t.date}</span><div class="mini-icon">${catIconHTML(c)}</div><div><b>${esc(t.name)}</b><div class="tx-meta">${esc(t.merchant || t.person || t.note || '—')}${t.kind === 'transfer' ? ` · ${acctName(acct(t.account))} → ${acctName(acct(t.toAccount))}` : ''}</div></div><div class="amount ${r.effect < 0 ? 'expense-text' : r.effect > 0 ? 'income-text' : ''}">${r.effect > 0 ? '+' : ''}${acctMoney(r.effect, a)}<small class="pb-after">${acctMoney(r.after, a)}</small></div></button>`; }
function acctPaneHTML(a) {
  const s = apSt(a), p = apPeriod(a, s.off), all = passbook(a.id), rows = all.filter(r => r.t.date >= p.start && r.t.date <= p.end), st = apStats(a, rows), max = Math.max(1, ...st.list.map(x => Math.abs(x.v))), col = { 支出: '#ff7188', 收入: '#a9cf89', 退款: '#a9cf89', 轉出: '#b57cf0', 轉入: '#f0c987', 應收: '#7dd8c6', 應付: '#d05c82', 餘額調整: '#5b6fd6' };
  const bar = (x, c) => `<button type="button" class="ap-stat" data-ap-kind="${x.k}"><span>${x.k}</span><i style="background:${c}">${x.n}</i><em><u style="width:${Math.max(2, Math.abs(x.v) / max * 100)}%;background:${c}"></u></em><b>${x.v > 0 ? '+' : ''}${acctMoney(x.v, a)}</b></button>`;
  // daily closing balances inside the period
  const before = all.find(r => r.t.date < p.start), first = before ? before.after : all.length ? Math.round((all.at(-1).after - all.at(-1).effect) * 100) / 100 : Number(a.balance || 0), days = [], t0 = isoDate(new Date()); let bal = first;
  for (let d = new Date(p.start + 'T00:00:00'); isoDate(d) <= p.end && isoDate(d) <= (s.off < 0 ? p.end : t0 > p.end ? p.end : t0); d.setDate(d.getDate() + 1)) { const k = isoDate(d), l = rows.find(r => r.t.date === k); if (l) bal = l.after; days.push({ v: bal, d: k }); }
  const W = 360, H = 120, lo = Math.min(...days.map(x => x.v)), hi = Math.max(...days.map(x => x.v)), tk = niceTicks(lo, hi, 3), y = v => 8 + 90 - (v - tk.lo) / ((tk.hi - tk.lo) || 1) * 90, x = i => 50 + (days.length < 2 ? 150 : i * 300 / (days.length - 1));
  const chart = days.length ? `<svg class="av-chart" viewBox="0 0 ${W} ${H}">${tk.ticks.map(v => `<text class="cg-axis" x="45" y="${y(v) + 4}" text-anchor="end">${compactNum(v)}</text>`).join('')}<polygon class="av-area" points="${x(0)},98 ${days.map((v, i) => `${x(i).toFixed(1)},${y(v.v).toFixed(1)}`).join(' ')} ${x(days.length - 1)},98"/><polyline class="av-line" points="${days.map((v, i) => `${x(i).toFixed(1)},${y(v.v).toFixed(1)}`).join(' ')}"/>${days.map((v, i) => `${i % Math.ceil(days.length / 4) === 0 ? `<text class="cg-label" x="${x(i)}" y="114" text-anchor="middle">${Number(v.d.slice(5, 7))}/${Number(v.d.slice(8))}</text>` : ''}<rect class="av-hit" data-pb-jump="${v.d}" x="${x(i) - 150 / days.length}" y="4" width="${300 / days.length}" height="96"><title>${v.d} ${acctMoney(v.v, a)}</title></rect>`).join('')}</svg>` : '';
  const list = s.asc ? [...rows].reverse() : rows;
  return `<div class="pane-tx"><div class="credit-period"><button type="button" data-ap-off="-1" aria-label="上一期">‹</button><strong>${p.start} ～ ${p.end}</strong><button type="button" data-ap-off="1" aria-label="下一期">›</button></div>${st.list.map(v => bar(v, col[v.k])).join('')}${rows.length ? bar({ k: '總計', ...st.total }, '#2f8fd0') : ''}${chart}<div class="panel-head" style="margin:8px 0 10px"><h3 style="margin:0">一般記錄</h3><span class="hint">${rows.length} 筆 <button type="button" class="ghost" data-ap-recon>對帳模式</button><button type="button" class="ghost" data-ap-sort aria-label="排序">${s.asc ? '△' : '▽'}</button><button type="button" class="ghost" data-acct-history="${esc(a.id)}">歷史統計</button><button type="button" class="ghost" data-ap-add aria-label="新增記錄">＋</button></span></div><div class="account-detail-list">${list.length ? list.map(r => apRow(r, a)).join('') : '<div class="empty">這一期沒有交易</div>'}</div></div>`;
}
// ---- 一般帳戶對帳 ---- ticks: t.recon on the account side, t.reconTo on the receiving side of a transfer.
function arKey(t, a) { return t.kind === 'transfer' && String(t.toAccount) === String(a.id) && String(t.account) !== String(a.id) ? 'reconTo' : 'recon'; }
function arItems(a, s) { const p = apPeriod(a, s.off), l = passbook(a.id).filter(r => r.t.date >= p.start && r.t.date <= p.end); return s.asc ? l.reverse() : l; }
function renderAcctRecon() {
  const el = document.getElementById('arBg'), s = window.__ar; if (!el || el.hidden || !s) return; const a = acct(s.id), p = apPeriod(a, s.off), l = arItems(a, s), done = l.filter(r => r.t[arKey(r.t, a)]), shown = l.filter(r => reconMatch(r.t, s.q)), sum = x => Math.round(x.reduce((v, r) => v + r.effect, 0) * 100) / 100;
  el.innerHTML = `<div class="recon-sheet">${sheetHead(`對帳模式 · ${acctName(a)}`, '<button type="button" class="icon" data-ar-menu aria-label="更多">⋯</button>')}${s.menu ? '<div class="recon-menu"><button type="button" data-ar-act="add">新增記錄</button><button type="button" data-ar-act="adjust">餘額調整</button><button type="button" data-ar-act="clear">取消全部選取</button><button type="button" data-ar-act="order">變更日期順序</button></div>' : ''}<div class="recon-period"><button type="button" data-ar-off="-1">‹</button><strong>${p.start} ～ ${p.end}</strong><button type="button" data-ar-off="1">›</button></div><div class="recon-search"><input id="arSearch" type="search" placeholder="搜尋（名稱、金額…）" value="${esc(s.q)}"></div><div class="recon-list">${shown.map(r => `<button type="button" class="recon-row ar-row${r.t[arKey(r.t, a)] ? ' done' : ''}" data-ar-id="${esc(r.t.id)}"><span class="ar-tick">${r.t[arKey(r.t, a)] ? '✓' : ''}</span><span class="day-main"><b>${esc(r.t.name)}</b><small>${r.t.date} ${esc(r.t.time || '')} ${esc(r.t.merchant || '')}</small></span><span class="day-side"><b class="${r.effect < 0 ? 'expense-text' : 'income-text'}">${r.effect > 0 ? '+' : ''}${acctMoney(r.effect, a)}</b><small>${acctMoney(r.after, a)}</small></span></button>`).join('') || '<div class="recon-empty">沒有記錄</div>'}</div><div class="recon-bar"><div class="recon-progress"><i style="width:${l.length ? Math.round(done.length / l.length * 100) : 0}%"></i></div><div class="recon-bar-row"><span>對帳筆數 <b>${done.length} / ${l.length}</b></span><span>已對帳 <b>${acctMoney(sum(done), a)}</b></span></div><div class="recon-bar-row"><span>這一期淨額 <b>${acctMoney(sum(l), a)}</b></span><span>帳戶餘額 <b>${acctMoney(a.balance, a)}</b></span></div></div></div>`;
}
document.addEventListener('click', async e => {
  const c = s => e.target.closest?.(s); let b; const el = document.getElementById('accountDetail');
  if ((b = c('[data-goto]'))) { nav(b.dataset.goto); return; }
  if ((b = c('[data-av-i]'))) { avSt().sel = Number(b.dataset.avI); renderAcctTotals(); const f = document.getElementById('avFull'); if (f && !f.hidden) openAvFull(); return; }
  if (c('[data-av-full]')) { openAvFull(); return; }
  if (c('[data-av-cur]')) { openCurPick(); return; }
  if ((b = c('[data-cur-pick]'))) { window.__acctCur = b.dataset.curPick; const x = document.getElementById('curBg'); if (x) x.hidden = true; renderAccounts(); return; }
  if ((b = c('[data-av-share]'))) { openAcctShare(b.dataset.avShare); return; }
  if ((b = c('[data-share-side]'))) { const x = document.getElementById('shareBg'); x.dataset.side = b.dataset.shareSide; openAcctShare(x.dataset.kind); return; }
  if ((b = c('[data-ap-off]'))) { window.__ap.off += Number(b.dataset.apOff); renderAccountDetail(); return; }
  if (c('[data-ap-sort]')) { window.__ap.asc = !window.__ap.asc; renderAccountDetail(); return; }
  if (c('[data-ap-add]')) { const i = window.__ap.id; window.openTx('expense'); setTimeout(() => { const s = txForm.elements.account; s.value = i; s.dataset.userSet = '1'; s.dispatchEvent(new Event('change', { bubbles: true })); }, 120); return; }
  if ((b = c('[data-pb-jump]'))) { const l = [...el.querySelectorAll('[data-pb-date]')], d = b.dataset.pbJump, t = l.find(x => x.dataset.pbDate === d) || l.find(x => window.__ap.asc ? x.dataset.pbDate > d : x.dataset.pbDate < d); t?.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.querySelectorAll('[data-pb-date].hit').forEach(x => x.classList.remove('hit')); t?.classList.add('hit'); return; }
  if ((b = c('[data-ap-kind]'))) { const a = acct(window.__ap.id), p = apPeriod(a, window.__ap.off), k = b.dataset.apKind, l = passbook(a.id).filter(r => r.t.date >= p.start && r.t.date <= p.end && (k === '總計' || apKind(r.t, r.effect, a) === k)), x = sheetEl('apBg'); x.hidden = false; x.innerHTML = `<div class="recon-sheet">${sheetHead(`${k} (${l.length})　${acctMoney(l.reduce((s, r) => s + r.effect, 0), a)}`)}<div class="recon-list notice-list">${l.map(r => apRow(r, a)).join('')}</div></div>`; return; }
  if (c('#apBg [data-tx-open]')) { document.getElementById('apBg').hidden = true; return; }
  if (c('[data-ap-recon]')) { window.__ar = { id: window.__ap.id, off: window.__ap.off, asc: true, q: '' }; sheetEl('arBg').hidden = false; renderAcctRecon(); return; }
  const s = window.__ar; if (!s || !c('#arBg')) return;
  if ((b = c('[data-ar-off]'))) { s.off += Number(b.dataset.arOff); renderAcctRecon(); return; }
  if (c('[data-ar-menu]')) { s.menu = !s.menu; renderAcctRecon(); return; }
  if ((b = c('[data-ar-act]'))) {
    const a = acct(s.id), k = b.dataset.arAct; s.menu = false;
    if (k === 'order') s.asc = !s.asc; if (k === 'clear') { for (const r of arItems(a, s)) delete r.t[arKey(r.t, a)]; await save(); }
    if (k === 'add') { document.getElementById('arBg').hidden = true; window.openTx('expense'); setTimeout(() => { const x = txForm.elements.account; x.value = a.id; x.dispatchEvent(new Event('change', { bubbles: true })); }, 120); return; }
    if (k === 'adjust') { document.getElementById('arBg').hidden = true; openEntity('accountAdjust', a); return; }
    renderAcctRecon(); return;
  }
  if ((b = c('[data-ar-id]'))) { const t = txById(b.dataset.arId), a = acct(s.id), k = arKey(t, a); if (t[k]) delete t[k]; else t[k] = true; renderAcctRecon(); await save(); }
});
function openAvFull() { const el = sheetEl('avFull'); el.hidden = false; el.innerHTML = `<div class="av-full">${sheetHead('帳戶總覽')}${acctChartHTML(true)}</div>`; }
document.addEventListener('change', e => { const t = e.target; if (t?.matches?.('[data-av-unit]')) { avSt().unit = t.value; avSt().sel = null; renderAcctTotals(); const f = document.getElementById('avFull'); if (f && !f.hidden) openAvFull(); } if (t?.matches?.('[data-acct-switch]')) { if (acct(t.value).type === 'card') openCreditAccount(t.value); else openAccountDetail(t.value); } });
document.addEventListener('input', e => { if (e.target?.id === 'arSearch') { window.__ar.q = e.target.value; renderAcctRecon(); const i = document.getElementById('arSearch'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); } });
