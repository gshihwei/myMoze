// 帳小簿 V26.69 — 記帳表單細節：轉帳對調、連續記帳、快捷鍵、範本 ☆、類別記住帳戶／專案、記帳模式.
// Bundled after js/tx-fx.js. Function declarations / var only. Modes and templates are per device (prefs).

// Account / project last used with a category.
function catMemory(cid, kind) {
  const list = state.transactions || [];
  for (let i = list.length - 1; i >= 0; i--) { const t = list[i]; if (String(t.category) === String(cid) && t.kind === kind && !t.refundOf && !t.feeOf && !t.imported) return { account: t.account, project: t.project || '' }; }
  return null;
}
// ---- entry modes ----
function modeList() { return Array.isArray(prefs().modes) ? prefs().modes : []; }
function modeActive() { return modeList().find(m => m.id === prefs().modeId) || null; }
function modeAllows(kind, idv) { const m = modeActive(), l = m?.[kind]; return !Array.isArray(l) || !l.length || l.map(String).includes(String(idv)); }
function modeSave(m) { const l = modeList().filter(x => x.id !== m.id); setPref('modes', [...l, m]); return m; }
function modeRemove(i) { setPref('modes', modeList().filter(m => m.id !== i)); if (prefs().modeId === i) setPref('modeId', ''); }
function entryModeFillSelect() {
  const s = document.getElementById('entryModeSel'); if (!s) return;
  const l = modeList(); s.hidden = !l.length || !!editId;
  s.innerHTML = `<option value="">一般模式</option>${l.map(m => `<option value="${esc(m.id)}"${m.id === prefs().modeId ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}`;
}
// Defaults for a brand-new record.
function entryModeApply() {
  const m = modeActive(), el = txForm?.elements; if (!m || !el || editId) return;
  if (m.account && [...el.account.options].some(o => o.value === String(m.account))) el.account.value = m.account;
  if (m.project && [...el.project.options].some(o => o.value === String(m.project))) el.project.value = m.project;
  if (m.category && [...el.category.options].some(o => o.value === String(m.category))) el.category.value = m.category;
  if (m.cur) { const c = document.getElementById('entryCurSel'); if (c) { c.dataset.cur = m.cur; fxSyncUI(); } }
}
function modeFormHTML(m) {
  const opt = (l, cur, none) => `<option value="">${none}</option>` + l.map(x => `<option value="${esc(x.id)}"${String(x.id) === String(cur || '') ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
  const checks = (k, l) => `<details><summary>${k === 'accounts' ? '可選帳戶' : k === 'projects' ? '可選專案' : '可選類別'}（不勾＝全部）</summary><div class="mode-checks">${l.map(x => `<label><input type="checkbox" data-mode-list="${k}" value="${esc(x.id)}"${(m?.[k] || []).map(String).includes(String(x.id)) ? ' checked' : ''}> ${esc(x.name)}</label>`).join('')}</div></details>`;
  const cats = catOrdered().filter(c => !c.parentId);
  return `<div class="mode-form" data-mode-id="${esc(m?.id || '')}"><div class="form-grid"><label>模式名稱<input id="modeName" maxlength="12" value="${esc(m?.name || '')}" placeholder="例如：日本旅遊"></label><label>預設幣種<input id="modeCur" maxlength="6" value="${esc(m?.cur || '')}" placeholder="留空＝帳戶幣別"></label><label>預設帳戶<select id="modeAccount">${opt(acctActive(acctOrdered(state.accounts)), m?.account, '不指定')}</select></label><label>預設專案<select id="modeProject">${opt(state.projects || [], m?.project, '不指定')}</select></label><label>預設類別<select id="modeCategory">${opt(catOrdered(), m?.category, '不指定')}</select></label></div>${checks('accounts', acctActive(acctOrdered(state.accounts)))}${checks('projects', state.projects || [])}${checks('categories', cats)}<div class="form-actions"><button type="button" class="secondary" data-mode-cancel>取消</button><button type="button" class="primary" data-mode-save>儲存模式</button></div></div>`;
}
function renderModes(editing) {
  const box = document.getElementById('modeSettings'); if (!box) return;
  const l = modeList();
  box.innerHTML = `${l.map(m => `<div class="setting"><label><input type="radio" name="modeActive" value="${esc(m.id)}"${m.id === prefs().modeId ? ' checked' : ''}> ${esc(m.name)}</label><span><button type="button" class="ghost" data-mode-edit="${esc(m.id)}">編輯</button><button type="button" class="ghost" data-mode-del="${esc(m.id)}">刪除</button></span></div>`).join('')}${l.length ? `<div class="setting"><label><input type="radio" name="modeActive" value=""${prefs().modeId ? '' : ' checked'}> 一般模式</label></div>` : ''}<button type="button" class="secondary" data-mode-edit="">＋ 新增模式</button>${editing !== undefined ? modeFormHTML(l.find(m => m.id === editing)) : ''}`;
}
function tplMove(tid, dir) {
  const l = [...tplList()], i = l.findIndex(x => String(x.id) === String(tid)), j = i + dir; if (i < 0 || j < 0 || j >= l.length) return false;
  [l[i], l[j]] = [l[j], l[i]]; setPref('templates', l); return true;
}
function entryStarSync() { const b = document.getElementById('entryStar'), n = String(txForm?.elements?.name?.value || '').trim(); if (b) b.textContent = n && tplList().some(t => t.name === n) ? '★' : '☆'; }
function entryTplChips() {
  const box = document.getElementById('entryTpls'); if (!box) return;
  const q = String(txForm.elements.name.value || '').trim().toLowerCase();
  const l = editId ? [] : tplList().filter(t => !q || t.name.toLowerCase().includes(q)).slice(0, 8);
  box.innerHTML = l.map(t => `<button type="button" class="tpl-pick" data-tpl-open="${esc(t.id)}">★ ${esc(t.name)}</button>`).join('');
}
function entryTplFromForm() {
  const f = new FormData(txForm), name = String(f.get('name') || '').trim(); if (!name) return { error: '請先填名稱，範本以名稱辨識' };
  if (tplList().some(t => t.name === name)) return { error: `已經有範本「${name}」` };
  const t = { name, kind: f.get('kind'), amount: Number(f.get('amount') || 0), category: f.get('category'), account: f.get('account'), toAccount: f.get('toAccount') || undefined, project: f.get('project'), merchant: f.get('merchant'), person: f.get('person'), note: f.get('note'), tags: parseTags(f.get('tags')) };
  return { tpl: tplSave(t, name) };
}
function entryContinue() { window.__entryContinue = document.querySelector('input[name=kind]:checked')?.value || 'expense'; setTimeout(() => { window.__entryContinue = null; }, 4000); txForm.requestSubmit(); }
function entryPlusOpen(t) { entryModeFillSelect(); if (!t) entryModeApply(); entryStarSync(); entryTplChips(); }
document.addEventListener('click', e => {
  const c = s => e.target.closest?.(s);
  if (c('#entrySwap')) { const el = txForm.elements, a = el.account.value; el.account.value = el.toAccount.value; el.toAccount.value = a; el.account.dispatchEvent(new Event('change', { bubbles: true })); return; }
  if (c('#entryStar')) { const r = entryTplFromForm(); alert(r.error || `已存成範本「${r.tpl.name}」`); renderTemplates(); entryStarSync(); entryTplChips(); return; }
  if (c('#entryContinueBtn')) { entryContinue(); return; }
  const acc = c('#accountChoices [data-acct]'); if (acc && txForm?.elements?.account) txForm.elements.account.dataset.userSet = '1';
  if (c('#modalClose') || c('#modalCancel')) window.__entryContinue = null;
  const mv = c('[data-tpl-up]'); if (mv) { tplMove(mv.dataset.tplUp, -1); renderTemplates(); return; }
  const ed = c('[data-mode-edit]'); if (ed) { renderModes(ed.dataset.modeEdit || 'new'); return; }
  if (c('[data-mode-cancel]')) { renderModes(); return; }
  const md = c('[data-mode-del]'); if (md) { if (confirm('刪除這個記帳模式？')) { modeRemove(md.dataset.modeDel); renderModes(); } return; }
  if (c('[data-mode-save]')) {
    const v = i => String(document.getElementById(i)?.value || '').trim(), root = document.querySelector('.mode-form'); if (!v('modeName')) { alert('請輸入模式名稱'); return; }
    const m = { id: root.dataset.modeId || id(), name: v('modeName'), cur: v('modeCur').toUpperCase(), account: v('modeAccount'), project: v('modeProject'), category: v('modeCategory') };
    for (const k of ['accounts', 'projects', 'categories']) m[k] = [...root.querySelectorAll(`[data-mode-list=${k}]:checked`)].map(x => x.value);
    modeSave(m); renderModes();
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t?.name === 'modeActive') { setPref('modeId', t.value); renderModes(); }
  if (t?.id === 'entryModeSel') { setPref('modeId', t.value); entryModeApply(); window.refreshEntryChoices?.(); renderModes(); }
  if (t?.name === 'category' && t.closest?.('#txForm') && !editId) {
    const m = catMemory(t.value, document.querySelector('input[name=kind]:checked')?.value), el = txForm.elements; if (!m) return;
    if (!el.account.dataset.userSet && [...el.account.options].some(o => o.value === String(m.account)) && modeAllows('accounts', m.account)) { el.account.value = m.account; el.account.dispatchEvent(new Event('change', { bubbles: true })); }
    if (!el.project.dataset.userSet && m.project && [...el.project.options].some(o => o.value === String(m.project))) el.project.value = m.project;
  }
  if (t?.name === 'project' && e.isTrusted && t.closest?.('#txForm')) t.dataset.userSet = '1';
});
document.addEventListener('input', e => { if (e.target?.name === 'name' && e.target.closest?.('#txForm')) { entryStarSync(); entryTplChips(); } });
document.addEventListener('keydown', e => {
  const open = document.getElementById('modalBg')?.classList.contains('open'), k = String(e.key || '').toLowerCase(), cmd = e.ctrlKey || e.metaKey;
  if (open && cmd && k === 's') { e.preventDefault(); txForm.requestSubmit(); return; }
  if (open && cmd && k === 'd') { e.preventDefault(); closeModals(); return; }
  if (open || cmd || e.altKey || document.documentElement.dataset.locked) return;
  const tg = e.target; if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tg?.tagName) || tg?.isContentEditable || document.querySelector('.modal-bg.open')) return;
  if (k === 'n') { e.preventDefault(); openTx(); }
});
// long press on ✓ = save and keep adding
(function () {
  let timer = null, fired = false;
  document.addEventListener('pointerdown', e => { if (!e.target.closest?.('.entry-ok,#amountKeypad [data-key=ok]')) return; fired = false; timer = setTimeout(() => { fired = true; entryContinue(); }, 600); });
  for (const ev of ['pointerup', 'pointercancel', 'pointermove']) document.addEventListener(ev, e => { if (ev !== 'pointermove' || Math.abs(e.movementX) + Math.abs(e.movementY) > 6) clearTimeout(timer); });
  document.addEventListener('click', e => { if (fired && e.target.closest?.('.entry-ok,#amountKeypad [data-key=ok]')) { e.preventDefault(); e.stopPropagation(); fired = false; } }, true);
})();
