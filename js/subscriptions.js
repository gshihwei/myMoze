// 帳小簿 V26.34 — 訂閱管理 (builds on recurring items; r.sub marks a subscription, r.paused stops posting/reminders).
// Bundled after js/reminders.js; uses app.js globals (state, esc, money, txTWD, normRecurring, recurringEnded, save, render).
// Function declarations / var only.

// Cost per month in the item's own currency (expense amount, positive).
function subMonthly(r) {
  const a = Math.abs(Number(r?.amount) || 0), n = Math.max(1, Math.floor(Number(r?.interval) || 1));
  if (r?.freq === 'day') return a * (365 / 12) / n;
  if (r?.freq === 'week') return a * (52 / 12) / n;
  if (r?.freq === 'year') return a / (12 * n);
  return a / n;
}
function subActive(r) { return !!r && !!r.sub && !r.paused && !recurringEnded(r) && r.kind !== 'income'; }
// Totals in TWD for active subscriptions; paused ones are counted separately.
function subSummary(list = state.recurring) {
  const items = (list || []).filter(r => r.sub && r.kind !== 'income').map(normRecurring);
  const twd = r => txTWD(subMonthly(r), r.account) ?? subMonthly(r);
  const active = items.filter(subActive), paused = items.filter(r => r.paused && !recurringEnded(r));
  const monthly = active.reduce((s, r) => s + twd(r), 0);
  return { active, paused, monthly, yearly: monthly * 12 };
}
function subToggle(r, key) { if (!r) return false; if (r[key]) delete r[key]; else r[key] = true; return true; }

function subSummaryHTML(s) {
  if (!s.active.length && !s.paused.length) return '<p class="hint">在下方週期交易按「標為訂閱」，這裡會統計每月與每年的訂閱支出。</p>';
  const row = r => `<div class="sub-row ${r.paused ? 'paused' : ''}"><span>${esc(r.name)}${r.paused ? '（已暫停）' : ''}</span><small>下次 ${esc(r.next)}</small><b>${money(Math.round(txTWD(subMonthly(r), r.account) ?? subMonthly(r)))}／月</b></div>`;
  return `<div class="sub-totals"><div><small>訂閱 ${s.active.length} 項 · 每月</small><b>${money(Math.round(s.monthly))}</b></div><div><small>每年約</small><b>${money(Math.round(s.yearly))}</b></div></div>` +
    [...s.active].sort((a, b) => a.next.localeCompare(b.next)).concat(s.paused).map(row).join('');
}
function renderSubscriptions() {
  const grid = document.getElementById('recurringGrid'); if (!grid?.parentNode) return;
  let box = document.getElementById('subSummary');
  if (!box) { box = document.createElement('section'); box.id = 'subSummary'; box.className = 'sub-summary'; grid.parentNode.insertBefore(box, grid); }
  box.innerHTML = '<h3>訂閱總覽</h3>' + subSummaryHTML(subSummary());
}
document.addEventListener('click', async e => {
  const find = v => (state.recurring || []).find(r => String(r.id) === String(v));
  const p = e.target.closest?.('[data-rec-pause]'), s = e.target.closest?.('[data-rec-sub]');
  const hit = p ? [find(p.dataset.recPause), 'paused'] : s ? [find(s.dataset.recSub), 'sub'] : null;
  if (hit && subToggle(hit[0], hit[1])) { await save(); render(); }
});
