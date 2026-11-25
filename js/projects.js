// 帳小簿 V26.9 — 專案頁.
// Bundled after js/search.js; uses app.js / analysis.js / budgets.js globals
// (state, esc, money, cat, txRow, anValue, anRank, anRankHTML, anTopCategory, isUnappliedPending,
// budgetStatus, budgetMeterHTML, openEntity, save, render). Function declarations / var only.
//
// Project record: { id, name, budget, start?, end?, note?, archived? }

var projSelected = null, projShowArchived = false;

function projNorm(p) { if (!p) return p; p.budget = Math.max(0, Number(p.budget) || 0); p.archived = !!p.archived; return p; }

// V26.76: a project can be statistical (`rules`): transactions belong to it by condition instead of by t.project.
// rules = { accounts|projects|categories|names|merchants|tags: { mode: 'in'|'ex', list: [] } }
function projRuleKeys() { return [['accounts', '帳戶'], ['projects', '專案'], ['categories', '類別'], ['names', '名稱'], ['merchants', '商家'], ['tags', '標籤']]; }
function projRuleHit(k, list, t) {
  const l = list.map(String), has = v => l.includes(String(v ?? ''));
  if (k === 'accounts') return has(t.account);
  if (k === 'projects') return has(t.project);
  if (k === 'tags') return (t.tags || []).some(has);
  if (k === 'categories') { const ids = Array.isArray(t.splits) && t.splits.length ? t.splits.map(x => x.category) : [t.category]; return ids.some(c => has(c) || has(anTopCategory(c))); }
  const v = String((k === 'names' ? t.name : t.merchant) || '').toLowerCase(); return list.some(x => v.includes(String(x).toLowerCase()));
}
function projMatch(p, t) {
  if (!p?.rules) return String(t.project) === String(p?.id) || (t.kind === 'transfer' && !!t.toProject && String(t.toProject) === String(p?.id));
  for (const [k] of projRuleKeys()) { const r = p.rules[k]; if (r?.list?.length && projRuleHit(k, r.list, t) !== (r.mode !== 'ex')) return false; }
  return true;
}
// Period shown for a project: cycle month / year = the one containing `today`; range (or start / end dates) = those dates; else everything.
function projPeriod(p, today, off) {
  const c = projPeriodAt(p, off, today); if (c) return c;
  if (p.rules && (p.start || p.end)) return { start: p.start || '0000-01-01', end: p.end || '9999-12-31' };
  return null;
}
function projEnded(p, today) { return !p.cycle && !!p.end && p.end < (today || isoDate(new Date())); }
function projTxs(pid, period) {
  const p = (state.projects || []).find(x => String(x.id) === String(pid)) || { id: pid };
  return (state.transactions || []).filter(t => projMatch(p, t) && !isUnappliedPending(t) && (!p.rules || t.kind === 'expense' || t.kind === 'income') && (!period || (t.date >= period.start && t.date <= period.end)))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.time || '').localeCompare(String(a.time || '')));
}

// Spending summary for one project (TWD; splits keep their own categories).
function projStats(p, off) {
  const txs = projTxs(p.id, projPeriod(p, undefined, off)), byCat = new Map();
  let spent = 0, income = 0;
  for (const t of txs) {
    if (t.kind === 'expense') {
      spent += anValue(t);
      const parts = Array.isArray(t.splits) && t.splits.length ? t.splits.map(s => [s.category, anValue(t, s.amount)]) : [[t.category, anValue(t)]];
      for (const [cid, v] of parts) { const k = anTopCategory(cid), c = cat(k), r = byCat.get(k) || { id: k, name: c.name, icon: c.icon, amount: 0, count: 0 }; r.amount += v; r.count++; byCat.set(k, r); }
    } else if (t.kind === 'income') income += anValue(t);
    else if (t.kind === 'transfer' && p.countTransfers && !p.rules && String(t.project || '') !== String(t.toProject || '')) { if (String(t.project) === String(p.id)) spent += anValue(t); else income += anValue(t); }
  }
  const dates = txs.map(t => t.date).filter(Boolean).sort();
  return { txs, count: txs.length, spent: Math.round(spent), income: Math.round(income), first: dates[0] || '', last: dates[dates.length - 1] || '', categories: anRank(byCat, 8) };
}

function projPeriodText(p, s) {
  const d = x => String(x).replace(/-/g, '/');
  const pp = p.cycle ? projPeriod(p) : null; if (pp) return `${d(pp.start)} – ${d(pp.end)}`;
  if (p.start || p.end) return `${p.start ? d(p.start) : '…'} – ${p.end ? d(p.end) : '…'}`;
  if (s.first) return s.first === s.last ? d(s.first) : `${d(s.first)} – ${d(s.last)}`;
  return '尚無交易';
}

function projCardHTML(p) {
  const s = projStats(p), st = budgetStatus(s.spent, p.budget);
  const meter = p.budget ? budgetMeterHTML({ title: p.name, spent: s.spent, limit: p.budget, ratio: s.spent / p.budget, pace: 0, status: st }) : '';
  return `<div class="proj-card ${p.archived ? 'archived' : ''} ${String(projSelected) === String(p.id) ? 'selected' : ''}">
    <div class="bc-head"><span class="bc-icon">${projIconHTML(p)}</span><b>${esc(p.name)}</b>${p.rules ? '<span class="bc-status none">統計</span>' : ''}${projEnded(p) ? '<span class="bc-status none">已結束</span>' : ''}${p.archived ? '<span class="bc-status none"><i aria-hidden="true">—</i>已封存</span>' : p.budget ? `<span class="bc-status ${st.key}"><i aria-hidden="true">${st.mark}</i>${st.label}</span>` : ''}</div>
    <div class="bc-fig"><strong>${money(s.spent)}</strong>${p.budget ? `<span>/ ${money(p.budget)}</span><small>${Math.round(s.spent / p.budget * 100)}%</small>` : '<span>未設預算</span>'}</div>
    ${meter}
    <div class="bc-foot"><span>${projPeriodText(p, s)}</span><span>${s.count} 筆${s.income ? ` · 收入 ${money(s.income)}` : ''}</span></div>${projTodayText(p) ? `<div class="bc-foot"><span>${projTodayText(p)}</span></div>` : ''}${p.note ? `<p class="hint">${esc(p.note)}</p>` : ''}
    <div class="bc-actions"><button type="button" class="primary" data-proj-open="${esc(p.id)}">明細</button><button type="button" class="secondary" data-proj-edit="${esc(p.id)}">編輯</button><button type="button" class="secondary danger-btn" data-proj-del="${esc(p.id)}">刪除</button></div>
  </div>`;
}

function projDetailHTML(p) {
  const s = projStats(p, p.cycle ? projSt().off : 0);
  return `<div class="panel proj-detail">
    <div class="panel-head"><div><h2>${esc(p.name)}</h2><p>${projPeriodText(p, s)} · ${s.count} 筆 · 支出 ${money(s.spent)}${p.budget ? ` / 預算 ${money(p.budget)}` : ''}</p></div><button type="button" class="ghost" data-proj-close>關閉</button></div>
    ${p.note ? `<p class="hint proj-note">${esc(p.note)}</p>` : ''}
    ${projDetailExtra(p, s)}
    <div class="proj-detail-grid">
      <div><h3>分類花費</h3>${anRankHTML(s.categories, { empty: '這個專案還沒有支出' })}</div>
      <div><h3>交易</h3><div class="proj-tx">${s.txs.length ? s.txs.slice(0, 100).map(t => `<div class="proj-tx-row" data-proj-tx="${esc(t.id)}"><span class="proj-tx-date">${esc(t.date)}</span>${txRow(t)}</div>`).join('') + (s.txs.length > 100 ? `<p class="hint">只列出最近 100 筆，共 ${s.txs.length} 筆；可到交易頁以「專案」篩選查看全部。</p>` : '') : '<div class="empty">還沒有交易。記帳時在「專案」欄選擇這個專案即可。</div>'}</div></div>
    </div>
  </div>`;
}

function renderProjectPage() {
  const grid = document.getElementById('projectGrid'); if (!grid) return;
  const all = (state.projects || []).map(projNorm), list = all.filter(p => projShowArchived || !p.archived), archived = all.filter(p => p.archived).length;
  const sel = all.find(p => String(p.id) === String(projSelected));
  const detail = document.getElementById('projectDetail');
  if (detail) { detail.innerHTML = sel ? projDetailHTML(sel) : ''; detail.querySelectorAll('[data-proj-tx]').forEach(r => r.onclick = () => openDetail(r.dataset.projTx)); }
  grid.innerHTML = (archived ? `<label class="proj-archived-toggle"><input type="checkbox" id="projShowArchived" ${projShowArchived ? 'checked' : ''}> 顯示已封存（${archived}）</label>` : '') +
    (list.length ? (() => { const t0 = isoDate(new Date()), later = p => !p.cycle && p.start && p.start > t0, on = list.filter(p => !p.archived && !later(p) && !projEnded(p)), sec = (h, l) => l.length ? `<h3 class="proj-sec">${h}（${l.length}）</h3>${l.map(projCardHTML).join('')}` : ''; return sec('進行中', on) + sec('未開始', list.filter(p => !p.archived && later(p))) + sec('已結束', list.filter(p => !p.archived && !later(p) && projEnded(p))) + sec('封存', list.filter(p => p.archived)); })() : '<div class="empty">還沒有專案。旅行、裝修、婚禮等可以建立專案，獨立追蹤花費。</div>');
  const tg = document.getElementById('projShowArchived'); if (tg) tg.onchange = () => { projShowArchived = tg.checked; renderProjectPage(); };
}

function projRulesHTML(rules) {
  const opts = { accounts: (state.accounts || []).map(a => [a.id, a.name]), projects: (state.projects || []).filter(p => !p.rules).map(p => [p.id, p.name]), categories: catOrdered().map(c => [c.id, (c.parentId ? '└ ' : '') + c.name]) };
  return projRuleKeys().map(([k, l]) => { const r = rules[k] || { mode: 'in', list: [] }, sel = r.list.map(String);
    return `<div class="proj-rule"><span>${l}</span><select name="pr_${k}_mode"><option value="in">包含</option><option value="ex"${r.mode === 'ex' ? ' selected' : ''}>排除</option></select>${opts[k] ? `<details><summary>${sel.length ? `已選 ${sel.length}` : '不限'}</summary><div class="mode-checks">${opts[k].map(([v, n]) => `<label><input type="checkbox" name="pr_${k}" value="${esc(v)}"${sel.includes(String(v)) ? ' checked' : ''}> ${esc(n)}</label>`).join('')}</div></details>` : `<input name="pr_${k}" value="${esc(r.list.join('、'))}" placeholder="以、分隔，留空＝不限">`}</div>`; }).join('');
}
function projRulesFromForm(f) {
  const out = {};
  for (const [k] of projRuleKeys()) { const list = ['accounts', 'projects', 'categories'].includes(k) ? f.getAll('pr_' + k).map(String) : String(f.get('pr_' + k) || '').split(/[、,，\n]+/).map(x => x.trim().replace(k === 'tags' ? /^#/ : /^$/, '')).filter(Boolean); if (list.length) out[k] = { mode: f.get(`pr_${k}_mode`) === 'ex' ? 'ex' : 'in', list }; }
  return out;
}
// Lines under the month calendar: spent on the selected day, and today's budget when the project has a daily one.
function projHomeHTML(date) {
  return (state.projects || []).filter(p => p.home && !p.archived).map(p => {
    const day = projTxs(p.id, { start: date, end: date }), out = Math.round(day.filter(t => t.kind === 'expense').reduce((s, t) => s + anValue(t), 0)), inc = Math.round(day.filter(t => t.kind === 'income').reduce((s, t) => s + anValue(t), 0));
    const b = (state.budgets || []).map(budgetNorm).find(x => x.scope === 'project' && String(x.project) === String(p.id)), d = b ? budgetDaily(b, date) : null;
    return `<div class="proj-home"><b>${esc(p.name)}</b><span>${out ? `<i class="expense-text">−${money(out)}</i>` : ''}${inc ? ` <i class="income-text">+${money(inc)}</i>` : ''}${!out && !inc ? '—' : ''}</span>${d ? `<small class="${d.left < 0 ? 'expense-text' : ''}">${d.left < 0 ? `今日超支 ${money(-d.left)}` : `今日可用 ${money(d.left)}`}</small>` : ''}</div>`;
  }).join('');
}
document.addEventListener('change', e => { if (e.target?.name === 'pstat') { const b = document.getElementById('projRules'); if (b) b.hidden = !e.target.checked; } });

function projFormHTML(p) {
  const r = p || {};
  return `<div class="form-grid">
    <label>專案名稱<input name="pname" required maxlength="40" value="${esc(r.name || '')}" placeholder="例如：台南旅行"></label>
    <label>預算（可留空）<input name="pbudget" type="number" min="0" step="any" value="${r.budget ? esc(r.budget) : ''}"></label>
    <label>週期<select name="pcycle"><option value="">單一區間／不限</option><option value="month"${r.cycle === 'month' ? ' selected' : ''}>每月重複</option><option value="week"${r.cycle === 'week' ? ' selected' : ''}>每週重複</option><option value="year"${r.cycle === 'year' ? ' selected' : ''}>每年重複</option></select></label>
    <label>起始日（每月第幾天 1～28，每週 0＝日…6＝六；留空＝依偏好）<input name="pstartday" type="number" min="0" max="28" value="${esc(r.startDay ?? '')}"></label>
    <label>圖示<input name="picon" maxlength="4" value="${esc(r.icon || '')}" placeholder="例如 🐷"></label>
    <label>開始日期<input name="pstart" type="date" value="${esc(r.start || '')}"></label>
    <label>結束日期<input name="pend" type="date" value="${esc(r.end || '')}"></label>
  </div>
  ${acctImageFieldHTML({ image: r.image, type: 'cash' })}
  <div class="form-grid form-grid-1"><label>備註<input name="pnote" maxlength="200" value="${esc(r.note || '')}" placeholder="可留空"></label></div>
  <label class="proj-archive"><input type="checkbox" name="phome" ${r.home ? 'checked' : ''}> 在首頁月曆下方顯示統計</label>
  <label class="proj-archive"><input type="checkbox" name="ptransfer" ${r.countTransfers ? 'checked' : ''}> 轉帳計入統計與預算（轉出這個專案算支出，轉入算收入）</label>
  <label class="proj-archive"><input type="checkbox" name="pstat" ${r.rules ? 'checked' : ''}> 統計專案（依條件自動統計，記帳時不必選）</label><div id="projRules" ${r.rules ? '' : 'hidden'}>${projRulesHTML(r.rules || {})}</div>
  ${r.id ? `<label class="proj-archive"><input type="checkbox" name="parchived" ${r.archived ? 'checked' : ''}> 封存（結束的專案；記帳表單不再列出，資料保留）</label>` : ''}`;
}
function projFromForm(f, old) {
  const name = String(f.get('pname') || '').trim().slice(0, 40);
  if (!name) return { error: '請輸入專案名稱' };
  if ((state.projects || []).some(p => p !== old && p.name === name)) return { error: `「${name}」已經存在` };
  const start = String(f.get('pstart') || ''), end = String(f.get('pend') || '');
  if (start && end && start > end) return { error: '結束日期不能早於開始日期' };
  const p = { ...(old || { id: id() }), name, budget: Math.max(0, Number(f.get('pbudget') || 0)), start, end, note: String(f.get('pnote') || '').trim() };
  p.archived = !!f.get('parchived');
  const cy = String(f.get('pcycle') || ''); if (cy === 'month' || cy === 'year' || cy === 'week') p.cycle = cy; else delete p.cycle;
  const sd = String(f.get('pstartday') ?? '').trim(); if (sd !== '' && (cy === 'month' || cy === 'week')) p.startDay = Math.min(28, Math.max(0, Math.floor(Number(sd) || 0))); else delete p.startDay;
  const pi = String(f.get('picon') || '').trim().slice(0, 4); if (pi) p.icon = pi; else delete p.icon; delete p.image; Object.assign(p, acctImageFromForm(f));
  if (f.get('ptransfer')) p.countTransfers = true; else delete p.countTransfers;
  if (f.get('phome')) p.home = true; else delete p.home;
  if (f.get('pstat')) p.rules = projRulesFromForm(f); else delete p.rules;
  if (!p.start) delete p.start; if (!p.end) delete p.end; if (!p.note) delete p.note;
  return { project: p };
}

// Delete: transactions keep their amounts but lose the project link; project budgets are removed.
function projRemove(p) {
  let n = 0;
  for (const t of (state.transactions || [])) if (String(t.project) === String(p.id)) { t.project = ''; n++; }
  const nb = (state.budgets || []).length;
  state.budgets = (state.budgets || []).filter(b => !(b.scope === 'project' && String(b.project) === String(p.id)));
  state.projects = (state.projects || []).filter(x => x !== p);
  return { tx: n, budgets: nb - state.budgets.length };
}

document.addEventListener('click', async e => {
  const find = v => (state.projects || []).find(p => String(p.id) === String(v));
  const op = e.target.closest?.('[data-proj-open]'); if (op) { projSelected = op.dataset.projOpen; renderProjectPage(); document.getElementById('projectDetail')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); return; }
  if (e.target.closest?.('[data-proj-close]')) { projSelected = null; renderProjectPage(); return; }
  const ed = e.target.closest?.('[data-proj-edit]'); if (ed) { const p = find(ed.dataset.projEdit); if (p) openEntity('project', p); return; }
  const del = e.target.closest?.('[data-proj-del]');
  if (del) {
    const p = find(del.dataset.projDel); if (!p) return;
    const n = projTxs(p.id).length, b = (state.budgets || []).filter(x => x.scope === 'project' && String(x.project) === String(p.id)).length;
    if (!confirm(`刪除專案「${p.name}」？\n\n${n} 筆交易會保留，但不再屬於這個專案${b ? `；${b} 個專案預算會一併刪除` : ''}。帳戶餘額不受影響。`)) return;
    projRemove(p); if (String(projSelected) === String(p.id)) projSelected = null; await save(); render();
  }
});
