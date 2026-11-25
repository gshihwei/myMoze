// 帳小簿 V26.36 — 年度回顧 (yearly review) and V26.37 資產負債總覽 (assets vs liabilities).
// Bundled after js/subscriptions.js; reuses analysis.js helpers (anTxs, anValue, anTotals, anByCategory)
// and app.js globals (state, esc, money, acct, acctCur, acctName, toTWD, isoDate). Function declarations / var only.

var yrYear;
function yrYears() {
  const ys = new Set([String(new Date().getFullYear())]);
  for (const t of (state.transactions || [])) if (/^\d{4}/.test(t.date || '')) ys.add(t.date.slice(0, 4));
  return [...ys].sort().reverse();
}
// Totals for one calendar year; averages use the months that have elapsed (all 12 for past years).
function yearReview(year, today = new Date()) {
  const y = Number(year), cur = today.getFullYear(), months = y < cur ? 12 : y === cur ? today.getMonth() + 1 : 0;
  const start = `${y}-01-01`, end = `${y}-12-31`, t = anTotals(start, end), prev = anTotals(`${y - 1}-01-01`, `${y - 1}-12-31`);
  const rows = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, inc: 0, out: 0 }));
  for (const x of anTxs(start, end)) rows[Number(x.date.slice(5, 7)) - 1][x.kind === 'expense' ? 'out' : 'inc'] += anValue(x);
  rows.forEach(r => { r.inc = Math.round(r.inc); r.out = Math.round(r.out); });
  return { year: y, months, inc: t.inc, out: t.out, net: t.net, savingsRate: t.inc > 0 ? t.net / t.inc : null,
    avgOut: months ? Math.round(t.out / months) : 0, avgInc: months ? Math.round(t.inc / months) : 0,
    prev: { inc: prev.inc, out: prev.out, net: prev.net }, rows, top: anByCategory(start, end, 'expense', 'all', null, 5).rows };
}
function yrPct(cur, prev) { return prev ? (cur - prev) / Math.abs(prev) * 100 : null; }
function yrDeltaText(cur, prev) { const p = yrPct(cur, prev); return p === null ? '去年無資料' : `${p >= 0 ? '↑' : '↓'} ${Math.abs(p).toFixed(1)}% 較去年`; }

function yearReviewHTML(r) {
  const best = r.rows.filter(x => x.out > 0).sort((a, b) => b.out - a.out)[0], max = Math.max(1, ...r.rows.map(x => Math.max(x.inc, x.out)));
  const bars = r.rows.map(x => `<div class="yr-col" title="${x.m} 月 收入 ${x.inc} / 支出 ${x.out}"><i class="in" style="height:${Math.round(x.inc / max * 60)}px"></i><i class="out" style="height:${Math.round(x.out / max * 60)}px"></i><small>${x.m}</small></div>`).join('');
  const top = (r.top || []).map(c => `<div class="yr-row"><span>${esc(c.name)}</span><b>${money(Math.round(c.amount))}</b></div>`).join('') || '<div class="hint">這一年沒有支出紀錄</div>';
  return `<div class="yr-grid">
    <div><small>收入</small><b class="income-text">${money(r.inc)}</b><em>${yrDeltaText(r.inc, r.prev.inc)}</em></div>
    <div><small>支出</small><b class="expense-text">${money(r.out)}</b><em>${yrDeltaText(r.out, r.prev.out)}</em></div>
    <div><small>結餘</small><b>${r.net < 0 ? '−' : ''}${money(Math.abs(r.net))}</b><em>${r.savingsRate === null ? '無收入' : `儲蓄率 ${(r.savingsRate * 100).toFixed(1)}%`}</em></div>
    <div><small>月均支出</small><b>${money(r.avgOut)}</b><em>月均收入 ${money(r.avgInc)}${best ? ` · 最高 ${best.m} 月` : ''}</em></div></div>
    <div class="yr-bars" aria-label="每月收支">${bars}</div>
    <h4>支出前 5 名分類</h4>${top}`;
}

// ---------- V26.37 assets vs liabilities ----------
// Each account's balance in TWD; positive balances are assets, negative ones (credit-card debt, overdrafts) are liabilities.
function balanceOverview(accounts = state.accounts) {
  const rows = [], missing = [];
  for (const a of (accounts || [])) {
    const cur = acctCur(a), v = Number(a.balance || 0), tw = cur === 'TWD' ? v : toTWD(v, cur);
    if (tw === null || tw === undefined) { if (v) missing.push(cur); continue; }
    rows.push({ id: String(a.id), name: a.name, type: a.type, cur, balance: v, twd: Math.round(tw) });
  }
  const assets = rows.filter(r => r.twd > 0).reduce((s, r) => s + r.twd, 0), liabilities = -rows.filter(r => r.twd < 0).reduce((s, r) => s + r.twd, 0);
  return { rows, assets, liabilities, net: assets - liabilities, ratio: assets > 0 ? liabilities / assets : null, missing: [...new Set(missing)] };
}
function balanceOverviewHTML(o) {
  const tot = o.assets + o.liabilities, ap = tot ? o.assets / tot * 100 : 0;
  const list = o.rows.filter(r => r.twd).sort((a, b) => Math.abs(b.twd) - Math.abs(a.twd)).map(r => `<div class="yr-row"><span>${esc(r.name)}${r.cur !== 'TWD' ? ` (${esc(r.cur)})` : ''}</span><b class="${r.twd < 0 ? 'expense-text' : ''}">${r.twd < 0 ? '−' : ''}${money(Math.abs(r.twd))}</b></div>`).join('');
  return `<div class="yr-grid"><div><small>總資產</small><b class="income-text">${money(o.assets)}</b></div><div><small>總負債</small><b class="expense-text">${money(o.liabilities)}</b></div>
    <div><small>淨資產</small><b>${o.net < 0 ? '−' : ''}${money(Math.abs(o.net))}</b></div><div><small>負債比</small><b>${o.ratio === null ? '—' : (o.ratio * 100).toFixed(1) + '%'}</b></div></div>
    <div class="yr-split" aria-label="資產與負債比例"><i class="in" style="width:${ap}%"></i><i class="out" style="width:${tot ? 100 - ap : 0}%"></i></div>${list}
    ${o.missing.length ? `<p class="hint">缺少 ${esc(o.missing.join('、'))} 匯率，這些帳戶未列入。</p>` : ''}`;
}

function renderYearly() {
  const root = document.getElementById('analysisRoot'); if (!root?.parentNode) return;
  let box = document.getElementById('yearlyBox');
  if (!box) { box = document.createElement('section'); box.id = 'yearlyBox'; box.className = 'yearly-box'; root.parentNode.insertBefore(box, root.nextSibling); }
  const ys = yrYears(); if (!ys.includes(String(yrYear))) yrYear = ys[0];
  box.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>年度回顧</h2><p>整年收支、儲蓄率與去年比較</p></div><select id="yrYear" aria-label="年度">${ys.map(y => `<option value="${y}" ${y === String(yrYear) ? 'selected' : ''}>${y} 年</option>`).join('')}</select></div>${yearReviewHTML(yearReview(yrYear))}</div>` +
    `<div class="panel"><div class="panel-head"><div><h2>資產負債總覽</h2><p>各帳戶換算成 TWD（外幣依目前匯率）</p></div></div>${balanceOverviewHTML(balanceOverview())}</div>`;
}
document.addEventListener('change', e => { if (e.target?.id === 'yrYear') { yrYear = e.target.value; renderYearly(); } });
