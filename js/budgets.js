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
  if (b.scope === 'total') return b.period === 'year' ? '全年總支出' : '每月總支出';
  if (b.scope === 'project') return (state.projects || []).find(p => String(p.id) === String(b.project))?.name || '未知專案';
  const ip = b.inProject ? (state.projects || []).find(p => String(p.id) === String(b.inProject)) : null;
  return (ip ? ip.name + '・' : '') + cat(b.category).name;
}
function budgetIcon(b) { return b.scope === 'total' ? 'Σ' : b.scope === 'project' ? '▣' : cat(b.category).icon; }

// Month boundaries and pace for the month being viewed (calendarMonth).
function budgetMonth(key = monthKey(), today = new Date()) {
  const { start, end } = key.length === 4 ? { start: key + '-01-01', end: key + '-12-31' } : periodBounds(key), days = anDays(start, end);
  const t = isoDate(today), elapsed = t < start ? 0 : t > end ? days : anDays(start, t);
  return { key, start, end, days, elapsed, current: t >= start && t <= end };
}

// Spent (TWD) for one budget in [start, end]: expenses only, splits respected,
// a category budget includes its subcategories, unapplied pending excluded (anTxs does that).
function budgetTxs(b, start, end) {
  const l = anTxs(start, end, 'all');
  if (b.scope === 'project') { const p = (state.projects || []).find(x => String(x.id) === String(b.project)); return p ? l.filter(t => projMatch(p, t)) : []; }
  if (b.scope === 'category' && b.inProject) { const p = (state.projects || []).find(x => String(x.id) === String(b.inProject)); return p ? l.filter(t => projMatch(p, t)) : []; }
  return l;
}
function budgetSpent(b, start, end) {
  let sum = 0;
  for (const t of budgetTxs(b, start, end)) {
    if (t.kind !== 'expense') continue;
    if (b.scope !== 'category') { sum += anValue(t); continue; }
    for (const [cid, v] of anParts(t)) if (anTopCategory(cid) === String(b.category) || String(cid) === String(b.category)) sum += v;
  }
  return Math.round(sum);
}
// V26.76 — effective limit: own amount (or % of the project budget) + project income + what earlier periods left over.
function budgetKeyFor(b, key) { return b.period === 'year' ? key.slice(0, 4) : key; }
function budgetKeyAdd(key, n) { return key.length === 4 ? String(Number(key) + n) : addMonths(key, n); }
function budgetBase(b, key) {
  if (budgetStopped(b, key)) return 0; const own = b.amounts?.[key]; if (own !== undefined && own !== null && own !== '') return Math.max(0, Number(own) || 0);
  if (b.inProject && Number(b.pct) > 0) { const pb = (state.budgets || []).map(budgetNorm).find(x => x.scope === 'project' && String(x.project) === String(b.inProject)); return pb ? Math.round(budgetLimit(pb, budgetKeyFor(pb, key)) * Number(b.pct) / 100) : 0; }
  return b.limit;
}
function budgetLimitParts(b, key) {
  const M = budgetMonth(key), base = budgetBase(b, key), income = b.addIncome ? Math.round(budgetTxs(b, M.start, M.end).filter(t => t.kind === 'income').reduce((s, t) => s + anValue(t), 0)) : 0;
  let carry = 0;
  if (b.rollover && b.since) {
    const since = budgetKeyFor(b, b.since); let k = since, guard = 0; const lo = budgetKeyAdd(key, -36); if (k < lo) k = lo;
    for (; k < key && guard < 40; k = budgetKeyAdd(k, 1), guard++) {
      const m = budgetMonth(k), inc = b.addIncome ? budgetTxs(b, m.start, m.end).filter(t => t.kind === 'income').reduce((s, t) => s + anValue(t), 0) : 0;
      const rem = budgetBase(b, k) + inc + carry - budgetSpent(b, m.start, m.end); carry = rem > 0 ? rem : b.rollDebt ? rem : 0;
    }
  }
  return { base, income, carry: Math.round(carry), limit: Math.max(0, Math.round(base + income + carry)) };
}
function budgetLimit(b, key) { return budgetLimitParts(b, key).limit; }
// V26.107 每期預算: b.amounts = { periodKey: amount } overrides the default `limit` for one period; b.stop = first period it no longer applies.
function budgetStopped(b, key) { return !!b.stop && String(key) >= String(budgetKeyFor(b, b.stop.length === 4 ? b.stop + '-01' : b.stop)); }
function budgetRaw(b, key) { const o = b.amounts?.[key]; return o !== undefined && o !== null && o !== '' ? Math.max(0, Number(o) || 0) : b.limit; }
// 沿用上期預算: this period gets the amount the previous period had. → number changed
function budgetCopyPrev(list, key) { let n = 0; for (const b of list) { const k = budgetKeyFor(b, key), prev = budgetKeyAdd(k, -1); if (b.stop && String(b.stop) <= k) delete b.stop; const v = budgetStopped(b, prev) ? 0 : budgetRaw(b, prev); if (budgetRaw(b, k) !== v) { b.amounts = { ...(b.amounts || {}), [k]: v }; n++; } } return n; }
// 清除這期後所有預算: the budgets end before this period (kept for earlier periods). → number changed
function budgetStopFrom(list, key) { let n = 0; for (const b of list) { const k = budgetKeyFor(b, key); if (b.stop && String(b.stop) <= k) continue; b.stop = k; if (b.amounts) { for (const x of Object.keys(b.amounts)) if (x >= k) delete b.amounts[x]; if (!Object.keys(b.amounts).length) delete b.amounts; } n++; } return n; }
function budgetBulkBtns() { return `<div class="budget-tools"><button type="button" class="secondary" data-budget-bulk="copy">沿用上期預算</button><button type="button" class="secondary danger-btn" data-budget-bulk="stop">清除這期後所有預算</button></div>`; }
// Today's allowance. fixed: limit / days of the period; ratio: what is left before today / days left (today included).
function budgetDaily(b, date) {
  if (!b.daily) return null;
  const key = budgetKeyFor(b, periodKeyOf(date)), M = budgetMonth(key, new Date(date + 'T00:00:00')), limit = budgetLimit(b, key), spentDay = budgetSpent(b, date, date);
  const d = anDays(M.start, date), before = d > 1 ? budgetSpent(b, M.start, addDaysIso(date, -1)) : 0;
  const allow = b.daily === 'fixed' ? Math.floor(limit / M.days) : Math.floor((limit - before) / (M.days - d + 1));
  return { allow, spent: spentDay, left: allow - spentDay };
}

function budgetStatus(spent, limit, alertPct) {
  if (!limit) return { key: 'none', label: '未設定金額', mark: '—' };
  const r = spent / limit;
  if (r > 1) return { key: 'over', label: '已超支', mark: '!' };
  if (r >= 1 - (Number(alertPct) > 0 ? Number(alertPct) : 20) / 100) return { key: 'near', label: '接近上限', mark: '▲' };
  return { key: 'ok', label: '正常', mark: '✓' };
}

function budgetRows(key = monthKey(), today = new Date()) {
  return (state.budgets || []).map(budgetNorm).filter(b => !budgetStopped(b, budgetKeyFor(b, key))).map(b => {
    const bk = budgetKeyFor(b, key), M = budgetMonth(bk, today), L = budgetLimitParts(b, bk), limit = L.limit;
    const spent = budgetSpent(b, M.start, M.end), remaining = limit - spent, left = M.current ? M.days - M.elapsed + 1 : 0;
    return {
      budget: b, title: budgetTitle(b), icon: budgetIcon(b), spent, limit, remaining, parts: L, daily: M.current && b.daily ? budgetDaily(b, isoDate(today)) : null,
      ratio: limit ? spent / limit : spent ? 9 : 0, pace: M.current ? M.elapsed / M.days : M.elapsed ? 1 : 0,
      perDay: left > 0 && remaining > 0 ? Math.floor(remaining / left) : 0, daysLeft: left,
      status: limit || !spent ? budgetStatus(spent, limit, b.alertPct) : { key: 'over', label: '已超支', mark: '!' },
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
    <div class="bc-head"><span class="bc-icon">${esc(r.icon)}</span><b>${esc(r.title)}</b><small class="bc-kind">${budgetKindLabel(r.budget)}</small><span class="bc-status ${r.status.key}"><i aria-hidden="true">${r.status.mark}</i>${r.status.label}</span></div>
    <div class="bc-fig"><strong>${money(r.spent)}</strong><span>/ ${money(r.limit)}</span><small>${Math.round(r.ratio * 100)}%</small></div>
    ${budgetMeterHTML(r)}
    ${r.budget.amounts?.[budgetKeyFor(r.budget, monthKey())] !== undefined ? `<div class="bc-foot"><span>本期單獨設定（每期預設 ${money(r.budget.limit)}）</span></div>` : ''}<div class="bc-foot"><span>${over ? `超出 ${money(-r.remaining)}` : `剩餘 ${money(r.remaining)}`}</span>${r.daysLeft && !over ? `<span>每日可用 ${money(r.perDay)} · 剩 ${r.daysLeft} 天</span>` : ''}</div>
    ${r.parts?.carry || r.parts?.income || r.daily ? `<div class="bc-foot">${r.parts.carry ? `<span>上期${r.parts.carry > 0 ? '累積' : '超支'} ${r.parts.carry > 0 ? '+' : '−'}${money(Math.abs(r.parts.carry))}</span>` : ''}${r.parts.income ? `<span>收入併入 +${money(r.parts.income)}</span>` : ''}${r.daily ? `<span>今日${r.daily.left < 0 ? `超支 ${money(-r.daily.left)}` : `可用 ${money(r.daily.left)}`}</span>` : ''}</div>` : ''}
    ${compact ? '' : budgetSubsHTML(r)}${compact ? '' : `<div class="bc-actions"><button type="button" class="secondary" data-budget-edit="${esc(r.budget.id)}">編輯</button><button type="button" class="secondary danger-btn" data-budget-del="${esc(r.budget.id)}">刪除</button></div>`}
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
  grid.innerHTML = (state.budgets || []).length ? budgetBulkBtns() + (rows.length ? rows.map(r => budgetCardHTML(r)).join('') : '<div class="empty">這一期沒有預算。可以按「沿用上期預算」。</div>') : rows.length ? rows.map(r => budgetCardHTML(r)).join('') : '<div class="empty">尚未設定預算。可以設定每月總支出、各分類或各專案的上限。</div>';
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
  const mains = catOrdered().filter(c => c.kind !== 'income');
  const inOpts = (state.projects || []).map(p => opt(p.id, esc(p.name), r.inProject)).join('');
  const projOpts = (state.projects || []).map(p => opt(p.id, esc(p.name), r.project)).join('') || '<option value="">尚無專案</option>';
  return `<div class="seg"><label><input type="radio" name="bscope" value="total" ${r.scope === 'total' ? 'checked' : ''}>總預算</label><label><input type="radio" name="bscope" value="category" ${r.scope === 'category' ? 'checked' : ''}>分類</label><label><input type="radio" name="bscope" value="project" ${r.scope === 'project' ? 'checked' : ''}>專案</label></div>
  <div class="form-grid">
    <label class="b-cat">分類（主分類含子分類）<select name="bcategory">${mains.map(c => opt(c.id, `${c.parentId ? '└ ' : ''}${esc(c.icon)} ${esc(c.name)}`, r.category)).join('')}</select></label>
    <label class="b-cat">只算某專案內<select name="binproject"><option value="">不限</option>${inOpts}</select></label>
    <label class="b-cat">分配方式：按照比例（占專案預算 %，填了就不用金額）<input name="bpct" type="number" min="0" max="100" step="any" value="${esc(r.pct || '')}"></label>
    <label class="b-proj">專案<select name="bproject">${projOpts}</select></label>
    <label>週期<select name="bperiod"><option value="month">每月</option><option value="year"${r.period === 'year' ? ' selected' : ''}>每年</option></select></label>
    <label>上限金額（每一期）<input name="limit" type="number" min="0" step="any" value="${esc(r.limit || '')}"></label>${r.id ? `<label>本期金額（${esc(budgetKeyFor(r, monthKey()))}，留空＝同上）<input name="bthis" type="number" min="0" step="any" value="${esc(r.amounts?.[budgetKeyFor(r, monthKey())] ?? '')}"></label>` : ''}
    <label>名稱（可留空）<input name="bname" value="${esc(r.name || '')}" placeholder="預設使用分類或專案名稱"></label>
    <label>每日預算<select name="bdaily"><option value="">不用</option><option value="fixed"${r.daily === 'fixed' ? ' selected' : ''}>固定金額（預算÷天數）</option><option value="ratio"${r.daily === 'ratio' ? ' selected' : ''}>按照比例（剩餘÷剩餘天數）</option></select></label>
    <label>剩餘低於幾 % 提醒<input name="balert" type="number" min="0" max="100" step="any" value="${esc(r.alertPct || '')}" placeholder="預設 20"></label>
  </div><label class="proj-archive"><input type="checkbox" name="broll" ${r.rollover ? 'checked' : ''}> 累積上期剩餘預算</label><label class="proj-archive"><input type="checkbox" name="bdebt" ${r.rollDebt ? 'checked' : ''}> 扣除上期超支（需開啟累積）</label><label class="proj-archive"><input type="checkbox" name="binc" ${r.addIncome ? 'checked' : ''}> 收入併入預算（總預算與專案預算）</label><p class="hint">依概覽目前選擇的月份計算；累積從開啟的那一期開始；外幣支出換算成新台幣，尚未確認入帳的待完成交易不計入。</p>`;
}
function budgetFormSync(root) {
  const scope = root.querySelector('input[name=bscope]:checked')?.value || 'category';
  root.querySelector('.b-cat')?.toggleAttribute('hidden', scope !== 'category');
  root.querySelector('.b-proj')?.toggleAttribute('hidden', scope !== 'project');
}
function budgetFromForm(f, old) {
  const scope = ['total', 'category', 'project'].includes(f.get('bscope')) ? f.get('bscope') : 'category';
  const limit = Math.abs(Number(f.get('limit') || 0));
  const inProject = scope === 'category' ? String(f.get('binproject') || '') : '', pct = inProject ? Math.max(0, Number(f.get('bpct') || 0)) : 0;
  if (!limit && !pct) return { error: '請輸入每月上限' };
  if (scope === 'project' && !f.get('bproject')) return { error: '請先建立專案' };
  if (scope === 'total' && (state.budgets || []).some(b => b !== old && budgetNorm(b).scope === 'total')) return { error: '已經有一個總預算，請直接編輯它' };
  const b = { ...(old || { id: id() }), scope, limit, name: String(f.get('bname') || '').trim() };
  if (scope === 'category') { b.category = f.get('bcategory') || ''; delete b.project; }
  else if (scope === 'project') { b.project = f.get('bproject') || ''; delete b.category; }
  else { delete b.category; delete b.project; }
  const put = (k, v) => { if (v) b[k] = v; else delete b[k]; };
  put('inProject', inProject); put('pct', pct); put('period', f.get('bperiod') === 'year' ? 'year' : ''); put('daily', ['fixed', 'ratio'].includes(f.get('bdaily')) ? f.get('bdaily') : ''); put('alertPct', Math.max(0, Number(f.get('balert') || 0)));
  const tk = budgetKeyFor(b, monthKey()), tv = String(f.get('bthis') ?? '').trim(); if (old) { const am = { ...(b.amounts || {}) }; if (tv === '') delete am[tk]; else am[tk] = Math.max(0, Number(tv) || 0); if (Object.keys(am).length) b.amounts = am; else delete b.amounts; }
  put('rollover', !!f.get('broll')); put('rollDebt', !!f.get('broll') && !!f.get('bdebt')); put('addIncome', scope !== 'category' && !!f.get('binc')); put('since', b.rollover ? old?.since || monthKey() : '');
  return { budget: b };
}

document.addEventListener('click', async e => {
  const ed = e.target.closest?.('[data-budget-edit]');
  if (ed) { const b = (state.budgets || []).find(x => String(x.id) === String(ed.dataset.budgetEdit)); if (b) openEntity('budget', b); return; }
  const del = e.target.closest?.('[data-budget-del]');
  if (del) { const b = (state.budgets || []).find(x => String(x.id) === String(del.dataset.budgetDel)); if (!b || !confirm(`刪除預算「${budgetTitle(budgetNorm(b))}」？`)) return; state.budgets = state.budgets.filter(x => x !== b); await save(); render(); }
});
