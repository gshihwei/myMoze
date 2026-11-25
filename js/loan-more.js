// 帳小簿 V26.93 — 借還款補齊：應收應付的週期與分期、代刷分期與退款、未開始、多筆視為結清、明細收還款；名稱／商家／標籤／對象管理.
// Bundled after js/acct-view.js. Function declarations / var only.

// ---- from the entry form ----
// o = entryPostLoan options + { ev: 'single'|'recurring'|'inst', rec, inst: { n, startNo, rate, method, grace, next, type } }
function loanFromEntry(o) {
  if (o.ev === 'recurring') {
    if (o.existing) return { error: '週期不支援既有款項，請改用單次或分期' };
    const a = (state.accounts || []).find(x => String(x.id) === String(o.account)); if (!a) return { error: '請選擇帳戶' };
    if (a.type === 'card' && o.direction === 'payable') return { error: '應付款項請選擇現金或銀行帳戶，不能用信用卡' };
    const r = recurringFromTx({ kind: o.direction === 'payable' ? 'income' : 'expense', name: o.name || `${o.label}：${o.person || '未指定對象'}`, amount: o.amount, account: o.account, category: o.category, date: o.date, note: o.note, person: o.person }, { ...o.rec, startNo: 1 });
    if (r.error) return r; r.rule.loan = { direction: o.direction, person: o.person || '', label: o.label }; state.recurring.push(r.rule); return { rule: r.rule };
  }
  if (o.ev === 'inst') {
    const n = Math.floor(Number(o.inst?.n || 0)); if (n < 2 || n > 600) return { error: '期數必須介於 2 ～ 600' };
    if (o.direction === 'receivable' && o.inst.type === 'card') return loanCardInst(o, n);
    const r = entryPostLoan(state, o); if (r.error) return r;
    const s = loanInstSet(r.loan, { n, startNo: o.existing ? o.inst.startNo : 1, rate: o.inst.rate, method: o.inst.method, grace: o.inst.grace, next: o.inst.next || addPeriod(o.date, { freq: 'month', interval: 1, start: o.date }) });
    return s.error ? s : r;
  }
  return entryPostLoan(state, o);
}
// 代刷分期: you pay N card instalments for somebody; every period is its own receivable (未開始 until its day).
function loanCardInst(o, n) {
  const total = Math.round(Math.abs(Number(o.amount || 0)) * 100), each = Math.floor(total / n / 100) * 100, first = total - each * (n - 1), group = id(), name = o.name || `${o.label || '代刷'}：${o.person || '未指定對象'}`, rule = { freq: 'month', interval: 1, start: o.date }; let d = o.date, loan = null;
  if (!(each > 0)) return { error: '金額太小，無法分期' };
  for (let i = 1; i <= n; i++) {
    const r = entryPostLoan(state, { ...o, existing: false, amount: (i === 1 ? first : each) / 100, date: d, name: `${name}（${i}/${n}）`, label: o.label || '代刷分期' }); if (r.error) return r;
    r.loan.cardInst = { group, n: i, total: n }; loan = loan || r.loan; d = addPeriod(d, rule);
  }
  return { loan };
}
function loanCardGroup(l) { return l?.cardInst ? (state.loans || []).filter(x => x.cardInst?.group === l.cardInst.group).sort((a, b) => a.cardInst.n - b.cardInst.n) : []; }
function loanNotStarted(l, today) { return !!l.date && l.date > (today || isoDate(new Date())) && loanStatus(l) === 'active' && !(Number(l.paid) > 0); }
// 退款: the shop refunds the money to the account it was paid from. What the person already paid back becomes 應付 to them.
function loanRefund(l, all, date) {
  const list = all ? loanCardGroup(l).filter(x => x.cardInst.n <= l.cardInst.n) : [l]; let back = 0;
  for (const x of list) {
    const out = loanOutstanding(x), extra = Math.round((Number(x.amount) - out) * 100) / 100, a = (state.accounts || []).find(k => String(k.id) === String(x.account)); if (!a || x.refunded) continue;
    if (out > 0) loanPay(x, out, a.id, date, '退款');
    if (extra > 0) { a.balance = Math.round((Number(a.balance || 0) + extra) * 100) / 100; const lid = id(); state.loans.push({ id: lid, person: x.person, direction: 'payable', amount: extra, paid: 0, account: a.id, date, dueDate: '', name: `退款應還：${x.person}`, note: x.name, label: '退款應還', payments: [], status: 'active' }); state.transactions.push({ id: id(), date, name: `退款應還：${x.person}`, amount: extra, kind: 'loan', loanId: lid, direction: 'payable', loanAction: 'borrow', account: a.id, note: x.name, person: x.person, category: '', loanRecord: true, time: '' }); }
    x.refunded = true; back += out + extra;
  }
  let removed = 0; if (all) for (const x of loanCardGroup(l).filter(y => y.cardInst.n > l.cardInst.n && !(Number(y.paid) > 0))) { removeLoan(x); removed++; }
  return { back: Math.round(back * 100) / 100, removed };
}
// One period of a recurring 應收／應付. Deterministic ids, like postRecurring.
function postRecurringLoan(r) {
  const tid = recurringTxId(r, r.seq + 1), lid = 'loan-' + tid; if (state.loans.some(l => l.id === lid) || state.transactions.some(t => t.id === tid)) { r.posted += 1; advanceRecurring(r); return null; }
  const res = entryPostLoan(state, { direction: r.loan.direction, amount: r.amount, account: r.account, date: recurringPostDate(r, r.next), time: r.extra?.time || '', person: r.loan.person, name: r.name, note: r.extra?.note || '', label: r.loan.label, category: r.category }); if (res.error) return null;
  const t = state.transactions[state.transactions.length - 1]; res.loan.id = lid; t.loanId = lid; t.id = tid; t.recurringId = r.id; t.recurringSeq = r.seq + 1; r.posted += 1; advanceRecurring(r); return t;
}
function loanMoreHTML(loan) {
  const g = loanCardGroup(loan), rec = loanDirection(loan) === 'receivable', own = !loan.existing && loan.account !== '' && !loan.refunded && !loan.historicalOnly;
  return `${loan.cardInst ? `<p class="hint">代刷分期 ${loan.cardInst.n} / ${loan.cardInst.total}　${g.map(x => `<button type="button" class="tx-link" data-loan-go="${esc(x.id)}">${x.cardInst.n}</button>`).join(' ')}</p>` : ''}${rec && own ? `<details class="stmt-adjust"><summary>退款（商家退回原帳戶）</summary><p class="hint">尚未收回的部分視為已退回「${acctName(acct(loan.account))}」；對方已付給你的部分會另記成應付款項，等你還給對方。</p><button type="button" class="secondary" data-loan-refund="one">${loan.cardInst ? '單期退款' : '全額退款'}</button>${loan.cardInst ? '<button type="button" class="secondary" data-loan-refund="all">全數退款並終止之後各期</button>' : ''}</details>` : ''}${loan.refunded ? '<p class="hint">已退款</p>' : ''}`;
}
// ---- transaction detail ----
function loanDetailExtra(t) {
  if (!isLoanTx(t) || t.loanId === undefined) return ''; const l = loanFind(t.loanId); if (!l) return '';
  const pays = (state.transactions || []).filter(x => x.kind === 'loanPayment' && String(x.loanId) === String(l.id)), o = (state.transactions || []).find(x => x.kind === 'loan' && String(x.loanId) === String(l.id));
  return txExtraBox('對象', esc(l.person)) + (t.kind === 'loan' ? txExtraBox(loanDirection(l) === 'receivable' ? '收款歷史' : '還款歷史', pays.length ? pays.map(x => txLink(x, `${esc(x.date)} ${money(x.amount)}`)).join('<br>') : '尚無', true) : o ? txExtraBox('原借款記錄', txLink(o, `${esc(o.date)} ${esc(o.name)} ${money(o.amount)}`), true) : '') + txExtraBox('剩餘款項', money(loanOutstanding(l)));
}
function loanDetailBtn(t) { const l = isLoanTx(t) && t.loanId !== undefined ? loanFind(t.loanId) : null; return l ? `<button type="button" class="primary" data-loan-go="${esc(l.id)}">${loanOutstanding(l) > 0 ? loanActionLabel(loanDirection(l)) : '查看借還款'}</button>` : ''; }
// ---- 名稱／商家／標籤／對象 管理 ----
function dataKinds() { return [['name', '名稱'], ['merchant', '商家'], ['tags', '標籤'], ['person', '對象']]; }
function dataList(k) {
  const m = new Map(), add = v => { if (v) m.set(v, (m.get(v) || 0) + 1); };
  for (const t of (state.transactions || [])) { if (k === 'tags') for (const x of (t.tags || [])) add(x); else if (!(k === 'name' && (t.installment || t.recurringId))) add(t[k]); }
  if (k === 'person') for (const l of (state.loans || [])) if (!m.has(l.person)) add(l.person);
  return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'zh-Hant'));
}
// Renames (or merges into an existing value; empty removes a merchant / tag). Returns how many records changed.
function dataRename(k, from, to) {
  to = String(to || '').trim(); if (to === from) return 0; if (!to && (k === 'name' || k === 'person')) return 0; if (k === 'person') return personRename(from, to); let n = 0;
  for (const t of (state.transactions || [])) {
    if (k === 'tags') { if ((t.tags || []).includes(from)) { t.tags = [...new Set(t.tags.map(x => x === from ? to : x).filter(Boolean))]; n++; } }
    else if (t[k] === from) { t[k] = to; n++; }
  }
  if (k === 'merchant' || k === 'name') for (const r of (state.recurring || [])) if (r[k] === from && to) r[k] = to;
  return n;
}
function renderDataSheet() {
  const s = window.__data || (window.__data = { k: 'name', q: '' }), el = sheetEl('dataBg'); if (el.hidden) return; const l = dataList(s.k).filter(([v]) => !s.q || String(v).toLowerCase().includes(s.q.toLowerCase()));
  el.innerHTML = `<div class="recon-sheet">${sheetHead('資料管理')}<div class="entry-tabs">${dataKinds().map(([k, n]) => `<button type="button" data-data-kind="${k}" class="${k === s.k ? 'active' : ''}">${n}</button>`).join('')}</div><div class="recon-search"><input id="dataQ" type="search" placeholder="搜尋" value="${esc(s.q)}"></div><div class="recon-list notice-list">${l.slice(0, 400).map(([v, n]) => `<div class="notice-row"><div class="day-main"><b>${esc(v)}</b><small>${n} 筆</small></div><div class="day-side"><button type="button" class="ghost" data-data-ren="${esc(v)}" aria-label="改名或合併">✎</button>${s.k === 'tags' || s.k === 'merchant' ? `<button type="button" class="ghost" data-data-del="${esc(v)}" aria-label="移除">🗑</button>` : ''}</div></div>`).join('') || '<div class="empty">沒有資料</div>'}${l.length > 400 ? `<p class="hint">只列出前 400 個，請用搜尋。</p>` : ''}</div></div>`;
}
document.addEventListener('click', async e => {
  const c = s => e.target.closest?.(s); let b;
  if ((b = c('[data-loan-go]'))) { detailBg.classList.remove('open'); window.__mozeLoanFilter = 'all'; window.__mozeSelectedLoanId = loanFind(b.dataset.loanGo)?.id; nav('loans'); renderLoans(); document.getElementById('loanDetailPanel')?.scrollIntoView({ block: 'start' }); return; }
  if ((b = c('[data-loan-refund]'))) { const l = loanFind(window.__mozeSelectedLoanId); if (!l || !confirm('確定退款？')) return; const r = loanRefund(l, b.dataset.loanRefund === 'all', isoDate(new Date())); await save(); render(); toast(`已退款 ${money(r.back)}${r.removed ? `，並移除之後 ${r.removed} 期` : ''}`); return; }
  if (c('#openDataSheet')) { sheetEl('dataBg').hidden = false; renderDataSheet(); return; }
  if ((b = c('[data-data-kind]'))) { window.__data.k = b.dataset.dataKind; window.__data.q = ''; renderDataSheet(); return; }
  if ((b = c('[data-data-ren]'))) { const v = b.dataset.dataRen, n = prompt('新的名稱（輸入已存在的名稱會合併）', v); if (n === null || !n.trim() || n.trim() === v) return; const k = dataRename(window.__data.k, v, n); if (k) { await save(); render(); } renderDataSheet(); toast(`已更新 ${k} 筆`); return; }
  if ((b = c('[data-data-del]'))) { const v = b.dataset.dataDel; if (!confirm(`從所有記錄移除「${v}」？`)) return; const k = dataRename(window.__data.k, v, ''); if (k) { await save(); render(); } renderDataSheet(); }
});
document.addEventListener('input', e => { if (e.target?.id === 'dataQ') { window.__data.q = e.target.value; renderDataSheet(); const i = document.getElementById('dataQ'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); } });
