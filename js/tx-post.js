// 帳小簿 V26.67 — 入帳方式 (立即／提醒入帳／延後入帳) 與訂金尾款追蹤.
// Bundled after js/tx-extra.js. Function declarations / var only.
// 提醒入帳 = the existing pending transaction (not in balances until confirmed); 延後入帳 = `postDate`.
// A deposit has `balanceTx` (id of the balance); the balance is a pending transaction with `depositOf`,
// `amountTbd` / `dateTbd` while its amount / date is still 未定.

function txPostMode(t) { return !t ? 'now' : t.pending ? 'remind' : t.postDate ? 'postpone' : 'now'; }
// Called by submitTx with the transaction about to be saved. o = { mode, on }
function txApplyPostMode(t, o) {
  const on = /^\d{4}-\d{2}-\d{2}$/.test(String(o?.on || '')) ? o.on : '';
  if (o?.mode === 'remind') { delete t.postDate; if (on) t.date = on; }
  else if (o?.mode === 'postpone' && on && on > t.date) t.postDate = on;
  else delete t.postDate;
  if (!t.pending) { delete t.amountTbd; delete t.dateTbd; }
  return t;
}
function depositAllowed(t) { return !!t && (t.kind === 'expense' || t.kind === 'transfer') && !t.installment && !t.recurringId && !t.depositOf; }
function depositBalance(t) { return t?.balanceTx ? txById(t.balanceTx) : null; }
// Creates / updates / removes the pending balance of deposit `t`. o = { on, amount, date }
function depositSync(t, o) {
  const cur = depositBalance(t);
  if (!o?.on || !depositAllowed(t)) {
    if (cur?.pending) state.transactions = state.transactions.filter(x => x !== cur);
    if (!cur || cur.pending) delete t.balanceTx;
    return null;
  }
  if (cur && !cur.pending) return cur; // already paid: edit the balance itself
  const amount = Math.max(0, Number(o.amount || 0)), date = String(o.date || '');
  const b = cur || { id: id(), time: '', tags: [], pending: true, pendingApplied: false, depositOf: t.id, person: '', note: '' };
  Object.assign(b, { kind: t.kind, name: t.name, category: t.category, project: t.project || '', merchant: t.merchant || '', account: t.account, amount, date: date || t.date });
  if (t.kind === 'transfer') b.toAccount = t.toAccount;
  if (amount) delete b.amountTbd; else b.amountTbd = true;
  if (date) delete b.dateTbd; else b.dateTbd = true;
  if (!cur) { state.transactions.push(b); t.balanceTx = b.id; }
  return b;
}
// A balance only shows up once its deposit has itself been posted.
function pendingVisible(t) { if (!t?.pending) return false; const d = t.depositOf ? txById(t.depositOf) : null; return !(d && d.pending); }
function depositLabel(t) { return t?.depositOf ? '尾款' : t?.balanceTx && depositBalance(t) ? '訂金' : ''; }
function depositText(t) {
  if (t.depositOf) { const d = txById(t.depositOf); return d ? `含訂金 ${money(d.amount)}，交易總計 ${money(Number(d.amount) + Number(t.amount || 0))}` : ''; }
  const b = depositBalance(t); if (!b) return '';
  const total = `交易總計 ${money(Number(t.amount) + Number(b.amount || 0))}`;
  if (b.pending) return `尾款 ${b.amountTbd ? '未定' : money(b.amount)}，${b.amountTbd ? '' : total + '，'}${b.dateTbd ? '日期未定' : `預計於 ${b.date} 支付`}`;
  return `尾款 ${money(b.amount)} 已於 ${b.date} 支付，${total}`;
}
// After a transaction was deleted: an unpaid balance goes with its deposit; a paid one just loses the link.
function txAfterDelete(t) {
  const b = depositBalance(t);
  if (b) { if (b.pending) state.transactions = state.transactions.filter(x => x !== b); else delete b.depositOf; }
  if (t.depositOf) { const d = txById(t.depositOf); if (d) delete d.balanceTx; }
}
function txPostFromForm(f) { return { mode: String(f.get('postMode') || 'now'), on: String(f.get('postOn') || '') }; }
function depositFromForm(f) { return { on: !!f.get('depOn') && f.get('postMode') !== undefined, amount: f.get('depAmount'), date: String(f.get('depDate') || '') }; }
function txPostSyncUI() {
  const el = txForm?.elements; if (!el?.postMode) return;
  const mode = el.postMode.value, kind = document.querySelector('input[name=kind]:checked')?.value, cardAcct = acct(el.account?.value)?.type === 'card';
  if (el.pending) el.pending.checked = mode === 'remind';
  const row = document.getElementById('postOnRow'), lab = document.getElementById('postOnLabel');
  if (row) row.hidden = mode === 'now'; if (lab) lab.textContent = mode === 'remind' ? '提醒日期' : '入帳日期';
  const hint = document.getElementById('postHint'); if (hint) hint.textContent = mode === 'remind' ? '到日期會出現在待完成交易，完成後才計入餘額與統計。' : mode === 'postpone' ? `信用卡帳單依入帳日期歸期${cardAcct ? '' : '（只影響信用卡）'}，報表仍算在消費日。` : '';
  const dep = document.getElementById('depositBox'); if (dep) dep.hidden = !(kind === 'expense' || kind === 'transfer') || !!el.instOn?.checked || dep.dataset.off === '1';
  const depf = document.getElementById('depositFields'); if (depf) depf.hidden = !el.depOn?.checked;
  const sum = document.getElementById('depositSum'); if (sum) { const a = Number(el.amount?.value || 0), b = Number(el.depAmount?.value || 0); sum.textContent = el.depOn?.checked ? (b ? `尾款 ${money(b)}，交易總計 ${money(a + b)}，${el.depDate?.value ? `預計於 ${el.depDate.value} 支付` : '日期未定'}` : '尾款金額未定，之後在待完成交易補上') : ''; }
}
// Fills the fields when the form opens.
function txPostOpen(t) {
  const el = txForm?.elements; if (!el?.postMode) return;
  const finishing = t && window.__finishPending === String(t.id); window.__finishPending = null;
  el.postMode.value = finishing ? 'now' : txPostMode(t);
  el.postOn.value = t ? (t.pending ? t.date : t.postDate || '') : '';
  if (finishing && el.date) el.date.value = isoDate(new Date());
  const b = t ? depositBalance(t) : null, off = !!(t && (t.depositOf || t.installment || t.recurringId || (b && !b.pending)));
  const box = document.getElementById('depositBox'); if (box) box.dataset.off = off ? '1' : '';
  el.depOn.checked = !!(b && b.pending); el.depAmount.value = b && !b.amountTbd ? b.amount : ''; el.depDate.value = b && !b.dateTbd ? b.date : '';
  txPostSyncUI();
}
// 完成入帳: a deposit balance (or an amount that is still 未定) opens the form; everything else posts directly.
function finishPending(t) {
  if (!t?.pending) return false;
  if (t.depositOf || t.amountTbd || t.dateTbd) { window.__finishPending = String(t.id); window.editTx(t.id); return false; }
  confirmPending(t); return true;
}
document.addEventListener('change', e => { if (e.target?.closest?.('#txForm') && ['postMode', 'postOn', 'depOn', 'depAmount', 'depDate', 'kind', 'account', 'instOn'].includes(e.target.name)) txPostSyncUI(); });
document.addEventListener('input', e => { if (e.target?.closest?.('#txForm') && ['depAmount', 'amount'].includes(e.target.name)) txPostSyncUI(); });
document.addEventListener('click', async e => {
  const b = e.target.closest?.('[data-finish-pending]'); if (!b) return;
  const t = txById(b.dataset.finishPending); if (!t) return;
  if (blockLoanTx(t)) return;
  detailBg.classList.remove('open');
  if (finishPending(t)) { await save(); render(); }
});
