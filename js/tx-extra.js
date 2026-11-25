// 帳小簿 V26.66 — 退款 (linked refunds), and the extra rows / buttons of the transaction detail.
// Bundled with js/recon-mode.js (tools/build-bundle.js). Function declarations / var only.
// A refund is an income with `refundOf` = the original transaction's id (and `refundSplit` for one line of a split).

function txById(i) { return (state.transactions || []).find(t => String(t.id) === String(i)); }
function refundsOf(t) { return (state.transactions || []).filter(x => x.refundOf !== undefined && String(x.refundOf) === String(t.id)); }
function refundedAmount(t, split) { return Math.round(refundsOf(t).filter(r => split === undefined || r.refundSplit === split).reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0) * 100) / 100; }
function refundLeft(t, split) {
  const full = split !== undefined ? Number(t.splits?.[split]?.amount || 0) : Math.abs(Number(t.amount || 0));
  return Math.max(0, Math.round((full - refundedAmount(t, split)) * 100) / 100);
}
function refundable(t) { return !!t && t.kind === 'expense' && !isUnappliedPending(t) && !isLoanTx(t) && refundLeft(t) > 0; }
// o: { amount, account, date, time, split, note } -> { tx } or { error }
function refundCreate(t, o) {
  const amount = Math.round(Number(o.amount || 0) * 100) / 100, split = o.split, left = refundLeft(t, split);
  if (!(amount > 0)) return { error: '請輸入有效的退款金額' };
  if (amount > left) return { error: `退款金額不能超過未退的 ${left}` };
  const a = (state.accounts || []).find(x => String(x.id) === String(o.account));
  if (!a) return { error: '請選擇退款帳戶' };
  if (acctCur(a) !== acctCur(acct(t.account))) return { error: '退款帳戶的幣別必須和原帳戶相同' };
  const c = entryEnsureCategory(state, '退款', 'income');
  const tx = { id: id(), date: o.date, time: o.time || '', kind: 'income', amount, account: a.id, category: c.id, name: `退款：${t.name}`, merchant: t.merchant || '', project: t.project || '', person: '', tags: [], note: o.note || '', refundOf: t.id };
  if (split !== undefined) tx.refundSplit = split;
  state.transactions.push(tx); adjust(tx, 1);
  return { tx };
}
// 分期退款. 'one' = this period only; 'all' = every period up to this one, and later periods are removed.
function refundInstallment(t, mode, o) {
  if (mode !== 'all') return refundCreate(t, { ...o, amount: refundLeft(t) });
  const g = installmentGroup(t).sort((a, b) => a.installment.n - b.installment.n), past = g.filter(x => x.installment.n <= t.installment.n), later = g.filter(x => x.installment.n > t.installment.n);
  const amount = Math.round(past.reduce((s, x) => s + refundLeft(x), 0) * 100) / 100; if (!(amount > 0)) return { error: '已經全部退款' };
  // one refund per paid period, so each period shows exactly what was returned
  for (const x of past) if (refundLeft(x) > 0) { const r = refundCreate(x, { ...o, split: undefined, amount: refundLeft(x) }); if (r.error) return r; }
  const ids = new Set(later.map(x => String(x.id))); for (const x of later) adjust(x, -1);
  state.transactions = state.transactions.filter(x => !ids.has(String(x.id)));
  return { amount, removed: later.length };
}
function txExtraBox(label, html, wide) { return `<div class="detail-box${wide ? ' detail-wide' : ''}"><small>${label}</small><b>${html}</b></div>`; }
function txLink(t, text) { return `<button type="button" class="tx-link" data-tx-open="${esc(t.id)}">${text}</button>`; }
// Called at the end of openDetail().
function txDetailExtra(t) {
  const grid = document.getElementById('detailGrid'); if (!grid) return;
  let h = '';
  if (t.kind === 'transfer') { const src = acct(t.account), dst = acct(t.toAccount), fx = (f, d, a) => [f ? `手續費 ${acctMoney(f, a)}` : '', d ? `折扣 ${acctMoney(d, a)}` : ''].filter(Boolean).join('、'); if (t.toFee || t.toDiscount) h += txExtraBox('實際入帳', `${acctName(dst)} ${acctMoney(Number(t.toBalanceEffect ?? t.toAmount ?? t.amount), dst)}`); const o = fx(t.fee, t.discount, src), i = fx(t.toFee, t.toDiscount, dst); if (o && t.discount) h += txExtraBox('轉出費用／折扣', o); if (i) h += txExtraBox('轉入費用／折扣', i); }
  if (t.orig) h += txExtraBox('外幣金額', `${esc(curText(t.orig.amount, t.orig.cur))}　匯率 ${esc(t.orig.rate)}${t.orig.auto ? '（線上）' : ''}`, true);
  const ff = (state.transactions || []).find(x => x.feeOf === t.id); if (ff) h += txExtraBox('國外手續費', txLink(ff, acctMoney(ff.amount, acct(ff.account)))); if (t.feeOf) { const o = txById(t.feeOf); if (o) h += txExtraBox('所屬記錄', txLink(o, esc(o.name))); }
  if (t.postDate) h += txExtraBox('入帳日', esc(t.postDate));
  const dt = depositText(t); if (dt) { const o = t.depositOf ? txById(t.depositOf) : depositBalance(t); h += txExtraBox(t.depositOf ? '尾款' : '訂金', `${esc(dt)} ${o ? txLink(o, t.depositOf ? '查看訂金' : o.pending ? '查看尾款' : '查看') : ''}`, true); }
  const rs = refundsOf(t);
  if (rs.length) h += txExtraBox('已退款', `${acctMoney(refundedAmount(t), acct(t.account))} ${rs.map(r => txLink(r, `${esc(r.date)} 查看`)).join(' ')}`, true);
  if (t.refundOf !== undefined) { const o = txById(t.refundOf); h += txExtraBox('原記錄', o ? txLink(o, `${esc(o.name)} ${esc(o.date)}`) : '已刪除', true); }
  if (t.installment?.interest) h += txExtraBox('本金／利息', `${acctMoney(instPrincipal(t), acct(t.account))}／${acctMoney(t.installment.interest, acct(t.account))}（年利率 ${esc(t.installment.rate)}%）`);
  if (t.depositInst) { const o = txById(t.depositInst); if (o) h += txExtraBox('訂金', txLink(o, esc(o.name))); }
  if (t.installment) h += txExtraBox('分期', `<button type="button" class="tx-link" data-inst-open="${esc(t.installment.group)}">查看各期</button>`);
  if (t.rewards?.length) h += txExtraBox('紅利回饋', t.rewards.map(x => { const f = rewardRuleById(x); return f ? esc(f.rule.name) : ''; }).filter(Boolean).join('、'));
  h += splitGroupDetail(t);
  h += attachDetailHTML(t);
  grid.insertAdjacentHTML('beforeend', h);
  let bar = document.getElementById('detailExtraBar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'detailExtraBar'; bar.className = 'form-actions detail-extra'; grid.after(bar); }
  const bt = depositBalance(t);
  bar.innerHTML = seriesButtons(t) + (t.pending && pendingVisible(t) && !isLoanTx(t) ? `<button type="button" class="primary" data-finish-pending="${esc(t.id)}">✓ 完成入帳</button>` : '') + (bt?.pending && pendingVisible(bt) ? `<button type="button" class="primary" data-finish-pending="${esc(bt.id)}">補尾款</button>` : '') + (refundable(t) ? '<button type="button" class="secondary" data-refund>退款</button>' : '') + '<div id="refundBox"></div>';
}
function refundFormHTML(t) {
  const accts = acctActive(acctOrdered(state.accounts), t.account).map(a => `<option value="${esc(a.id)}"${String(a.id) === String(t.account) ? ' selected' : ''}>${acctName(a)}</option>`).join('');
  const sp = Array.isArray(t.splits) && t.splits.length ? `<label>退哪一項<select id="rfSplit">${t.splits.map((s, i) => `<option value="${i}">${esc(cat(s.category).name)} ${money(refundLeft(t, i))}</option>`).join('')}</select></label>` : '';
  const inst = t.installment ? '<label>方式<select id="rfMode"><option value="one">單期退款（只退這一期）</option><option value="all">全數退款（退到這一期並終止未來分期）</option></select></label>' : '';
  return `<div class="refund-form form-grid">${sp}${inst}<label>退款金額<input id="rfAmount" type="number" min="0" step="any" value="${refundLeft(t, sp ? 0 : undefined)}"></label><label>退款帳戶<select id="rfAccount">${accts}</select></label><label>日期<input id="rfDate" type="date" value="${isoDate(new Date())}"></label><button type="button" class="primary" data-refund-save>確認退款</button></div>`;
}
document.addEventListener('click', async e => {
  const ln = e.target.closest?.('[data-tx-open]'); if (ln) { openDetail(ln.dataset.txOpen); return; }
  if (e.target.closest?.('[data-refund]')) { const t = txById(window.detailId), b = document.getElementById('refundBox'); if (t && b) b.innerHTML = refundFormHTML(t); return; }
  if (e.target.closest?.('[data-refund-save]')) {
    const t = txById(window.detailId), v = i => document.getElementById(i)?.value; if (!t) return;
    const o = { amount: v('rfAmount'), account: v('rfAccount'), date: v('rfDate') || isoDate(new Date()), time: nowTime(), split: v('rfSplit') !== undefined ? Number(v('rfSplit')) : undefined };
    const r = t.installment && v('rfMode') === 'all' ? refundInstallment(t, 'all', o) : refundCreate(t, o);
    if (r.error) { alert(r.error); return; }
    await save(); render(); openDetail(t.id);
  }
});
document.addEventListener('change', e => { if (e.target?.id === 'rfSplit') { const t = txById(window.detailId), a = document.getElementById('rfAmount'); if (t && a) a.value = refundLeft(t, Number(e.target.value)); } });
