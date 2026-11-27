// 帳小簿 V26.125 — 參考 ALL SET（不用記帳）加入：發票品項搜尋與比價、發票自動配對記錄、扣款帳戶餘額檢查、下載結果明細.
// Bundled after js/einvoice-dl.js. Function declarations / var only.

// ---- 發票品項搜尋 ----
// Every invoice line whose name contains q, from recorded and not-yet-recorded invoices, newest first.
function invItemHits(q) {
  const k = String(q || '').trim().toLowerCase(), out = []; if (!k) return out;
  for (const { inv, t } of invAll()) for (const x of inv.items || []) if (String(x[0]).toLowerCase().includes(k) && invItemAmount(x) > 0)
    out.push({ date: String(inv.date || t?.date || ''), shop: invShop(inv, t), name: String(x[0]), qty: Number(x[1]) || 0, price: Number(x[2]) || 0, amount: invItemAmount(x), no: inv.no, tx: t ? t.id : null });
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
// Price comparison card shown on the search page's 發票品項 tab.
function fvPriceHTML(q) {
  const l = invItemHits(q); if (!l.length) return '';
  const ps = l.map(x => x.price).filter(p => p > 0), lo = Math.min(...ps), hi = Math.max(...ps), avg = ps.reduce((a, b) => a + b, 0) / ps.length, qty = l.reduce((a, x) => a + x.qty, 0), sum = l.reduce((a, x) => a + x.amount, 0);
  const row = x => `<div class="fv-item"><span class="fv-item-d">${fmtDate(x.date)}</span><span class="fv-item-n">${esc(x.name)}<small>${esc(x.shop || '')}${x.tx ? '' : '　未歸帳'}</small></span><span class="fv-item-q">${x.qty} × ${money(x.price)}</span><b class="${x.price === lo && lo !== hi ? 'income-text' : x.price === hi && lo !== hi ? 'expense-text' : ''}">${money(x.amount)}</b></div>`;
  return `<div class="fv-price"><div class="fv-price-sum"><span>買過 <b>${l.length}</b> 次・共 <b>${Math.round(qty * 100) / 100}</b> 件</span><span>單價 最低 <b class="income-text">${money(lo)}</b>・平均 <b>${money(Math.round(avg * 10) / 10)}</b>・最高 <b class="expense-text">${money(hi)}</b></span><span>品項合計 <b>${money(sum)}</b></span></div>${l.slice(0, 200).map(row).join('')}</div>`;
}
// Matching invoice lines under one search result row.
function fvItemLines(t, q) {
  const k = String(q || '').trim().toLowerCase(); if (!k) return '';
  const l = invOfTx(t).flatMap(i => (i.items || []).filter(x => String(x[0]).toLowerCase().includes(k)));
  return l.length ? `<div class="fv-item-lines">${l.slice(0, 6).map(x => `<span>🧾 ${esc(x[0])}　${x[1]} × ${money(x[2])} ＝ ${money(invItemAmount(x))}</span>`).join('')}</div>` : '';
}

// ---- 發票與記錄配對 ----
function invDayNum(d) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : null; }
// Days the record is after the invoice date (negative = before).
function invGap(t, inv) { const a = invDayNum(t?.date), b = invDayNum(inv?.date); return a === null || b === null ? null : a - b; }
// Same rule as ALL SET: same day (amounts may differ after discounts), or 14 days before to 45 days after with the exact amount
// (online shops invoice after shipping; debit cards may charge later).
function invCandOk(t, inv) { const g = invGap(t, inv); if (g === 0) return true; return g !== null && g >= -14 && g <= 45 && Math.abs(Math.abs(Number(t.amount)) - Number(inv.total)) < 0.005; }
function invMatchable(t) { return t && t.kind === 'expense' && !invOfTx(t).length && !(typeof isUnappliedPending === 'function' && isUnappliedPending(t)) && !t.splitGroup; }
// Pairs an invoice with an expense only when both are the single one of that day and amount, and the user has not
// said "not this one" (unlinking remembers the record in inv.sep). → [[invoice, transaction]]
function invAutoPairs() {
  const key = (d, a) => `${invDayNum(d)}:${Math.round(Number(a) * 100)}`, invs = new Map(), txs = new Map();
  for (const i of invDb().list) { if (i.hidden || !(Number(i.total) > 0) || invDayNum(i.date) === null) continue; const k = key(i.date, i.total); invs.set(k, [...(invs.get(k) || []), i]); }
  for (const t of state.transactions || []) { if (!invMatchable(t)) continue; const k = key(t.date, Math.abs(Number(t.amount))); if (invs.has(k)) txs.set(k, [...(txs.get(k) || []), t]); }
  const out = []; for (const [k, l] of invs) { const m = txs.get(k); if (l.length === 1 && m?.length === 1 && !(l[0].sep || []).includes(String(m[0].id))) out.push([l[0], m[0]]); }
  return out;
}
// Links the pairs; the invoice lines go into the note only when the record has none. → [{ no, tx }]
function invAutoMatch() { return invAutoPairs().map(([inv, t]) => { invLink(inv, t, t.note ? '' : 'replace'); return { no: inv.no, tx: t.id }; }); }

// ---- 扣款帳戶餘額檢查 ----
// Charges due within `days` days (card bills, and expenses from cash or bank accounts), grouped by the account the money
// leaves from, compared with its balance today. → [{ account, balance, need, short, items: [{ name, amount, date }] }]
function payFundCheck(today, days = 3) {
  const t0 = today ? new Date(today) : new Date(), lim = isoDate(new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + days)), by = new Map(), fut = typeof acctFuture === 'function' ? acctFuture(today) : null;
  const add = (fundId, item, cur) => { const f = (state.accounts || []).find(a => String(a.id) === String(fundId)); if (!f || f.type === 'card' || f.archived) return; let v = item.amount; if (acctCur(f) !== cur) { if (acctCur(f) !== 'TWD') return; v = toTWD(v, cur); if (v === null) return; v *= 1.02; } const g = by.get(String(f.id)) || { account: f, items: [], need: 0 }; g.items.push({ ...item, amount: Math.round(v) }); g.need += v; by.set(String(f.id), g); };
  for (const b of billNotices(today)) if (b.due <= lim && b.card.payFrom != null && b.card.payFrom !== '') add(b.card.payFrom, { name: `${b.card.name} 卡費`, amount: b.owed, date: b.due }, acctCur(b.card));
  for (const x of upcomingNotices(today, days)) { const a = acct(x.account); if (x.kind === 'expense' && a && a.type !== 'card') add(x.account, { name: x.name, amount: x.amount, date: x.date }, acctCur(a)); }
  return [...by.values()].map(g => { const balance = fut ? acctNow(g.account, fut) : Number(g.account.balance || 0), need = Math.round(g.need); return { ...g, balance, need, short: Math.max(0, Math.round(need - balance)) }; }).sort((a, b) => b.short - a.short);
}
function payShortList(today) { return payFundCheck(today).filter(g => g.short > 0); }
function noticeFundHTML(l) {
  return l.map(g => `<div class="notice-row overdue"><div class="notice-ico">${svgForAccount(g.account)}</div><div class="day-main"><b>${esc(g.account.name)} 餘額不足</b><small>3 天內要扣 ${acctMoney(g.need, g.account)}：${g.items.map(i => `${esc(i.name)} ${acctMoney(i.amount, g.account)}（${fmtDate(i.date)}）`).join('、')}</small><small>目前餘額 ${acctMoney(g.balance, g.account)}</small></div><div class="day-side"><b class="expense-text">還差 ${acctMoney(g.short, g.account)}</b></div></div>`).join('');
}

// ---- 下載結果明細 ----
function einvResultSave(r, auto) { einvLs('moze-einv-result', { at: Date.now(), added: (r.addedNos || []).slice(0, 300), filled: (r.filledNos || []).slice(0, 300), auto: (auto || []).slice(0, 300), oldest: r.oldest || '' }); }
function einvResultGet() { const r = einvLs('moze-einv-result'); return r && Date.now() - r.at < 7 * 864e5 && !r.seen ? r : null; }
function einvResultBar() {
  const r = einvResultGet(); if (!r || !(r.added.length || r.auto.length)) return ''; const d = new Date(r.at);
  return `<div class="inv-result"><span>${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 下載：新增 ${r.added.length} 張${r.auto.length ? `，自動歸帳 ${r.auto.length} 張` : ''}</span><button type="button" class="ghost" data-einv-result>查看</button><button type="button" class="ghost" data-einv-result-x aria-label="不再顯示">×</button></div>`;
}
function einvResultHTML() {
  const r = einvLs('moze-einv-result'); if (!r) return ''; const all = invAll(), auto = new Map((r.auto || []).map(a => [a.no, a.tx]));
  const row = no => { const x = all.find(y => y.inv.no === no); if (!x) return ''; const { inv, t } = x; return `<button type="button" class="notice-row" data-inv-open="${esc(inv.no)}"><div class="day-main"><b>${esc(invShop(inv, t) || inv.no)}</b><small>${fmtDate(inv.date)}　${esc(inv.no)}　${t ? `${auto.has(inv.no) ? '自動歸帳到' : '已歸帳到'}「${esc(t.name)}」` : '未歸帳'}</small></div><div class="day-side"><b>${money(inv.total)}</b></div></button>`; };
  const nos = [...new Set([...(r.added || []), ...(r.auto || []).map(a => a.no)])];
  return `<div class="inv-pop-bg" data-inv-pop-bg><div class="inv-receipt inv-dlres"><b>這次下載的發票</b><p class="hint">新增 ${r.added.length} 張${r.filled.length ? `、補上 ${r.filled.length} 張明細` : ''}${r.auto.length ? `、自動歸帳 ${r.auto.length} 張（同一天、同金額的記錄；不對的話打開發票按「取消連結」）` : ''}${r.oldest ? `。最早到 ${esc(r.oldest)}` : ''}</p><div class="notice-list">${nos.map(row).join('') || '<div class="recon-empty">沒有新的發票</div>'}</div></div></div>`;
}
document.addEventListener('click', async e => {
  const c = q => e.target.closest?.(q); if (!c('#invBg')) return; const s = invSt();
  if (c('[data-einv-result]')) { s.pop = 'dlres'; s.open = null; renderInvoices(); return; }
  if (c('[data-einv-result-x]')) { const r = einvLs('moze-einv-result'); if (r) einvLs('moze-einv-result', { ...r, seen: true }); renderInvoices(); return; }
  if (c('[data-inv-auto]')) { const m = invAutoMatch(); if (m.length) { await save(); render(); } renderInvoices(); toast(m.length ? `已自動歸帳 ${m.length} 張發票` : '沒有可以自動配對的發票'); }
});
