// 帳小簿 V26.9 — 專案頁.
// Bundled after js/search.js; uses app.js / analysis.js / budgets.js globals
// (state, esc, money, cat, txRow, anValue, anRank, anRankHTML, anTopCategory, isUnappliedPending,
// budgetStatus, budgetMeterHTML, openEntity, save, render). Function declarations / var only.
//
// Project record: { id, name, budget, start?, end?, note?, archived? }

var projSelected = null, projShowArchived = false;

function projNorm(p) { if (!p) return p; p.budget = Math.max(0, Number(p.budget) || 0); p.archived = !!p.archived; return p; }

function projTxs(pid) {
  return (state.transactions || []).filter(t => String(t.project) === String(pid) && !isUnappliedPending(t))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.time || '').localeCompare(String(a.time || '')));
}

// Spending summary for one project (TWD; splits keep their own categories).
function projStats(p) {
  const txs = projTxs(p.id), byCat = new Map();
  let spent = 0, income = 0;
  for (const t of txs) {
    if (t.kind === 'expense') {
      spent += anValue(t);
      const parts = Array.isArray(t.splits) && t.splits.length ? t.splits.map(s => [s.category, anValue(t, s.amount)]) : [[t.category, anValue(t)]];
      for (const [cid, v] of parts) { const k = anTopCategory(cid), c = cat(k), r = byCat.get(k) || { id: k, name: c.name, icon: c.icon, amount: 0, count: 0 }; r.amount += v; r.count++; byCat.set(k, r); }
    } else if (t.kind === 'income') income += anValue(t);
  }
  const dates = txs.map(t => t.date).filter(Boolean).sort();
  return { txs, count: txs.length, spent: Math.round(spent), income: Math.round(income), first: dates[0] || '', last: dates[dates.length - 1] || '', categories: anRank(byCat, 8) };
}

function projPeriodText(p, s) {
  const d = x => String(x).replace(/-/g, '/');
  if (p.start || p.end) return `${p.start ? d(p.start) : '…'} – ${p.end ? d(p.end) : '…'}`;
  if (s.first) return s.first === s.last ? d(s.first) : `${d(s.first)} – ${d(s.last)}`;
  return '尚無交易';
}

function projCardHTML(p) {
  const s = projStats(p), st = budgetStatus(s.spent, p.budget);
  const meter = p.budget ? budgetMeterHTML({ title: p.name, spent: s.spent, limit: p.budget, ratio: s.spent / p.budget, pace: 0, status: st }) : '';
  return `<div class="proj-card ${p.archived ? 'archived' : ''} ${String(projSelected) === String(p.id) ? 'selected' : ''}">
    <div class="bc-head"><span class="bc-icon">▣</span><b>${esc(p.name)}</b>${p.archived ? '<span class="bc-status none"><i aria-hidden="true">—</i>已封存</span>' : p.budget ? `<span class="bc-status ${st.key}"><i aria-hidden="true">${st.mark}</i>${st.label}</span>` : ''}</div>
    <div class="bc-fig"><strong>${money(s.spent)}</strong>${p.budget ? `<span>/ ${money(p.budget)}</span><small>${Math.round(s.spent / p.budget * 100)}%</small>` : '<span>未設預算</span>'}</div>
    ${meter}
    <div class="bc-foot"><span>${projPeriodText(p, s)}</span><span>${s.count} 筆${s.income ? ` · 收入 ${money(s.income)}` : ''}</span></div>
    <div class="bc-actions"><button type="button" class="primary" data-proj-open="${esc(p.id)}">明細</button><button type="button" class="secondary" data-proj-edit="${esc(p.id)}">編輯</button><button type="button" class="secondary danger-btn" data-proj-del="${esc(p.id)}">刪除</button></div>
  </div>`;
}

function projDetailHTML(p) {
  const s = projStats(p);
  return `<div class="panel proj-detail">
    <div class="panel-head"><div><h2>${esc(p.name)}</h2><p>${projPeriodText(p, s)} · ${s.count} 筆 · 支出 ${money(s.spent)}${p.budget ? ` / 預算 ${money(p.budget)}` : ''}</p></div><button type="button" class="ghost" data-proj-close>關閉</button></div>
    ${p.note ? `<p class="hint proj-note">${esc(p.note)}</p>` : ''}
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
    (list.length ? list.map(projCardHTML).join('') : '<div class="empty">還沒有專案。旅行、裝修、婚禮等可以建立專案，獨立追蹤花費。</div>');
  const tg = document.getElementById('projShowArchived'); if (tg) tg.onchange = () => { projShowArchived = tg.checked; renderProjectPage(); };
}

function projFormHTML(p) {
  const r = p || {};
  return `<div class="form-grid">
    <label>專案名稱<input name="pname" required maxlength="40" value="${esc(r.name || '')}" placeholder="例如：台南旅行"></label>
    <label>預算（可留空）<input name="pbudget" type="number" min="0" step="any" value="${r.budget ? esc(r.budget) : ''}"></label>
    <label>開始日期<input name="pstart" type="date" value="${esc(r.start || '')}"></label>
    <label>結束日期<input name="pend" type="date" value="${esc(r.end || '')}"></label>
  </div>
  <label class="entity-field">備註<input name="pnote" maxlength="200" value="${esc(r.note || '')}" placeholder="可留空"></label>
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
