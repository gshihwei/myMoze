// 帳小簿 V26.78 — 借還款進階：既有款項、超收超還、轉成支出、多筆收還款、對象改名與歷史、分期還款、不納入總額.
// Bundled after js/reports.js. Function declarations / var only.
// loan.existing = the money moved before using the app (no account effect). loan.inst = { n, left, rate, method, next, grace }.

function loanFind(i) { return (state.loans || []).find(l => String(l.id) === String(i)); }
function loanCreateExisting(o) {
  const amount = Math.abs(Number(o.amount || 0)); if (!amount) return { error: '請輸入有效金額' };
  const direction = o.direction === 'payable' ? 'payable' : 'receivable', person = String(o.person || '').trim() || '未指定對象', lid = id(), label = direction === 'payable' ? '既有欠款' : '既有應收';
  const loan = { id: lid, person, direction, amount, paid: 0, account: '', date: o.date || isoDate(new Date()), dueDate: o.dueDate || '', name: String(o.name || '').trim() || `${label}：${person}`, note: o.note || '', label: o.label || label, existing: true, payments: [], status: 'active' };
  (state.loans = state.loans || []).push(loan);
  state.transactions.push({ id: id(), date: loan.date, time: '', name: loan.name, amount, kind: 'loan', loanId: lid, direction, loanAction: direction === 'receivable' ? 'lend' : 'borrow', account: '', note: loan.note, person, category: '', loanRecord: true, loanExisting: true });
  return { loan };
}
// Records one repayment (≤ outstanding). Returns the transaction.
function loanPay(loan, amount, accountId, date, note) {
  const a = (state.accounts || []).find(x => String(x.id) === String(accountId)); if (!a) return null;
  const pid = id(), dir = loanDirection(loan), amt = Math.round(Math.min(amount, loanOutstanding(loan)) * 100) / 100;
  loan.paid = Math.round((Number(loan.paid || 0) + amt) * 100) / 100; loan.payments = loan.payments || []; loan.payments.push({ id: pid, date, amount: amt, account: a.id, note: note || '' });
  if (loan.status === 'stopped') loan.status = ''; refreshLoanStatus(loan);
  a.balance = Math.round((Number(a.balance || 0) + (dir === 'receivable' ? amt : -amt)) * 100) / 100;
  const t = { id: id(), date, time: '', name: `${loanActionLabel(dir)} · ${loan.person}`, amount: amt, kind: 'loanPayment', loanId: loan.id, paymentId: pid, loanDirection: dir, account: a.id, note: note || '', person: loan.person, loanRecord: true };
  state.transactions.push(t); return t;
}
// o: { amount, account, date, note, over: 'track'|'settle', under: 'track'|'settle' }
function loanSettle(loan, o) {
  const out = loanOutstanding(loan), amount = Math.abs(Number(o.amount || 0)), dir = loanDirection(loan);
  if (!(amount > 0)) return { error: '請輸入有效金額' };
  if (!(state.accounts || []).some(a => String(a.id) === String(o.account))) return { error: '請選擇實際帳戶' };
  const pay = Math.min(amount, out), extra = Math.round((amount - pay) * 100) / 100, res = { paid: pay, extra };
  if (pay > 0) loanPay(loan, pay, o.account, o.date, o.note);
  if (extra > 0) {
    if (o.over === 'track') { const r = entryPostLoan(state, { direction: dir === 'receivable' ? 'payable' : 'receivable', amount: extra, account: o.account, date: o.date, person: loan.person, name: `${dir === 'receivable' ? '多收' : '多還'}：${loan.person}`, label: dir === 'receivable' ? '多收' : '多還' }); if (r.error) return r; res.loan = r.loan; }
    else { const k = dir === 'receivable' ? 'income' : 'expense', c = entryEnsureCategory(state, '其他', k), t = { id: id(), date: o.date, time: '', kind: k, amount: extra, account: o.account, category: c.id, name: `${dir === 'receivable' ? '多收' : '多還'} · ${loan.person}`, person: loan.person, merchant: '', project: '', note: '', tags: [] }; state.transactions.push(t); adjust(t, 1); }
  } else if (o.under === 'settle' && loanOutstanding(loan) > 0) loan.status = 'stopped';
  return res;
}
// 轉成支出: the rest is treated as collected, and the same amount is spent — the account does not change.
function loanWriteOff(loan, o) {
  const out = loanOutstanding(loan); if (loanDirection(loan) !== 'receivable' || !(out > 0)) return { error: '只有尚未收回的應收款項可以轉成支出' };
  const a = (state.accounts || []).find(x => String(x.id) === String(o.account)); if (!a) return { error: '請選擇帳戶' };
  loanPay(loan, out, a.id, o.date, '轉成支出');
  const t = { id: id(), date: o.date, time: '', kind: 'expense', amount: out, account: a.id, category: o.category || entryEnsureCategory(state, '其他', 'expense').id, project: o.project || '', name: String(o.name || '').trim() || `呆帳 · ${loan.person}`, merchant: '', person: loan.person, note: '', tags: [] };
  state.transactions.push(t); adjust(t, 1); return { tx: t };
}
function loanPayMany(ids, amount, account, date) {
  let left = Math.abs(Number(amount || 0)), n = 0; const l = ids.map(loanFind).filter(x => x && loanOutstanding(x) > 0);
  for (const x of l) { if (!(left > 0)) break; const v = Math.min(left, loanOutstanding(x)); loanPay(x, v, account, date, ''); left = Math.round((left - v) * 100) / 100; n++; }
  return { n, left };
}
function personRename(from, to) {
  to = String(to || '').trim(); if (!to || to === from) return 0; let n = 0;
  for (const l of (state.loans || [])) if ((l.person || '未指定對象') === from) { l.person = to; n++; }
  for (const t of (state.transactions || [])) if (t.person === from) { t.person = to; n++; }
  return n;
}
function personHistory(p) { const ids = new Set((state.loans || []).filter(l => (l.person || '未指定對象') === p).map(l => String(l.id))); return (state.transactions || []).filter(t => ids.has(String(t.loanId))).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))); }
// ---- instalments ----
function loanInstNext(loan) {
  const x = loan.inst, out = loanOutstanding(loan); if (!x || !(out > 0)) return null;
  const s = loanSchedule(out, Math.max(1, x.left), x.rate, x.method, 0, x.grace || 0)[0]; return s ? { no: x.n - x.left + 1, date: x.next, principal: x.left <= 1 ? out : s.principal, interest: s.interest } : null;
}
function loanInstSet(loan, o) {
  const n = Math.floor(Number(o.n || 0)), start = Math.max(1, Math.floor(Number(o.startNo || 1))); if (n < 1 || n > 600) return { error: '剩餘期數必須介於 1 ～ 600' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(o.next || ''))) return { error: '請選擇下期日期' };
  loan.inst = { n: n + start - 1, left: n, rate: Math.max(0, Number(o.rate || 0)), method: ['annuity', 'principal', 'flat'].includes(o.method) ? o.method : 'annuity', next: o.next, day: Number(o.next.slice(8, 10)), grace: Math.min(n - 1, Math.max(0, Math.floor(Number(o.grace || 0)))) };
  return { inst: loan.inst };
}
function loanInstPay(loan, account, date) {
  const x = loanInstNext(loan); if (!x) return { error: '沒有待繳的期數' };
  const a = (state.accounts || []).find(v => String(v.id) === String(account)); if (!a) return { error: '請選擇實際帳戶' };
  if (x.principal > 0) loanPay(loan, x.principal, a.id, date, `第 ${x.no} / ${loan.inst.n} 期本金`);
  if (x.interest > 0) { const k = loanDirection(loan) === 'payable' ? 'expense' : 'income', c = entryEnsureCategory(state, k === 'expense' ? '利息支出' : '利息', k), t = { id: id(), date, time: '', kind: k, amount: x.interest, account: a.id, category: c.id, name: `利息 · ${loan.name || loan.person}（${x.no}/${loan.inst.n}）`, person: loan.person, merchant: '', project: '', note: '', tags: [], loanInterestOf: loan.id }; state.transactions.push(t); adjust(t, 1); }
  loan.inst.left = Math.max(0, loan.inst.left - 1); if (loan.inst.grace > 0) loan.inst.grace--; loan.inst.next = addPeriod(loan.inst.next, { freq: 'month', interval: 1, start: '2000-01-' + String(loan.inst.day || 1).padStart(2, '0') });
  return { paid: x };
}
function loanInstHTML(loan) {
  if (!(loanOutstanding(loan) > 0)) return '';
  const x = loan.inst, nx = loanInstNext(loan), acc = (state.accounts || []).filter(a => a.type !== 'card' && !a.archived), opts = acc.map(a => `<option value="${esc(a.id)}"${String(a.id) === String(loan.account) ? ' selected' : ''}>${acctName(a)}</option>`).join('');
  const sched = x ? loanSchedule(loanOutstanding(loan), x.left, x.rate, x.method, 0, x.grace || 0) : [], ti = sched.reduce((s, r) => s + r.interest, 0);
  return `<div class="loan-payment-area"><h4>分期還款</h4>${nx ? `<p>第 ${nx.no} / ${x.n} 期 · ${nx.date} · 本金 ${money(nx.principal)}＋利息 ${money(nx.interest)}＝<b>${money(nx.principal + nx.interest)}</b></p><p class="hint">剩 ${x.left} 期，之後利息合計約 ${money(ti)}。提前償還本金請用上方的${loanActionLabel(loanDirection(loan))}，之後各期會自動重算。</p><div class="loan-payment-form"><label>帳戶<select id="liAccount">${opts}</select></label><label>日期<input id="liDate" type="date" value="${nx.date}"></label><button type="button" class="primary" data-loan-inst-pay="${esc(loan.id)}">完成第 ${nx.no} 期</button></div>` : ''}<details><summary>${x ? '修改分期（利率、期數、日期）' : '設定分期'}</summary><div class="form-grid"><label>剩餘期數<input id="liN" type="number" min="1" max="600" value="${x?.left || 12}"></label><label>起始期數<input id="liStart" type="number" min="1" value="${x ? x.n - x.left + 1 : 1}"></label><label>年利率 %<input id="liRate" type="number" min="0" step="any" value="${x?.rate ?? 0}"></label><label>利率類型<select id="liMethod">${[['annuity', '本息均攤'], ['principal', '本金均攤'], ['flat', '固定利息']].map(([v, l]) => `<option value="${v}"${x?.method === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label>下期日期<input id="liNext" type="date" value="${x?.next || isoDate(new Date())}"></label><label>寬限期（只繳利息的期數）<input id="liGrace" type="number" min="0" value="${x?.grace || 0}"></label></div><div class="form-actions">${x ? `<button type="button" class="secondary" data-loan-inst-del="${esc(loan.id)}">取消分期</button>` : ''}<button type="button" class="secondary" data-loan-inst-set="${esc(loan.id)}">儲存分期</button></div></details>${x ? `<details><summary>攤還表</summary><div class="cmp-wrap"><table class="cmp"><thead><tr><th>期</th><th>本金</th><th>利息</th><th>剩餘本金</th></tr></thead><tbody>${sched.slice(0, 360).map(r => `<tr><th>${x.n - x.left + r.n}</th><td>${money(r.principal)}</td><td>${money(r.interest)}</td><td>${money(r.balance)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}</div>`;
}
function loanExtraHTML(loan) {
  const rec = loanDirection(loan) === 'receivable', out = loanOutstanding(loan), opts = (state.accounts || []).filter(a => a.type !== 'card' && !a.archived).map(a => `<option value="${esc(a.id)}"${String(a.id) === String(loan.account) ? ' selected' : ''}>${acctName(a)}</option>`).join('');
  return `${loan.existing ? `<p class="hint">${rec ? '既有應收' : '既有欠款'}：只登記剩餘金額，最初那一筆不影響帳戶。</p>` : ''}${loanInstHTML(loan)}${rec && out > 0 ? `<details class="stmt-adjust"><summary>轉成支出（呆帳）</summary><p class="hint">剩餘 ${money(out)} 視為已收回，並記一筆同額支出，帳戶餘額不變。</p><div class="form-grid"><label>帳戶<select id="lwAccount">${opts}</select></label><label>名稱<input id="lwName" placeholder="呆帳 · ${esc(loan.person)}"></label><label>類別<select id="lwCat">${catOptionsHTML('', '')}</select></label></div><button type="button" class="secondary" data-loan-writeoff="${esc(loan.id)}">轉成支出</button></details>` : ''}<label class="proj-archive"><input type="checkbox" data-loan-exclude="${esc(loan.id)}"${loan.excludeNet ? ' checked' : ''}> 不納入借還款總額</label>`;
}
function loanBulkHTML() {
  const ids = [...(window.__loanSel || [])].map(loanFind).filter(l => l && loanOutstanding(l) > 0); if (!ids.length) return '';
  const dirs = new Set(ids.map(loanDirection)), sum = ids.reduce((s, l) => s + loanOutstanding(l), 0);
  return dirs.size > 1 ? '<div class="loan-bulk">請選同一種類（應收或應付）的款項</div>' : `<div class="loan-bulk"><b>${ids.length} 筆 · ${money(sum)}</b><input id="lbAmount" type="number" min="0" step="any" value="${sum}" aria-label="金額"><select id="lbAccount" aria-label="帳戶">${(state.accounts || []).filter(a => a.type !== 'card' && !a.archived).map(a => `<option value="${esc(a.id)}">${acctName(a)}</option>`).join('')}</select><button type="button" class="primary" data-loan-bulk>${loanActionLabel([...dirs][0])}</button></div>`;
}
function renderLoanBulk() { let el = document.getElementById('loanBulkBar'); const g = document.getElementById('loanGrid'); if (!g) return; if (!el) { el = document.createElement('div'); el.id = 'loanBulkBar'; g.before(el); } el.innerHTML = loanBulkHTML(); }
document.addEventListener('click', async e => {
  const c = s => e.target.closest?.(s), v = i => document.getElementById(i)?.value, today = isoDate(new Date());
  let b;
  if ((b = c('[data-loan-check]'))) { e.stopPropagation(); const s = window.__loanSel || (window.__loanSel = new Set()), k = b.dataset.loanCheck; if (s.has(k)) s.delete(k); else s.add(k); b.classList.toggle('on', s.has(k)); renderLoanBulk(); return; }
  if (c('[data-loan-bulk]')) { const r = loanPayMany([...window.__loanSel], v('lbAmount'), v('lbAccount'), today); if (!r.n) { alert('請輸入有效金額'); return; } if (r.left > 0) alert(`金額多出 ${money(r.left)}，只沖銷到剩餘款項。`); window.__loanSel.clear(); await save(); render(); return; }
  if ((b = c('[data-loan-writeoff]'))) { const l = loanFind(b.dataset.loanWriteoff); if (!confirm(`把剩餘 ${money(loanOutstanding(l))} 轉成支出？`)) return; const r = loanWriteOff(l, { account: v('lwAccount'), name: v('lwName'), category: v('lwCat'), date: today }); if (r.error) { alert(r.error); return; } await save(); render(); return; }
  if ((b = c('[data-loan-inst-set]'))) { const l = loanFind(b.dataset.loanInstSet), r = loanInstSet(l, { n: v('liN'), startNo: v('liStart'), rate: v('liRate'), method: v('liMethod'), next: v('liNext'), grace: v('liGrace') }); if (r.error) { alert(r.error); return; } await save(); render(); return; }
  if ((b = c('[data-loan-inst-del]'))) { if (!confirm('取消分期設定？已完成的期數記錄保留。')) return; delete loanFind(b.dataset.loanInstDel).inst; await save(); render(); return; }
  if ((b = c('[data-loan-inst-pay]'))) { const r = loanInstPay(loanFind(b.dataset.loanInstPay), v('liAccount'), v('liDate') || today); if (r.error) { alert(r.error); return; } await save(); render(); return; }
  if ((b = c('[data-person-rename]'))) { const p = b.dataset.personRename, n = prompt('新的對象名稱', p); if (n === null) return; if (personRename(p, n)) { await save(); render(); } return; }
  if ((b = c('[data-person-history]'))) {
    const p = b.dataset.personHistory, l = personHistory(p), ls = (state.loans || []).filter(x => (x.person || '未指定對象') === p), sum = (d, k) => ls.filter(x => loanDirection(x) === d).reduce((s, x) => s + k(x), 0), el = sheetEl('personBg'); el.hidden = false;
    el.innerHTML = `<div class="recon-sheet">${sheetHead(esc(p))}<div class="recon-list notice-list">${infoRow('應收款項', money(sum('receivable', x => x.amount)))}${infoRow('已收款', money(sum('receivable', x => x.paid)))}${infoRow('應付款項', money(sum('payable', x => x.amount)))}${infoRow('已還款', money(sum('payable', x => x.paid)))}${infoRow('剩餘（應收－應付）', money(sum('receivable', loanOutstanding) - sum('payable', loanOutstanding)))}${l.map(t => `<div class="notice-row"><div class="notice-ico">${t.kind === 'loan' ? '＋' : '✓'}</div><div class="day-main"><b>${esc(t.name)}</b><small>${t.date} · ${t.loanExisting ? '既有款項' : acctName(acct(t.account))}</small></div><div class="day-side"><b>${money(t.amount)}</b></div></div>`).join('')}</div></div>`;
  }
});
document.addEventListener('change', async e => { const b = e.target?.closest?.('[data-loan-exclude]'); if (b) { const l = loanFind(b.dataset.loanExclude); if (b.checked) l.excludeNet = true; else delete l.excludeNet; await save(); render(); } });
