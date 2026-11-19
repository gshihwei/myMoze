// 帳小簿 V26.17 — 資料健檢.
// Bundled after js/backup.js; uses app.js globals (state, esc, money, save, render). Function declarations / var only.
//
// healthCheck(state) lists problems; each fixable one has a fixer that only touches the references
// involved (never amounts or balances), so running a fix cannot change any account balance.

function healthCheck(st = state) {
  const ids = list => new Set((list || []).map(x => String(x.id)));
  const acc = ids(st.accounts), cats = ids(st.categories), projs = ids(st.projects);
  const issues = [];
  const txs = st.transactions || [];
  const badAcc = txs.filter(t => (t.account !== undefined && t.account !== '' && !acc.has(String(t.account))) || (t.kind === 'transfer' && t.toAccount && !acc.has(String(t.toAccount))));
  if (badAcc.length) issues.push({ key: 'txAccount', level: 'serious', count: badAcc.length, text: `${badAcc.length} 筆交易的帳戶已不存在`, hint: '會影響帳戶餘額，請到交易頁找出這些交易後手動改帳戶或刪除。', ids: badAcc.map(t => t.id) });
  const badCat = txs.filter(t => (t.category && !cats.has(String(t.category))) || (Array.isArray(t.splits) && t.splits.some(s => s.category && !cats.has(String(s.category)))));
  if (badCat.length) issues.push({ key: 'txCategory', level: 'minor', count: badCat.length, text: `${badCat.length} 筆交易的分類已不存在`, hint: '修正後改為「未分類」，金額不變。', fix: true });
  const badProj = txs.filter(t => t.project && !projs.has(String(t.project)));
  if (badProj.length) issues.push({ key: 'txProject', level: 'minor', count: badProj.length, text: `${badProj.length} 筆交易的專案已不存在`, hint: '修正後移除專案關聯，金額不變。', fix: true });
  const badBud = (st.budgets || []).filter(b => (b.scope === 'project' ? !projs.has(String(b.project)) : b.scope !== 'total' && b.category && !cats.has(String(b.category))));
  if (badBud.length) issues.push({ key: 'budget', level: 'minor', count: badBud.length, text: `${badBud.length} 個預算的分類或專案已不存在`, hint: '修正後刪除這些預算。', fix: true });
  const badRec = (st.recurring || []).filter(r => (r.category && !cats.has(String(r.category))) || (r.account && !acc.has(String(r.account))));
  if (badRec.length) issues.push({ key: 'recurring', level: 'minor', count: badRec.length, text: `${badRec.length} 個週期交易的分類或帳戶已不存在`, hint: '修正後清除失效的分類／帳戶，入帳前請重新選擇。', fix: true });
  const badLoan = (st.loans || []).filter(l => Array.isArray(l.payments) && Math.abs(l.payments.reduce((s, p) => s + Number(p.amount || 0), 0) - Number(l.paid || 0)) >= 0.01);
  if (badLoan.length) issues.push({ key: 'loanPaid', level: 'minor', count: badLoan.length, text: `${badLoan.length} 筆借還款的已收／已還金額與紀錄合計不符`, hint: '修正後以收還款紀錄重新計算已收／已還與狀態（不影響帳戶餘額）。', fix: true });
  const seen = new Map(), dups = [];
  for (const t of txs) {
    if (t.installment || t.kind === 'loan' || t.kind === 'loanPayment') continue;
    const k = [t.date, t.time || '', t.kind, t.account, Math.abs(Number(t.amount || 0)), t.name || ''].join('\u001f');
    if (seen.has(k)) dups.push([seen.get(k), t.id]); else seen.set(k, t.id);
  }
  if (dups.length) issues.push({ key: 'duplicate', level: 'info', count: dups.length, text: `${dups.length} 組疑似重複的交易`, hint: '日期、時間、類型、帳戶、金額與名稱都相同。請確認後再刪除，這裡不會自動處理。', pairs: dups });
  return issues;
}

function healthFix(key, st = state) {
  const cats = new Set((st.categories || []).map(x => String(x.id))), projs = new Set((st.projects || []).map(x => String(x.id))), acc = new Set((st.accounts || []).map(x => String(x.id)));
  let n = 0;
  if (key === 'txCategory') for (const t of st.transactions || []) {
    if (t.category && !cats.has(String(t.category))) { t.category = ''; n++; }
    if (Array.isArray(t.splits)) for (const s of t.splits) if (s.category && !cats.has(String(s.category))) { s.category = ''; n++; }
  }
  if (key === 'txProject') for (const t of st.transactions || []) if (t.project && !projs.has(String(t.project))) { t.project = ''; n++; }
  if (key === 'budget') { const before = (st.budgets || []).length; st.budgets = (st.budgets || []).filter(b => (b.scope === 'project' ? projs.has(String(b.project)) : b.scope === 'total' || !b.category || cats.has(String(b.category)))); n = before - st.budgets.length; }
  if (key === 'recurring') for (const r of st.recurring || []) { if (r.category && !cats.has(String(r.category))) { r.category = ''; n++; } if (r.account && !acc.has(String(r.account))) { r.account = ''; n++; } }
  if (key === 'loanPaid') for (const l of st.loans || []) {
    if (!Array.isArray(l.payments)) continue;
    const paid = Math.round(l.payments.reduce((s, p) => s + Number(p.amount || 0), 0) * 100) / 100;
    if (Math.abs(paid - Number(l.paid || 0)) >= 0.01) { l.paid = paid; if (l.status !== 'stopped') l.status = Math.max(0, Number(l.amount || 0) - paid) <= 0 ? 'completed' : 'active'; n++; }
  }
  return n;
}

function renderHealth(issues) {
  const box = document.getElementById('healthResult'); if (!box) return;
  if (!issues) { box.innerHTML = ''; return; }
  const mark = { serious: '!', minor: '▲', info: 'i' };
  box.innerHTML = issues.length ? issues.map(i => `<div class="health-row ${i.level}"><span class="bc-status ${i.level === 'serious' ? 'over' : i.level === 'minor' ? 'near' : 'none'}"><i aria-hidden="true">${mark[i.level]}</i></span><div><b>${esc(i.text)}</b><small>${esc(i.hint)}</small></div>${i.fix ? `<button type="button" class="secondary" data-health-fix="${i.key}">修正</button>` : ''}</div>`).join('')
    : '<div class="health-row ok"><span class="bc-status ok"><i aria-hidden="true">✓</i></span><div><b>沒有發現問題</b><small>所有交易、預算、週期與借還款的參照都正確。</small></div></div>';
}

document.addEventListener('click', async e => {
  if (e.target.closest?.('#healthRun')) { renderHealth(healthCheck()); return; }
  const fx = e.target.closest?.('[data-health-fix]');
  if (fx) { const n = healthFix(fx.dataset.healthFix); if (n) { await save(); render(); } renderHealth(healthCheck()); }
});
