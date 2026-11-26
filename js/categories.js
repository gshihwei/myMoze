// 帳小簿 V26.7 — 分類管理.
// Bundled after js/budgets.js (tools/build-bundle.js); uses app.js globals (state, esc, cat, save, render,
// openEntity, id). Function declarations / var only (hoisted), like analysis.js and budgets.js.
//
// Category record: { id, name, icon, kind: 'expense' | 'income', parentId?, order? }
// Two levels only: a main category and its subcategories. `order` sorts siblings; missing → array order.

var catPageKind;
// Quick-pick icons grouped for the category form. Single code points (+ optional U+FE0F), no ZWJ sequences,
// so each fits the 4-character icon field. Anything else can still be typed or pasted into the field.
function catIconGroups() {
  return [
    ['餐飲', ['🍜', '🍱', '🍽️', '🍳', '🍞', '🍔', '🍕', '🍣', '🍙', '🍛', '🍲', '🥗', '🍰', '🍩', '🍎', '🍌', '🍇', '🥤', '☕', '🍵', '🍺', '🍷', '🥩']],
    ['交通', ['🚗', '🚕', '🚌', '🚇', '🚆', '🚄', '✈️', '🚲', '🛵', '🏍️', '⛽', '🅿️', '🚢', '🚁', '🛴']],
    ['居家', ['🏠', '🏡', '🛋️', '🛏️', '🚿', '🧻', '🧺', '🧹', '🧴', '🔧', '🔨', '💡', '🔥', '💧', '📺', '🔌']],
    ['購物', ['🛒', '🛍️', '👕', '👖', '👗', '👟', '👜', '💄', '💍', '💎', '🎁', '🧸', '🎧', '💻', '⌚', '📷', '🕶️']],
    ['醫療健康', ['💊', '💉', '🩺', '🩹', '🏥', '🦷', '👓', '💪', '🏃', '🏋️', '🧘']],
    ['娛樂運動', ['🎬', '🎥', '🎮', '🎲', '🎵', '🎤', '🎸', '🎨', '🎡', '🎢', '🎟️', '🎳', '⚽', '🏀', '🎾', '🏊', '🎰']],
    ['學習工作', ['📚', '📖', '✏️', '📝', '🎓', '🏫', '💼', '🖥️', '📎']],
    ['金融收入', ['💰', '💵', '💳', '🏦', '📈', '📉', '💹', '🧾', '💸', '🏆', '🛡️', '＄']],
    ['生活家庭', ['🧳', '🏨', '🏖️', '⛺', '💇', '💆', '👶', '🧓', '👵', '👪', '🐾', '🐶', '🐱', '🧧', '💝', '🤝', '🎂', '🎗️']],
    ['通訊其他', ['📱', '📞', '🌐', '📦', '✉️', '🔋', '👤', '🏷️', '•']],
  ];
}
function catIcons() { return [...new Set(catIconGroups().flatMap(g => g[1]))]; }

function catSiblings(c) { return (state.categories || []).filter(x => x.kind === c.kind && String(x.parentId || '') === String(c.parentId || '')); }
function catSortKey(c) { const i = (state.categories || []).indexOf(c); return Number.isFinite(Number(c.order)) ? Number(c.order) : 1e6 + i; }
function catMains(kind) { return (state.categories || []).filter(c => !c.parentId && c.kind !== 'prefs' && (!kind || (c.kind || 'expense') === kind)).sort((a, b) => catSortKey(a) - catSortKey(b)); }
function catChildren(main) { return (state.categories || []).filter(c => String(c.parentId) === String(main.id)).sort((a, b) => catSortKey(a) - catSortKey(b)); }

// Mains in order, each followed by its subcategories. Orphan subcategories (parent missing) are listed as mains.
function catOrdered(kind) {
  const out = [], seen = new Set();
  for (const m of catMains(kind)) { out.push(m); seen.add(m); for (const s of catChildren(m)) { out.push(s); seen.add(s); } }
  for (const c of (state.categories || [])) if (!seen.has(c) && c.kind !== 'prefs' && (!kind || (c.kind || 'expense') === kind)) out.push(c);
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
  const special = catSpecialKind(kind) || r.__sys, lockName = r.__sys || (r.id && r['name'] === '轉帳' && kind === 'transfer') ? 'readonly' : '';
  return `${special ? `<input type="hidden" name="ckind" value="${esc(kind)}">` : `<div class="seg"><label><input type="radio" name="ckind" value="expense" ${kind === 'expense' ? 'checked' : ''} ${r.parentId ? 'disabled' : ''}>支出</label><label><input type="radio" name="ckind" value="income" ${kind === 'income' ? 'checked' : ''} ${r.parentId ? 'disabled' : ''}>收入</label></div>`}
  ${acctImageFieldHTML({ image: r.image, type: 'cash', preview: catIconShown(r), hint: '不想用 emoji 時可上傳自己的圖片，會縮成小圖並隨類別同步' })}
  <div class="form-grid">
    <label>名稱<input name="cname" required maxlength="30" value="${esc(r.name || '')}" placeholder="例如：早餐" ${lockName}></label>
    <label ${special ? 'hidden' : ''}>上層分類<select name="cparent" ${isMainWithKids || special ? 'disabled' : ''}><option value="">（主分類）</option>${parents.map(m => `<option value="${esc(m.id)}" ${String(m.id) === String(r.parentId) ? 'selected' : ''}>${esc(m.icon)} ${esc(m.name)}</option>`).join('')}</select></label>
    <label>圖示<input name="cicon" maxlength="4" value="${esc(r.icon || '•')}"></label>
  </div>
  <div class="cat-icon-groups" role="group" aria-label="常用圖示">${catIconGroups().map(([label, list]) => `<div class="cat-icon-group"><small>${esc(label)}</small><div class="cat-icons">${list.map(i => `<button type="button" data-cat-icon="${esc(i)}" aria-label="${esc(i)}">${esc(i)}</button>`).join('')}</div></div>`).join('')}</div>
  <p class="hint">找不到想要的？直接在上方「圖示」欄輸入或貼上任何 emoji（建議單一圖示）。</p>
  ${r.id && !r.__new ? `<p class="cat-form-del"><button type="button" class="secondary danger-btn" data-cat-del="${esc(r.id)}">刪除這個分類</button></p>` : ''}
  ${isMainWithKids ? '<p class="hint">這個主分類底下有子分類，不能改成子分類；改變收支類型時，子分類會一起改。</p>' : ''}<label class="proj-archive"><input type="checkbox" name="ccoloron"${r.color ? ' checked' : ''}> 自訂顏色 <input type="color" name="ccolor" value="${esc(r.color || '#3f86e6')}"></label><label class="proj-archive"><input type="checkbox" name="chidden"${r.hidden ? ' checked' : ''}> 隱藏（記帳時不出現，既有記錄保留）</label>`;
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
  const ck = String(f.get('ckind') || ''); const kind = catSpecialKind(ck) ? ck : parent ? (parent.kind || 'expense') : (f.get('ckind') === 'income' ? 'income' : (old?.parentId ? (old.kind || 'expense') : 'expense'));
  const dup = (state.categories || []).some(c => c !== old && c.name === name && (c.kind || 'expense') === kind && String(c.parentId || '') === parentId);
  if (dup) return { error: `「${name}」已經存在` };
  const c = { ...(old || { id: id() }), name, icon: String(f.get('cicon') || '•').trim().slice(0, 4) || '•', kind };
  if (parentId) c.parentId = parentId; else delete c.parentId;
  delete c.image; Object.assign(c, acctImageFromForm(f)); delete c.removed;
  if (f.get('chidden')) c.hidden = true; else delete c.hidden;
  const col = String(f.get('ccolor') || ''); if (f.get('ccoloron') && /^#[0-9a-f]{6}$/i.test(col)) c.color = col; else delete c.color;
  return { category: c };
}

function catDeleteFormHTML(c) {
  const u = catUsage(c.id);
  const targets = catOrdered(c.kind || 'expense').filter(x => String(x.id) !== String(c.id));
  return `<p>「${esc(catLabel(c))}」目前用於 ${u.tx} 筆交易、${u.recurring} 個週期交易、${u.budgets} 個預算。刪除前請選擇要改用的分類：</p>
  <div class="form-grid form-grid-1"><label>改用分類<select name="ctarget">${targets.map(x => `<option value="${esc(x.id)}">${x.parentId ? '　└ ' : ''}${esc(x.icon)} ${esc(x.name)}</option>`).join('')}</select></label></div>
  <p class="hint">這些交易、週期交易與預算會改成選擇的分類，帳戶餘額不受影響。</p>`;
}

function renderCategoryPage() {
  const grid = document.getElementById('categoryGrid'); if (!grid) return;
  const tabs = `<div class="entry-tabs cat-tabs">${catKinds().map(([k, l]) => `<button type="button" data-cat-page="${k}" class="${k === catPageKind ? 'active' : ''}">${l}</button>`).join('')}</div>`;
  if (catSpecialKind(catPageKind)) { grid.innerHTML = tabs + catSpecialHTML(catPageKind); return; }
  const kind = catPageKind === 'income' ? 'income' : 'expense';
  const mains = catMains(kind);
  const card = m => {
    const kids = catChildren(m), u = catUsage(m.id), sib = catSiblings(m).length;
    return `<div class="cat-card">
      <div class="cat-head"><span class="cat-icon">${catIconHTML(m)}</span><div><b>${esc(m.name)}</b><small>${u.tx} 筆交易${kids.length ? ` · ${kids.length} 個子分類` : ''}</small></div>
        <span class="cat-order"><button type="button" aria-label="上移" data-cat-move="-1" data-cat-id="${esc(m.id)}" ${sib < 2 ? 'disabled' : ''}>↑</button><button type="button" aria-label="下移" data-cat-move="1" data-cat-id="${esc(m.id)}" ${sib < 2 ? 'disabled' : ''}>↓</button></span></div>
      ${kids.length ? `<div class="cat-subs">${kids.map(s => `<button type="button" class="cat-sub" data-cat-edit="${esc(s.id)}" title="編輯子分類"${s.hidden ? ' style="opacity:.45"' : ''}>${catIconHTML(s)} ${esc(s.name)}<small>${catUsage(s.id).tx}</small></button>`).join('')}</div>` : ''}
      <div class="cat-actions"><button type="button" class="secondary" data-cat-edit="${esc(m.id)}">編輯</button><button type="button" class="secondary" data-cat-addsub="${esc(m.id)}">＋ 子分類</button><button type="button" class="secondary" data-cat-hide="${esc(m.id)}">${m.hidden ? '顯示' : '隱藏'}</button>${kids.length ? '' : `<button type="button" class="secondary" data-cat-merge="${esc(m.id)}">合併</button>`}<button type="button" class="secondary danger-btn" data-cat-del="${esc(m.id)}">刪除</button></div>
    </div>`;
  };
  grid.innerHTML = `${tabs}
    <p class="cat-icon-tools"><button type="button" class="secondary" id="catApplyIcons">依名稱補上預設圖示</button></p>
    ${mains.length ? mains.map(card).join('') : '<div class="empty">還沒有分類</div>'}`;
}

async function catDelete(c) {
  if (catChildren(c).length) { alert(`「${c.name}」底下還有 ${catChildren(c).length} 個子分類，請先刪除或移動子分類。`); return; }
  if (catUsage(c.id).total) { openEntity('categoryDelete', c); return; }
  if (!confirm(`刪除分類「${catLabel(c)}」？`)) return;
  state.categories = state.categories.filter(x => x !== c);
  await save(); render();
}

document.addEventListener('click', async e => {
  const pg = e.target.closest?.('[data-cat-page]'); if (pg) { catPageKind = pg.dataset.catPage; renderCategoryPage(); return; }
  const find = v => (state.categories || []).find(c => String(c.id) === String(v));
  const ed = e.target.closest?.('[data-cat-edit]'); if (ed) { const c = find(ed.dataset.catEdit); if (c) openEntity('category', c); return; }
  const add = e.target.closest?.('[data-cat-addsub]'); if (add) { const m = find(add.dataset.catAddsub); if (m) openEntity('category', { kind: m.kind || 'expense', parentId: m.id, icon: m.icon, __new: true }); return; }
  const del = e.target.closest?.('[data-cat-del]'); if (del) { const c = find(del.dataset.catDel); if (!c) return; if (del.closest('#entityBg')) closeModals(); catDelete(c); return; }
  const mv = e.target.closest?.('[data-cat-move]'); if (mv) { const c = find(mv.dataset.catId); if (c && catMove(c, Number(mv.dataset.catMove))) { await save(); render(); } }
});

// ---- V26.92 類別圖片與轉帳／應收／應付／系統類別 ----
function catIconHTML(c) { return c?.image && acctImageValid(c.image) ? `<img class="cat-img" src="${c.image}" alt="">` : esc(catIconShown(c)); }
// Placeholder icons (•, ＄…) are shown as the icon the name or the main category suggests.
function catIconShown(c) { if (!c) return '🏷️'; if (!catIconIsPlaceholder(c.icon)) return c.icon; const p = c.parentId ? (state?.categories || []).find(x => String(x.id) === String(c.parentId)) : null; return (typeof catIconLookup === 'function' && (catIconLookup(c.name) || (p && (catIconLookup(p.name) || (!catIconIsPlaceholder(p.icon) && p.icon))))) || c.icon || '🏷️'; }
function catKinds() { return [['expense', '支出'], ['income', '收入'], ['transfer', '轉帳'], ['receivable', '應收款項'], ['payable', '應付款項'], ['system', '系統']]; }
function catSpecialKind(k) { return ['transfer', 'receivable', 'payable', 'system'].includes(k); }
// Built-in entries of a special kind. 系統 ones that are real income / expense categories are edited there (kind in `as`).
function catBuiltins(kind) {
  if (kind !== 'system') return presetDefaults()[kind] || [];
  return [{ name: '帳單分期', icon: '⇄' }, { name: '信用卡繳款', icon: '💳' }, ...presetDefaults().system.map(x => ({ ...x, as: x.kind })), { name: '餘額調整', icon: '＄' }, { name: '多類別', icon: '🗂️' }];
}
function catBuiltinRecord(kind, name) { const b = catBuiltins(kind).find(x => x.name === name), k = b?.as || kind; return (state.categories || []).find(c => c.name === name && (c.kind || 'expense') === k && !c.parentId) || null; }
// Presets shown in the entry form: built-ins (with the user's icon / picture / colour / order, minus hidden) plus own ones.
function catPresetList(kind) {
  const base = presetDefaults()[kind] || [], own = (state.categories || []).filter(c => c.kind === kind && !c.parentId), seen = new Set();
  const l = base.map((b, i) => { seen.add(b.name); const r = catBuiltinRecord(kind === 'system' ? 'system' : kind, b.name); return r ? { ...b, icon: r.icon || b.icon, color: r.color, image: r.image, hidden: r.hidden, removed: r.removed, order: Number.isFinite(Number(r.order)) && r.order !== undefined ? Number(r.order) : i, id: r.id } : { ...b, order: i }; });
  for (const c of own) if (!seen.has(c.name) && kind !== 'system') l.push({ name: c.name, icon: c.icon, color: c.color, image: c.image, hidden: c.hidden, removed: c.removed, order: Number.isFinite(Number(c.order)) && c.order !== undefined ? Number(c.order) : 100, id: c.id });
  return l.filter(x => !x.removed).sort((a, b) => a.order - b.order);
}
function catSpecialRec(kind, name) {
  const b = catBuiltins(kind).find(x => x.name === name), k = b?.as || kind; let r = catBuiltinRecord(kind, name) || (state.categories || []).find(c => c.kind === kind && c.name === name);
  if (!r) { r = { id: id(), name, icon: b?.icon || '🏷️', kind: k }; (state.categories = state.categories || []).push(r); } return r;
}
function catSpecialIcon(name, fallback) { const r = (state?.categories || []).find(c => c.kind === 'system' && c.name === name); return { icon: r?.icon || fallback, image: r?.image, color: r?.color }; }
function catSpecialHTML(kind) {
  const l = kind === 'system' ? catBuiltins('system').map(b => { const r = catBuiltinRecord('system', b.name); return { ...b, icon: r?.icon || b.icon, image: r?.image, color: r?.color }; }) : catPresetList(kind), sys = kind === 'system';
  return `<div class="cat-special">${l.map((c, i) => `<div class="cat-srow${c.hidden ? ' off' : ''}"><span class="entry-bubble" style="background:${esc(c.color || ({ transfer: '#d98a3d', receivable: '#7dd8c6', payable: '#d05c82' }[kind] || '#d98a3d'))}"><span class="emoji">${catIconHTML(c)}</span></span><b>${esc(c.name)}</b><span class="cat-sact"><button type="button" class="ghost" data-cats-edit="${esc(c.name)}" aria-label="編輯">✎</button>${sys ? '' : `<button type="button" class="ghost" data-cats-hide="${esc(c.name)}" aria-label="${c.hidden ? '顯示' : '隱藏'}">${c.hidden ? '🙈' : '👁'}</button><button type="button" class="ghost" data-cats-up="${i}" ${i ? '' : 'disabled'} aria-label="上移">↑</button><button type="button" class="ghost" data-cats-down="${i}" ${i < l.length - 1 ? '' : 'disabled'} aria-label="下移">↓</button>${c.name === '轉帳' ? '' : `<button type="button" class="ghost" data-cats-del="${esc(c.name)}" aria-label="刪除">🗑</button>`}`}</span></div>`).join('')}${sys ? '<p class="hint">系統類別供內建功能使用，不能改名或刪除，可以換圖示與顏色。</p>' : `<button type="button" class="secondary" data-cats-add>＋ 新增類別</button>`}</div>`;
}
document.addEventListener('click', async e => {
  const c = s => e.target.closest?.(s); let b; const kind = catPageKind;
  if ((b = c('[data-cats-edit]'))) { const r = catSpecialRec(kind, b.dataset.catsEdit); openEntity('category', { ...r, __sys: kind === 'system' }); entityFormEl.dataset.editId = r.id; return; }
  if (c('[data-cats-add]')) { openEntity('category', { kind, icon: '🏷️', __new: true }); return; }
  if ((b = c('[data-cats-hide]'))) { const r = catSpecialRec(kind, b.dataset.catsHide); if (r.hidden) delete r.hidden; else r.hidden = true; await save(); render(); return; }
  if ((b = c('[data-cats-del]'))) { const n = b.dataset.catsDel; if (!confirm(`刪除類別「${n}」？已經用它記錄的交易會保留。`)) return; const r = catSpecialRec(kind, n); if (catUsage(r.id).total || (presetDefaults()[kind] || []).some(x => x.name === n)) r.removed = true; else state.categories = state.categories.filter(x => x !== r); await save(); render(); return; }
  if ((b = c('[data-cats-up],[data-cats-down]'))) { const l = catPresetList(kind), i = Number(b.dataset.catsUp ?? b.dataset.catsDown), j = b.dataset.catsUp !== undefined ? i - 1 : i + 1; if (!l[j]) return; [l[i], l[j]] = [l[j], l[i]]; l.forEach((x, k) => { catSpecialRec(kind, x.name).order = k; }); await save(); render(); return; }
  if ((b = c('[data-cat-hide]'))) { const r = (state.categories || []).find(x => String(x.id) === b.dataset.catHide); if (r) { if (r.hidden) delete r.hidden; else r.hidden = true; await save(); render(); } return; }
  if ((b = c('[data-cat-merge]'))) { const r = (state.categories || []).find(x => String(x.id) === b.dataset.catMerge); if (!r) return; if (catChildren(r).length) { alert('底下還有子分類，請先合併或移動子分類。'); return; } openEntity('categoryDelete', r); return; }
});
// V26.118 the image preview follows the emoji while no picture is chosen
function catPreviewSync() { const f = document.getElementById('entityForm'), pv = f?.querySelector('.cat-preview[data-acct-image-preview]'); if (!pv || f.querySelector('[name=aimage]')?.value) return; pv.textContent = f.querySelector('[name=cicon]')?.value || '•'; }
document.addEventListener('input', e => { if (e.target?.name === 'cicon') catPreviewSync(); });
document.addEventListener('click', e => { if (e.target.closest?.('#entityForm .cat-icons button')) setTimeout(catPreviewSync, 0); });
