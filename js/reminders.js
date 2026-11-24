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
