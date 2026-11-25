// 帳小簿 V26.63 — 信用卡「對帳模式」: tick off each statement line against the bank's bill.
// Right swipe (or ✓) = confirmed, left swipe (or ⏭) = 延後入帳 to the first day of the next statement (undoable from the next one).
// Bundled after js/yearly.js (tools/build-bundle.js). Function declarations / var only (hoisted).
// Stored on the transaction itself (syncs with it): `recon: true` when confirmed, `postDate` = the posting date when it differs from the purchase date.

function reconSt() { return window.__recon || (window.__recon = { card: null, period: null, offset: 0, order: 'asc', q: '', menu: false, note: '' }); }
function reconNextStart(period) { const d = new Date(period.end + 'T00:00:00'); d.setDate(d.getDate() + 1); return isoDate(d); }
// Lines of the statement: the card's expenses (not payments) dated inside the period, oldest first by default.
function reconItems(card, period, order) {
  const list = cardSpendTxs(card, period.start, period.end);
  const key = t => `${t.date} ${t.time || '00:00'}`;
  list.sort((a, b) => key(a).localeCompare(key(b)));
  return order === 'desc' ? list.reverse() : list;
}
function reconStats(items) {
  const done = items.filter(t => t.recon);
  const sum = cardSpendSum;
  return { count: items.length, doneCount: done.length, total: sum(items), doneAmount: sum(done), remaining: sum(items) - sum(done) };
}
// One card, or every card of a bank (combined statement); each card uses its own period for the same offset.
function reconCards(s) { return (s.cards || [s.card]).map(i => acct(i)).filter(c => c && c.id); }
function reconAll(s) { return reconCards(s).flatMap(c => reconItems(c, cardPeriod(c, new Date(), s.offset), s.order)); }
function openReconBank(cards, offset) {
  if (!cards.length) return;
  const s = reconSt(); s.card = cards[0].id; s.cards = cards.map(c => c.id); s.offset = offset; s.q = ''; s.menu = false; s.note = '';
  const el = reconOverlay(); el.hidden = false; renderReconMode();
}
function reconListHTML(s, shown) {
  if (!s.cards) return shown.map(t => reconRowHTML(t, s.period)).join('');
  return reconCards(s).map(c => { const l = shown.filter(t => String(t.account) === String(c.id)), st = reconStats(l); return l.length ? `<div class="recon-group"><b>${esc(c.name)}</b><span>${st.doneCount} / ${st.count} · ${acctMoney(st.total, c)}</span></div>` + l.map(t => reconRowHTML(t, s.period)).join('') : ''; }).join('');
}
function reconMark(t, on) { if (on) t.recon = true; else delete t.recon; return t; }
// Posts the line on the first day of the next statement; the purchase date (and reports / budgets) stay as they are.
function reconPostpone(t, period) { t.postDate = reconNextStart(period); delete t.recon; return t; }
function reconRestore(t) { delete t.postDate; delete t.recon; return t; }
// V26.63-65 moved `date` itself and kept the purchase date in `origDate`; turn those into date + postDate.
function reconMigrate(st) {
  let n = 0;
  for (const t of (st?.transactions || [])) if (t && t.origDate) { t.postDate = t.date; t.date = t.origDate; delete t.origDate; n++; }
  return n;
}
function reconClear(items) { let n = 0; for (const t of items) if (t.recon) { delete t.recon; n++; } return n; }
function reconMatch(t, q) {
  q = String(q || '').trim().toLowerCase(); if (!q) return true;
  const hay = [t.name, t.merchant, t.note, t.person, String(t.amount), String(Math.round(t.amount)), t.date, ...(Array.isArray(t.tags) ? t.tags : [])].join(' ').toLowerCase();
  return hay.includes(q);
}
function reconWeekday(date) { return '日一二三四五六'[new Date(date + 'T00:00:00').getDay()]; }

function reconRowHTML(t, period) {
  const c = typeof cat === 'function' ? cat(t.category) : { icon: '🏷️', name: '' }, a = typeof acct === 'function' ? acct(t.account) : { name: '' };
  const posted = !!t.postDate;
  return `<div class="recon-row${t.recon ? ' done' : ''}" data-recon-id="${esc(t.id)}">
  <div class="recon-swipe-bg"><span class="ok">已確認</span><span class="later">${posted ? '改回原期' : '延後入帳'}</span></div>
  <div class="recon-body">
    <div class="recon-date">${t.date.replace(/-/g, '/')} 週${reconWeekday(t.date)}${t.time ? ' ' + esc(t.time) : ''}${posted ? ` <em>延後入帳 ${esc(t.postDate)}</em>` : ''}</div>
    <div class="recon-main"><div class="recon-icon">${esc(c.icon || '🏷️')}</div>
      <div class="recon-text"><b>${esc(t.name)}</b><small>${esc(t.merchant || t.note || '')}</small></div>
      <div class="recon-amt">${cardLineAmount(t) < 0 ? '−' : ''}${money(Math.abs(t.amount))}</div></div>
    <div class="recon-foot"><span class="recon-chip">${esc(c.name || '')}</span><span class="recon-chip">${esc(a.name || '')}</span>
      <button type="button" class="recon-btn" data-recon-ok aria-label="確認">✓</button><button type="button" class="recon-btn" data-recon-later aria-label="${posted ? '改回原期' : '延後入帳'}">${posted ? '↺' : '⏭'}</button></div>
  </div></div>`;
}
function reconOverlay() {
  let el = document.getElementById('reconBg');
  if (!el) { el = document.createElement('div'); el.id = 'reconBg'; el.className = 'recon-bg'; el.hidden = true; document.body.appendChild(el); }
  return el;
}
function renderReconMode() {
  const s = reconSt(), el = document.getElementById('reconBg'); if (!el || el.hidden || !s.card) return;
  const card = acct(s.card); if (!card || !card.id) { el.hidden = true; return; }
  s.period = cardPeriod(card, new Date(), s.offset);
  const items = reconAll(s), shown = items.filter(t => reconMatch(t, s.q)), st = reconStats(items);
  const pct = st.count ? Math.round(st.doneCount / st.count * 100) : 0;
  const keepQ = el.querySelector('#reconSearch'), had = keepQ && document.activeElement === keepQ;
  el.innerHTML = `<div class="recon-sheet">
  <div class="recon-head"><button type="button" class="icon" data-recon-close aria-label="關閉">×</button><div class="recon-title"><b>對帳模式</b><small>${s.cards ? `${esc(card.bank || '')} · ${s.cards.length} 張卡` : esc(card.name)}</small></div><button type="button" class="icon" data-recon-menu aria-label="選單">⋯</button></div>
  ${s.menu ? `<div class="recon-menu"><button type="button" data-recon-act="add">新增記錄</button><button type="button" data-recon-act="pay">新增繳款</button><button type="button" data-recon-act="clear">取消全部選取</button><button type="button" data-recon-act="order">變更日期順序（目前：${s.order === 'asc' ? '由遠到近' : '由近到遠'}）</button></div>` : ''}
  <div class="recon-period"><button type="button" data-recon-prev aria-label="上一期">‹</button><strong>${s.period.start} ～ ${s.period.end}</strong><button type="button" data-recon-next aria-label="下一期" ${s.offset >= 0 ? 'disabled' : ''}>›</button></div>
  <div class="recon-search"><input id="reconSearch" type="search" placeholder="搜尋（名稱、商家、金額…）" value="${esc(s.q)}" autocomplete="off"></div>
  ${s.note ? `<div class="recon-note">${esc(s.note)}</div>` : ''}
  <div class="recon-list">${shown.length ? reconListHTML(s, shown) : `<div class="recon-empty">${items.length ? '沒有符合的記錄' : '這一期沒有消費記錄'}</div>`}</div>
  <div class="recon-bar"><div class="recon-progress"><i style="width:${pct}%"></i></div><div class="recon-bar-row"><span>對帳筆數 <b>${st.doneCount} / ${st.count}</b></span><span>對帳金額 <b>${money(st.doneAmount)}</b></span></div><div class="recon-bar-row sub"><span>本期合計 ${money(st.total)}</span><span>${st.remaining > 0 ? `尚未對帳 ${money(st.remaining)}` : (st.count ? '全部對完 ✓' : '')}</span></div></div>
</div>`;
  const inp = el.querySelector('#reconSearch'); if (had && inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
}
function openReconMode(cardId) {
  const card = acct(cardId); if (!card || card.type !== 'card') return;
  const s = reconSt(); s.card = card.id; s.cards = null; s.offset = creditStatementOffset; s.period = cardPeriod(card, new Date(), s.offset); s.q = ''; s.menu = false; s.note = '';
  const el = reconOverlay(); el.hidden = false; renderReconMode();
}
function closeReconMode() { const el = document.getElementById('reconBg'); if (el) el.hidden = true; reconSt().menu = false; if (typeof render === 'function') render(); }
async function reconApply(id, action) {
  const s = reconSt(), t = (state.transactions || []).find(x => String(x.id) === String(id)); if (!t) return;
  if (action === 'ok') reconMark(t, !t.recon);
  else if (t.postDate) { reconRestore(t); s.note = `已改回消費日 ${t.date} 入帳`; }
  else { reconPostpone(t, cardPeriod(acct(t.account), new Date(), s.offset)); s.note = `已延後入帳到 ${t.postDate}（可在下一期的對帳模式改回）`; }
  renderReconMode(); await save();
  if (action !== 'ok' && typeof render === 'function') render();
}
document.addEventListener('click', async e => {
  const open = e.target.closest?.('[data-recon-open]'); if (open) { openReconMode(open.dataset.reconOpen); return; }
  const el = document.getElementById('reconBg'); if (!el || el.hidden || !el.contains(e.target)) return;
  const s = reconSt();
  if (e.target.closest('[data-recon-close]')) { closeReconMode(); return; }
  const pn = e.target.closest('[data-recon-prev],[data-recon-next]');
  if (pn) { if (pn.hasAttribute('data-recon-next')) { if (s.offset >= 0) return; s.offset++; } else s.offset--; s.q = ''; s.note = ''; s.menu = false; renderReconMode(); return; }
  if (e.target.closest('[data-recon-menu]')) { s.menu = !s.menu; renderReconMode(); return; }
  const act = e.target.closest('[data-recon-act]');
  if (act) {
    s.menu = false; const card = acct(s.card), a = act.dataset.reconAct;
    if (a === 'order') s.order = s.order === 'asc' ? 'desc' : 'asc';
    else if (a === 'clear') { const n = reconClear(reconAll(s)); s.note = n ? `已取消 ${n} 筆的確認` : ''; renderReconMode(); await save(); return; }
    else if (a === 'add') {
      const today = isoDate(new Date()), d = today < s.period.start ? s.period.start : today > s.period.end ? s.period.end : today;
      openTx('expense'); if (formAccount) formAccount.value = card.id; if (txForm?.elements?.date) txForm.elements.date.value = d; setTimeout(() => window.refreshEntryChoices?.(), 10);
    } else if (a === 'pay' && s.cards) { el.hidden = true; bankSt().offset = s.offset; render(); document.getElementById('bankPayAmount')?.scrollIntoView({ block: 'center' }); return; } else if (a === 'pay') { el.hidden = true; creditStatementOffset = s.offset; if (typeof render === 'function') render(); setTimeout(() => { const b = document.querySelector('[data-inline-payment]'); if (b && !b.disabled) b.click(); else alert('這一期沒有需要繳的款項，或沒有可扣款的帳戶。'); }, 50); return; }
    renderReconMode(); return;
  }
  const row = e.target.closest('.recon-row');
  if (row && e.target.closest('[data-recon-ok]')) { reconApply(row.dataset.reconId, 'ok'); return; }
  if (row && e.target.closest('[data-recon-later]')) { reconApply(row.dataset.reconId, 'later'); }
});
document.addEventListener('input', e => { if (e.target?.id === 'reconSearch') { reconSt().q = e.target.value; renderReconMode(); } });
document.addEventListener('keydown', e => { const el = document.getElementById('reconBg'); if (e.key === 'Escape' && el && !el.hidden && !document.getElementById('modalBg')?.classList.contains('open')) closeReconMode(); });
// swipe: right = confirm, left = postpone / restore
(function () {
  let g = null;
  document.addEventListener('pointerdown', e => {
    const body = e.target.closest?.('.recon-body'); if (!body || e.target.closest('button')) return;
    g = { body, x: e.clientX, y: e.clientY, dx: 0, lock: false, id: body.closest('.recon-row').dataset.reconId };
  });
  document.addEventListener('pointermove', e => {
    if (!g) return; const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.lock) { if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { g = null; return; } if (Math.abs(dx) > 10) g.lock = true; else return; }
    g.dx = Math.max(-140, Math.min(140, dx)); g.body.style.transition = 'none'; g.body.style.transform = `translateX(${g.dx}px)`;
    g.body.closest('.recon-row').dataset.swipe = g.dx > 0 ? 'ok' : 'later';
  });
  function end() {
    if (!g) return; const { body, dx, id } = g; g = null;
    body.style.transition = 'transform .15s'; body.style.transform = ''; delete body.closest('.recon-row').dataset.swipe;
    if (dx > 80) reconApply(id, 'ok'); else if (dx < -80) reconApply(id, 'later');
  }
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
})();
