// 帳小簿 V26.110 — 進階設定改成 MOZE 的列表樣式：每列「名稱……值」，點了用滾輪選擇器（區間：每／數字／單位），
// 日期用日期選擇器，勾選項改成開關。底下仍是原本的表單欄位，邏輯不變。
// Bundled after js/date-pick.js. Function declarations / var only.

// ---- 滾輪選擇器 ----
// cols: [{ opts: [[value, label]], val }]; multi: { opts, vals } for a multi-select list instead.
function wpSt() { return window.__wp || (window.__wp = {}); }
function wpOpen(o) {
  const s = window.__wp = { ...o }; const el = sheetEl('wpBg'); el.className = 'dp-bg'; el.hidden = false;
  const body = o.multi ? `<div class="wp-multi">${o.multi.opts.map(([v, l]) => `<button type="button" data-wp-tog="${esc(v)}" class="${o.multi.vals.includes(String(v)) ? 'on' : ''}">${esc(l)}<i>✓</i></button>`).join('')}</div>`
    : `<div class="wp-cols" style="grid-template-columns:repeat(${o.cols.length},1fr)">${o.cols.map((c, i) => `<div class="wp-col" data-wp-col="${i}">${c.opts.map(([v, l], j) => `<button type="button" class="wp-opt" data-wp-i="${j}">${esc(l)}</button>`).join('')}</div>`).join('')}<i class="wp-band"></i></div>`;
  el.innerHTML = `<div class="dp-card wp-card" role="dialog" aria-label="${esc(o.title)}"><div class="dp-top wp-top"><span></span><b>${esc(o.title)}</b><span></span></div>${body}<div class="dp-act"><button type="button" data-wp-cancel>取消</button><button type="button" data-wp-ok>確定</button></div></div>`;
  if (!o.multi) el.querySelectorAll('.wp-col').forEach((col, i) => { const k = Math.max(0, o.cols[i].opts.findIndex(([v]) => String(v) === String(o.cols[i].val))); col.scrollTop = k * 44; wpMark(col); col.addEventListener('scroll', () => wpMark(col), { passive: true }); });
}
function wpIndex(col) { return Math.max(0, Math.min(col.children.length - 1, Math.round(col.scrollTop / 44))); }
function wpMark(col) { const k = wpIndex(col); [...col.children].forEach((b, j) => b.classList.toggle('on', j === k)); }
function wpClose() { const el = document.getElementById('wpBg'); if (el) el.hidden = true; }
document.addEventListener('click', e => {
  const c = s => e.target.closest?.(s); if (!c('#wpBg')) return; const s = wpSt(), el = document.getElementById('wpBg'); let b;
  if (e.target === el || c('[data-wp-cancel]')) { wpClose(); return; }
  if ((b = c('[data-wp-tog]'))) { b.classList.toggle('on'); return; }
  if ((b = c('.wp-opt'))) { const col = b.parentElement; col.scrollTop = Number(b.dataset.wpI) * 44; wpMark(col); return; }
  if (c('[data-wp-ok]')) { const vals = s.multi ? [...el.querySelectorAll('[data-wp-tog].on')].map(x => x.dataset.wpTog) : [...el.querySelectorAll('.wp-col')].map((col, i) => s.cols[i].opts[wpIndex(col)][0]); wpClose(); s.onOk?.(vals); }
});

// ---- 進階設定列 ----
function advFire(i) { i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }
function advNumRange(n) { return n === 'instCount' ? [2, 60] : n === 'instGrace' ? [0, 60] : n === 'rcEndCount' ? [1, 360] : [1, 360]; }
function advNumText(n, v) { return n === 'instCount' || n === 'instGrace' ? `${v} 期` : n === 'rcEndCount' ? `${v} 次` : `第 ${v} 期`; }
function advWheelNums() { return ['rcStartNo', 'instStart', 'instCount', 'instGrace']; }
// Kind of an advanced-settings row, from what it contains.
function advKind(L) {
  if (L.querySelector('#rcDayText')) return 'rcday'; if (L.querySelector('.adv-inline')) return 'interval'; if (L.querySelector('select[name=rcEndType]')) return 'endtype';
  if (L.classList.contains('check') && L.querySelector('input[type=checkbox]')) return 'switch';
  const x = L.querySelector('select, input, b'); if (!x) return 'text';
  if (x.tagName === 'SELECT') return 'select'; if (x.tagName === 'B') return 'text'; if (x.type === 'date') return 'date'; if (advWheelNums().includes(x.name)) return 'num'; return 'input';
}
function advDecorate() {
  for (const L of document.querySelectorAll('#advSheet label')) {
    if (L.dataset.advKind || L.closest('.split-section, .rc-days')) continue; const k = advKind(L); L.dataset.advKind = k; L.classList.add('adv-row');
    if (!['switch', 'text', 'input'].includes(k)) L.insertAdjacentHTML('beforeend', '<span class="adv-val"></span>');
  }
}
function advValText(L) {
  const k = L.dataset.advKind, el = txForm?.elements; if (!el) return '';
  if (k === 'select') { const s = L.querySelector('select'); return s.selectedOptions[0]?.text.replace(/（.*?）/, '') || ''; }
  if (k === 'date') { const i = L.querySelector('input'); return i.value ? fmtDate(i.value) : '未設定'; }
  if (k === 'num') { const i = L.querySelector('input'); return advNumText(i.name, i.value || i.min || 1); }
  if (k === 'interval') { const n = Math.max(1, Number(L.querySelector('input').value) || 1), s = L.querySelector('select'), u = s ? s.selectedOptions[0]?.text : '月'; return `每${n > 1 ? ` ${n} ` : ''}${u}`; }
  if (k === 'endtype') { const t = el.rcEndType.value; return t === 'count' ? `${el.rcEndCount.value || 1} 次` : t === 'date' ? '指定結束日期' : '無限期'; }
  if (k === 'rcday') { const f = el.rcFreq.value, d = el.date.value || isoDate(new Date()); if (f === 'week') { const w = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'], l = [...txForm.querySelectorAll('[name=rcDays]:checked')].map(x => w[x.value]); return l.length ? l.join(', ') : w[new Date(d + 'T00:00:00').getDay()]; } if (f === 'month') return `${Number(d.slice(8))} 號`; if (f === 'year') return `${Number(d.slice(5, 7))} 月 ${Number(d.slice(8))} 日`; return '每天'; }
  return '';
}
function advRowsSync() {
  advDecorate(); for (const L of document.querySelectorAll('#advSheet label.adv-row')) { const v = L.querySelector(':scope > .adv-val'); if (v) v.textContent = advValText(L); }
  const cl = document.querySelector('#advSheet label[data-adv-kind=endtype]'); if (cl && cl.firstChild?.nodeType === 3) cl.firstChild.textContent = document.getElementById('rcCountLabel')?.textContent || '次數';
}
function advRowOpen(L) {
  const k = L.dataset.advKind, el = txForm.elements, title = (L.querySelector('.entry-lbl')?.textContent || [...L.childNodes].find(n => n.nodeType === 3 && n.textContent.trim())?.textContent || L.querySelector('span')?.textContent || '').trim();
  if (k === 'select') { const s = L.querySelector('select'), opts = [...s.options].filter(o => !o.hidden && !o.disabled).map(o => [o.value, o.text]); wpOpen({ title, cols: [{ opts, val: s.value }], onOk: ([v]) => { s.value = v; advFire(s); advRowsSync(); } }); return; }
  if (k === 'date') { dpOpen(L.querySelector('input')); return; }
  if (k === 'num') { const i = L.querySelector('input'), [lo, hi] = advNumRange(i.name), opts = []; for (let n = lo; n <= hi; n++) opts.push([n, advNumText(i.name, n)]); wpOpen({ title, cols: [{ opts, val: i.value || lo }], onOk: ([v]) => { i.value = v; advFire(i); advRowsSync(); } }); return; }
  if (k === 'interval') { const i = L.querySelector('input'), s = L.querySelector('select'), hi = Number(i.max) || 30, nums = []; for (let n = 1; n <= hi; n++) nums.push([n, String(n)]); const cols = [{ opts: [['', '每']], val: '' }, { opts: nums, val: i.value || 1 }]; if (s) cols.push({ opts: [...s.options].map(o => [o.value, o.text]), val: s.value }); else cols.push({ opts: [['m', '月']], val: 'm' });
    wpOpen({ title, cols, onOk: ([, n, u]) => { i.value = n; if (s) s.value = u; advFire(i); if (s) advFire(s); advRowsSync(); } }); return; }
  if (k === 'endtype') { const opts = [['never', '無限期'], ['date', '指定結束日期']]; for (let n = 1; n <= 360; n++) opts.push(['c' + n, `${n} 次`]); const t = el.rcEndType.value;
    wpOpen({ title, cols: [{ opts, val: t === 'count' ? 'c' + (el.rcEndCount.value || 1) : t }], onOk: ([v]) => { if (v[0] === 'c') { el.rcEndType.value = 'count'; el.rcEndCount.value = v.slice(1); advFire(el.rcEndCount); } else el.rcEndType.value = v; advFire(el.rcEndType); advRowsSync(); if (v === 'date' && !el.rcEndDate.value) dpOpen(el.rcEndDate); } }); return; }
  if (k === 'rcday') { const f = el.rcFreq.value, d = el.date.value || isoDate(new Date());
    if (f === 'week') { const w = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'], boxes = [...txForm.querySelectorAll('[name=rcDays]')], cur = boxes.filter(x => x.checked).map(x => x.value); wpOpen({ title: '指定日期', multi: { opts: w.map((x, j) => [String(j), x]), vals: cur.length ? cur : [String(new Date(d + 'T00:00:00').getDay())] }, onOk: vals => { for (const x of boxes) x.checked = vals.includes(x.value); advFire(boxes[0]); advRowsSync(); } }); return; }
    if (f === 'month') { const opts = []; for (let n = 1; n <= 31; n++) opts.push([n, `${n} 號`]); wpOpen({ title: '指定日期', cols: [{ opts, val: Number(d.slice(8)) }], onOk: ([n]) => { const [y, m] = d.split('-').map(Number), last = new Date(y, m, 0).getDate(); el.date.value = `${d.slice(0, 8)}${String(Math.min(n, last)).padStart(2, '0')}`; advFire(el.date); advRowsSync(); toast(`第一筆日期改為 ${fmtDate(el.date.value)}`); } }); return; }
    if (f === 'year') dpOpen(el.date); }
}
document.addEventListener('click', e => {
  const L = e.target.closest?.('#advSheet label.adv-row'); if (!L) return; const k = L.dataset.advKind;
  if (k === 'switch' || k === 'text' || k === 'input') return; if (e.target.matches?.('input:not([type=date])')) return;
  e.preventDefault(); e.stopImmediatePropagation(); advRowOpen(L);
}, true);
document.addEventListener('change', e => { if (e.target?.closest?.('#txForm')) setTimeout(advRowsSync, 0); });
document.addEventListener('input', e => { if (e.target?.closest?.('#txForm')) setTimeout(advRowsSync, 0); });
document.addEventListener('click', e => { if (e.target.closest?.('[data-adv-tab], #efEvent, [data-ef=event], .ef-pill')) setTimeout(advRowsSync, 30); });
(function advWatch() { const s = document.getElementById('advSheet'); if (!s || typeof MutationObserver !== 'function') return; advDecorate(); new MutationObserver(() => { if (!s.hidden) advRowsSync(); }).observe(s, { attributes: true, attributeFilter: ['hidden'] }); })();
