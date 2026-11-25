// 帳小簿 V26.83 — 拆帳進階：各項可用不同帳戶／專案、代付（應收）、可與手續費／折扣並用.
// Bundled after js/prefs-plus.js. Function declarations / var only.
// Lines that only differ in category stay inside one transaction (`splits`). As soon as one line has its own account / project / 代付,
// every line becomes its own transaction, linked by `splitGroup`, so balances, statements and reports need no special case.

function splitRowExtraHTML(d) {
  const a = acctActive(acctOrdered(state.accounts || []), d?.account).map(x => `<option value="${esc(x.id)}"${String(x.id) === String(d?.account ?? '') ? ' selected' : ''}>${acctName(x)}</option>`).join('');
  const p = (state.projects || []).filter(x => !x.archived).map(x => `<option value="${esc(x.id)}"${String(x.id) === String(d?.project ?? '') ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
  return `<details class="split-more"${d?.account || d?.project || d?.lend ? ' open' : ''}><summary>帳戶／專案／代付</summary><div class="split-more-grid"><select data-split-account aria-label="帳戶"><option value="">同主帳戶</option>${a}</select><select data-split-project aria-label="專案"><option value="">同主專案</option>${p}</select><label class="check"><input type="checkbox" data-split-lend${d?.lend ? ' checked' : ''}> 代付（記成應收）</label><input data-split-person placeholder="代付對象" value="${esc(d?.person || '')}"></div></details>`;
}
function splitRowRead(r) {
  const v = k => r.querySelector(`[data-split-${k}]`)?.value || '';
  return { category: v('category'), amount: Number(v('amount') || 0), account: v('account'), project: v('project'), lend: !!r.querySelector('[data-split-lend]')?.checked, person: v('person').trim() };
}
// Spreads `net` over the lines in proportion to their typed amounts; the last line takes the rounding difference.
function splitShare(amounts, net, cur) {
  const total = amounts.reduce((s, x) => s + x, 0); let left = net;
  return amounts.map((x, i) => { const v = i === amounts.length - 1 ? Math.round(left * 1e4) / 1e4 : curRound(net * x / total, cur); left -= v; return v; });
}
function splitNeedsGroup(t, rows) { return rows.some(r => r.lend || (r.account && String(r.account) !== String(t.account)) || (r.project && String(r.project) !== String(t.project || ''))); }
// Stored lines of a single transaction. `amount` is the net share; `base` is what was typed when a fee / discount was spread.
function splitStored(t, rows) {
  const typed = rows.map(r => r.amount), sum = Math.round(typed.reduce((s, x) => s + x, 0) * 1e4) / 1e4;
  if (Math.abs(sum - t.amount) < 1e-6) return rows.map(r => ({ category: r.category, amount: r.amount }));
  const net = splitShare(typed, t.amount, acctCur(acct(t.account)));
  return rows.map((r, i) => ({ category: r.category, amount: net[i], base: r.amount }));
}
// Builds the linked transactions for `t` (not yet saved). Returns { list, loans } or { error }.
function splitGroupPlan(t, rows) {
  if (t.kind !== 'expense' && t.kind !== 'income') return { error: '轉帳不能拆帳' };
  if (t.imported) return { error: '匯入的記錄不能拆到不同帳戶' };
  if (t.kind === 'income' && rows.some(r => r.lend)) return { error: '收入不能設定代付' };
  if (t.pending && rows.some(r => r.lend)) return { error: '提醒入帳的記錄不能包含代付' };
  if (rows.every(r => r.lend)) return { error: '全部都是代付時，請改用「應收款項」' };
  const cur = acctCur(acct(t.account)), typed = rows.map(r => r.amount), net = splitShare(typed, t.amount, cur), g = t.splitGroup?.id || id(), n = rows.length;
  const fees = t.feeIncluded ? splitShare(typed, Number(t.fee || 0), cur) : null, discs = t.feeIncluded ? splitShare(typed, Number(t.discount || 0), cur) : null;
  const list = [], loans = []; let first = true;
  for (let i = 0; i < n; i++) {
    const r = rows[i], a = r.account ? acct(r.account) : acct(t.account), ac = acctCur(a), same = String(a.id) === String(t.account);
    const amount = ac === cur ? net[i] : fxConvert(net[i], cur, ac);
    if (!(amount > 0)) return { error: ac === cur ? '拆帳金額扣除折扣後必須大於 0' : `沒有 ${cur}→${ac} 的匯率，不能拆到「${a.name}」` };
    if (r.lend) { loans.push({ amount, account: a.id, person: r.person || t.person, date: t.date, time: t.time, name: `代付：${t.name}`, note: t.note, project: r.project || t.project || '', n: i + 1 }); continue; }
    const x = JSON.parse(JSON.stringify(t));
    for (const k of ['splits', 'fee', 'discount', 'feeIncluded', 'orig']) delete x[k];
    if (!first) { x.id = id(); for (const k of ['attachments', 'invoiceNo', 'invoiceCode', 'invoices', 'balanceTx', 'recon', 'recurringId', 'recurringSeq']) delete x[k]; }
    Object.assign(x, { amount, account: a.id, category: r.category, project: r.project || t.project || '', splitGroup: { id: g, n: i + 1, total: n } });
    if (!same) { delete x.rewards; delete x.recon; }
    if (ac === cur) { if (fees && (fees[i] || discs[i])) { x.fee = fees[i]; x.discount = discs[i]; x.feeIncluded = true; } if (t.orig) x.orig = { ...t.orig, amount: Math.round(t.orig.amount * amount / t.amount * 1e4) / 1e4 }; }
    else x.orig = { cur, amount: net[i], rate: Math.round(amount / net[i] * 1e6) / 1e6, auto: true };
    list.push(x); first = false;
  }
  return { list, loans, group: g };
}
// Saves the plan; `old` is the transaction being edited (its effect is taken out first).
function splitGroupSave(plan, old) {
  if (old) { adjust(old, -1); state.transactions = state.transactions.filter(x => x.id !== old.id); }
  for (const x of plan.list) { state.transactions.push(x); adjust(x, 1); }
  for (const l of plan.loans) {
    const r = entryPostLoan(state, { direction: 'receivable', label: '代付', ...l }); if (r.error) continue;
    const tx = state.transactions[state.transactions.length - 1]; tx.splitGroup = { id: plan.group, n: l.n, total: plan.list.length + plan.loans.length }; if (l.project) tx.project = l.project;
  }
  return plan.list[0];
}
function splitGroupOf(t) { return t?.splitGroup ? (state.transactions || []).filter(x => x.splitGroup?.id === t.splitGroup.id).sort((a, b) => a.splitGroup.n - b.splitGroup.n) : []; }
function splitGroupDetail(t) {
  const g = splitGroupOf(t); if (g.length < 2) return '';
  const lab = x => `${esc(x.kind === 'loan' ? '代付' : cat(x.category).name)} ${acctMoney(x.amount, acct(x.account))} ${acctName(acct(x.account))}`;
  return txExtraBox(`拆帳 ${t.splitGroup.n} / ${t.splitGroup.total}`, g.map(x => x.id === t.id ? `<span>${lab(x)}（這筆）</span>` : txLink(x, lab(x))).join('<br>'), true);
}
// undefined = not a group; null = cancelled; otherwise the ids to delete. 代付 stays (handled on the 借還款 page).
function splitGroupDeleteIds(t) {
  const g = splitGroupOf(t).filter(x => !isLoanTx(x)); if (g.length < 2) return undefined;
  if (confirm(`這筆是拆帳的其中一項（同組 ${g.length} 筆）。\n\n要刪除「整組」嗎？按「取消」可以選擇只刪除這一筆。`)) return g.map(x => String(x.id));
  return confirm(`只刪除「${t.name}」${money(t.amount)}？`) ? [String(t.id)] : null;
}
