// 帳小簿 V26.96 — 手勢與快捷選單：長按＋、範本快捷、下拉完成記帳、通知中心滑動.
// Bundled after js/drafts.js. Function declarations / var only.

// Direction of a swipe, or '' when it is too short / too diagonal.
function swipeDir(dx, dy, min) { const a = Math.abs(dx), b = Math.abs(dy), m = min || 60; return a >= m && a > b * 1.6 ? (dx > 0 ? 'right' : 'left') : b >= m && b > a * 1.6 ? (dy > 0 ? 'down' : 'up') : ''; }
// Pulling down saves only from the top of the form, straight down, and far enough.
function pullSaves(startTop, dx, dy) { return startTop <= 0 && dy >= 140 && Math.abs(dx) < 60; }
function quickMenuHTML() {
  const modes = modeList(), cur = prefs().modeId || '', n = draftDb().list.length;
  return `<div class="recon-sheet qm">${sheetHead('快速記帳')}<div class="recon-list notice-list"><div class="qm-grid">${[['say', '🎤', '一句話／語音'], ['tpl', '★', '範本快捷'], ['paste', '💬', `通知草稿${n ? ` ${n}` : ''}`], ['expense', '＋', '記支出'], ['transfer', '⇄', '轉帳'], ['withdraw', '⬆', '提款']].map(([k, i, l]) => `<button type="button" class="qm-item" data-qm="${k}"><span>${i}</span>${l}</button>`).join('')}</div>${modes.length ? `<h3 class="notice-h">記帳模式</h3>${[{ id: '', name: '一般模式' }, ...modes].map(m => `<button type="button" class="ef-row${String(m.id) === String(cur) ? ' on' : ''}" data-qm-mode="${esc(m.id)}"><span class="ef-name">${esc(m.name)}</span><b>${String(m.id) === String(cur) ? '✓' : ''}</b></button>`).join('')}` : ''}</div></div>`;
}
function tplQuickHTML(q) {
  const s = String(q || '').toLowerCase(), l = tplList().filter(t => !s || t.name.toLowerCase().includes(s));
  return `<div class="recon-sheet">${sheetHead('範本快捷')}<div class="recon-search"><input id="tplQ" type="search" placeholder="搜尋範本" value="${esc(q || '')}"></div><div class="recon-list notice-list">${l.map(t => `<div class="notice-row"><button type="button" class="ef-row" data-tplq="${esc(t.id)}"><span class="entry-acct-ico">${catIconHTML(cat(t.data.category))}</span><span class="ef-name">${esc(t.name)}<small class="hint"> ${acctName(acct(t.data.account))}</small></span><b>${t.data.amount ? acctMoney(t.data.amount, acct(t.data.account)) : ''}</b></button><button type="button" class="secondary" data-tplq-save="${esc(t.id)}" aria-label="直接新增">✓</button></div>`).join('') || '<div class="recon-empty">沒有範本。記帳時按名稱旁的 ☆ 就能存成範本。</div>'}</div></div>`;
}
// A record straight from a template (today, now). Only simple expense / income / transfer templates with an amount.
function tplMake(x) {
  const d = x?.data; if (!d || !(Number(d.amount) > 0)) return { error: '這個範本沒有金額，請點名稱帶入後輸入。' }; if (d.kind !== 'expense' && d.kind !== 'income' && d.kind !== 'transfer') return { error: '這類範本請點名稱帶入。' };
  if (!(state.accounts || []).some(a => String(a.id) === String(d.account)) || (d.kind === 'transfer' && !(state.accounts || []).some(a => String(a.id) === String(d.toAccount)))) return { error: '範本的帳戶已不存在，請點名稱帶入後重選。' };
  const t = { ...JSON.parse(JSON.stringify(d)), id: id(), date: isoDate(new Date()), time: nowTime() }; state.transactions.push(t); adjust(t, 1); return { tx: t };
}
function openQuickMenu() { const el = sheetEl('qmBg'); el.hidden = false; el.innerHTML = quickMenuHTML(); }
document.addEventListener('pointerdown', e => {
  const b = e.target.closest?.('#mobileAdd,#quickAdd'); if (!b) return; clearTimeout(window.__lpTimer); window.__lpFired = false; window.__lpXY = [e.clientX, e.clientY];
  window.__lpTimer = setTimeout(() => { window.__lpFired = true; navigator.vibrate?.(15); openQuickMenu(); }, 550);
});
document.addEventListener('pointermove', e => { const p = window.__lpXY; if (p && Math.hypot(e.clientX - p[0], e.clientY - p[1]) > 12) clearTimeout(window.__lpTimer); });
for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, () => { clearTimeout(window.__lpTimer); window.__lpXY = null; });
document.addEventListener('click', e => { if (window.__lpFired && e.target.closest?.('#mobileAdd,#quickAdd')) { e.stopPropagation(); e.preventDefault(); window.__lpFired = false; } }, true);
document.addEventListener('contextmenu', e => { if (e.target.closest?.('#mobileAdd,#quickAdd')) { e.preventDefault(); clearTimeout(window.__lpTimer); openQuickMenu(); } });
document.addEventListener('click', async e => {
  const c = s => e.target.closest?.(s), hide = i => { const x = document.getElementById(i); if (x) x.hidden = true; }; let b;
  if ((b = c('[data-qm]'))) { hide('qmBg'); const k = b.dataset.qm; if (k === 'say') sayOpen(''); else if (k === 'paste') openDrafts(); else if (k === 'tpl') { const el = sheetEl('tplBg'); el.hidden = false; el.innerHTML = tplQuickHTML(''); } else if (k === 'expense') window.openTx('expense'); else openTransfer({ preset: k === 'withdraw' ? '提款' : '轉帳' }); return; }
  if ((b = c('[data-qm-mode]'))) { setPref('modeId', b.dataset.qmMode); hide('qmBg'); toast(`記帳模式：${modeActive()?.name || '一般模式'}`); return; }
  if ((b = c('[data-tplq]'))) { const x = tplList().find(t => String(t.id) === b.dataset.tplq); hide('tplBg'); if (x) window.openTx(x.data.kind, { ...JSON.parse(JSON.stringify(x.data)), date: isoDate(new Date()), time: nowTime() }); return; }
  if ((b = c('[data-tplq-save]'))) { const r = tplMake(tplList().find(t => String(t.id) === b.dataset.tplqSave)); if (r.error) { alert(r.error); return; } await save(); render(); hide('tplBg'); toast(`已新增 ${r.tx.name} ${money(r.tx.amount)}`); }
});
document.addEventListener('input', e => { if (e.target?.id === 'tplQ') { const el = sheetEl('tplBg'), v = e.target.value; el.innerHTML = tplQuickHTML(v); const i = document.getElementById('tplQ'); i?.focus(); i?.setSelectionRange(v.length, v.length); } });
// ---- touch ----
document.addEventListener('touchstart', e => {
  const t = e.touches[0], sc = e.target.closest?.('.entry-scroll'), row = e.target.closest?.('#noticeBg .notice-row');
  window.__touch = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, sc, top: sc ? sc.scrollTop : 1, row, form: !!e.target.closest?.('input,select,textarea,.ef-strip,.amount-sug') } : null;
}, { passive: true });
document.addEventListener('touchmove', e => {
  const s = window.__touch; if (!s || e.touches.length !== 1) return; const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y;
  if (s.sc && !s.form) { const bar = document.getElementById('pullHint') || Object.assign(document.createElement('div'), { id: 'pullHint', className: 'pull-hint' }); if (s.top <= 0 && dy > 50 && Math.abs(dx) < 60) { bar.textContent = pullSaves(s.top, dx, dy) ? '放開完成記帳' : '再往下拉完成記帳'; s.sc.parentNode.insertBefore(bar, s.sc); } else bar.remove(); }
  if (s.row && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) s.row.style.transform = `translateX(${Math.max(-110, Math.min(110, dx))}px)`;
}, { passive: true });
document.addEventListener('touchend', e => {
  const s = window.__touch; window.__touch = null; if (!s) return; document.getElementById('pullHint')?.remove(); const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
  if (s.row) {
    s.row.style.transform = ''; const d = swipeDir(dx, dy, 70), q = x => s.row.querySelector(x); let b = null;
    if (d === 'left') b = q('[data-bill-pay],[data-finish-pending],[data-pending-confirm]'); else if (d === 'right') b = q('[data-bill-recon]');
    if (b) b.click(); return;
  }
  if (s.sc && !s.form && pullSaves(s.top, dx, dy) && document.getElementById('advSheet')?.hidden !== false) txForm.requestSubmit();
}, { passive: true });
