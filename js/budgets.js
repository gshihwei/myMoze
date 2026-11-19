// 帳小簿 V26.6 — 預算.
// Bundled after js/analysis.js (tools/build-bundle.js); uses app.js / analysis.js globals:
// state, esc, money, cat, monthKey, calendarMonth, isoDate, anTxs, anParts, anTopCategory, anValue.
// Function declarations only (hoisted), like analysis.js.
//
// Budget record: { id, scope: 'total' | 'category' | 'project', category, project, limit, name }
// Older records { id, category, limit } are read as scope 'category'.

function budgetNorm(b) {
  if (!b) return b;
  if (!['total', 'category', 'project'].includes(b.scope)) b.scope = b.project && !b.category ? 'project' : 'category';
  b.limit = Math.max(0, Number(b.limit) || 0);
  return b;
}

function budgetTitle(b) {
  if (b.name) return b.name;
  if (b.scope === 'total') return '每月總支出';
  if (b.scope === 'project') return (state.projects || []).find(p => String(p.id) === String(b.project))?.name || '未知專案';
  return cat(b.category).name;
}
function budgetIcon(b) { return b.scope === 'total' ? 'Σ' : b.scope === 'project' ? '▣' : cat(b.category).icon; }

// Month boundaries and pace for the month being viewed (calendarMonth).
function budgetMonth(key = monthKey(), today = new Date()) {
  const [y, m] = key.split('-').map(Number), start = `${key}-01`, end = isoDate(new Date(y, m, 0)), days = new Date(y, m, 0).getDate();
  const t = isoDate(today), elapsed = t < start ? 0 : t > end ? days : Number(t.slice(8, 10));
  return { key, start, end, days, elapsed, current: t >= start && t <= end };
}

// Spent (TWD) for one budget in [start, end]: expenses only, splits respected,
// a category budget includes its subcategories, unapplied pending excluded (anTxs does that).
function budgetSpent(b, start, end) {
  let sum = 0;
  for (const t of anTxs(start, end, 'all')) {
    if (t.kind !== 'expense') continue;
    if (b.scope === 'total') { sum += anValue(t); continue; }
    if (b.scope === 'project') { if (String(t.project) === String(b.project)) sum += anValue(t); continue; }
    for (const [cid, v] of anParts(t)) if (anTopCategory(cid) === String(b.category) || String(cid) === String(b.category)) sum += v;
  }
  return Math.round(sum);
}

function budgetStatus(spent, limit) {
  if (!limit) return { key: 'none', label: '未設定金額', mark: '—' };
  const r = spent / limit;
  if (r > 1) return { key: 'over', label: '已超支', mark: '!' };
  if (r >= 0.8) return { key: 'near', label: '接近上限', mark: '▲' };
  return { key: 'ok', label: '正常', mark: '✓' };
}

function budgetRows(key = monthKey(), today = new Date()) {
  const M = budgetMonth(key, today);
  return (state.budgets || []).map(budgetNorm).map(b => {
    const spent = budgetSpent(b, M.start, M.end), remaining = b.limit - spent, left = M.current ? M.days - M.elapsed + 1 : 0;
    return {
      budget: b, title: budgetTitle(b), icon: budgetIcon(b), spent, limit: b.limit, remaining,
      ratio: b.limit ? spent / b.limit : 0, pace: M.current ? M.elapsed / M.days : M.elapsed ? 1 : 0,
      perDay: left > 0 && remaining > 0 ? Math.floor(remaining / left) : 0, daysLeft: left,
      status: budgetStatus(spent, b.limit),
    };
  }).sort((a, b) => (a.budget.scope === 'total' ? -1 : 0) - (b.budget.scope === 'total' ? -1 : 0) || b.ratio - a.ratio);
}

function budgetMeterHTML(r) {
  const pct = Math.min(100, r.ratio * 100);
  return `<div class="bmeter ${r.status.key}" role="meter" aria-valuemin="0" aria-valuemax="${r.limit}" aria-valuenow="${r.spent}" aria-label="${esc(r.title)} 已用 ${Math.round(r.ratio * 100)}%"><i style="width:${pct.toFixed(1)}%"></i>${r.pace > 0 && r.pace < 1 ? `<b class="bmeter-pace" style="left:${(r.pace * 100).toFixed(1)}%" title="今天"></b>` : ''}</div>`;
}

function budgetCardHTML(r, compact = false) {
  const over = r.remaining < 0;
  return `<div class="budget-card2 ${r.status.key}">
    <div class="bc-head"><span class="bc-icon">${esc(r.icon)}</span><b>${esc(r.title)}</b><span class="bc-status ${r.status.key}"><i aria-hidden="true">${r.status.mark}</i>${r.status.label}</span></div>
    <div class="bc-fig"><strong>${money(r.spent)}</strong><span>/ ${money(r.limit)}</span><small>${Math.round(r.ratio * 100)}%</small></div>
    ${budgetMeterHTML(r)}
    <div class="bc-foot"><span>${over ? `超出 ${money(-r.remaining)}` : `剩餘 ${money(r.remaining)}`}</span>${r.daysLeft && !over ? `<span>每日可用 ${money(r.perDay)} · 剩 ${r.daysLeft} 天</span>` : ''}</div>
    ${compact ? '' : `<div class="bc-actions"><button type="button" class="secondary" data-budget-edit="${esc(r.budget.id)}">編輯</button><button type="button" class="secondary danger-btn" data-budget-del="${esc(r.budget.id)}">刪除</button></div>`}
  </div>`;
}

function renderBudgetPage() {
  const grid = document.getElementById('budgetGrid'); if (!grid) return;
  const rows = budgetRows(), M = budgetMonth();
  const head = document.getElementById('budgetSummary');
  if (head) {
    const cats = rows.filter(r => r.budget.scope === 'category'), limit = cats.reduce((s, r) => s + r.limit, 0), spent = cats.reduce((s, r) => s + r.spent, 0);
    const [y, m] = M.key.split('-');
    head.textContent = rows.length ? `${y} 年 ${Number(m)} 月 · ${rows.filter(r => r.status.key === 'over').length} 項超支 · ${rows.filter(r => r.status.key === 'near').length} 項接近上限${cats.length ? ` · 分類預算合計 ${money(spent)} / ${money(limit)}` : ''}` : '';
  }
  grid.innerHTML = rows.length ? rows.map(r => budgetCardHTML(r)).join('') : '<div class="empty">尚未設定預算。可以設定每月總支出、各分類或各專案的上限。</div>';
}

function renderBudgetOverview() {
  const box = document.getElementById('budgetOverview'); if (!box) return;
  const rows = budgetRows();
  const head = document.getElementById('budgetOverviewTotal');
  if (head) head.textContent = rows.length ? `${rows.length} 項 · ${rows.filter(r => r.status.key === 'over').length} 項超支` : '';
  box.innerHTML = rows.length ? `<div class="budget-mini">${rows.slice(0, 4).map(r => `<div class="bm-row"><div class="bm-top"><span>${esc(r.icon)} ${esc(r.title)}</span><span class="bc-status ${r.status.key}"><i aria-hidden="true">${r.status.mark}</i>${money(r.spent)} / ${money(r.limit)}</span></div>${budgetMeterHTML(r)}</div>`).join('')}</div>` : '<div class="empty">尚未設定預算</div>';
}

// ---- form (rendered inside the shared entity modal) ----
function budgetFormHTML(b) {
  const r = budgetNorm(b ? { ...b } : { scope: 'category', limit: '' });
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`;
  const mains = (state.categories || []).filter(c => c.kind !== 'income' && !c.parentId);
  const projOpts = (state.projects || []).map(p => opt(p.id, esc(p.name), r.project)).join('') || '<option value="">尚無專案</option>';
  return `<div class="seg"><label><input type="radio" name="bscope" value="total" ${r.scope === 'total' ? 'checked' : ''}>總預算</label><label><input type="radio" name="bscope" value="category" ${r.scope === 'category' ? 'checked' : ''}>分類</label><label><input type="radio" name="bscope" value="project" ${r.scope === 'project' ? 'checked' : ''}>專案</label></div>
  <div class="form-grid">
    <label class="b-cat">分類（含子分類）<select name="bcategory">${mains.map(c => opt(c.id, `${esc(c.icon)} ${esc(c.name)}`, r.category)).join('')}</select></label>
    <label class="b-proj">專案<select name="bproject">${projOpts}</select></label>
    <label>每月上限<input name="limit" type="number" min="1" step="any" required value="${esc(r.limit || '')}"></label>
    <label>名稱（可留空）<input name="bname" value="${esc(r.name || '')}" placeholder="預設使用分類或專案名稱"></label>
  </div><p class="hint">預算以月為單位，依概覽目前選擇的月份計算；外幣支出換算成新台幣，尚未確認入帳的待完成交易不計入。</p>`;
}
function budgetFormSync(root) {
  const scope = root.querySelector('input[name=bscope]:checked')?.value || 'category';
  root.querySelector('.b-cat')?.toggleAttribute('hidden', scope !== 'category');
  root.querySelector('.b-proj')?.toggleAttribute('hidden', scope !== 'project');
}
function budgetFromForm(f, old) {
  const scope = ['total', 'category', 'project'].includes(f.get('bscope')) ? f.get('bscope') : 'category';
  const limit = Math.abs(Number(f.get('limit') || 0));
  if (!limit) return { error: '請輸入每月上限' };
  if (scope === 'project' && !f.get('bproject')) return { error: '請先建立專案' };
  if (scope === 'total' && (state.budgets || []).some(b => b !== old && budgetNorm(b).scope === 'total')) return { error: '已經有一個總預算，請直接編輯它' };
  const b = { ...(old || { id: id() }), scope, limit, name: String(f.get('bname') || '').trim() };
  if (scope === 'category') { b.category = f.get('bcategory') || ''; delete b.project; }
  else if (scope === 'project') { b.project = f.get('bproject') || ''; delete b.category; }
  else { delete b.category; delete b.project; }
  return { budget: b };
}

document.addEventListener('click', async e => {
  const ed = e.target.closest?.('[data-budget-edit]');
  if (ed) { const b = (state.budgets || []).find(x => String(x.id) === String(ed.dataset.budgetEdit)); if (b) openEntity('budget', b); return; }
  const del = e.target.closest?.('[data-budget-del]');
  if (del) { const b = (state.budgets || []).find(x => String(x.id) === String(del.dataset.budgetDel)); if (!b || !confirm(`刪除預算「${budgetTitle(budgetNorm(b))}」？`)) return; state.budgets = state.budgets.filter(x => x !== b); await save(); render(); }
});
