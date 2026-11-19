// 帳小簿 V26.7 — 分類管理.
// Bundled after js/budgets.js (tools/build-bundle.js); uses app.js globals (state, esc, cat, save, render,
// openEntity, id). Function declarations / var only (hoisted), like analysis.js and budgets.js.
//
// Category record: { id, name, icon, kind: 'expense' | 'income', parentId?, order? }
// Two levels only: a main category and its subcategories. `order` sorts siblings; missing → array order.

var catPageKind;
function catIcons() { return ['🍜', '☕', '🍱', '🛒', '🚗', '🚌', '⛽', '🏠', '💡', '📱', '👕', '💊', '🎬', '🎮', '✈️', '🎁', '📚', '🐾', '💼', '💰', '📈', '🏦', '🧾', '•']; }

function catSiblings(c) { return (state.categories || []).filter(x => x.kind === c.kind && String(x.parentId || '') === String(c.parentId || '')); }
function catSortKey(c) { const i = (state.categories || []).indexOf(c); return Number.isFinite(Number(c.order)) ? Number(c.order) : 1e6 + i; }
function catMains(kind) { return (state.categories || []).filter(c => !c.parentId && (!kind || (c.kind || 'expense') === kind)).sort((a, b) => catSortKey(a) - catSortKey(b)); }
function catChildren(main) { return (state.categories || []).filter(c => String(c.parentId) === String(main.id)).sort((a, b) => catSortKey(a) - catSortKey(b)); }

// Mains in order, each followed by its subcategories. Orphan subcategories (parent missing) are listed as mains.
function catOrdered(kind) {
  const out = [], seen = new Set();
  for (const m of catMains(kind)) { out.push(m); seen.add(m); for (const s of catChildren(m)) { out.push(s); seen.add(s); } }
  for (const c of (state.categories || [])) if (!seen.has(c) && (!kind || (c.kind || 'expense') === kind)) out.push(c);
  return out;
}
function catLabel(c) { const p = c.parentId ? (state.categories || []).find(x => String(x.id) === String(c.parentId)) : null; return p ? p.name + ' › ' + c.name : c.name; } // plain text; callers escape
function catOptionsHTML(kind, selected, { all = false } = {}) {
  return (all ? '<option value="all">全部分類</option>' : '') + catOrdered(kind).map(c => `<option value="${esc(c.id)}" ${String(c.id) === String(selected) ? 'selected' : ''}>${c.parentId ? '　└ ' : ''}${esc(c.icon)} ${esc(c.name)}</option>`).join('');
}

// Where a category is used: transactions (incl. split lines), recurring items, budgets.
function catUsage(cid) {
  const k = String(cid);
  let tx = 0;
  for (const t of (state.transactions || [])) {
    if (String(t.category) === k) tx++;
    else if (Array.isArray(t.splits) && t.splits.some(s => String(s.category) === k)) tx++;
  }
  const recurring = (state.recurring || []).filter(r => String(r.category) === k).length;
  const budgets = (state.budgets || []).filter(b => String(b.category) === k).length;
  return { tx, recurring, budgets, total: tx + recurring + budgets };
}

// Move every reference from one category to another (transactions, splits, recurring, budgets).
function catReassign(fromId, toId) {
  const f = String(fromId), to = String(toId);
  for (const t of (state.transactions || [])) {
    if (String(t.category) === f) t.category = to;
    if (Array.isArray(t.splits)) for (const s of t.splits) if (String(s.category) === f) s.category = to;
  }
  for (const r of (state.recurring || [])) if (String(r.category) === f) r.category = to;
  for (const b of (state.budgets || [])) if (String(b.category) === f) b.category = to;
}

function catMove(c, dir) {
  const list = catSiblings(c).sort((a, b) => catSortKey(a) - catSortKey(b));
  list.forEach((x, i) => { x.order = i; });
  const i = list.indexOf(c), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return false;
  [list[i].order, list[j].order] = [list[j].order, list[i].order];
  return true;
}

function catFormHTML(c) {
  const r = c || { kind: 'expense', icon: '•' };
  const kind = r.kind || 'expense';
  const isMainWithKids = r.id && !r.parentId && catChildren(r).length;
  const parents = catMains(kind).filter(m => String(m.id) !== String(r.id));
  return `<div class="seg"><label><input type="radio" name="ckind" value="expense" ${kind === 'expense' ? 'checked' : ''} ${r.parentId ? 'disabled' : ''}>支出</label><label><input type="radio" name="ckind" value="income" ${kind === 'income' ? 'checked' : ''} ${r.parentId ? 'disabled' : ''}>收入</label></div>
  <div class="form-grid">
    <label>名稱<input name="cname" required maxlength="30" value="${esc(r.name || '')}" placeholder="例如：早餐"></label>
    <label>上層分類<select name="cparent" ${isMainWithKids ? 'disabled' : ''}><option value="">（主分類）</option>${parents.map(m => `<option value="${esc(m.id)}" ${String(m.id) === String(r.parentId) ? 'selected' : ''}>${esc(m.icon)} ${esc(m.name)}</option>`).join('')}</select></label>
    <label>圖示<input name="cicon" maxlength="4" value="${esc(r.icon || '•')}"></label>
  </div>
  <div class="cat-icons" role="group" aria-label="常用圖示">${catIcons().map(i => `<button type="button" data-cat-icon="${esc(i)}">${esc(i)}</button>`).join('')}</div>
  ${r.id && !r.__new ? `<p class="cat-form-del"><button type="button" class="secondary danger-btn" data-cat-del="${esc(r.id)}">刪除這個分類</button></p>` : ''}
  ${isMainWithKids ? '<p class="hint">這個主分類底下有子分類，不能改成子分類；改變收支類型時，子分類會一起改。</p>' : ''}`;
}
function catFormBind(root) {
  root.querySelectorAll('[data-cat-icon]').forEach(b => b.onclick = () => { const i = root.querySelector('[name=cicon]'); if (i) i.value = b.dataset.catIcon; });
  root.querySelectorAll('input[name=ckind]').forEach(r => r.onchange = () => {
    const sel = root.querySelector('[name=cparent]'); if (!sel || sel.disabled) return;
    sel.innerHTML = '<option value="">（主分類）</option>' + catMains(r.value).map(m => `<option value="${esc(m.id)}">${esc(m.icon)} ${esc(m.name)}</option>`).join('');
  });
}
function catFromForm(f, old) {
  const name = String(f.get('cname') || '').trim().slice(0, 30);
  if (!name) return { error: '請輸入分類名稱' };
  const parentId = old && !old.parentId && catChildren(old).length ? '' : String(f.get('cparent') || '');
  const parent = parentId ? (state.categories || []).find(c => String(c.id) === parentId) : null;
  if (parentId && !parent) return { error: '找不到上層分類' };
  if (parent && parent.parentId) return { error: '只能放在主分類底下（最多兩層）' };
  const kind = parent ? (parent.kind || 'expense') : (f.get('ckind') === 'income' ? 'income' : (old?.parentId ? (old.kind || 'expense') : 'expense'));
  const dup = (state.categories || []).some(c => c !== old && c.name === name && (c.kind || 'expense') === kind && String(c.parentId || '') === parentId);
  if (dup) return { error: `「${name}」已經存在` };
  const c = { ...(old || { id: id() }), name, icon: String(f.get('cicon') || '•').trim().slice(0, 4) || '•', kind };
  if (parentId) c.parentId = parentId; else delete c.parentId;
  return { category: c };
}

function catDeleteFormHTML(c) {
  const u = catUsage(c.id);
  const targets = catOrdered(c.kind || 'expense').filter(x => String(x.id) !== String(c.id));
  return `<p>「${esc(catLabel(c))}」目前用於 ${u.tx} 筆交易、${u.recurring} 個週期交易、${u.budgets} 個預算。刪除前請選擇要改用的分類：</p>
  <label class="entity-field">改用分類<select name="ctarget">${targets.map(x => `<option value="${esc(x.id)}">${x.parentId ? '　└ ' : ''}${esc(x.icon)} ${esc(x.name)}</option>`).join('')}</select></label>
  <p class="hint">這些交易、週期交易與預算會改成選擇的分類，帳戶餘額不受影響。</p>`;
}

function renderCategoryPage() {
  const grid = document.getElementById('categoryGrid'); if (!grid) return;
  const kind = catPageKind === 'income' ? 'income' : 'expense';
  const mains = catMains(kind);
  const card = m => {
    const kids = catChildren(m), u = catUsage(m.id), sib = catSiblings(m).length;
    return `<div class="cat-card">
      <div class="cat-head"><span class="cat-icon">${esc(m.icon)}</span><div><b>${esc(m.name)}</b><small>${u.tx} 筆交易${kids.length ? ` · ${kids.length} 個子分類` : ''}</small></div>
        <span class="cat-order"><button type="button" aria-label="上移" data-cat-move="-1" data-cat-id="${esc(m.id)}" ${sib < 2 ? 'disabled' : ''}>↑</button><button type="button" aria-label="下移" data-cat-move="1" data-cat-id="${esc(m.id)}" ${sib < 2 ? 'disabled' : ''}>↓</button></span></div>
      ${kids.length ? `<div class="cat-subs">${kids.map(s => `<button type="button" class="cat-sub" data-cat-edit="${esc(s.id)}" title="編輯子分類">${esc(s.icon)} ${esc(s.name)}<small>${catUsage(s.id).tx}</small></button>`).join('')}</div>` : ''}
      <div class="cat-actions"><button type="button" class="secondary" data-cat-edit="${esc(m.id)}">編輯</button><button type="button" class="secondary" data-cat-addsub="${esc(m.id)}">＋ 子分類</button><button type="button" class="secondary danger-btn" data-cat-del="${esc(m.id)}">刪除</button></div>
    </div>`;
  };
  grid.innerHTML = `<div class="seg cat-kind"><label><input type="radio" name="catPageKind" value="expense" ${kind === 'expense' ? 'checked' : ''}>支出分類</label><label><input type="radio" name="catPageKind" value="income" ${kind === 'income' ? 'checked' : ''}>收入分類</label></div>
    ${mains.length ? mains.map(card).join('') : '<div class="empty">還沒有分類</div>'}`;
  grid.querySelectorAll('input[name=catPageKind]').forEach(r => r.onchange = () => { catPageKind = r.value; renderCategoryPage(); });
}

async function catDelete(c) {
  if (catChildren(c).length) { alert(`「${c.name}」底下還有 ${catChildren(c).length} 個子分類，請先刪除或移動子分類。`); return; }
  if (catUsage(c.id).total) { openEntity('categoryDelete', c); return; }
  if (!confirm(`刪除分類「${catLabel(c)}」？`)) return;
  state.categories = state.categories.filter(x => x !== c);
  await save(); render();
}

document.addEventListener('click', async e => {
  const find = v => (state.categories || []).find(c => String(c.id) === String(v));
  const ed = e.target.closest?.('[data-cat-edit]'); if (ed) { const c = find(ed.dataset.catEdit); if (c) openEntity('category', c); return; }
  const add = e.target.closest?.('[data-cat-addsub]'); if (add) { const m = find(add.dataset.catAddsub); if (m) openEntity('category', { kind: m.kind || 'expense', parentId: m.id, icon: m.icon, __new: true }); return; }
  const del = e.target.closest?.('[data-cat-del]'); if (del) { const c = find(del.dataset.catDel); if (!c) return; if (del.closest('#entityBg')) closeModals(); catDelete(c); return; }
  const mv = e.target.closest?.('[data-cat-move]'); if (mv) { const c = find(mv.dataset.catId); if (c && catMove(c, Number(mv.dataset.catMove))) { await save(); render(); } }
});
