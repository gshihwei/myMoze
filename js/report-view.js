// 帳小簿 V26.99 — 統計報表畫面 (依 MOZE「統計報表」)：記錄類型長條、類別圓環、折線圖跳轉、點項目看明細、選擇報表；免息期推薦.
// Bundled after js/detail-card.js. Function declarations / var only.

// Finer record types than `kind`: 系統類別 (手續費、折扣、紅利回饋、利息) are counted on their own.
function rptType(t) {
  if (t.kind === 'transfer') return '轉帳'; if (t.kind === 'loan') return (t.direction === 'payable' || t.loanAction === 'borrow') ? '應付' : '應收'; if (t.kind === 'loanPayment') return t.loanDirection === 'payable' ? '應付還款' : '應收收款';
  if (t.kind === 'balance_adjustment') return '餘額調整'; const n = cat(t.category).name;
  if (t.kind === 'income') return t.rewardOf ? '紅利回饋' : t.refundOf !== undefined ? '退款' : n === '折扣' ? '折扣' : n === '紅利回饋' ? '紅利回饋' : n === '利息收入' || n === '利息' ? '利息收入' : '收入';
  return n === '手續費' ? '手續費' : n === '利息支出' ? '利息支出' : '支出';
}
function rptTypes() { return [['支出', '#ff7188', -1], ['收入', '#a9cf89', 1], ['退款', '#8fc7a0', 1], ['轉帳', '#b57cf0', 0], ['應收', '#7dd8c6', -1], ['應收收款', '#5fb8a6', 1], ['應付', '#d05c82', 1], ['應付還款', '#8f9ed6', -1], ['手續費', '#c96f9b', -1], ['折扣', '#d9c27a', 1], ['紅利回饋', '#b5678f', 1], ['利息支出', '#d9a7c0', -1], ['利息收入', '#b0a05f', 1], ['餘額調整', '#5b6fd6', 0]]; }
function rptByType(txs) { const m = new Map(); for (const t of txs) { const k = rptType(t), x = m.get(k) || { k, n: 0, v: 0, l: [] }; x.n++; x.v += anValue(t); x.l.push(t); m.set(k, x); } return rptTypes().filter(([k]) => m.has(k)).map(([k, c, s]) => ({ ...m.get(k), v: Math.round(m.get(k).v), c, s })); }
function rptSel(s, types) { return types.find(x => x.k === s.type) || types.find(x => x.k === '支出') || types[0] || null; }
function rptChips(types, cur) { return `<div class="rv-chips">${types.map(x => `<button type="button" class="${x.k === cur ? 'on' : ''}" data-rv-type="${x.k}"><i style="background:${x.c}"></i>${x.k}</button>`).join('')}</div>`; }
// Rows of a tab: [{ k, name, v, n, l, icon }]
function rptRows(tab, list, drill) {
  const m = new Map(), add = (k, name, v, t, icon) => { if (!name) return; const x = m.get(k) || { k, name, v: 0, n: 0, l: [], icon }; x.v += v; x.n++; x.l.push(t); m.set(k, x); };
  for (const t of list) {
    const v = anValue(t), a = acct(t.account);
    if (tab === 'cat') for (const [cid, pv] of anParts(t)) { const top = anTopCategory(cid); if (drill && top !== String(drill)) continue; const key = drill ? String(cid) : String(top), c = cat(key); add(key, c.name, pv, t, c); }
    else if (tab === 'acct') add(String(t.account), a.name, v, t, null); else if (tab === 'grp') { const g = a.group || acctTypeLabel(a); add(g, g, v, t); }
    else if (tab === 'proj') { const l = (state.projects || []).filter(p => projMatch(p, t)); if (l.length) for (const p of l) add(String(p.id), p.name, v, t, null); else add('', '無專案', v, t); }
    else if (tab === 'name') add(t.name, t.name, v, t); else if (tab === 'mer') add(t.merchant, t.merchant, v, t); else if (tab === 'per') add(t.person, t.person && t.person !== '不限定對象' ? t.person : '', v, t); else if (tab === 'tag') for (const x of (t.tags || [])) add(x, '#' + x, v, t);
  }
  return [...m.values()].map(x => ({ ...x, v: Math.round(x.v) })).sort((x, y) => y.v - x.v);
}
function rptRowIcon(tab, r) { if (tab === 'cat') return `<span class="entry-acct-ico">${catIconHTML(r.icon)}</span>`; if (tab === 'acct') return `<span class="entry-acct-ico">${svgForAccount(acct(r.k))}</span>`; if (tab === 'proj') return `<span class="entry-acct-ico">${projIconHTML((state.projects || []).find(p => String(p.id) === r.k))}</span>`; return ''; }
function rptListHTML(tab, rows, sel, s) {
  const tot = rows.reduce((a, r) => a + r.v, 0), sorted = s.sort === 'n' ? [...rows].sort((a, b) => b.n - a.n || b.v - a.v) : rows;
  return `<div class="notice-total">總共 ${rows.length} 項 <button type="button" class="ghost" data-rv-sort>${s.sort === 'n' ? '依次數排序' : '依金額排序'}</button></div>${sorted.slice(0, 300).map(r => `<button type="button" class="ef-row" data-rv-row="${esc(r.k)}">${rptRowIcon(tab, r)}<span class="ef-name">${esc(r.name)}（${r.n}）</span><b class="${sel.s < 0 ? 'expense-text' : sel.s > 0 ? 'income-text' : ''}">${money(r.v)}</b></button>`).join('')}<div class="info-row"><span>總計</span><b>${money(tot)}</b></div>`;
}
function rptRing(r, tot, color) { const f = tot ? r.v / tot : 0, c = 2 * Math.PI * 40; return `<button type="button" class="rv-ring" data-rv-cat="${esc(r.k)}"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" class="rv-bg"/><circle cx="50" cy="50" r="40" stroke="${color}" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/><text x="50" y="55" text-anchor="middle">${(f * 100).toFixed(1)}%</text></svg><span>${esc(r.name)}</span><b class="expense-text">${money(r.v)}</b></button>`; }
// Daily / weekly / monthly line of one type, with a hit area per point.
function rptLineHTML(list, p, s, color) {
  const first = list.map(t => t.date).sort()[0] || p.start, last = list.map(t => t.date).sort().at(-1) || p.end, start = p.start < '1000' ? first : p.start, end = p.end > '9000' ? last : p.end, unit = s.lineUnit || 'day', key = d => unit === 'month' ? d.slice(0, 7) : unit === 'week' ? rptUnit('week', d, 0).start : d, pts = [], m = new Map();
  for (const t of list) m.set(key(t.date), (m.get(key(t.date)) || 0) + anValue(t)); const seen = new Set(); let g = 0; for (let d = new Date(start + 'T00:00:00'); isoDate(d) <= end && g++ < 800; d.setDate(d.getDate() + 1)) { const k = key(isoDate(d)); if (!seen.has(k)) { seen.add(k); pts.push({ k, v: Math.round(m.get(k) || 0) }); } }
  if (!pts.length) return ''; const W = 360, H = 150, tk = niceTicks(0, Math.max(1, ...pts.map(x => x.v)), 3), y = v => 10 + 110 - v / tk.hi * 110, x = i => 46 + (pts.length < 2 ? 150 : i * 304 / (pts.length - 1)), w = 304 / Math.max(1, pts.length), lab = k => unit === 'month' ? k.slice(2).replace('-', '/') : `${Number(k.slice(5, 7))}/${Number(k.slice(8))}`;
  return `<svg class="av-chart" viewBox="0 0 ${W} ${H}">${tk.ticks.map(v => `<text class="cg-axis" x="41" y="${y(v) + 4}" text-anchor="end">${compactNum(v)}</text>`).join('')}<polyline fill="none" stroke="${color}" stroke-width="2" points="${pts.map((q, i) => `${x(i).toFixed(1)},${y(q.v).toFixed(1)}`).join(' ')}"/>${pts.map((q, i) => `${i % Math.ceil(pts.length / 5) === 0 ? `<text class="cg-label" x="${x(i)}" y="${H - 8}" text-anchor="middle">${lab(q.k)}</text>` : ''}<rect class="av-hit" data-rv-jump="${q.k}" x="${x(i) - w / 2}" y="6" width="${w}" height="118"><title>${q.k} ${money(q.v)}</title></rect>`).join('')}</svg><div class="av-foot"><select data-rv-unit aria-label="檢視單位">${[['day', '按日'], ['week', '按週'], ['month', '按月']].map(([v, l]) => `<option value="${v}"${v === unit ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`;
}
function rptBodyHTML(def, s, txs) {
  const types = rptByType(txs), sel = rptSel(s, types); if (!types.length) return '<div class="recon-empty">這段期間沒有記錄</div>'; window.__rvRows = null;
  if (s.tab === 'ov') {
    const max = Math.max(...types.map(x => x.v), 1), net = types.reduce((a, x) => a + x.s * x.v, 0), exp = types.find(x => x.k === '支出'), cats = exp ? rptRows('cat', exp.l) : [], mers = exp ? rptRows('mer', exp.l) : [];
    return `${types.map(x => `<button type="button" class="ap-stat" data-rv-open="${x.k}"><span>${x.k}</span><i style="background:${x.c}">${x.n}</i><em><u style="width:${Math.max(2, x.v / max * 100)}%;background:${x.c}"></u></em><b>${x.s < 0 ? '−' : x.s > 0 ? '+' : ''}${money(x.v)}</b></button>`).join('')}<div class="ap-stat"><span>總計</span><i style="background:#2f8fd0">${txs.length}</i><em></em><b>${net < 0 ? '−' : '+'}${money(Math.abs(net))}</b></div>${cats.length ? `<h3 class="notice-h">類別</h3><div class="rv-rings">${cats.slice(0, 3).map((r, i) => rptRing(r, exp.v, ['#4aa79c', '#9fd0e6', '#2d6fa8'][i])).join('')}</div>` : ''}${exp ? `<h3 class="notice-h">TOP 3</h3>${[...exp.l].sort((a, b) => anValue(b) - anValue(a)).slice(0, 3).map(rptRowHTML).join('')}` : ''}${mers.length ? `<h3 class="notice-h">商家</h3>${mers.slice(0, 5).map(r => `<button type="button" class="ef-row" data-rv-mer="${esc(r.k)}"><span class="ef-name">${esc(r.name)}（${r.n}）</span><b class="expense-text">${money(r.v)}</b></button>`).join('')}` : ''}`;
  }
  const chips = rptChips(types, sel.k);
  if (s.tab === 'tx') { const l = [...sel.l].sort((a, b) => (s.asc ? 1 : -1) * (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))), days = []; for (const t of l) { if (!days.length || days.at(-1).d !== t.date) days.push({ d: t.date, l: [] }); days.at(-1).l.push(t); } return `${rptLineHTML(sel.l, rptPeriod(def, s.off), s, sel.c)}${chips}<button type="button" class="ghost" data-rpt-asc>${s.asc ? '△ 由遠到近' : '▽ 由近到遠'}</button>${days.slice(0, 200).map(x => `<div class="rv-day" data-rv-day="${x.d}"><b>${fmtDate(x.d)} ${WEEKDAYS[new Date(x.d + 'T00:00:00').getDay()]}</b><span>${money(Math.round(x.l.reduce((a, t) => a + anValue(t), 0)))}</span></div>${x.l.map(rptRowHTML).join('')}`).join('')}`; }
  if (s.tab === 'rank') return chips + [...sel.l].sort((a, b) => anValue(b) - anValue(a)).slice(0, 100).map(rptRowHTML).join('');
  const rows = rptRows(s.tab, sel.l, s.tab === 'cat' ? s.drill : null); window.__rvRows = rows; const pie = ['cat', 'acct', 'proj', 'grp'].includes(s.tab);
  const top = rows.length > 9 ? [...rows.slice(0, 8).map(r => ({ k: r.name, v: r.v })), { k: '其他', v: rows.slice(8).reduce((a, r) => a + r.v, 0) }] : rows.map(r => ({ k: r.name, v: r.v }));
  return `${s.tab === 'cat' && s.drill ? `<button type="button" class="ghost" data-rpt-drill="">← 返回 ${esc(cat(s.drill).name)}</button>` : ''}${pie && rows.length ? donutSVG(top, money(rows.reduce((a, r) => a + r.v, 0))) : ''}${chips}${rows.length ? rptListHTML(s.tab, rows, sel, s) : '<div class="recon-empty">沒有資料</div>'}`;
}
function rvShow(title, l) { const el = sheetEl('rvBg'); el.hidden = false; el.style.zIndex = 30; el.innerHTML = `<div class="recon-sheet">${sheetHead(`${esc(title)}（${l.length}）　${money(Math.round(l.reduce((a, t) => a + anValue(t), 0)))}`)}<div class="recon-list notice-list">${[...l].sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))).slice(0, 300).map(rptRowHTML).join('')}</div></div>`; }
function rvNow() { const s = rptSt(), def = rptList().find(x => x.id === s.id) || rptList()[0], txs = rptTxs(def, s.off), types = rptByType(txs); return { s, def, txs, types, sel: rptSel(s, types) }; }
// Grid of reports (統計 / 比較).
function rvPick() { const s = rptSt(), el = sheetEl('rvBg'); el.hidden = false; el.style.zIndex = 30; el.innerHTML = `<div class="recon-sheet">${sheetHead('選擇報表')}<div class="recon-list notice-list"><h3 class="notice-h">統計（${rptList().length}）</h3><div class="qm-grid">${rptList().map(r => `<button type="button" class="qm-item${r.id === s.id ? ' on' : ''}" data-rv-rpt="${esc(r.id)}"><span>${esc(r.icon || '📊')}</span>${esc(r.name)}</button>`).join('')}</div><h3 class="notice-h">比較（${cmpList().length}）</h3><div class="qm-grid">${cmpList().map(r => `<button type="button" class="qm-item" data-rv-cmp="${esc(r.id)}"><span>📈</span>${esc(r.name)}</button>`).join('')}</div></div></div>`; }
function rvPeriods() { const { s, def } = rvNow(); if (def.type !== 'cycle' && def.type !== undefined) return; const el = sheetEl('rvBg'); el.hidden = false; el.style.zIndex = 30; el.innerHTML = `<div class="recon-sheet">${sheetHead('選擇區間')}<div class="recon-list notice-list">${Array.from({ length: 37 }, (_, i) => 1 - i).map(o => { const p = rptPeriod(def, o); return `<button type="button" class="ef-row${o === s.off ? ' on' : ''}" data-rv-off="${o}"><span class="ef-name">${fmtDate(p.start)} － ${fmtDate(p.end)}</span></button>`; }).join('')}</div></div>`; }
// ---- 免息期推薦 (CNY / HKD): days until the due date of a purchase made today ----
function interestFreeDays(card, today) { const t = today ? new Date(today + 'T00:00:00') : new Date(), iso = isoDate(t), p = [0, 1, -1, 2].map(k => cardPeriod(card, t, k)).find(q => iso >= q.start && iso <= q.end) || cardPeriod(card, t, 0), due = cardStatementDueDate(card, p); return Math.round((due - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5); }
function interestFreeBest(today) { const l = (state.accounts || []).filter(a => a.type === 'card' && !a.archived && !a.noGrace && ['CNY', 'HKD'].includes(acctCur(a))).map(a => ({ a, d: interestFreeDays(a, today) })); const max = Math.max(-1, ...l.map(x => x.d)); return new Set(l.filter(x => x.d === max).map(x => x.a.id)); }
document.addEventListener('click', e => {
  const c = s => e.target.closest?.(s), hide = () => { const x = document.getElementById('rvBg'); if (x) x.hidden = true; }; let b;
  if (c('[data-rv-pick]')) { rvPick(); return; } if (c('[data-rv-periods]')) { rvPeriods(); return; }
  if ((b = c('[data-rv-rpt]'))) { Object.assign(rptSt(), { id: b.dataset.rvRpt, off: 0, drill: null }); hide(); renderReport(); return; }
  if ((b = c('[data-rv-cmp]'))) { hide(); document.getElementById('rptBg').hidden = true; window.__cmp = window.__cmp || null; document.getElementById('openCompare')?.click(); const p = document.getElementById('cmpPick'); if (p) { p.value = b.dataset.rvCmp; p.dispatchEvent(new Event('change', { bubbles: true })); } return; }
  if ((b = c('[data-rv-off]'))) { rptSt().off = Number(b.dataset.rvOff); hide(); renderReport(); return; }
  if ((b = c('[data-rv-type]'))) { rptSt().type = b.dataset.rvType; rptSt().drill = null; renderReport(); return; }
  if ((b = c('[data-rv-open]'))) { const x = rvNow().types.find(y => y.k === b.dataset.rvOpen); if (x) rvShow(x.k, x.l); return; }
  if ((b = c('[data-rv-cat]'))) { Object.assign(rptSt(), { tab: 'cat', type: '支出', drill: b.dataset.rvCat }); renderReport(); return; }
  if ((b = c('[data-rv-mer]'))) { const x = rvNow().types.find(y => y.k === '支出'); rvShow(b.dataset.rvMer, x.l.filter(t => t.merchant === b.dataset.rvMer)); return; }
  if (c('[data-rv-sort]')) { rptSt().sort = rptSt().sort === 'n' ? 'v' : 'n'; renderReport(); return; }
  if ((b = c('[data-rv-row]'))) { const s = rptSt(), r = (window.__rvRows || []).find(x => x.k === b.dataset.rvRow); if (!r) return; if (s.tab === 'cat' && !s.drill && (state.categories || []).some(k => String(k.parentId) === r.k)) { s.drill = r.k; renderReport(); } else rvShow(r.name, r.l); return; }
  if ((b = c('[data-rv-jump]'))) { const s = rptSt(), l = [...document.querySelectorAll('[data-rv-day]')], k = b.dataset.rvJump, d = l.find(x => x.dataset.rvDay.startsWith(k)) || (s.asc ? l.find(x => x.dataset.rvDay > k) : l.find(x => x.dataset.rvDay < k)); d?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  if (c('#rvBg [data-tx-open]')) hide();
});
document.addEventListener('change', e => { if (e.target?.matches?.('[data-rv-unit]')) { rptSt().lineUnit = e.target.value; renderReport(); } });
