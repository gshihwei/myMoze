// 帳小簿 V26.109 — 日期選擇器（像 MOZE：月曆、年月切換、今天、鍵盤輸入、取消／確定）.
// Bundled after js/doc-gaps.js. Function declarations / var only.
// Used for every date field of the entry form (they are made read-only so the system picker does not open).

function dpSt() { return window.__dp || (window.__dp = { input: null, sel: '', view: '', mode: 'day', yr: 0 }); }
// 42 cells (6 weeks) for the month `ym` (YYYY-MM), weeks starting on `ws` (0 = 週日).
function dpCells(ym, ws) {
  const [y, m] = ym.split('-').map(Number), first = new Date(y, m - 1, 1), back = (first.getDay() - (ws || 0) + 7) % 7, out = [];
  for (let i = 0; i < 42; i++) { const d = new Date(y, m - 1, 1 - back + i), iso = isoDate(d); out.push({ iso, day: d.getDate(), wd: d.getDay(), out: iso.slice(0, 7) !== ym }); }
  return out;
}
// Typed date: 2024-12-07, 2024/12/7, 20241207, 12/7 (this year) → ISO or ''.
function dpParse(s, base) {
  const t = String(s || '').trim(); let y, m, d, r;
  if ((r = t.match(/^(\d{4})[-/.年\s]?(\d{1,2})[-/.月\s]?(\d{1,2})日?$/))) [, y, m, d] = r.map(Number);
  else if ((r = t.match(/^(\d{1,2})[-/.月](\d{1,2})日?$/))) { y = Number(String(base || isoDate(new Date())).slice(0, 4)); m = Number(r[1]); d = Number(r[2]); }
  else return '';
  const x = new Date(y, m - 1, d); return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d ? isoDate(x) : '';
}
function dpInRange(iso, inp) { return !((inp?.min && iso < inp.min) || (inp?.max && iso > inp.max)); }
function dpRender() {
  const s = dpSt(), el = sheetEl('dpBg'); el.className = 'dp-bg'; if (el.hidden) return; const today = isoDate(new Date()), [vy, vm] = s.view.split('-').map(Number), ws = Number(prefs().weekStart || 0);
  const wd = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'], heads = [...Array(7)].map((_, i) => wd[(i + ws) % 7]);
  let body;
  if (s.mode === 'kb') body = `<div class="dp-kb"><input id="dpKb" inputmode="numeric" autocomplete="off" value="${esc(s.sel)}" placeholder="例如 2024-12-07、20241207、12/7"><p class="hint">輸入日期後按「確定」。</p></div>`;
  else if (s.mode === 'ym') body = `<div class="dp-nav"><button type="button" class="dp-arrow" data-dp-yr="-1" aria-label="前一年">‹</button><button type="button" class="dp-title" data-dp-ym>${s.yr} 年 ⇕</button><button type="button" class="dp-arrow" data-dp-yr="1" aria-label="下一年">›</button></div><div class="dp-months">${[...Array(12)].map((_, i) => `<button type="button" data-dp-month="${i + 1}" class="${s.yr === vy && i + 1 === vm ? 'on' : ''}">${i + 1} 月</button>`).join('')}</div>`;
  else body = `<div class="dp-nav"><button type="button" class="dp-arrow" data-dp-mv="-1" aria-label="上個月">‹</button><button type="button" class="dp-title" data-dp-ym>${vy} 年 ${vm} 月 ⇕</button><button type="button" class="dp-arrow" data-dp-mv="1" aria-label="下個月">›</button></div><div class="dp-grid">${heads.map(h => `<span class="dp-h">${h}</span>`).join('')}${dpCells(s.view, ws).map(c => { const cls = ['dp-d', c.out && 'out', (c.wd === 0 || holidayName(c.iso)) && 'sun', c.wd === 6 && !holidayName(c.iso) && 'sat', c.iso === s.sel && 'sel', c.iso === today && 'dp-today'].filter(Boolean).join(' '), ok = dpInRange(c.iso, s.input); return `<button type="button" class="${cls}" data-dp-day="${c.iso}"${ok ? '' : ' disabled'}${holidayName(c.iso) ? ` title="${esc(holidayName(c.iso))}"` : ''}>${c.day === 1 ? `${Number(c.iso.slice(5, 7))}月` : String(c.day).padStart(2, '0')}</button>`; }).join('')}</div>`;
  el.innerHTML = `<div class="dp-card" role="dialog" aria-label="日期"><div class="dp-top"><button type="button" class="dp-icon" data-dp-kb aria-label="${s.mode === 'kb' ? '月曆' : '鍵盤輸入'}">${s.mode === 'kb' ? '📅' : '⌨'}</button><b>日期</b><button type="button" class="dp-link" data-dp-today>今天</button></div>${body}<div class="dp-act"><button type="button" data-dp-cancel>取消</button><button type="button" data-dp-ok>確定</button></div></div>`;
  if (s.mode === 'kb') setTimeout(() => document.getElementById('dpKb')?.focus(), 30);
}
function dpOpen(input) {
  const s = dpSt(), v = /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? input.value : isoDate(new Date()); Object.assign(s, { input, sel: v, view: v.slice(0, 7), mode: 'day', yr: Number(v.slice(0, 4)) });
  sheetEl('dpBg').hidden = false; dpRender();
}
function dpClose() { const el = document.getElementById('dpBg'); if (el) el.hidden = true; }
function dpCommit() {
  const s = dpSt(), i = s.input; let v = s.sel;
  if (s.mode === 'kb') { v = dpParse(document.getElementById('dpKb')?.value, s.sel); if (!v) { alert('日期格式不正確'); return; } }
  if (!dpInRange(v, i)) { alert(`請選擇 ${i.min || '…'} ～ ${i.max || '…'} 之間的日期`); return; }
  dpClose(); if (!i) return; i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
}
function dpMove(n) { const s = dpSt(), [y, m] = s.view.split('-').map(Number), d = new Date(y, m - 1 + n, 1); s.view = isoDate(d).slice(0, 7); dpRender(); }
// Entry-form date fields: read-only (no system picker), opened with our picker.
function dpBind(root) { for (const i of (root || document).querySelectorAll('#modalBg input[type=date]')) { i.readOnly = true; i.dataset.dp = '1'; } }
dpBind();
document.addEventListener('click', e => {
  const c = s => e.target.closest?.(s); let b;
  const inp = e.target.matches?.('input[type=date][data-dp]') ? e.target : c('.ef-pick-native')?.querySelector('input[type=date]');
  if (inp) { e.preventDefault(); e.stopImmediatePropagation(); dpBind(); dpOpen(inp); return; }
  if (!c('#dpBg')) return; const s = dpSt();
  if (e.target.id === 'dpBg' || c('[data-dp-cancel]')) { dpClose(); return; }
  if (c('[data-dp-ok]')) { dpCommit(); return; }
  if (c('[data-dp-today]')) { s.sel = isoDate(new Date()); s.view = s.sel.slice(0, 7); s.mode = 'day'; dpRender(); return; }
  if (c('[data-dp-kb]')) { s.mode = s.mode === 'kb' ? 'day' : 'kb'; dpRender(); return; }
  if (c('[data-dp-ym]')) { s.mode = s.mode === 'ym' ? 'day' : 'ym'; s.yr = Number(s.view.slice(0, 4)); dpRender(); return; }
  if ((b = c('[data-dp-yr]'))) { s.yr += Number(b.dataset.dpYr); dpRender(); return; }
  if ((b = c('[data-dp-month]'))) { s.view = `${s.yr}-${String(b.dataset.dpMonth).padStart(2, '0')}`; s.mode = 'day'; dpRender(); return; }
  if ((b = c('[data-dp-mv]'))) { dpMove(Number(b.dataset.dpMv)); return; }
  if ((b = c('[data-dp-day]'))) { s.sel = b.dataset.dpDay; if (s.sel.slice(0, 7) !== s.view) s.view = s.sel.slice(0, 7); dpRender(); }
}, true);
document.addEventListener('keydown', e => {
  const el = document.getElementById('dpBg'); if (!el || el.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); dpClose(); }
  else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); dpCommit(); }
  else if (dpSt().mode === 'day' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); const s = dpSt(), n = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key], v = addDaysIso(s.sel, n); if (dpInRange(v, s.input)) { s.sel = v; s.view = v.slice(0, 7); dpRender(); } }
}, true);
