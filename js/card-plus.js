// 帳小簿 V26.73 — 信用卡：銀行合併（主帳戶）對帳與繳款、額度共用、自動扣繳、調整本期結帳日.
// Bundled after js/changelog.js. Function declarations / var only.
// Cards of the same 所屬銀行 form the combined ("main") account. New card fields: shareLimit, autoPay, autoPaySince,
// stmtOverride = { 'YYYY-MM': 'YYYY-MM-DD' } (nominal month → that statement's closing date).

// Cards sharing one credit limit with `card` (itself included).
function limitGroup(card) {
  const bank = String(card?.bank || '').trim(); if (!card?.shareLimit || !bank) return [card];
  const l = (state.accounts || []).filter(a => a.type === 'card' && a.shareLimit && String(a.bank || '').trim() === bank); return l.some(a => a.id === card.id) ? l : [card];
}
function limitGroupHTML(card) { const l = limitGroup(card).filter(c => c.id !== card.id); return l.length ? `<div class="hint">與 ${l.map(c => esc(c.name)).join('、')} 共用額度</div>` : ''; }
function cardOwedTWD(a, cur) { const v = Math.max(0, -Number(a?.balance || 0)), from = acctCur(a); return from === cur ? v : (fxConvert(v, from, cur) ?? 0); }

// ---- 調整本期結帳日 ----
function stmtMonthKey(y, m) { const d = new Date(y, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function stmtOverrideOf(card, y, m) { const v = card?.stmtOverride?.[stmtMonthKey(y, m)]; return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : ''; }
// mode 'once' sets / clears (date '') one statement; 'all' changes the card's closing day. Keeps payments attached to their statements.
function stmtAdjust(card, base, offset, date, mode) {
  const [y, m] = cardNominalMonth(card, base, offset), old = [0, 1].map(k => stmtRange(card, y, m + k));
  if (mode === 'all') { card.statement = Number(date.slice(8, 10)); delete card.stmtOverride; }
  else {
    const prevEnd = stmtRange(card, y, m - 1).end, nextEnd = stmtRange(card, y, m + 1).end;
    if (date && (date <= prevEnd || date >= nextEnd)) return { error: `結帳日必須在 ${prevEnd} 與 ${nextEnd} 之間` };
    const o = { ...(card.stmtOverride || {}) }; if (date) o[stmtMonthKey(y, m)] = date; else delete o[stmtMonthKey(y, m)];
    if (Object.keys(o).length) card.stmtOverride = o; else delete card.stmtOverride;
  }
  const now = [0, 1].map(k => stmtRange(card, y, m + k));
  old.forEach((p, i) => { const from = creditStatementKey(card, p), to = creditStatementKey(card, now[i]); if (from !== to) for (const t of state.transactions) if (t.cardStatementKey === from) t.cardStatementKey = to; });
  // lines postponed to the old "first day of the next statement" that now fall back into this statement
  const back = (state.transactions || []).filter(t => String(t.account) === String(card.id) && t.postDate && t.postDate > old[0].end && t.postDate <= now[0].end);
  return { period: now[0], back };
}
function stmtRange(card, y, m) { const e = cardStmtEnd(card, y, m), p = cardStmtEnd(card, y, m - 1); return { start: isoDate(new Date(p.getFullYear(), p.getMonth(), p.getDate() + 1)), end: isoDate(e) }; }
function stmtAdjustHTML(card) {
  const [y, m] = cardNominalMonth(card, new Date(), creditStatementOffset), ov = stmtOverrideOf(card, y, m);
  return `<details class="stmt-adjust"><summary>調整本期結帳日${ov ? `（已調整為 ${ov}）` : ''}</summary><div class="form-grid"><label>實際結帳日<input type="date" id="stmtAdjDate" value="${stmtRange(card, y, m).end}"></label><label>套用範圍<select id="stmtAdjMode"><option value="once">僅這一期</option><option value="all">每一期都變更</option></select></label></div><div class="form-actions">${ov ? `<button type="button" class="secondary" data-stmt-reset="${esc(card.id)}">還原預設結帳日</button>` : ''}<button type="button" class="primary" data-stmt-adjust="${esc(card.id)}">套用</button></div></details>`;
}

// ---- payments ----
function cardPayCreate(card, period, source, amount, o) {
  const t = { id: o?.id || id(), date: o?.date || isoDate(new Date()), name: `${card.name} 繳款`, amount, kind: 'transfer', category: '', account: source.id, toAccount: card.id, note: o?.note || '信用卡繳款', cardPayment: true, cardStatementKey: creditStatementKey(card, period), tags: [] };
  state.transactions.push(t); adjust(t, 1); return t;
}
// Split one payment over the cards that still owe something, in list order (same currency as the source only).
function bankPayPlan(cards, base, offset, amount) {
  let left = Math.round(Number(amount || 0) * 100) / 100; const out = [];
  for (const c of cards) { const st = creditStmt(c, base, offset), v = Math.min(left, st.owed); if (v > 0) { out.push({ card: c, period: st.period, amount: Math.round(v * 100) / 100 }); left = Math.round((left - v) * 100) / 100; } }
  return { list: out, left };
}
function bankOwed(cards, base, offset) { return Math.round(cards.reduce((s, c) => s + creditStmt(c, base, offset).owed, 0) * 100) / 100; }
function bankSt() { return window.__bankOff || (window.__bankOff = { offset: 0 }); }
function bankCombinedHTML(list) {
  const off = bankSt().offset, b = new Date(), same = list.filter(c => acctCur(c) === 'TWD'), owed = bankOwed(same, b, off);
  const src = (state.accounts || []).filter(a => a.type !== 'card' && !a.archived && acctCur(a) === 'TWD'), pf = list.find(c => c.payFrom)?.payFrom;
  const p = list.length ? cardPeriod(list[0], b, off) : { start: '', end: '' };
  return `<div class="credit-period"><button type="button" data-bank-off="-1" aria-label="上一期">‹</button><strong>${p.start} ～ ${p.end}</strong><button type="button" data-bank-off="1" aria-label="下一期" ${off >= 0 ? 'disabled' : ''}>›</button></div>${creditStatsHTML(sumCreditStats(list.map(a => creditStats(a, b, off))))}<div class="credit-section"><div class="credit-section-head"><h4>合併對帳與繳款</h4><span class="credit-section-actions"><button type="button" class="ghost" data-recon-bank>對帳模式</button></span></div>${owed > 0 && src.length ? `<div class="credit-payment-grid"><label>繳款金額（尚欠 ${money(owed)}，自動分配到各卡）<input id="bankPayAmount" type="number" min="0" step="any" value="${owed}"></label><label>扣款帳戶<select id="bankPaySource">${src.map(a => `<option value="${esc(a.id)}"${String(a.id) === String(pf || '') ? ' selected' : ''}>${acctName(a)}（${acctMoney(a.balance, a)}）</option>`).join('')}</select></label></div><div class="credit-payment-actions"><button type="button" class="primary" data-bank-pay>合併繳款</button></div>` : '<div class="credit-empty">這一期沒有尚欠的帳款</div>'}</div>`;
}

// ---- 自動扣繳 ----
// Why an auto payment cannot run yet: '' = can pay, else a reason.
function autoPayReason(card, off, today) {
  const st = creditStmt(card, new Date(today + 'T00:00:00'), off), src = (state.accounts || []).find(a => String(a.id) === String(card.payFrom) && a.type !== 'card');
  if (!(st.owed > 0)) return 'paid';
  if (!src) return '沒有設定扣繳帳戶';
  if (acctCur(src) !== acctCur(card)) return '扣繳帳戶幣別不同';
  const items = reconItems(card, st.period, 'asc');
  if (items.some(t => !t.recon)) return '尚未完成對帳';
  if (Number(src.balance || 0) < st.owed) return '扣繳帳戶餘額不足';
  return '';
}
// Pays every due statement whose conditions are met. Ids are deterministic so two devices make the same record.
function autoPayRun(today) {
  const t0 = today || isoDate(new Date()); let n = 0;
  for (const card of (state?.accounts || [])) {
    if (card.type !== 'card' || !card.autoPay || card.archived) continue;
    for (const off of [-1, 0]) {
      const base = new Date(t0 + 'T00:00:00'), st = creditStmt(card, base, off), due = isoDate(cardStatementDueDate(card, st.period));
      if (due > t0 || due < String(card.autoPaySince || t0) || autoPayReason(card, off, t0)) continue;
      const tid = `autopay-${creditStatementKey(card, st.period)}`; if (state.transactions.some(t => t.id === tid)) continue;
      cardPayCreate(card, st.period, acct(card.payFrom), st.owed, { id: tid, date: due, note: '信用卡自動扣繳' }); n++;
    }
  }
  return n;
}
function autoPayAlerts(today, lead) {
  const t0 = isoDate(today ? new Date(today) : new Date()), out = [];
  for (const card of (state.accounts || [])) {
    if (card.type !== 'card' || !card.autoPay || card.archived) continue;
    const base = new Date(t0 + 'T00:00:00'), st = creditStmt(card, base, 0), due = isoDate(cardStatementDueDate(card, st.period)), days = Math.round((new Date(due + 'T00:00:00') - base) / 864e5), why = autoPayReason(card, 0, t0);
    if (why && why !== 'paid' && days <= lead && due >= String(card.autoPaySince || t0)) out.push({ type: 'autopay', id: String(card.id), title: `${card.name} 自動扣繳：${why}`, date: due, days, amount: st.owed });
  }
  return out;
}
function acctCardPlusHTML(a) {
  return `<label class="proj-archive"><input type="checkbox" name="ashare" ${a.shareLimit ? 'checked' : ''}> 額度共用（同一所屬銀行、也勾選此項的卡共用額度，以其中最高的額度計）</label><label class="proj-archive"><input type="checkbox" name="aautopay" ${a.autoPay ? 'checked' : ''}> 自動扣繳（到繳款期限時，該期全部對帳完成且扣款帳戶餘額足夠，就自動全額繳款）</label>`;
}
function acctCardPlusFromForm(f, old) {
  const o = {}; if (f.get('ashare')) o.shareLimit = true;
  if (f.get('aautopay')) { o.autoPay = true; o.autoPaySince = old?.autoPaySince || isoDate(new Date()); }
  return o;
}
document.addEventListener('click', async e => {
  const c = s => e.target.closest?.(s);
  const bo = c('[data-bank-off]'); if (bo) { const s = bankSt(); s.offset = Math.min(0, s.offset + Number(bo.dataset.bankOff)); renderBankDetail(); return; }
  if (c('[data-recon-bank]') && selectedBank) { openReconBank(bankCards(selectedBank), bankSt().offset); return; }
  if (c('[data-bank-pay]') && selectedBank) {
    const cards = bankCards(selectedBank).filter(x => acctCur(x) === 'TWD'), src = acct(document.getElementById('bankPaySource')?.value), amt = Number(document.getElementById('bankPayAmount')?.value || 0);
    const plan = bankPayPlan(cards, new Date(), bankSt().offset, amt);
    if (!(amt > 0) || !plan.list.length) { alert('請輸入有效的繳款金額'); return; }
    if (plan.left > 0) { alert(`繳款金額超過尚欠帳款 ${money(plan.left)}`); return; }
    if (!confirm(`從「${src.name}」繳款 ${money(amt)}：\n${plan.list.map(x => `${x.card.name} ${money(x.amount)}`).join('\n')}${Number(src.balance) < amt ? '\n\n⚠️ 扣款帳戶餘額不足' : ''}`)) return;
    for (const x of plan.list) cardPayCreate(x.card, x.period, src, x.amount);
    await save(); render(); return;
  }
  const sa = c('[data-stmt-adjust],[data-stmt-reset]');
  if (sa) {
    const card = acct(sa.dataset.stmtAdjust || sa.dataset.stmtReset), mode = document.getElementById('stmtAdjMode')?.value || 'once', date = sa.dataset.stmtReset ? '' : document.getElementById('stmtAdjDate')?.value;
    if (!sa.dataset.stmtReset && !date) return;
    if (mode === 'all' && !sa.dataset.stmtReset && !confirm(`把「${card.name}」的結帳日改成每月 ${Number(date.slice(8, 10))} 日？\n所有個別調整過的結帳日會重設。`)) return;
    const r = stmtAdjust(card, new Date(), creditStatementOffset, date, sa.dataset.stmtReset ? 'once' : mode);
    if (r.error) { alert(r.error); return; }
    if (r.back.length && confirm(`有 ${r.back.length} 筆延後入帳的記錄落回本期，要一併移到下一期第一天嗎？`)) for (const t of r.back) t.postDate = reconNextStart(r.period);
    await save(); render();
  }
});
