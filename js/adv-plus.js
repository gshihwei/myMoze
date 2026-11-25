// 帳小簿 V26.102 — 進階設定補齊：分期完整欄位、應收款項的訂金尾款、CNY／HKD 帳單折抵.
// Bundled after js/ui-ask.js. Function declarations / var only.

// ---- 分期 ----
function instRoundHow(v, how, digits) { const p = 10 ** (digits || 0), e = 1e-9; return how === 'floor' ? Math.floor(v * p + e) / p : how === 'ceil' ? Math.ceil(v * p - e) / p : how === 'keep' ? Math.round(v * 100) / 100 : Math.round(v * p + e) / p; }
// Everything the 分期 tab can say. Interest type '' = none; a monthly rate becomes the annual rate used by loanSchedule().
function instOptsFromForm(f) {
  const type = String(f.get('instMethod') || ''), raw = Math.max(0, Number(f.get('instRate')) || 0);
  return { startNo: f.get('instStart'), int: !!f.get('instInt'), rem: f.get('instRem'), rate: type ? raw * (f.get('instRateType') === 'month' ? 12 : 1) : 0, method: type || 'annuity', grace: type ? f.get('instGrace') : 0, daily: !!type && !!f.get('instDaily'), how: f.get('instHow') || 'round', each: type ? 0 : Number(f.get('instEach')) || 0, every: Math.min(12, Math.max(1, Math.floor(Number(f.get('instEvery')) || 1))), first: f.get('instFirst') || '', post: f.get('instPost') || 'now', reward: f.get('instReward') || 'each' };
}
// Interest-free amounts of n periods: [first, …]. `each` fixes the normal period; the rest goes to the first / last one.
function instAmounts(total, n, o) {
  const dig = o?.int ? 0 : 2, each = o?.each > 0 ? o.each : instRoundHow(total / n, o?.how || 'round', o?.how === 'keep' ? 2 : dig), list = Array(n).fill(each), rest = Math.round((total - each * (n - 1)) * 100) / 100; list[o?.rem === 'last' ? n - 1 : 0] = rest; return rest > 0 ? list : null;
}
function instDates(first, n, every) { const out = []; let d = first; const r = { freq: 'month', interval: every || 1, start: first }; for (let i = 0; i < n; i++) { out.push(d); d = addPeriod(d, r); } return out; }
// Called by installmentPlan() when the form sent the new fields (o.how).
function instFullPlan(t, n, o) {
  const total = Math.abs(Number(t.amount || 0)), first = /^\d{4}-\d{2}-\d{2}$/.test(o.first || '') ? o.first : t.date, dates = instDates(first, n, o.every), no = Math.max(1, Math.floor(Number(o.startNo) || 1)); let list;
  if (Number(o.rate) > 0) { const p = instRatePlan({ ...t, date: first }, n, o); if (p.error) return p; list = p.list; }
  else {
    if (total < n) return { error: '金額太小，無法分期' }; const am = instAmounts(total, n, o); if (!am) return { error: '每期金額 × 期數超過總金額' };
    const base = { ...t }, g = id(), all = n + no - 1; for (const k of ['fee', 'discount', 'feeIncluded', 'feeName', 'discountName', 'attachments']) delete base[k];
    list = am.map((a, i) => ({ ...base, id: i ? id() : t.id, date: dates[i], amount: a, name: `${t.name}（${no + i}/${all}）`, installment: { group: g, n: no + i, total: all, amount: total } }));
  }
  list.forEach((x, i) => {
    x.date = dates[i]; if (x.installment && (o.every || 1) > 1) x.installment.every = o.every; if (i) delete x.rewards; if (o.reward !== 'first' && t.rewards) x.rewards = [...t.rewards];
    if (o.post === 'remind') { x.pending = true; x.pendingApplied = false; }
  });
  return { list };
}
function instFormHint() {
  const el = txForm?.elements, set = (i, v) => { const x = document.getElementById(i); if (x) x.textContent = v; }; if (!el?.instHow) return; const o = instOptsFromForm(new FormData(txForm)), n = Math.floor(Number(el.instCount.value) || 0), P = Number(el.amount.value || 0), type = el.instMethod.value, show = (k, on) => txForm.querySelectorAll(`[data-inst-row="${k}"]`).forEach(x => { x.hidden = !on; });
  show('rate', !!type); show('norate', !type); set('instTotalText', P ? money(P) : '—'); set('instTotalLabel', Number(el.instStart.value) > 1 ? '分期剩餘金額' : '分期總金額'); set('instCountLabel', Number(el.instStart.value) > 1 ? '剩餘期數' : '分期期數');
  if (!(P > 0) || n < 2) { set('instFirstText', '—'); set('instEachText', '—'); return; }
  if (type) { const s = instSchedule(P, n, { ...o, dates: instDates(o.first || el.date.value || isoDate(new Date()), n + 1, o.every) }, 0); set('instEachText', money(s[Math.min(1, n - 1)].principal + s[Math.min(1, n - 1)].interest)); set('instFirstText', money(s[0].principal + s[0].interest)); }
  else { const a = instAmounts(P, n, o); set('instFirstText', a ? money(a[0]) : '超過總金額'); set('instEachText', a ? money(a[n > 1 ? 1 : 0]) : '—'); if (document.activeElement !== el.instEach) el.instEach.placeholder = a ? String(a[1]) : ''; }
}
function instBarText(n) {
  const el = txForm.elements, c = Number(el.instCount.value) || 0, s = Math.max(1, Number(el.instStart.value) || 1), type = { annuity: '本息均攤', principal: '本金均攤', flat: '固定利息' }[el.instMethod.value], first = el.instFirst?.value || el.date.value;
  return `分期：#${s} / ${c + s - 1}（${money(n)}）${type && Number(el.instRate.value) > 0 ? `\n利息採用${type}：${el.instRateType.value === 'month' ? '月' : '年'}利率 ${el.instRate.value}%` : ''}\n首次還款日將從 ${fmtDate(first)} 開始進行（${c} 期）`;
}
// ---- 訂金尾款：應收款項（幫別人代付訂金）----
// The balance is a pending record that becomes a second loan when it is paid (loanBalance keeps who and which kind).
function loanDepositCreate(loan, o) {
  const t = (state.transactions || []).find(x => x.kind === 'loan' && String(x.loanId) === String(loan.id)); if (!t) return null; const amount = Math.max(0, Number(o.amount || 0)), date = String(o.date || '');
  const b = { id: id(), time: '', tags: [], pending: true, pendingApplied: false, depositOf: t.id, kind: 'expense', name: t.name, category: t.category || '', project: '', merchant: '', person: loan.person, note: '', account: loan.account, amount, date: date || t.date, loanBalance: { direction: loanDirection(loan), person: loan.person, label: loan.label || '' } };
  if (!amount) b.amountTbd = true; if (!date) b.dateTbd = true; state.transactions.push(b); t.balanceTx = b.id; return b;
}
// Finishing such a balance: the pending record is replaced by a loan linked to the deposit.
function loanBalanceFinish(old, t) {
  const r = entryPostLoan(state, { direction: old.loanBalance.direction, amount: t.amount, account: t.account, date: t.date, time: t.time, person: t.person || old.loanBalance.person, name: t.name, note: t.note, label: old.loanBalance.label, category: t.category }); if (r.error) return r;
  const x = state.transactions[state.transactions.length - 1], d = txById(old.depositOf); state.transactions = state.transactions.filter(y => y.id !== old.id); x.depositOf = old.depositOf; if (d) d.balanceTx = x.id; return { tx: x };
}
// ---- 帳單折抵 (CNY / HKD cards) ----
function offsetCard(a) { return !!a && a.type === 'card' && ['CNY', 'HKD'].includes(acctCur(a)); }
// The newest closed statement that still owes money and is not past its due date on `date`.
function offsetTarget(card, date) {
  if (!offsetCard(card)) return null; const d = new Date(date + 'T00:00:00');
  for (const k of [0, -1]) { const st = creditStmt(card, d, k); if (st.period.end < date && st.owed > 0 && isoDate(cardStatementDueDate(card, st.period)) >= date) return { period: st.period, key: creditStatementKey(card, st.period), owed: st.owed }; } return null;
}
function offsetApply(t, want) { delete t.offsetKey; if (t.kind !== 'income' || want === false || t.pending) return t; const g = offsetTarget(acct(t.account), t.date); if (g) t.offsetKey = g.key; return t; }
function offsetSyncUI() {
  const el = txForm?.elements, o = el?.postMode?.querySelector('[value=offset]'); if (!o) return; const g = document.querySelector('input[name=kind]:checked')?.value === 'income' ? offsetTarget(acct(el.account?.value), el.date?.value || isoDate(new Date())) : null;
  o.hidden = !g; o.disabled = !g; if (!g && el.postMode.value === 'offset') el.postMode.value = 'now'; else if (g && el.postMode.value === 'now' && !editId && el.postMode.dataset.user !== '1') el.postMode.value = 'offset';
}
document.addEventListener('change', e => { const t = e.target; if (!t?.closest?.('#txForm')) return; if (t.name === 'postMode') t.dataset.user = '1'; if (['account', 'kind', 'date'].includes(t.name)) { offsetSyncUI(); setTimeout(efSync, 0); } if (/^inst/.test(t.name || '')) instFormHint(); });
document.addEventListener('input', e => { const t = e.target; if (t?.closest?.('#txForm') && (/^inst/.test(t.name || '') || t.name === 'amount')) instFormHint(); });
function cardPayFrom(p) { return p.offsetKey ? '帳單折抵' : esc(acct(p.account).name); }
