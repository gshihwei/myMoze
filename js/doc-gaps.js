// 帳小簿 V26.106 — 對照文件截圖補齊：專案預算分配與更多功能、子預算、借還款對象篩選、範本新增確認.
// Bundled after js/find-view.js. Function declarations / var only.

// ---- 專案預算分配 (s013_1) ----
// { total, allocated, unallocated, rows: [{ budget, name, limit, spent }], unset: [{ category, spent }] } for the period containing `today`.
function projAlloc(p, today) {
  const key = monthKey(today ? new Date(today + 'T00:00:00') : new Date()), bs = (state.budgets || []).map(budgetNorm), pb = bs.find(b => b.scope === 'project' && String(b.project) === String(p.id));
  const total = pb ? budgetLimit(pb, budgetKeyFor(pb, key)) : Number(p.budget) || 0, M = budgetMonth(key);
  const rows = bs.filter(b => b.scope === 'category' && String(b.inProject) === String(p.id)).map(b => ({ budget: b, name: budgetTitle(b), limit: budgetLimit(b, budgetKeyFor(b, key)), spent: budgetSpent(b, M.start, M.end) }));
  const has = new Set(rows.map(r => String(r.budget.category))), spent = new Map();
  for (const t of projTxs(p.id, { start: M.start, end: M.end })) { if (t.kind !== 'expense') continue; for (const part of (t.splits?.length ? t.splits : [t])) { const c = cat(part.category), main = c.parentId ? String(c.parentId) : String(c.id); if (has.has(String(c.id)) || has.has(main)) continue; spent.set(main, (spent.get(main) || 0) + (t.splits?.length ? Number(part.base ?? part.amount) || 0 : anValue(t))); } }
  const allocated = rows.reduce((s, r) => s + r.limit, 0);
  return { total, allocated, unallocated: total - allocated, rows, unset: [...spent.entries()].map(([category, v]) => ({ category, spent: Math.round(v) })).sort((a, b) => b.spent - a.spent) };
}
function projAllocHTML(p) {
  const a = projAlloc(p); if (!a.total && !a.rows.length && !a.unset.length) return '';
  const row = (icon, name, right, sub) => `<div class="notice-row"><div class="day-main"><b>${icon} ${name}</b><small>${sub}</small></div><div class="day-side">${right}</div></div>`;
  return `<div class="proj-alloc"><h3>專案預算</h3>${row('▣', esc(p.name), `<b>${money(a.total)}</b>`, a.total ? `已分配 ${money(a.allocated)}（${Math.round(a.allocated / a.total * 100)}%）・未分配 <span class="${a.unallocated < 0 ? 'expense-text' : ''}">${money(a.unallocated)}</span>` : '尚未設定專案預算')}
  ${a.rows.length ? `<h3>類別預算</h3>${a.rows.map(r => row(esc(cat(r.budget.category).icon || ''), esc(r.name), `<b class="${r.spent > r.limit ? 'expense-text' : ''}">${money(r.spent)} / ${money(r.limit)}</b>`, `<button type="button" class="ghost" data-budget-edit="${esc(r.budget.id)}">編輯</button>`)).join('')}` : ''}
  ${a.unset.length ? `<h3>未設定預算</h3>${a.unset.slice(0, 12).map(u => row(esc(cat(u.category).icon || ''), esc(cat(u.category).name), `<b>${money(u.spent)}</b>`, `<button type="button" class="ghost" data-proj-budget="${esc(p.id)}" data-cat="${esc(u.category)}">＋設定預算</button>`)).join('')}` : ''}</div>`;
}
// Removes the project's own budget and the category budgets inside it. → number removed
function projClearBudgets(p, onlyCats) {
  const n = (state.budgets || []).length;
  state.budgets = (state.budgets || []).filter(b => { const x = budgetNorm({ ...b }); return !((x.scope === 'category' && String(x.inProject) === String(p.id)) || (!onlyCats && x.scope === 'project' && String(x.project) === String(p.id))); });
  if (!onlyCats) p.budget = 0; return n - state.budgets.length;
}
function projBudgetList(p) { return (state.budgets || []).filter(b => { const x = budgetNorm({ ...b }); return (x.scope === 'project' && String(x.project) === String(p.id)) || (x.scope === 'category' && String(x.inProject) === String(p.id)); }); }
function projExport(p) {
  const l = projTxs(p.id); if (!l.length) { alert('這個專案還沒有記錄'); return; }
  const x = document.createElement('a'); x.href = URL.createObjectURL(new Blob([txExportCsv(l)], { type: 'text/csv;charset=utf-8' })); x.download = `專案-${p.name}.csv`; x.click(); setTimeout(() => URL.revokeObjectURL(x.href), 1000);
}
// ---- 子預算 (s014_1): category budgets of subcategories under a main-category budget ----
function budgetSubs(b) {
  const c = cat(b.category); if (b.scope !== 'category' || c.parentId) return [];
  return (state.budgets || []).map(budgetNorm).filter(x => String(x.id) !== String(b.id) && x.scope === 'category' && String(cat(x.category).parentId) === String(b.category) && String(x.inProject || '') === String(b.inProject || ''));
}
function budgetSubsHTML(r) {
  if (r.budget.scope !== 'category' || cat(r.budget.category).parentId) return ''; const l = budgetSubs(r.budget), key = monthKey(), alloc = l.reduce((s, x) => s + budgetLimit(x, budgetKeyFor(x, key)), 0);
  return `<div class="bc-foot bc-subs"><span>${l.length ? `子預算已分配 ${money(alloc)}${r.limit ? `（${Math.round(alloc / r.limit * 100)}%）` : ''}：${l.map(x => esc(budgetTitle(x))).join('、')}` : '尚無子預算'}</span><button type="button" class="ghost" data-budget-sub="${esc(r.budget.id)}">＋新增子預算</button></div>`;
}
function budgetKindLabel(b) { return b.scope === 'total' ? '總預算' : b.scope === 'project' ? '專案' : cat(b.category).parentId ? '子類別' : '主類別'; }
// ---- 借還款：對象篩選 (s024_3) ----
function loanPersonChips(filter) {
  const ps = [...new Set((state.loans || []).filter(l => loanFilterMatch(l, filter)).map(l => l.person || '未指定對象'))], cur = window.__loanPerson || '';
  if (cur && !ps.includes(cur)) window.__loanPerson = '';
  return ps.length > 1 ? `<div class="fv-chips loan-chips"><button type="button" data-loan-person="" class="${window.__loanPerson ? '' : 'on'}">全部</button>${ps.map(p => `<button type="button" data-loan-person="${esc(p)}" class="${window.__loanPerson === p ? 'on' : ''}">${esc(p)}</button>`).join('')}</div>` : '';
}
function loanPersonOk(l) { return !window.__loanPerson || (l.person || '未指定對象') === window.__loanPerson; }

document.addEventListener('click', async e => {
  const c = s => e.target.closest?.(s); let b;
  if ((b = c('[data-loan-person]'))) { window.__loanPerson = b.dataset.loanPerson; renderLoans(); return; }
  if ((b = c('[data-budget-sub]'))) { const p = (state.budgets || []).map(budgetNorm).find(x => String(x.id) === b.dataset.budgetSub); const kids = p ? catOrdered().filter(k => String(k.parentId) === String(p.category)) : []; if (!kids.length) { alert('這個類別沒有子類別'); return; } openEntity('budget', { scope: 'category', category: kids[0].id, inProject: p.inProject || '', limit: '' }); return; }
  if ((b = c('[data-proj-budget]'))) { openEntity('budget', { scope: 'category', category: b.dataset.cat, inProject: b.dataset.projBudget, limit: '' }); return; }
  if ((b = c('[data-proj-more]'))) {
    const p = (state.projects || []).find(x => String(x.id) === b.dataset.projMore); if (!p) return;
    const k = await uiAsk({ icon: '⋮', title: '更多功能', options: [['budget', '設定專案預算'], ['copy', '沿用上期預算'], ['clearCats', '清除類別預算'], ['stop', '清除這期後所有預算', 'danger'], ['clearAll', '清除所有預算', 'danger'], ['export', '匯出專案'], ['del', '刪除此專案', 'danger']] }); if (!k) return;
    if (k === 'budget') { const pb = (state.budgets || []).find(x => x.scope === 'project' && String(x.project) === String(p.id)); openEntity('budget', pb || { scope: 'project', project: p.id, limit: '' }); return; }
    if (k === 'export') { projExport(p); return; }
    if (k === 'copy' || k === 'stop') { const l = projBudgetList(p); if (!l.length) { alert('這個專案還沒有預算'); return; } if (k === 'stop' && !confirm(`「${p.name}」的預算從這一期起不再套用？之前各期保留。`)) return; const n = k === 'copy' ? budgetCopyPrev(l, monthKey()) : budgetStopFrom(l, monthKey()); await save(); render(); toast(k === 'copy' ? `已沿用上期，更新 ${n} 個預算` : `已清除 ${n} 個預算`); return; }
    if (k === 'del') { document.querySelector(`[data-proj-del="${CSS.escape(String(p.id))}"]`)?.click(); return; }
    if (!confirm(k === 'clearAll' ? `清除「${p.name}」的專案預算與所有類別預算？` : `清除「${p.name}」裡的類別預算？`)) return;
    const n = projClearBudgets(p, k === 'clearCats'); await save(); render(); toast(`已清除 ${n} 個預算`);
  }
});
document.addEventListener('click', async e => {
  const b = e.target.closest?.('[data-budget-bulk]'); if (!b) return; const k = b.dataset.budgetBulk, l = state.budgets || [], [y, m] = monthKey().split('-');
  if (k === 'stop' && !confirm(`所有預算從 ${y} 年 ${Number(m)} 月起不再套用？之前各期保留。`)) return;
  const n = k === 'copy' ? budgetCopyPrev(l, monthKey()) : budgetStopFrom(l, monthKey()); await save(); render(); toast(k === 'copy' ? `已沿用上期，更新 ${n} 個預算` : `已清除 ${n} 個預算`);
});
// 調整餘額: show the balance at the chosen date and time.
document.addEventListener('change', e => {
  const n = e.target?.name; if (n !== 'adate' && n !== 'atime') return; const f = e.target.form, out = document.getElementById('adjNow'); if (!f || !out) return;
  const a = (state.accounts || []).find(x => String(x.id) === String(f.dataset.editId)); if (!a) return; const d = f.elements.adate.value, t = f.elements.atime.value, now = isoDate(new Date()), past = d < now || (d === now && t < nowTime());
  out.textContent = `${past ? `${fmtDate(d)} ${t} 的餘額` : '當前餘額'} ${acctMoney(past ? pinBalanceAt(a, d, t) : a.balance, a)}`;
});
