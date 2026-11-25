// 帳小簿 V26.71／72 — 通知中心 (全部／信用卡帳單／待完成交易／借還款追蹤／即將到來) 與全螢幕月曆.
// Bundled after js/tx-attach.js. Function declarations / var only.

function sheetEl(id) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement('div'); el.id = id; el.className = 'recon-bg'; el.hidden = true; document.body.appendChild(el); }
  return el;
}
function sheetHead(title, right) { return `<div class="recon-head"><button type="button" class="icon" data-sheet-close aria-label="關閉">×</button><div class="recon-title"><b>${title}</b></div>${right || '<span></span>'}</div>`; }

// ---- notification center ----
// Closed statements (last 3) that still owe money: { card, period, offset, owed, due, days, reconDone, key }.
function billNotices(today) { return withTxIndex(() => billNoticesRun(today)); }
function billNoticesRun(today) {
  const base = today ? new Date(today) : new Date(), mid = new Date(base.getFullYear(), base.getMonth(), base.getDate()), gone = new Set(prefs().billDismissed || []), out = [];
  for (const card of (state.accounts || [])) {
    if (card.type !== 'card' || card.archived) continue;
    for (const offset of [-2, -1, 0]) {
      const st = creditStmt(card, mid, offset), key = creditStatementKey(card, st.period);
      if (!(st.owed > 0) || st.period.end >= isoDate(mid) || gone.has(key)) continue;
      const due = cardStatementDueDate(card, st.period), items = reconItems(card, st.period, 'asc');
      out.push({ card, period: st.period, offset, owed: st.owed, due: isoDate(due), days: Math.round((due - mid) / 864e5), reconDone: items.length > 0 && items.every(t => t.recon), key });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}
function pendingNotices() { return (state.transactions || []).filter(pendingVisible).sort((a, b) => (a.dateTbd ? 1 : 0) - (b.dateTbd ? 1 : 0) || String(a.date).localeCompare(String(b.date))); }
// Recurring rules and future instalments due within `days` days.
function upcomingNotices(today, days) {
  const t0 = isoDate(today ? new Date(today) : new Date()), d = new Date(t0 + 'T00:00:00'); d.setDate(d.getDate() + (days || 30)); const lim = isoDate(d), out = [];
  for (const r0 of (state.recurring || [])) { const r = normRecurring(r0); if (!recurringEnded(r) && !r.paused && r.next <= lim) out.push({ type: 'recurring', id: r.id, name: r.name, date: r.next, kind: r.kind, amount: Math.abs(Number(r.amount || 0)), account: r.account, label: recurringLabel(r), category: r.category }); }
  for (const t of (state.transactions || [])) if (t.installment && t.date > t0 && t.date <= lim) out.push({ type: 'installment', id: t.id, name: t.name, date: t.date, kind: t.kind, amount: Math.abs(Number(t.amount || 0)), account: t.account, label: installmentLabel(t), category: t.category });
  for (const l of (state.loans || [])) if (l.inst && loanStatus(l) === 'active' && l.inst.next <= lim) { const x = loanInstNext(l); if (x) out.push({ type: 'loan', id: l.id, name: l.name || l.person, date: x.date, kind: loanDirection(l) === 'payable' ? 'expense' : 'income', amount: x.principal + x.interest, account: l.account, label: `分期 ${x.no} / ${l.inst.n}`, category: '' }); }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
function noticeCount() { return billNotices().length + pendingNotices().filter(t => t.dateTbd || t.date <= isoDate(new Date())).length + draftDb().list.length; }
function noticeSt() { return window.__notice || (window.__notice = { tab: 'all' }); }
function noticeBillsHTML(l) {
  return (l.length ? `<div class="notice-total">${l.length} 筆 · 合計 −${money(l.reduce((s, b) => s + (txTWD(b.owed, b.card.id) ?? b.owed), 0))}</div>` : '') + l.map(b => `<div class="notice-row${b.days < 0 ? ' overdue' : ''}"><div class="notice-ico">${svgForAccount(b.card)}</div><div class="day-main"><b>${esc(b.card.name)}</b><small>${b.period.start} ～ ${b.period.end}</small><small>繳款期限 ${b.due}（${reminderDayText(b.days)}）· ${esc(b.card.autoPay && b.card.payFrom ? `自動扣繳${(w => w && w !== 'paid' ? `（${w}）` : '')(autoPayReason(b.card, b.offset, isoDate(new Date())))}` : '手動繳納')} · ${b.reconDone ? '已對帳' : '未對帳'}</small></div><div class="day-side"><b class="expense-text">${acctMoney(b.owed, b.card)}</b><span class="notice-act"><button type="button" class="ghost" data-bill-recon="${esc(b.card.id)}" data-off="${b.offset}">對帳</button><button type="button" class="primary" data-bill-pay="${esc(b.card.id)}" data-off="${b.offset}">繳費</button><button type="button" class="ghost" data-bill-dismiss="${esc(b.key)}" aria-label="移除這筆通知">×</button></span></div></div>`).join('');
}
function noticePendingHTML(l) { return l.map(pendingRow).join(''); }
function noticeLoansHTML() { return loanGroups().map(g => `<button type="button" class="notice-row" data-loan-id="${esc(g.firstId)}"><div class="notice-ico">👤</div><div class="day-main"><b>${esc(g.person)}</b><small>${[g.receivable ? `${g.receivable} 筆應收` : '', g.payable ? `${g.payable} 筆應付` : ''].filter(Boolean).join(' · ')}</small></div><div class="day-side"><b class="${g.net < 0 ? 'expense-text' : 'income-text'}">${g.net < 0 ? '應付 ' : '應收 '}${money(Math.abs(g.net))}</b></div></button>`).join(''); }
function noticeUpcomingHTML(l) {
  const net = Math.round(l.reduce((s, x) => s + (x.kind === 'income' ? 1 : x.kind === 'transfer' ? 0 : -1) * (txTWD(x.amount, x.account) ?? x.amount), 0));
  return l.length ? `<div class="notice-total">${l.length} 筆 · 合計 ${net < 0 ? '−' : '+'}${money(Math.abs(net))}</div>` + l.map(x => `<div class="notice-row"><div class="notice-ico">${catIconHTML(cat(x.category))}</div><div class="day-main"><b>${esc(x.name)}</b><small>${fmtDate(x.date)}（${reminderDayText(remindDaysBetween(x.date, new Date()))}）· ${esc(x.label)}</small></div><div class="day-side"><b class="${x.kind === 'income' ? 'income-text' : 'expense-text'}">${x.kind === 'income' ? '+' : '−'}${acctMoney(x.amount, acct(x.account))}</b></div></div>`).join('') : '';
}
function renderNotice() { appBadge();
  const el = document.getElementById('noticeBg'); noticeBadge(); if (!el || el.hidden) return;
  const tab = noticeSt().tab, bills = billNotices(), pend = pendingNotices(), up = upcomingNotices(), loans = noticeLoansHTML();
  const sec = (k, title, html) => (tab === 'all' || tab === k) ? (html ? `<h3 class="notice-h">${title}</h3>${html}` : tab === k ? '<div class="recon-empty">沒有項目</div>' : '') : '';
  const body = (tab === 'draft' ? draftsHTML() : tab === 'all' && draftDb().list.length ? `<h3 class="notice-h">通知草稿</h3><button type="button" class="notice-row" data-notice-tab="draft"><div class="notice-ico">💬</div><div class="day-main"><b>${draftDb().list.length} 筆草稿待補齊</b></div></button>` : '') + sec('bill', '信用卡帳單', noticeBillsHTML(bills)) + sec('pending', '待完成交易', noticePendingHTML(pend)) + sec('loan', '借還款追蹤', loans) + sec('upcoming', '即將到來（30 天內）', noticeUpcomingHTML(up));
  el.innerHTML = `<div class="recon-sheet">${sheetHead('通知中心')}<div class="entry-tabs">${[['all', '全部'], ['bill', `信用卡帳單 ${bills.length || ''}`], ['pending', `待完成交易 ${pend.length || ''}`], ['draft', `通知草稿 ${draftDb().list.length || ''}`], ['loan', '借還款追蹤'], ['upcoming', '即將到來']].map(([k, l]) => `<button type="button" data-notice-tab="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div><div class="recon-list notice-list">${body || '<div class="recon-empty">目前沒有待處理事項 🎉</div>'}</div></div>`;
}
function noticeBadge() {
  const b = document.getElementById('noticeBtn'); if (!b) return; const n = noticeCount();
  b.innerHTML = `🔔${n ? `<i>${n > 99 ? '99+' : n}</i>` : ''}`;
}
function gotoBill(cardId, off) {
  nav('accounts'); openCreditAccount(cardId); creditStatementOffset = off; creditDetailTab = 'statement'; renderAccounts();
}

// ---- full-screen calendar ----
function twHolidays() {
  return { '2026-01-01': '元旦', '2026-02-15': '小年夜', '2026-02-16': '除夕', '2026-02-17': '春節', '2026-02-18': '春節', '2026-02-19': '春節', '2026-02-20': '補假', '2026-02-27': '補假', '2026-02-28': '和平紀念日', '2026-04-03': '補假', '2026-04-04': '兒童節', '2026-04-05': '清明節', '2026-04-06': '補假', '2026-05-01': '勞動節', '2026-06-19': '端午節', '2026-09-25': '中秋節', '2026-09-28': '教師節', '2026-10-09': '補假', '2026-10-10': '國慶日', '2026-10-25': '光復節', '2026-10-26': '補假', '2026-12-25': '行憲紀念日',
    '2027-01-01': '元旦', '2027-02-04': '小年夜', '2027-02-05': '除夕', '2027-02-06': '春節', '2027-02-07': '春節', '2027-02-08': '春節', '2027-02-09': '補假', '2027-02-10': '補假', '2027-02-28': '和平紀念日', '2027-03-01': '補假', '2027-04-04': '兒童節', '2027-04-05': '清明節', '2027-04-06': '補假', '2027-05-01': '勞動節', '2027-06-09': '端午節', '2027-09-15': '中秋節', '2027-09-28': '教師節', '2027-10-10': '國慶日', '2027-10-11': '補假', '2027-10-25': '光復節', '2027-12-25': '行憲紀念日' };
}
function holidayName(date) { return twHolidays()[date] || ''; }
function calSt() { return window.__cal || (window.__cal = { y: new Date().getFullYear(), m: new Date().getMonth(), mode: 'stat', avg: false, sel: '' }); }
// { days: { date: {out, inc} }, out, inc, n }
function calMonth(y, m) {
  const pre = `${y}-${String(m + 1).padStart(2, '0')}-`, days = {}; let out = 0, inc = 0;
  for (const t of (state.transactions || [])) {
    if (!String(t.date).startsWith(pre) || isUnappliedPending(t)) continue;
    const v = txSigned(t); if (!v) continue;
    const d = days[t.date] || (days[t.date] = { out: 0, inc: 0 }); if (v < 0) { d.out -= v; out -= v; } else { d.inc += v; inc += v; }
  }
  return { days, out: Math.round(out), inc: Math.round(inc), n: new Date(y, m + 1, 0).getDate() };
}
// Statement closing dates in a month: { date: [{ card, st, due, owed, unpaid }] }
function calBills(y, m, today) {
  const out = {}, t0 = isoDate(today ? new Date(today) : new Date());
  for (const card of (state.accounts || [])) {
    if (card.type !== 'card' || card.archived) continue;
    const end = isoDate(cardStmtEnd(card, y, m)); let st = null;
    for (const base of [new Date(y, m + 1, 0), new Date(y, m, 15)]) for (const off of [-2, -1, 0, 1, 2]) if (!st) { const p = cardPeriod(card, base, off); if (p.end === end) st = { ...creditStmt(card, base, off) }; }
    if (!st) continue;
    const due = isoDate(cardStatementDueDate(card, st.period)), closed = end < t0;
    (out[end] = out[end] || []).push({ card, spend: st.spend, paid: st.paid, owed: st.owed, due, closed, unpaid: closed && st.owed > 0 });
  }
  return out;
}
function calHTML() {
  const s = calSt(), M = calMonth(s.y, s.m), today = isoDate(new Date()), lead = calendarLead(s.y, s.m), bills = s.mode === 'bill' ? calBills(s.y, s.m) : {}, max = Math.max(1, ...Object.values(M.days).map(d => Math.max(d.out, d.inc)));
  const ws = prefs().weekStart || 0, heads = Array.from({ length: 7 }, (_, i) => '日一二三四五六'[(i + ws) % 7]);
  let cells = heads.map(h => `<div class="fc-head">${h}</div>`).join('') + '<div></div>'.repeat(lead), hol = 0, wk = 0;
  for (let n = 1; n <= M.n; n++) {
    const date = `${s.y}-${String(s.m + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`, d = M.days[date], wd = new Date(s.y, s.m, n).getDay(), weekend = wd === 0 || wd === 6, h = holidayName(date);
    if (weekend) wk++; else if (h) hol++;
    let inner = '', style = '', cls = '';
    if (s.mode === 'stat' && d) { const k = Math.min(1, Math.max(d.out, d.inc) / max); style = `background:rgba(${d.out >= d.inc ? '255,104,117' : '49,168,117'},${(0.08 + 0.5 * k).toFixed(2)})`; inner = (d.out ? `<small class="expense-text">−${compactNum(d.out)}</small>` : '') + (d.inc ? `<small class="income-text">+${compactNum(d.inc)}</small>` : ''); }
    if (s.mode === 'bill' && bills[date]) { inner = `<span class="fc-cards">${bills[date].map(b => `<span class="fc-card">${svgForAccount(b.card)}</span>`).join('')}</span>`; if (bills[date].some(b => b.unpaid)) cls = ' fc-unpaid'; }
    if (s.mode === 'holiday') { inner = h ? `<small class="fc-hol">${h}</small>` : ''; if (h || weekend) cls = ' fc-off'; }
    cells += `<button type="button" class="fc-day${cls}${date === today ? ' today' : ''}${date === s.sel ? ' sel' : ''}" style="${style}" data-fc-day="${date}"><b>${n}</b>${inner}</button>`;
  }
  let foot = '';
  if (s.mode === 'stat') {
    const now = new Date(), cur = now.getFullYear() === s.y && now.getMonth() === s.m, div = s.avg ? (cur ? now.getDate() : M.n) : 1, v = x => money(Math.round(x / div));
    foot = `<div class="fc-foot"><span>支出 <b class="expense-text">${v(M.out)}</b></span><span>收入 <b class="income-text">${v(M.inc)}</b></span><span>總計 <b>${v(M.inc - M.out)}</b></span><button type="button" class="ghost" data-fc-avg>${s.avg ? '看本月合計' : '看每日平均'}</button></div>`;
    if (s.sel) { const l = state.transactions.filter(t => t.date === s.sel).sort((a, b) => String(b.time || '').localeCompare(String(a.time || ''))); foot += `<div class="fc-list"><h3 class="notice-h">${s.sel} ${WEEKDAYS[new Date(s.sel + 'T00:00:00').getDay()]}</h3>${l.length ? l.map(t => `<button type="button" class="notice-row" data-tx-open="${esc(t.id)}"><div class="notice-ico">${catIconHTML(cat(t.category))}</div><div class="day-main"><b>${esc(t.name)}</b><small>${esc(t.merchant || '')} ${acctName(acct(t.account))}</small></div><div class="day-side"><b>${acctMoney(txEffect(t) || t.amount, acct(t.account))}</b></div></button>`).join('') : '<div class="recon-empty">當日沒有交易</div>'}</div>`; }
  } else if (s.mode === 'bill') {
    const sel = bills[s.sel];
    if (sel) foot = `<div class="fc-list">${sel.map(b => `<div class="notice-row"><div class="notice-ico">${svgForAccount(b.card)}</div><div class="day-main"><b>${esc(b.card.name)}</b><small>繳費期限 ${b.due}</small><small>應繳 ${acctMoney(b.spend, b.card)} · 已繳 ${acctMoney(b.paid, b.card)}</small></div><div class="day-side"><b class="${b.unpaid ? 'expense-text' : ''}">剩餘 ${acctMoney(b.owed, b.card)}</b></div></div>`).join('')}</div>`;
    else { const all = Object.values(bills).flat(), cl = all.filter(b => b.closed); foot = `<div class="fc-foot"><span>已繳清 <b>${cl.filter(b => !b.unpaid).length}</b> 筆</span><span>未繳清 <b class="expense-text">${cl.filter(b => b.unpaid).length}</b> 筆</span><span>未結帳 <b>${all.length - cl.length}</b> 筆</span></div>`; }
  } else foot = `<div class="fc-foot"><span>國定假日（平日）<b>${hol}</b> 天</span><span>週末 <b>${wk}</b> 天</span></div>${s.y < 2026 || s.y > 2027 ? '<p class="hint">內建假日只有 2026、2027 年。</p>' : s.y === 2027 ? '<p class="hint">2027 年的補假以政府公告為準。</p>' : ''}`;
  return `<div class="recon-sheet fc-sheet">${sheetHead('月曆', `<select id="fcMode" aria-label="檢視"><option value="stat"${s.mode === 'stat' ? ' selected' : ''}>收支統計</option><option value="bill"${s.mode === 'bill' ? ' selected' : ''}>帳單結帳日</option><option value="holiday"${s.mode === 'holiday' ? ' selected' : ''}>假日</option></select>`)}<div class="recon-period"><button type="button" data-fc-move="-1" aria-label="上一月">‹</button><input type="month" id="fcMonth" value="${s.y}-${String(s.m + 1).padStart(2, '0')}" aria-label="選擇年月"><button type="button" data-fc-move="1" aria-label="下一月">›</button></div><div class="recon-list"><div class="fc-grid">${cells}</div>${foot}</div></div>`;
}
function renderFullCal() { const el = document.getElementById('calBg'); if (el && !el.hidden) el.innerHTML = calHTML(); }
document.addEventListener('click', async e => {
  const c = s => e.target.closest?.(s);
  if (c('#noticeBtn')) { sheetEl('noticeBg').hidden = false; renderNotice(); return; }
  if (c('#fullCalBtn')) { const s = calSt(); s.y = calendarMonth.getFullYear(); s.m = calendarMonth.getMonth(); s.sel = ''; sheetEl('calBg').hidden = false; renderFullCal(); return; }
  const cl = c('[data-sheet-close]'); if (cl) { const bg = cl.closest('.recon-bg'); if (bg) bg.hidden = true; return; }
  const nt = c('[data-notice-tab]'); if (nt) { noticeSt().tab = nt.dataset.noticeTab; renderNotice(); return; }
  const br = c('[data-bill-recon]'); if (br) { sheetEl('noticeBg').hidden = true; gotoBill(br.dataset.billRecon, Number(br.dataset.off)); openReconMode(br.dataset.billRecon); return; }
  const bp = c('[data-bill-pay]'); if (bp) { sheetEl('noticeBg').hidden = true; gotoBill(bp.dataset.billPay, Number(bp.dataset.off)); setTimeout(() => { const b = document.querySelector('[data-inline-payment]'); if (b && !b.disabled) { b.click(); document.getElementById('creditPaymentForm')?.scrollIntoView({ block: 'center' }); } else alert('沒有可扣款的帳戶。'); }, 80); return; }
  const bd = c('[data-bill-dismiss]'); if (bd) { if (confirm('移除這筆帳單通知？移除後不會再出現在通知中心（帳單本身不受影響）。')) { setPref('billDismissed', [...(prefs().billDismissed || []), bd.dataset.billDismiss].slice(-200)); renderNotice(); } return; }
  if (c('#noticeBg [data-loan-id]')) { sheetEl('noticeBg').hidden = true; return; }
  const mv = c('[data-fc-move]'); if (mv) { const s = calSt(), d = new Date(s.y, s.m + Number(mv.dataset.fcMove), 1); s.y = d.getFullYear(); s.m = d.getMonth(); s.sel = ''; renderFullCal(); return; }
  if (c('[data-fc-avg]')) { calSt().avg = !calSt().avg; renderFullCal(); return; }
  const fd = c('[data-fc-day]'); if (fd) { const s = calSt(); s.sel = s.sel === fd.dataset.fcDay ? '' : fd.dataset.fcDay; renderFullCal(); }
});
document.addEventListener('change', e => {
  if (e.target?.id === 'fcMode') { const s = calSt(); s.mode = e.target.value; s.sel = ''; renderFullCal(); }
  if (e.target?.id === 'fcMonth' && e.target.value) { const s = calSt(), [y, m] = e.target.value.split('-').map(Number); s.y = y; s.m = m - 1; s.sel = ''; renderFullCal(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.querySelector('.modal-bg.open')) for (const i of ['noticeBg', 'calBg']) { const el = document.getElementById(i); if (el) el.hidden = true; } });
