// 帳小簿 V26.119 — 概覽區塊排序：設定→偏好→概覽顯示的區塊，每列可勾選顯示並用 ↑↓ 調整順序（prefs.ovOrder，隨偏好同步）.
// Bundled after js/invoice-view.js. Function declarations / var only.
// Phone (single column, ≤1100px): every block follows the chosen order in one flow.
// Wide screen: each block stays in its own column (main / right rail, the two small columns) and is ordered within it.

function ovKeys() { return overviewPanels().map(x => x[0]); }
// Chosen order, with blocks added in later versions placed where they are by default.
function ovOrder(p) {
  const all = ovKeys(), saved = (Array.isArray((p || prefs()).ovOrder) ? (p || prefs()).ovOrder : []).filter(k => all.includes(k)), out = [...new Set(saved)];
  all.forEach((k, i) => { if (out.includes(k)) return; const prev = all.slice(0, i).reverse().find(x => out.includes(x)); out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, k); });
  return out;
}
function ovMove(order, key, dir) { const l = [...order], i = l.indexOf(key), j = i + dir; if (i < 0 || j < 0 || j >= l.length) return l; [l[i], l[j]] = [l[j], l[i]]; return l; }
// Original layout, recorded once: each container with its children (blocks and fixed parts).
function ovHome() {
  if (window.__ovHome) return window.__ovHome; const v = document.getElementById('view-overview'); if (!v?.querySelector) return null;
  const parents = new Set([...v.querySelectorAll('[data-ov-panel]')].map(el => el.parentElement)); if (!parents.size) return null;
  // a part holding blocks (the two small columns) moves with the earliest of its blocks
  return (window.__ovHome = [...parents].map(p => ({ p, kids: [...p.children], groups: new Map([...p.children].filter(k => !k.dataset?.ovPanel && k.querySelector?.('[data-ov-panel]')).map(k => [k, [...k.querySelectorAll('[data-ov-panel]')].map(x => x.dataset.ovPanel)])) })));
}
function ovNarrow() { return typeof matchMedia === 'function' && matchMedia('(max-width:1100px)').matches; }
function applyOverviewOrder() {
  const home = ovHome(); if (!home) return; const order = ovOrder(), rank = el => order.indexOf(el.dataset.ovPanel), v = document.getElementById('view-overview');
  const flow = v.querySelector('.overview-grid > .content'), cols = v.querySelector('.overview-cols'), rail = v.querySelector('.overview-grid > .rail'), narrow = ovNarrow() && flow;
  if (narrow) {
    const blocks = [...v.querySelectorAll('[data-ov-panel]')].sort((a, b) => rank(a) - rank(b));
    for (const b of blocks) flow.appendChild(b); if (cols) cols.hidden = true; if (rail) rail.hidden = true;
  } else {
    for (const h of home) for (const k of h.kids) h.p.appendChild(k);
    for (const h of home) { const r = k => k.dataset?.ovPanel ? rank(k) : Math.min(...h.groups.get(k).map(x => order.indexOf(x))), mov = k => !!k.dataset?.ovPanel || h.groups.has(k), blocks = h.kids.filter(mov).sort((a, b) => r(a) - r(b)); let i = 0; for (const k of h.kids) h.p.appendChild(mov(k) ? blocks[i++] : k); }
    if (cols) cols.hidden = false; if (rail) rail.hidden = false;
  }
  v.classList.toggle('ov-flow', !!narrow);
}
function ovPrefsRender(box) {
  box = box || document.getElementById('prefOverviewPanels'); if (!box) return; const hidden = new Set(overviewHidden()), names = Object.fromEntries(overviewPanels()), order = ovOrder();
  box.innerHTML = order.map((k, i) => `<div class="ov-pref-row"><label><input type="checkbox" data-ov-pref="${k}" ${hidden.has(k) ? '' : 'checked'}> ${esc(names[k])}</label><span><button type="button" class="ghost" data-ov-move="${k}" data-dir="-1" aria-label="上移" ${i ? '' : 'disabled'}>↑</button><button type="button" class="ghost" data-ov-move="${k}" data-dir="1" aria-label="下移" ${i < order.length - 1 ? '' : 'disabled'}>↓</button></span></div>`).join('')
    + `<p class="hint">電腦版分左右欄，區塊會在自己那一欄裡照這個順序排列；手機照這個順序由上到下排列。</p><button type="button" class="ghost" data-ov-reset>還原預設順序</button>`;
}
document.addEventListener('change', e => {
  const cb = e.target?.closest?.('[data-ov-pref]'); if (!cb) return; const set = new Set(overviewHidden()); if (cb.checked) set.delete(cb.dataset.ovPref); else set.add(cb.dataset.ovPref); setPref('hiddenPanels', [...set]);
});
document.addEventListener('click', e => {
  const b = e.target.closest?.('[data-ov-move]'); if (b) { setPref('ovOrder', ovMove(ovOrder(), b.dataset.ovMove, Number(b.dataset.dir))); applyOverviewOrder(); ovPrefsRender(); return; }
  if (e.target.closest?.('[data-ov-reset]')) { setPref('ovOrder', []); applyOverviewOrder(); ovPrefsRender(); }
});
if (typeof matchMedia === 'function') { try { matchMedia('(max-width:1100px)').addEventListener('change', () => applyOverviewOrder()); } catch { } }
