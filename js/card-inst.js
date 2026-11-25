// 帳小簿 V26.74 — 帳單分期.
// Bundled after js/card-plus.js. Function declarations / var only.
// One group = { stmtInst: groupId } transactions on the card:
//   credit   balance_adjustment +R on the statement's closing date  (this bill no longer has to be paid)
//   part k   balance_adjustment −principal on the first day of the k-th next statement
//   interest expense 利息支出, same date, pending + autoPost (enters the balance when its day comes)
// Principal parts are not expenses, so nothing is counted twice; the card's total debt does not change by converting.

// method: 'annuity' 本息均攤 | 'principal' 本金均攤 | 'flat' 固定利息. Interest is per month (annual rate / 12), rounded to `digits`.
// grace = number of first periods that pay interest only. Returns [{ n, principal, interest, balance }].
function loanSchedule(P, n, ratePct, method, digits, grace) {
  P = Math.abs(Number(P || 0)); n = Math.floor(Number(n || 0)); const p10 = 10 ** (digits || 0), rd = v => Math.round(v * p10) / p10, r = Math.max(0, Number(ratePct || 0)) / 1200, g = Math.min(Math.max(0, Math.floor(Number(grace || 0))), Math.max(0, n - 1));
  if (!(P > 0) || n < 1) return [];
  const m = n - g, out = []; let bal = P;
  const each = Math.floor(P / m * p10) / p10, pay = r > 0 ? rd(P * r / (1 - (1 + r) ** -m)) : 0;
  for (let i = 1; i <= n; i++) {
    const interest = rd((method === 'flat' ? P : bal) * r);
    let principal = 0;
    if (i > g) {
      const k = i - g;
      if (k === m) principal = bal;
      else if (method === 'annuity' && r > 0) principal = Math.max(0, Math.min(bal, rd(pay - interest)));
      else principal = k === 1 ? rd(P - each * (m - 1)) : each;
    }
    bal = rd(bal - principal); out.push({ n: i, principal: rd(principal), interest, balance: bal });
  }
  return out;
}
function stmtInstCreate(card, base, offset, o) {
  const st = creditStmt(card, base, offset), amount = Number(o.amount || 0), n = Math.floor(Number(o.n || 0));
  if (!(amount > 0) || amount > st.owed) return { error: `分期金額必須介於 1 ～ ${st.owed}` };
  if (n < 2 || n > 60) return { error: '期數必須介於 2 ～ 60' };
  const plan = loanSchedule(amount, n, o.rate, o.method, curDigits(acctCur(card))), g = id(), [y, m] = cardNominalMonth(card, base, offset), list = [];
  const meta = k => ({ stmtInst: g, stmtInstNo: k, stmtInstTotal: n });
  list.push({ id: id(), date: st.period.end, time: '', kind: 'balance_adjustment', amount, account: card.id, category: '', name: `帳單分期（${n} 期）`, note: '', tags: [], ...meta(0) });
  const c = plan.some(p => p.interest > 0) ? entryEnsureCategory(state, '利息支出', 'expense') : null;
  for (const p of plan) {
    const date = stmtRange(card, y, m + p.n).start;
    list.push({ id: id(), date, time: '', kind: 'balance_adjustment', amount: -p.principal, account: card.id, category: '', name: `帳單分期本金（${p.n}/${n}）`, note: '', tags: [], ...meta(p.n) });
    if (p.interest > 0) list.push({ id: id(), date, time: '', kind: 'expense', amount: p.interest, account: card.id, category: c.id, name: `帳單分期利息（${p.n}/${n}）`, note: '', tags: [], pending: true, pendingApplied: false, autoPost: true, ...meta(p.n) });
  }
  for (const t of list) { state.transactions.push(t); adjust(t, 1); }
  autoPostDue();
  return { group: g, plan };
}
function stmtInstRemove(g) {
  const l = state.transactions.filter(t => t.stmtInst === g); for (const t of l) adjust(t, -1);
  state.transactions = state.transactions.filter(t => t.stmtInst !== g); return l.length;
}
// Pending records that post themselves on their date.
function autoPostDue(today) {
  const t0 = today || isoDate(new Date()); let n = 0;
  for (const t of (state?.transactions || [])) if (t.pending && t.autoPost && t.date <= t0) { confirmPending(t); delete t.autoPost; n++; }
  return n;
}
function stmtInstGroups(card) {
  const map = new Map();
  for (const t of state.transactions) if (t.stmtInst && String(t.account) === String(card.id)) { const g = map.get(t.stmtInst) || { id: t.stmtInst, total: t.stmtInstTotal, amount: 0, date: '', interest: 0, left: 0 }; if (t.stmtInstNo === 0) { g.amount = t.amount; g.date = t.date; } else { if (t.kind === 'expense') g.interest += t.amount; else if (t.date > isoDate(new Date())) g.left++; } map.set(t.stmtInst, g); }
  return [...map.values()];
}
function stmtInstHTML(card, owed) {
  const gs = stmtInstGroups(card);
  return `<details class="stmt-adjust"><summary>帳單分期${gs.length ? `（${gs.length} 組）` : ''}</summary>${gs.map(g => `<div class="payment-record"><div><b>${acctMoney(g.amount, card)} 分 ${g.total} 期</b><div class="meta">${g.date} 帳單 · 利息共 ${acctMoney(g.interest, card)} · 剩 ${g.left} 期</div></div><button type="button" class="ghost" data-stmtinst-del="${esc(g.id)}">取消分期</button></div>`).join('')}${owed > 0 ? `<div class="form-grid"><label>分期金額<input id="siAmount" type="number" min="1" step="any" value="${owed}"></label><label>期數<input id="siN" type="number" min="2" max="60" value="6"></label><label>年利率 %<input id="siRate" type="number" min="0" step="any" value="0"></label><label>利息方式<select id="siMethod"><option value="annuity">本息均攤</option><option value="principal">本金均攤</option><option value="flat">固定利息</option></select></label></div><p class="hint" id="siHint"></p><div class="form-actions"><button type="button" class="primary" data-stmtinst="${esc(card.id)}">建立帳單分期</button></div>` : '<p class="hint">這一期沒有尚欠的帳款。</p>'}</details>`;
}
document.addEventListener('input', e => {
  if (!/^si(Amount|N|Rate|Method)$/.test(e.target?.id || '')) return;
  const v = i => document.getElementById(i)?.value, pl = loanSchedule(v('siAmount'), v('siN'), v('siRate'), v('siMethod'), 0), h = document.getElementById('siHint');
  if (h && pl.length) h.textContent = `第 1 期 ${money(pl[0].principal + pl[0].interest)}（本金 ${money(pl[0].principal)}＋利息 ${money(pl[0].interest)}），利息合計 ${money(pl.reduce((s, x) => s + x.interest, 0))}。實際金額以銀行為準。`;
});
document.addEventListener('click', async e => {
  const b = e.target.closest?.('[data-stmtinst]');
  if (b) { const v = i => document.getElementById(i)?.value, r = stmtInstCreate(acct(b.dataset.stmtinst), new Date(), creditStatementOffset, { amount: v('siAmount'), n: v('siN'), rate: v('siRate'), method: v('siMethod') }); if (r.error) { alert(r.error); return; } await save(); render(); return; }
  const d = e.target.closest?.('[data-stmtinst-del]');
  if (d && confirm('取消這組帳單分期？會移除所有期別與利息記錄，該期帳單恢復為尚欠。')) { stmtInstRemove(d.dataset.stmtinstDel); await save(); render(); }
});
