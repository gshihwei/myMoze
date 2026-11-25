// 帳小簿 V26.88 — 分期進階：利息、提前償還本金、修改後重算、調息、分期事件頁、尾款改分期.
// Bundled after js/prefs-sync.js. Function declarations / var only.
// A period with interest keeps its parts in installment.principal / installment.interest (amount = both);
// installment.rate / method / daily describe how the rest of the group is recalculated. Without `principal` the whole amount is principal.

function instPrincipal(x) { return Number(x.installment?.principal ?? x.amount ?? 0); }
function instInterest(x) { return Number(x.installment?.interest || 0); }
function instGroups() {
  const m = new Map();
  for (const t of (state.transactions || [])) if (t.installment?.group) { const l = m.get(t.installment.group); if (l) l.push(t); else m.set(t.installment.group, [t]); }
  return [...m.entries()].map(([g, l]) => instSummary(g, l));
}
function instSummary(g, l, today) {
  const t0 = today || isoDate(new Date()), list = [...l].sort((a, b) => a.date.localeCompare(b.date) || a.installment.n - b.installment.n), done = list.filter(x => x.date <= t0 && !x.pending), left = list.filter(x => !(x.date <= t0 && !x.pending)), s = (a, f) => Math.round(a.reduce((v, x) => v + f(x), 0) * 100) / 100;
  const regular = list.filter(x => !x.installment.prepay), amt = x => Number(x.amount || 0);
  return { group: g, name: list[0].name.replace(/（\d+\/\d+）(（提前繳清）)?$/, '').replace(/（提前.*）$/, ''), account: list[0].account, list, total: regular[0]?.installment.total || list.length, done: done.length, left: left.length, paid: s(done, amt), rest: s(left, amt), principal: s(list, instPrincipal), interest: s(list, instInterest), paidPrincipal: s(done, instPrincipal), paidInterest: s(done, instInterest), next: left[0]?.date || '', rate: list.at(-1).installment.rate || 0, last: list.at(-1).date };
}
function instDays(a, b) { return Math.max(0, Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5)); }
// Per-period principal / interest. o = { rate, method, grace, daily, dates (n+1 dates: start + due dates, for daily interest) }.
function instSchedule(P, n, o, digits) {
  const base = loanSchedule(P, n, o?.rate, o?.method || 'annuity', digits, o?.grace);
  if (!o?.daily || !(Number(o.rate) > 0) || !o.dates || o.method === 'flat') return base;
  const p10 = 10 ** (digits || 0), rd = v => Math.round(v * p10) / p10, g = Math.min(Math.max(0, Math.floor(Number(o.grace) || 0)), n - 1), r = Number(o.rate) / 1200, m = n - g, pay = rd(P * r / (1 - (1 + r) ** -m)); let bal = P;
  return base.map((x, i) => { const interest = rd(bal * Number(o.rate) / 36500 * instDays(o.dates[i], o.dates[i + 1])); let principal = 0; if (i >= g) principal = i === n - 1 ? bal : o.method === 'principal' ? x.principal : Math.max(0, Math.min(bal, rd(pay - interest))); bal = rd(bal - principal); return { n: i + 1, principal: rd(principal), interest, balance: bal }; });
}
// Interest version of installmentPlan() (called by it when o.rate > 0).
function instRatePlan(t, n, o) {
  const P = Math.abs(Number(t.amount || 0)), no = Math.max(1, Math.floor(Number(o.startNo) || 1)), all = n + no - 1, group = id(), rule = { freq: 'month', interval: 1, start: t.date }, dates = [];
  { let d = t.date; for (let i = 0; i < n; i++) { dates.push(d); d = addPeriod(d, rule); } }
  const prev = addPeriod(t.date, { freq: 'month', interval: -1, start: t.date }) || t.date, first = prev < t.date ? prev : t.date;
  const sch = instSchedule(P, n, { ...o, dates: [first, ...dates] }, o.int ? 0 : curDigits(acctCur(acct(t.account))));
  const base = { ...t }; for (const k of ['fee', 'discount', 'feeIncluded', 'feeName', 'discountName', 'attachments', 'orig']) delete base[k];
  const meta = { rate: Number(o.rate), method: o.method || 'annuity', ...(o.daily ? { daily: true } : {}) };
  return { list: sch.map((s, i) => ({ ...base, id: i === 0 ? t.id : id(), date: dates[i], amount: Math.round((s.principal + s.interest) * 100) / 100, name: t.name + '（' + (no + i) + '/' + all + '）', installment: { group, n: no + i, total: all, amount: P, principal: s.principal, interest: s.interest, ...meta } })).filter(x => x.amount > 0) };
}
// Spreads `remaining` principal over `list` (dated periods, oldest first) again. meta = { rate, method, daily, grace }.
function instSpread(list, remaining, meta, prevDate) {
  const n = list.length; if (!n) return; const dig = curDigits(acctCur(acct(list[0].account)));
  const sch = instSchedule(remaining, n, { ...meta, dates: [prevDate || list[0].date, ...list.map(x => x.date)] }, Number.isInteger(remaining) ? 0 : Math.max(dig, 2));
  list.forEach((x, i) => { adjust(x, -1); x.amount = Math.round((sch[i].principal + sch[i].interest) * 100) / 100; x.installment = { ...x.installment, principal: sch[i].principal, interest: sch[i].interest, rate: Number(meta.rate || 0), method: meta.method || 'annuity', ...(meta.daily ? { daily: true } : {}) }; adjust(x, 1); });
}
function instMeta(x) { return { rate: Number(x.installment?.rate || 0), method: x.installment?.method || 'annuity', daily: !!x.installment?.daily }; }
// 提前償還本金: one extra payment; the later periods shrink.
function instPrepay(t, amount, date) {
  const later = instFuture(t), rest = Math.round(later.reduce((s, x) => s + instPrincipal(x), 0) * 100) / 100; amount = Math.round(Number(amount || 0) * 100) / 100;
  if (!(amount > 0) || amount > rest) return { error: `金額必須介於 1 ～ ${rest}（剩餘本金）` };
  const x = JSON.parse(JSON.stringify(t)); for (const k of ['postDate', 'recon', 'attachments', 'invoiceNo', 'invoiceCode', 'rewards', 'balanceTx', 'depositOf']) delete x[k];
  Object.assign(x, { id: id(), date, time: nowTime(), amount, name: t.name.replace(/（\d+\/\d+）$/, '') + '（提前償還本金）', installment: { ...t.installment, principal: amount, interest: 0, prepay: true } });
  state.transactions.push(x); adjust(x, 1);
  const left = Math.round((rest - amount) * 100) / 100; if (left > 0) instSpread(later, left, instMeta(later[0]), t.date); else instStop(t);
  return { tx: x };
}
// 調息: this period and the later ones use the new rate.
function instRate(t, rate) {
  const list = [t, ...instFuture(t)].filter(x => !x.installment.prepay), rest = Math.round(list.reduce((s, x) => s + instPrincipal(x), 0) * 100) / 100, prev = installmentGroup(t).filter(x => x.installment.n < t.installment.n).sort((a, b) => b.installment.n - a.installment.n)[0];
  if (!(Number(rate) >= 0)) return false; const hist = [...(t.installment.hist || []), { date: t.date, rate: Number(rate) }];
  instSpread(list, rest, { ...instMeta(t), rate: Number(rate) }, prev?.date || t.date); for (const x of list) x.installment.hist = hist; return true;
}
// After one period was edited by hand: the change is principal; optionally the later periods absorb it.
function instAfterEdit(old, t) {
  if (!old?.installment || !t?.installment || Number(old.amount) === Number(t.amount)) return;
  t.installment = { ...t.installment, principal: Math.round((Number(t.amount) - instInterest(t)) * 100) / 100 };
  const later = instFuture(t); if (!later.length) return;
  const diff = Math.round((Number(t.installment.principal) - instPrincipal(old)) * 100) / 100, rest = Math.round((later.reduce((s, x) => s + instPrincipal(x), 0) - diff) * 100) / 100;
  if (diff && rest > 0 && confirm('這一期的金額改變了。\n\n確定：依剩餘本金重新計算後面的期數\n取消：只修改這一期')) instSpread(later, rest, instMeta(later[0]), t.date);
}
// Interest since the last paid period, for 提前繳清.
function instPayoffInterest(t, date) { const m = instMeta(t), rest = instFuture(t).reduce((s, x) => s + instPrincipal(x), 0); return m.rate > 0 ? Math.round(rest * m.rate / 36500 * Math.max(0, instDays(t.date, date))) : 0; }
// ---- 尾款改分期 ----
function instEditable(t) { return !!t?.depositOf && !!t.pending; }
function instFromBalance(t, plan) {
  plan.list.forEach((x, i) => { if (i) { delete x.depositOf; x.depositInst = t.depositOf; } delete x.pending; delete x.pendingApplied; delete x.amountTbd; delete x.dateTbd; });
  state.transactions = state.transactions.filter(x => x.id !== t.id);
  for (const x of plan.list) { state.transactions.push(x); adjust(x, 1); }
}
// ---- 分期事件 ----
function instEventsHTML() {
  const gs = instGroups(), card = g => `<div class="entity-card recurring-card ${g.left ? '' : 'ended'}"><div class="rc-head"><span class="mini-icon">${esc(cat(g.list[0].category).icon)}</span><b>${esc(g.name)}</b></div><strong>${acctMoney(g.rest, acct(g.account))}<small class="hint"> 未入帳</small></strong><div class="inst-bar"><i style="width:${Math.round(g.paid / ((g.paid + g.rest) || 1) * 100)}%"></i></div><div class="hint">已入帳 ${g.done} 期 ${acctMoney(g.paid, acct(g.account))} · 剩 ${g.left} 期${g.next ? ` · 下一期 ${g.next}` : ''}</div><div class="hint">${acctName(acct(g.account))} · 本金 ${acctMoney(g.principal, acct(g.account))}${g.interest ? ` · 利息 ${acctMoney(g.interest, acct(g.account))}${g.rate ? `（${g.rate}%）` : ''}` : ''}</div><div class="rc-actions"><button type="button" class="secondary" data-inst-open="${esc(g.group)}">各期明細</button>${g.left ? `<button type="button" class="secondary" data-inst-edit="${esc(g.group)}">編輯</button>` : ''}<button type="button" class="secondary danger-btn" data-inst-del="${esc(g.group)}">刪除</button></div></div>`;
  const on = gs.filter(g => g.left).sort((a, b) => a.next.localeCompare(b.next)), off = gs.filter(g => !g.left).sort((a, b) => b.last.localeCompare(a.last)), sum = on.reduce((s, g) => s + (txTWD(g.rest, g.account) ?? g.rest), 0);
  return `<h3>分期事件</h3><p class="hint">未入帳的分期帳款合計 ${money(sum)}。帳單分期請到信用卡明細、貸款分期請到借還款查看。</p><div class="card-grid">${on.map(card).join('') || '<div class="empty">沒有進行中的分期</div>'}</div>${off.length ? `<details><summary>已結束（${off.length}）</summary><div class="card-grid">${off.map(card).join('')}</div></details>` : ''}`;
}
function renderInstEvents() {
  const grid = document.getElementById('recurringGrid'); if (!grid?.parentNode) return; let el = document.getElementById('instEvents');
  if (!el) { el = document.createElement('section'); el.id = 'instEvents'; el.className = 'inst-events'; grid.after(el); }
  el.innerHTML = instEventsHTML();
}
function instSheet(group) {
  const g = instGroups().find(x => x.group === group), el = sheetEl('instBg'); if (!g) return; el.hidden = false; const a = acct(g.account), t0 = isoDate(new Date()), hist = g.list.at(-1).installment.hist || [];
  el.innerHTML = `<div class="recon-sheet">${sheetHead(esc(g.name))}<div class="recon-list notice-list">${infoRow('本金', `${acctMoney(g.paidPrincipal, a)} / ${acctMoney(g.principal, a)}`)}${g.interest ? infoRow('利息', `${acctMoney(g.paidInterest, a)} / ${acctMoney(g.interest, a)}`) : ''}${hist.map(h => infoRow('調息', `${h.date} 起 ${h.rate}%`)).join('')}${g.list.map(x => `<button type="button" class="notice-row" data-tx-open="${esc(x.id)}"><div class="notice-ico">${x.date <= t0 ? '✓' : '○'}</div><div class="day-main"><b>${esc(x.name)}</b><small>${x.date}${x.installment.interest ? `　本金 ${acctMoney(x.installment.principal, a)}＋利息 ${acctMoney(x.installment.interest, a)}` : ''}</small></div><div class="day-side"><b>${acctMoney(x.amount, a)}</b></div></button>`).join('')}</div></div>`;
}
document.addEventListener('click', async e => {
  const c = s => e.target.closest?.(s); let b;
  if ((b = c('[data-inst-open]'))) { instSheet(b.dataset.instOpen); return; }
  if (c('#instBg [data-tx-open]')) { document.getElementById('instBg').hidden = true; return; }
  if ((b = c('[data-inst-edit]'))) { const g = instGroups().find(x => x.group === b.dataset.instEdit), t = g?.list.find(x => x.date > isoDate(new Date())); if (t) window.editTx(t.id); return; }
  if ((b = c('[data-inst-del]'))) {
    const g = instGroups().find(x => x.group === b.dataset.instDel); if (!g || !confirm(`刪除「${g.name}」整組 ${g.list.length} 期？帳戶餘額會還原。`)) return;
    const ids = new Set(g.list.map(x => x.id)); for (const x of g.list) { adjust(x, -1); txAfterDelete(x); } state.transactions = state.transactions.filter(x => !ids.has(x.id)); await save(); render();
  }
});
