// 帳小簿 V26.104 — 週期事件／分期事件頁、修改與刪除選單、退款表單、多類別更新、比較報表操作與分析頁.
// Bundled after js/card-view.js. Function declarations / var only.

// ---- 週期事件 / 分期事件 ----
function evSt() { return window.__ev || (window.__ev = { kind: 'rec', tab: 'on' }); }
function recPeriods(r, n) { // already posted records, then up to n future periods
  const past = (state.transactions || []).filter(t => String(t.recurringId) === String(r.id)).sort((a, b) => (a.recurringSeq || 0) - (b.recurringSeq || 0)).map(t => ({ no: t.recurringSeq, date: t.date, amount: Math.abs(Number(t.amount || 0)), id: t.id })), x = normRecurring(JSON.parse(JSON.stringify(r))), next = [];
  for (let i = 0; i < n && !recurringEnded(x) && !r.paused; i++) { next.push({ no: x.seq + 1, date: recurringPostDate(x, x.next), amount: Math.abs(Number(r.amount || 0)) }); x.seq++; x.next = addPeriod(x.next, x); }
  return { past, next };
}
function eventRowsHTML() {
  const s = evSt(), t0 = isoDate(new Date());
  if (s.kind === 'rec') {
    const all = (state.recurring || []).map(normRecurring), on = all.filter(r => !recurringEnded(r)), off = all.filter(recurringEnded), l = s.tab === 'on' ? on.sort((a, b) => a.next.localeCompare(b.next)) : off;
    return { on: on.length, off: off.length, html: l.map(r => `<div class="ev-row"><button type="button" class="notice-row" data-ev-rec="${esc(r.id)}"><div class="notice-ico">${catIconHTML(cat(r.category))}</div><div class="day-main"><b>${esc(r.name)}${r.paused ? '（已暫停）' : ''}</b><small>${recurringLabel(r)} · ${freqText(r)}${r.sub ? ' · 訂閱' : ''} · ${acctName(acct(r.account))}</small></div><div class="day-side"><b class="${r.kind === 'income' ? 'income-text' : 'expense-text'}">${acctMoney(Math.abs(r.amount), acct(r.account))}</b><small>${recurringEnded(r) ? '已結束' : relDay(r.next)}</small></div></button><button type="button" class="ghost" data-ev-menu="${esc(r.id)}" aria-label="更多">⋯</button></div>`).join('') };
  }
  const gs = instGroups(), on = gs.filter(g => g.left), off = gs.filter(g => !g.left), l = s.tab === 'on' ? on.sort((a, b) => a.next.localeCompare(b.next)) : off.sort((a, b) => b.last.localeCompare(a.last));
  return { on: on.length, off: off.length, html: l.map(g => { const n = g.list.find(x => x.date > t0) || g.list.at(-1); return `<div class="ev-row"><button type="button" class="notice-row" data-inst-open="${esc(g.group)}"><div class="notice-ico">${catIconHTML(cat(g.list[0].category))}</div><div class="day-main"><b>${esc(g.name)}</b><small>分期 #${n.installment.n} / ${g.total} · ${acctName(acct(g.account))} · 剩 ${acctMoney(g.rest, acct(g.account))}</small></div><div class="day-side"><b class="expense-text">${acctMoney(n.amount, acct(g.account))}</b><small>${fmtDate(n.date)}</small></div></button><button type="button" class="ghost" data-ev-inst="${esc(g.group)}" aria-label="更多">⋯</button></div>`; }).join('') };
}
function renderEvents() {
  const grid = document.getElementById('recurringGrid'); if (!grid) return; const s = evSt(), r = eventRowsHTML(), fut = instGroups().reduce((a, g) => a + (txTWD(g.rest, g.account) ?? g.rest), 0);
  grid.className = 'ev-page'; grid.innerHTML = `<div class="seg ev-kind"><button type="button" class="${s.kind === 'rec' ? 'primary' : 'secondary'}" data-ev-kind="rec">週期事件</button><button type="button" class="${s.kind === 'inst' ? 'primary' : 'secondary'}" data-ev-kind="inst">分期事件</button></div><div class="entry-tabs"><button type="button" data-ev-tab="on" class="${s.tab === 'on' ? 'active' : ''}">進行中（${r.on}）</button><button type="button" data-ev-tab="off" class="${s.tab === 'off' ? 'active' : ''}">已結束（${r.off}）</button></div>${s.kind === 'inst' && s.tab === 'on' ? `<p class="hint">未入帳的分期帳款合計 ${money(Math.round(fut))}</p>` : ''}${r.html || `<div class="empty">${s.kind === 'rec' ? '尚無週期交易' : '沒有分期'}</div>`}`;
  const old = document.getElementById('instEvents'); if (old) old.remove();
}
function recSheet(r) {
  const p = recPeriods(r, 12), el = sheetEl('instBg'); el.hidden = false; const a = acct(r.account), tot = p.past.reduce((s, x) => s + x.amount, 0);
  el.innerHTML = `<div class="recon-sheet">${sheetHead(esc(r.name))}<div class="recon-list notice-list">${infoRow('累計金額', acctMoney(tot, a))}${infoRow('週期', `${r.end?.type === 'count' ? `共 ${r.end.value} 期` : r.end?.type === 'date' ? `至 ${fmtDate(r.end.value)}` : '無限期'} · ${freqText(normRecurring(r))}`)}${p.past.map(x => `<button type="button" class="notice-row" data-tx-open="${esc(x.id)}"><div class="notice-ico ev-no">${x.no || '•'}</div><div class="day-main"><b>${fmtDate(x.date)}</b></div><div class="day-side"><b class="expense-text">${acctMoney(x.amount, a)}</b></div></button>`).join('')}${p.next.map(x => `<div class="notice-row ev-future"><div class="notice-ico ev-no">${x.no}</div><div class="day-main"><b>${fmtDate(x.date)}</b></div><div class="day-side"><b>${acctMoney(x.amount, a)}</b></div></div>`).join('')}</div></div>`;
}
// ---- 修改 / 刪除 menus ----
function seriesKind(t) { return t?.installment && !t.installment.prepay ? 'inst' : seriesRule(t) ? 'rec' : ''; }
async function seriesEditAsk(t) {
  const k = seriesKind(t); if (!k) return 'one'; const inst = k === 'inst', more = inst && instFuture(t).length, r = inst ? null : seriesRule(t);
  return uiAsk({ icon: '✎', options: [['one', '修改此記錄'], ...(inst ? (more ? [['all', '修改連同未來分期'], ['rate', '調整利率'], ['prepay', '提前償還本金'], ['payoff', '提前繳清分期']] : []) : recurringEnded(normRecurring(r)) ? [] : [['all', '修改連同未來週期']])] });
}
async function seriesDeleteAsk(t) {
  const k = seriesKind(t); if (!k) return 'plain'; return uiAsk({ icon: '🗑', options: [['one', '刪除此記錄'], ...(k === 'inst' ? [['group', '刪除此分期事件', 'danger']] : []), ['stop', k === 'inst' ? '終止未來分期' : '終止未來週期', 'danger']] });
}
async function seriesDelete(t, how) {
  if (how === 'one') { if (!confirm(`刪除「${t.name}」${money(t.amount)}？`)) return false; adjust(t, -1); state.transactions = state.transactions.filter(x => x !== t); txAfterDelete(t); return true; }
  if (how === 'group') { const g = installmentGroup(t); if (!confirm(`刪除整組 ${g.length} 期？`)) return false; const ids = new Set(g.map(x => x.id)); for (const x of g) { adjust(x, -1); txAfterDelete(x); } state.transactions = state.transactions.filter(x => !ids.has(x.id)); return true; }
  if (how === 'stop') { if (!confirm('這筆記錄之後的相關記錄會一併刪除，確定要終止嗎？')) return false; if (seriesKind(t) === 'inst') instStop(t); else recurringStop(t); return true; }
  return false;
}
function futureApply(t) { if (window.__applyFuture !== t.id) return; window.__applyFuture = null; if (seriesKind(t) === 'inst') instApply(t); else recurringApplyFrom(t); }
// ---- 退款 as the entry form ----
async function refundOpen(t) {
  let split; if (Array.isArray(t.splits) && t.splits.length > 1) { const k = await uiAsk({ icon: '↩', title: '退哪一項', options: t.splits.map((s, i) => [String(i), `${cat(s.category).name} ${money(refundLeft(t, i))}`]) }); if (k === null) return; split = Number(k); }
  if (t.installment) { const k = await uiAsk({ icon: '↩', title: '提醒', text: '要將此分期已支付的金額進行退款，並把剩餘期數終止嗎？', options: [['all', '全數退款'], ['one', '單期退款']] }); if (!k) return; if (k === 'all') { const r = refundInstallment(t, 'all', { account: t.account, date: isoDate(new Date()), time: nowTime() }); if (r.error) { alert(r.error); return; } await save(); render(); toast(`已退款 ${money(r.amount)}`); return; } }
  const c = entryEnsureCategory(state, '退款', 'income'); detailBg.classList.remove('open'); window.openTx('income', { kind: 'income', amount: refundLeft(t, split), account: t.account, project: t.project || '', merchant: t.merchant || '', person: '', name: `退款：${t.name}`, category: c.id, date: isoDate(new Date()), time: nowTime(), tags: [], note: '' });
  window.__refund = { id: t.id, split }; modalTitle.textContent = '新增退款'; setTimeout(efSync, 260);
}
function refundApply(t) { // → error text or ''
  const r = window.__refund, o = r && txById(r.id); if (!o || t.kind !== 'income') return ''; const left = refundLeft(o, r.split); if (t.amount > left + 1e-6) return `退款金額不能超過未退的 ${left}`; if (acctCur(acct(t.account)) !== acctCur(acct(o.account))) return '退款帳戶的幣別必須和原帳戶相同';
  t.refundOf = o.id; if (r.split !== undefined) t.refundSplit = r.split; offsetApply(t); return '';
}
function refundFee(o, amount, like) { const fee = acct(o.account).fxFeeRefund ? (state.transactions || []).find(x => x.feeOf === o.id) : null, back = fee ? Math.min(refundLeft(fee), curRound(Number(fee.amount) * amount / Math.abs(Number(o.amount || 1)), acctCur(acct(fee.account)))) : 0; if (!(back > 0)) return null; const r = { ...like, id: id(), amount: back, account: fee.account, name: `退款：${fee.name}`, refundOf: fee.id, note: '' }; delete r.refundSplit; state.transactions.push(r); adjust(r, 1); return r; }
function refundBarText() { const r = window.__refund, o = r && txById(r.id); if (!o) return ''; const n = Number(efEl('amount')?.value || 0), l = (o.rewards || []).map(x => { const f = rewardRuleById(x); return f ? rewardText(rewardOne(f.rule, n, curDigits(acctCur(acct(f.rule.account || o.account)))), f.rule.account || o.account) : ''; }).filter(Boolean); return l.length ? `預計需退回回饋：${l.join(' / ')}` : ''; }
// ---- 多類別：名稱、商家一起更新 ----
// policy: 'all' | 'empty' | 'keep'
function multiFieldApply(items, k, v, policy) { if (policy === 'all') return items.map(x => x.locked ? x : { ...x, [k]: v }); if (policy === 'empty') return items.map(x => x.locked || x[k] ? x : { ...x, [k]: v }); return items; }
async function multiFieldAsk(k, label) { const p = prefs()[k === 'name' ? 'multiName' : 'multiMer'] || ''; if (p) return p; return uiAsk({ icon: '☰', title: '更新', text: `要連同其他子類別記錄一起更新${label}嗎？`, options: [['all', '全部更新'], ['empty', `只更新無${label}記錄`], ['keep', '不用']], cancel: false }); }
document.addEventListener('click', async e => {
  const c = s => e.target.closest?.(s); let b;
  if ((b = c('[data-ev-kind]'))) { evSt().kind = b.dataset.evKind; evSt().tab = 'on'; renderEvents(); return; }
  if ((b = c('[data-ev-tab]'))) { evSt().tab = b.dataset.evTab; renderEvents(); return; }
  if ((b = c('[data-ev-rec]'))) { const r = (state.recurring || []).find(x => String(x.id) === b.dataset.evRec); if (r) recSheet(r); return; }
  if ((b = c('[data-ev-menu]'))) {
    const r = (state.recurring || []).find(x => String(x.id) === b.dataset.evMenu); if (!r) return; const on = !recurringEnded(normRecurring(r)), k = await uiAsk({ icon: '⋯', title: r.name, options: [['edit', '編輯'], ...(on ? [['post', '入帳本期'], ['skip', '略過本期'], ['pause', r.paused ? '恢復' : '暫停'], ['sub', r.sub ? '取消訂閱標記' : '標為訂閱']] : []), ['del', '刪除', 'danger']] });
    if (k === 'edit') { openEntity('recurring', r); return; } if (k === 'post') postRecurring(r); else if (k === 'skip') skipRecurring(r); else if (k === 'pause') subToggle(r, 'paused'); else if (k === 'sub') subToggle(r, 'sub'); else if (k === 'del') { if (!confirm(`刪除週期交易「${r.name}」？已入帳的交易不會被刪除。`)) return; state.recurring = state.recurring.filter(x => x !== r); } else return;
    await save(); render(); return;
  }
  if ((b = c('[data-ev-inst]'))) {
    const g = instGroups().find(x => x.group === b.dataset.evInst); if (!g) return; const t = g.list.find(x => x.date > isoDate(new Date())) || g.list.at(-1), k = await uiAsk({ icon: '⋯', title: g.name, options: [['open', '各期明細'], ...(g.left ? [['edit', '編輯下一期與之後']] : []), ['del', '刪除此分期事件', 'danger']] });
    if (k === 'open') instSheet(g.group); else if (k === 'edit') { window.editTx(t.id); window.__applyFuture = t.id; modalTitle.textContent = '修改連同未來分期'; } else if (k === 'del' && await seriesDelete(t, 'group')) { await save(); render(); }
  }
});
// The detail card's edit / delete / refund buttons first ask what to do with a series.
document.addEventListener('click', async e => {
  const b = e.target.closest?.('[data-dc]'); if (!b) return; const t = txById(window.detailId), k = b.dataset.dc; if (!t) return;
  if (k === 'refund' && refundable(t)) { e.stopImmediatePropagation(); refundOpen(t); return; }
  if (!seriesKind(t) || (k !== 'edit' && k !== 'del')) return; e.stopImmediatePropagation();
  if (k === 'edit') { const a = await seriesEditAsk(t); if (!a) return; if (a === 'rate' || a === 'prepay' || a === 'payoff') { document.querySelector(`#detailExtraBar [data-series=${a}]`)?.click(); return; } detailBg.classList.remove('open'); window.editTx(t.id); if (a === 'all') { window.__applyFuture = t.id; modalTitle.textContent = seriesKind(t) === 'inst' ? '修改連同未來分期' : '修改連同未來週期'; } return; }
  const a = await seriesDeleteAsk(t); if (a && await seriesDelete(t, a)) { detailBg.classList.remove('open'); await save(); render(); }
}, true);
// ---- 比較報表 ----
function cmpHeat(v, max, kind) { if (!v || !max) return ''; const a = (0.08 + 0.34 * Math.min(1, Math.abs(v) / max)).toFixed(2); return `background:rgba(${kind === 'in' ? '120,170,90' : '220,90,110'},${a})`; }
function cmpIncomeKey(def, k) { return def.by === 'income' || ['收入', '退款', '應收收款', '應付', '折扣', '紅利回饋', '利息收入'].includes(k) && def.by === 'kind'; }
function cmpRange(a, b) { const lo = Math.min(a, b), hi = Math.max(a, b); return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i); }
// One page: 統計・項目佔比・區間統計・區間變化・交易明細.
function cmpAnalysisHTML(def, s, m) {
  const K = cmpCalc(m, s.rows, s.cols), col = cmpColors(), pick = s.pick, cols = [...K.C], avg = s.sort === 'avg'; if (s.sort !== 'order') cols.sort((a, b) => s.sort === 'count' ? b.count - a.count : K.colTotal[b.key] - K.colTotal[a.key]); const tot = cols.reduce((a, c) => a + K.colTotal[c.key], 0), max = Math.max(1, ...cols.map(c => K.colTotal[c.key])), bar = s.cell?.row;
  const lines = cols.slice(0, 10), pts = lines.map(c => { let a = 0; return K.R.map(i => { const v = m.cell[i + '|' + c.key] || 0; a += v; return s.cum ? a : v; }); }), W = 700, H = 200, mx = Math.max(1, ...pts.flat()), x = i => 8 + (K.R.length < 2 ? W / 2 : i * (W - 16) / (K.R.length - 1)), y = v => H - 10 - v / mx * (H - 24);
  let tx = cmpTxs(def, m, bar !== undefined ? [bar] : K.R, pick ? m.cols.filter(c => c.key === pick) : K.C); if (s.txSort === 'amount') tx = [...tx].sort((a, b) => anValue(b) - anValue(a)); else if (s.txSort === 'asc') tx = [...tx].reverse();
  return `<div class="ca"><section><h3 class="notice-h">統計 <select id="cmpSort"><option value="order">依欄位順序</option><option value="amount"${s.sort === 'amount' ? ' selected' : ''}>依金額排序</option><option value="count"${s.sort === 'count' ? ' selected' : ''}>依次數排序</option><option value="avg"${avg ? ' selected' : ''}>平均</option></select></h3>${cols.map((c, i) => `<button type="button" class="ap-stat${pick === c.key ? ' on' : ''}" data-ca-pick="${esc(c.key)}"><span>${esc(c.name)}</span><i style="background:${col[i % col.length]}">${c.count}</i><em><u style="width:${Math.max(2, K.colTotal[c.key] / max * 100)}%;background:${col[i % col.length]}"></u></em><b>${money(Math.round(avg ? K.colTotal[c.key] / Math.max(1, K.n) : K.colTotal[c.key]))}</b></button>`).join('')}<div class="ap-stat"><span>總計</span><i style="background:#2f8fd0">${cols.reduce((a, c) => a + c.count, 0)}</i><em></em><b>${money(Math.round(avg ? tot / Math.max(1, K.n) : tot))}</b></div></section>
  <section><h3 class="notice-h">項目佔比</h3>${tot > 0 ? donutSVG([...K.C].sort((a, b) => K.colTotal[b.key] - K.colTotal[a.key]).slice(0, 10).map(c => ({ k: c.name, v: K.colTotal[c.key] })).filter(r => r.v > 0), bigMoney(tot)) : '<div class="empty">沒有資料</div>'}</section>
  <section class="ca-wide"><h3 class="notice-h">區間統計</h3>${cmpStackSVG(m, K)}${bar !== undefined ? `<button type="button" class="tx-link" data-ca-bar="${bar}">● ${esc(m.periods[bar].label)}　${money(K.rowTotal[bar])}（${K.growth[bar] === null ? '—' : (K.growth[bar] > 0 ? '↑' : '↓') + Math.abs(K.growth[bar] * 100).toFixed(2) + '%'}）　詳細 ›</button>` : '<p class="hint">點長條看該區間與上期的變化。</p>'}</section>
  <section class="ca-wide"><h3 class="notice-h">區間變化 <button type="button" class="ghost" data-ca-cum>${s.cum ? '累積顯示' : '個別顯示'}</button></h3><svg class="cmp-svg" viewBox="0 0 ${W} ${H}">${lines.map((c, j) => `<polyline fill="none" stroke="${col[j % col.length]}" stroke-width="2" points="${pts[j].map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"><title>${esc(c.name)}</title></polyline>`).join('')}</svg><div class="dn-legend">${lines.map((c, j) => `<span><i style="background:${col[j % col.length]}"></i>${esc(c.name)} ${money(pts[j].at(-1) || 0)}</span>`).join('')}</div></section>
  <section class="ca-wide"><h3 class="notice-h">交易明細（${tx.length}） <select id="caTx"><option value="desc">依日期排序（降冪）</option><option value="asc"${s.txSort === 'asc' ? ' selected' : ''}>依日期排序（升冪）</option><option value="amount"${s.txSort === 'amount' ? ' selected' : ''}>依金額排序</option></select></h3>${tx.slice(0, 300).map(rptRowHTML).join('') || '<div class="recon-empty">沒有記錄</div>'}</section></div>`;
}
document.addEventListener('click', async e => {
  const c = s => e.target.closest?.(s), C = cmpSt(); let b; if (!c('#cmpBg')) return;
  if (window.__cmpLong) { window.__cmpLong = false; e.stopImmediatePropagation(); e.preventDefault(); return; }
  if ((b = c('[data-cmp-cell]'))) { e.stopImmediatePropagation(); const def = cmpList().find(x => x.id === C.id) || cmpList()[0], m = cmpBuild(def), i = Number(b.dataset.cmpCell), k = m.cols.find(x => x.key === b.dataset.key); if (k) rvShow(`${k.name} ${m.periods[i].label}`, cmpTxs(def, m, [i], [k])); return; }
  if (c('[data-ca-open]')) { C.view = 'all'; C.cell = null; C.pick = null; renderCompare(); return; }
  if (c('[data-ca-back]')) { C.view = 'table'; renderCompare(); return; }
  if ((b = c('[data-ca-pick]'))) { C.pick = C.pick === b.dataset.caPick ? null : b.dataset.caPick; renderCompare(); return; }
  if (c('[data-ca-cum]')) { C.cum = !C.cum; renderCompare(); return; }
  if ((b = c('[data-ca-bar]'))) { const def = cmpList().find(x => x.id === C.id), m = cmpBuild(def), K = cmpCalc(m, C.rows, C.cols), i = Number(b.dataset.caBar), el = sheetEl('rvBg'); el.hidden = false; el.style.zIndex = 30; const l = K.C.map(x => ({ k: x.name, v: m.cell[i + '|' + x.key] || 0 })).filter(x => x.v > 0).sort((a, d) => d.v - a.v); el.innerHTML = `<div class="recon-sheet">${sheetHead(esc(m.periods[i].label))}<div class="recon-list notice-list">${l.map(x => infoRow(x.k, money(x.v))).join('')}${l.length ? donutSVG(l.slice(0, 10), money(K.rowTotal[i])) : ''}</div></div>`; }
}, true);
document.addEventListener('change', e => { if (e.target?.id === 'caTx') { cmpSt().txSort = e.target.value; renderCompare(); } });
// Long press: a row header starts / ends a range (or clears it), a column header offers 全選.
document.addEventListener('pointerdown', e => {
  const r = e.target.closest?.('#cmpBg [data-cmp-row]'), k = e.target.closest?.('#cmpBg [data-cmp-col]'); clearTimeout(window.__cmpTimer); if (!r && !k) return;
  window.__cmpTimer = setTimeout(async () => {
    const C = cmpSt(), i = r ? Number(r.dataset.cmpRow) : 0; window.__cmpLong = true;
    if (r) { if (C.anchor === undefined || C.anchor === null) { C.anchor = i; C.anchorOff = C.rows.includes(i); toast(C.anchorOff ? '取消範圍選取：再長按結束的區間' : '範圍選取：再長按結束的區間'); } else { const l = cmpRange(C.anchor, i); C.rows = C.anchorOff ? C.rows.filter(x => !l.includes(x)) : [...new Set([...C.rows, ...l])]; C.anchor = null; renderCompare(); } }
    else { const a = await uiAsk({ icon: 'ℹ', text: '要全選所有欄位嗎？', options: [['all', '全選'], ['none', '取消所有欄位']] }); const def = cmpList().find(x => x.id === C.id) || cmpList()[0]; if (a) { C.cols = a === 'all' ? cmpBuild(def).cols.map(x => x.key) : []; renderCompare(); } window.__cmpLong = false; }
  }, 550);
});
for (const ev of ['pointerup', 'pointercancel', 'pointermove']) document.addEventListener(ev, e => { if (ev !== 'pointermove' || Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0) > 6) clearTimeout(window.__cmpTimer); if (ev === 'pointerup') setTimeout(() => { window.__cmpLong = false; }, 350); });

async function multiMenu() {
  const S = window.entryItems.state(), k = await uiAsk({ icon: '🗂️', title: `多類別（${S.items.length} 項）`, text: `${S.items.map((it, i) => `${i + 1}. ${it.preset || cat(it.category).name} ${itemSign(it) > 0 ? '+' : '−'}${itemNet(it)}`).join('\n')}\n合計 ${money(Math.abs(itemsTotal(S.items)))}`, options: [['name', '更新名稱'], ['mer', '更新商家'], ['cat', '全部變更為目前項目的類別']] });
  if (k === 'cat') { const x = S.items[S.ci]; if (itemLoan(x)) { alert('請先切換到支出或收入項目'); return; } window.entryItems.setAll(y => itemLoan(y) || y.kind !== x.kind ? y : { ...y, category: x.category }); return; }
  if (k !== 'name' && k !== 'mer') return; const fld = k === 'name' ? 'name' : 'merchant', lab = k === 'name' ? '名稱' : '商家', v = prompt(`多類別的${lab}`, S.items[S.ci][fld] || ''); if (v === null) return;
  const p = await multiFieldAsk(fld, lab), l = multiFieldApply(S.items, fld, v.trim(), p); window.entryItems.setAll((y, i) => l[i]);
}
