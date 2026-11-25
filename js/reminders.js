// 帳小簿 V26.31 — 信用卡額度使用率與繳款倒數 (V26.32 起also hosts in-app reminders).
// Bundled after js/accounts.js; uses app.js globals (state, esc, money, isoDate, cardPeriod,
// cardStatementDueDate, creditStatementPayments). Function declarations / var only.

// Used / available credit. A card's balance is negative when money is owed.
function creditUsage(card) {
  const used = Math.max(0, -Number(card?.balance || 0)), limit = Math.max(0, Number(card?.limit || 0));
  const pct = limit ? used / limit * 100 : 0;
  const level = !limit ? 'none' : pct > 100 ? 'over' : pct > 80 ? 'high' : 'ok';
  return { used, limit, available: Math.max(0, limit - used), pct, level, over: limit ? Math.max(0, used - limit) : 0 };
}

// Oldest closed statement that still has an unpaid amount: { owed, dueDate, days, overdue, period } or null.
// days = whole days from `today` to the due date (negative once overdue).
function creditDueInfo(card, today) {
  const base = today ? new Date(today) : new Date(), mid = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  for (const off of [-1, 0]) {
    const period = cardPeriod(card, mid, off);
    const spend = state.transactions.filter(t => String(t.account) === String(card.id) && t.kind === 'expense' && !t.cardPayment && t.date >= period.start && t.date <= period.end).reduce((s, t) => s + Number(t.amount || 0), 0);
    const paid = creditStatementPayments(card, period).reduce((s, t) => s + Number(t.amount || 0), 0);
    const owed = Math.round((spend - paid) * 100) / 100;
    if (owed <= 0) continue;
    const due = cardStatementDueDate(card, period), days = Math.round((due - mid) / 864e5);
    return { owed, dueDate: isoDate(due), days, overdue: days < 0, period };
  }
  return null;
}

function creditDueText(info) {
  if (!info) return '';
  if (info.overdue) return `已逾期 ${-info.days} 天 · 欠 ${money(info.owed)}`;
  return info.days === 0 ? `今天繳款 · ${money(info.owed)}` : `${info.days} 天後繳款 · ${money(info.owed)}`;
}

// Small block shown under a card's available amount in the accounts list.
function creditRowExtraHTML(card) {
  const u = creditUsage(card), info = creditDueInfo(card);
  const bar = u.limit ? `<div class="credit-bar credit-bar-${u.level}"><i style="width:${Math.min(100, u.pct)}%"></i></div><small class="credit-use-text ${u.level}">使用率 ${u.pct.toFixed(0)}%${u.over ? ` · 超額 ${money(u.over)}` : ''}</small>` : '';
  const due = info ? `<small class="credit-due-text ${info.overdue ? 'overdue' : info.days <= 3 ? 'soon' : ''}">${esc(creditDueText(info))}</small>` : '';
  return bar + due;
}

// ---------- V26.32 in-app reminders ----------
// Shown on the overview whenever the app is open (a PWA cannot notify while closed without a push server).
// Sources: unpaid credit-card statements and recurring items, within `lead` days (overdue always shown).
function remindDaysBetween(iso, today) {
  const mid = new Date(today.getFullYear(), today.getMonth(), today.getDate()), d = new Date(String(iso) + 'T00:00:00');
  return Math.round((d - mid) / 864e5);
}
function reminderList(today, lead) {
  const base = today ? new Date(today) : new Date(), n = Number.isFinite(Number(lead)) ? Number(lead) : 3, out = [];
  for (const card of (state.accounts || [])) {
    if (card.type !== 'card' || card.archived) continue;
    const info = creditDueInfo(card, base);
    if (info && info.days <= n) out.push({ type: 'card', id: String(card.id), title: `${card.name} 信用卡繳款`, date: info.dueDate, days: info.days, amount: info.owed });
  }
  for (const a of (state.accounts || [])) if (lowBalanceHit(a)) out.push({ type: 'low', id: String(a.id), title: `${a.name} 餘額不足`, date: '', days: 0, amount: Number(a.balance || 0), limit: Number(a.lowBalance) });
  for (const a of (state.accounts || [])) if (creditLowAvailHit(a)) { const u = creditUsage(a); out.push({ type: 'low', id: String(a.id), title: `${a.name} 可用額度不足`, date: '', days: 0, amount: u.available, limit: Number(a.lowAvail) }); }
  for (const r0 of (state.recurring || [])) {
    const r = normRecurring(r0);
    if (recurringEnded(r) || r.paused || !r.next) continue;
    const days = remindDaysBetween(r.next, base);
    if (days <= n) out.push({ type: 'recurring', id: String(r.id), title: r.name || '週期交易', date: r.next, days, amount: Math.abs(Number(r.amount) || 0), kind: r.kind });
  }
  return out.sort((a, b) => a.days - b.days || a.title.localeCompare(b.title));
}
function reminderDayText(days) { return days < 0 ? `逾期 ${-days} 天` : days === 0 ? '今天' : days === 1 ? '明天' : `${days} 天後`; }
function reminderBarHTML(list) {
  const shown = list.slice(0, 6), more = list.length - shown.length;
  return `<div class="reminder-head"><b>🔔 提醒 ${list.length} 項</b><button type="button" class="ghost" id="reminderSnooze">今天不再提醒</button></div>` +
    shown.map(x => `<div class="reminder-row ${x.days < 0 ? 'overdue' : x.days <= 1 ? 'soon' : ''}"><span>${esc(x.title)}</span><small>${x.type === 'low' ? `低於 ${money(x.limit)}` : `${esc(x.date)} · ${reminderDayText(x.days)}`}</small><b>${x.kind === 'income' ? '+' : ''}${money(x.amount)}</b></div>`).join('') +
    (more > 0 ? `<div class="hint">還有 ${more} 項…</div>` : '');
}
function renderReminders() {
  const p = prefs(), host = document.querySelector('#view-overview .metrics'); if (!host?.parentNode) return;
  let bar = document.getElementById('reminderBar');
  if (!bar) { bar = document.createElement('section'); bar.id = 'reminderBar'; bar.className = 'reminder-bar'; host.parentNode.insertBefore(bar, host); }
  const today = isoDate(new Date()), list = p.remindOn === false || p.remindSnooze === today ? [] : reminderList(new Date(), p.remindDays);
  bar.hidden = !list.length; bar.innerHTML = list.length ? reminderBarHTML(list) : '';
}
document.addEventListener('click', e => { if (e.target.closest?.('#reminderSnooze')) { setPref('remindSnooze', isoDate(new Date())); renderReminders(); } });
