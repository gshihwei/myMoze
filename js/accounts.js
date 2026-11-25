// 帳小簿 V26.10 — 帳戶管理.
// Bundled after js/projects.js; uses app.js globals (state, esc, money, acct, acctName, acctMoney,
// acctCur, adjust, isoDate, selectedDate, openEntity, deleteAccount, save, render, id).
// Function declarations / var only.
//
// Account record: { id, name, type: 'cash' | 'bank' | 'ewallet' | 'broker' | 'card', balance, currency?, limit?, statement?, due?, note?, archived? }

function acctCurrencies() { return ['TWD', 'USD', 'JPY', 'EUR', 'CNY', 'HKD', 'KRW', 'GBP', 'AUD', 'SGD', 'CAD', 'THB']; }
function acctTypes() { return [['bank', '銀行'], ['cash', '現金'], ['ewallet', '電子支付'], ['broker', '證券戶'], ['card', '信用卡']]; }
function acctTypeLabel(a) { return (acctTypes().find(([k]) => k === a?.type) || [0, '銀行'])[1]; }
function acctHasTx(aid) { const k = String(aid); return (state.transactions || []).some(t => String(t.account) === k || String(t.toAccount ?? '') === k); }
// User-defined order (account.order); accounts without one keep their stored order after the ordered ones.
function acctOrdered(list) { const arr = [...(list || [])]; return arr.map((a, i) => [a, Number.isFinite(Number(a.order)) ? Number(a.order) : 1e6 + i]).sort((x, y) => x[1] - y[1]).map(x => x[0]); }
function acctMove(a, dir) {
  const group = acctOrdered(state.accounts).filter(x => (x.type === 'card') === (a.type === 'card'));
  const all = acctOrdered(state.accounts); all.forEach((x, i) => { x.order = i; });
  const i = group.indexOf(a), j = i + dir; if (i < 0 || j < 0 || j >= group.length) return false;
  const b = group[j]; [a.order, b.order] = [b.order, a.order]; return true;
}
// True when the account has a low-balance threshold and its balance is below it (cards never trigger).
function lowBalanceHit(a) { return !!a && a.type !== 'card' && !a.archived && Number.isFinite(Number(a.lowBalance)) && a.lowBalance !== '' && a.lowBalance !== null && Number(a.balance || 0) < Number(a.lowBalance); }
// Options shared by the "new account" form: exclude from net worth, low-balance reminder (not for cards).
function acctNewOptionsHTML() {
  return `<label class="proj-archive"><input type="checkbox" name="aexclude"> 不納入總資產</label><div class="form-grid form-grid-1"><label>餘額不足提醒（低於此金額時提醒；信用卡不適用，留空＝不提醒）<input name="alow" type="number" min="0" step="any" inputmode="decimal" placeholder="例如 3000"></label></div>`;
}
function acctOptionsFromForm(f, type) {
  const o = {}, raw = String(f.get('alow') ?? '').trim(), low = Number(raw);
  if (f.get('aexclude')) o.excludeNet = true;
  if (type !== 'card' && raw !== '' && Number.isFinite(low) && low >= 0) o.lowBalance = low;
  return o;
}
// ---- V26.40 credit-card account settings (MOZE-style) ----
function acctWeekendOptions(cur) { return [['keep', '依原日期'], ['next', '順延到下週一'], ['prev', '提前到週五']].map(([k, l]) => `<option value="${k}" ${(cur || 'keep') === k ? 'selected' : ''}>${l}</option>`).join(''); }
// Bank choices for a credit card: names of the bank-type accounts, plus the card's current value so it is never lost.
function acctBankNames(current) {
  const names = [...new Set((state.accounts || []).filter(x => x.type === 'bank').map(x => String(x.name || '').trim()).filter(Boolean))];
  const cur = String(current || '').trim(); if (cur && !names.includes(cur)) names.push(cur);
  return names;
}
function acctBankOptions(current) { const cur = String(current || '').trim(); return acctBankNames(cur).map(b => `<option value="${esc(b)}" ${b === cur ? 'selected' : ''}>${esc(b)}</option>`).join(''); }
function acctCardFieldsHTML(a, card) {
  const sources = (state.accounts || []).filter(x => x.type !== 'card' && String(x.id) !== String(a.id));
  return `<div class="acct-card-fields" data-acct-card-fields ${card ? '' : 'hidden'}><div class="form-grid">
    <label>所屬銀行（從銀行帳戶選擇，帳戶頁依銀行分組）<select name="abank"><option value="">不指定</option>${acctBankOptions(a.bank)}</select></label>
    <label>信用額度<input name="alimit" type="number" min="0" step="any" value="${esc(a.limit ?? 0)}"></label>
    <label>可用額度不足提醒（低於此金額提醒，留空＝不提醒）<input name="alowavail" type="number" min="0" step="any" inputmode="decimal" value="${esc(a.lowAvail ?? '')}" placeholder="例如 10000"></label>
    <label>結帳日<input name="astatement" type="number" min="1" max="31" value="${esc(a.statement ?? 15)}"></label>
    <label>結帳日遇非工作日<select name="astmtwk">${acctWeekendOptions(a.stmtWeekend)}</select></label>
    <label>繳款日<input name="adue" type="number" min="1" max="31" value="${esc(a.due ?? 5)}"></label>
    <label>繳款日遇非工作日<select name="aduewk">${acctWeekendOptions(a.dueWeekend)}</select></label>
    <label>主帳戶（繳款時預設的扣款帳戶）<select name="apayfrom"><option value="">不指定</option>${sources.map(x => `<option value="${esc(x.id)}" ${String(a.payFrom ?? '') === String(x.id) ? 'selected' : ''}>${esc(acctName(x))}</option>`).join('')}</select></label>
    <label>紅利回饋 %<input name="areward" type="number" min="0" step="any" inputmode="decimal" value="${esc(a.rewardPct ?? '')}" placeholder="例如 1"></label>
    <label>國外交易手續費 %（外幣卡，僅估算顯示）<input name="afxfee" type="number" min="0" step="any" inputmode="decimal" value="${esc(a.fxFeePct ?? '')}" placeholder="例如 1.5"></label></div>
    <label class="proj-archive"><input type="checkbox" name="aoffset" ${a.offsetBill ? 'checked' : ''}> 帳單折抵（建議繳款金額先扣掉預估回饋）</label></div>`;
}
// Weekend handling for statement / due dates. Only Saturdays and Sundays are known (public holidays are not built in).
function cardAdjustDate(card, d, mode) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate()), w = out.getDay();
  if (mode === 'next') { if (w === 6) out.setDate(out.getDate() + 2); else if (w === 0) out.setDate(out.getDate() + 1); }
  else if (mode === 'prev') { if (w === 6) out.setDate(out.getDate() - 1); else if (w === 0) out.setDate(out.getDate() - 2); }
  return out;
}
// Statement closing date for the (0-based) month m of year y, after the weekend rule.
function cardStmtEnd(card, y, m) {
  const first = new Date(y, m, 1), stmt = Math.min(31, Math.max(1, Number(card.statement || 15))), dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return cardAdjustDate(card, new Date(first.getFullYear(), first.getMonth(), Math.min(stmt, dim)), card.stmtWeekend);
}
// [year, month] (0-based) of the closed statement `offset` periods back from `base`.
function cardNominalMonth(card, base, offset) {
  const day = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  let y = base.getFullYear(), m = base.getMonth();
  if (day <= cardStmtEnd(card, y, m)) m -= 1;
  const d = new Date(y, m + (offset || 0), 1); return [d.getFullYear(), d.getMonth()];
}
// Available credit below the reminder threshold.
function creditLowAvailHit(a) {
  if (!a || a.type !== 'card' || a.archived) return false;
  const lim = Number(a.limit || 0), th = a.lowAvail; if (!(lim > 0) || th === '' || th === null || th === undefined || !Number.isFinite(Number(th))) return false;
  return creditUsage(a).available < Number(th);
}
// Estimated reward / foreign fee lines for the statement panel (display only; never changes balances).
function creditRewardHTML(card, spend, due) {
  const pct = Number(card.rewardPct || 0), fx = Number(card.fxFeePct || 0), parts = [];
  const reward = Math.round(spend * pct / 100);
  if (pct > 0) { parts.push(`預估回饋 ${money(reward)}（${pct}%）`); if (card.offsetBill) parts.push(`折抵後建議繳款 ${money(Math.max(0, due - reward))}`); }
  if (fx > 0 && acctCur(card) !== 'TWD') parts.push(`預估國外手續費 ${money(Math.round(spend * fx / 100))}（${fx}%）`);
  return parts.length ? `<div class="credit-reward hint">${parts.join(' · ')}</div>` : '';
}
// Sum of the balances in TWD (foreign currency at the current rate; accounts without a rate are skipped).
function acctGroupTotal(list) {
  let t = 0;
  for (const a of (list || [])) { const cur = acctCur(a), v = Number(a.balance || 0), tw = cur === 'TWD' ? v : toTWD(v, cur); if (tw !== null && tw !== undefined && Number.isFinite(tw)) t += tw; }
  return Math.round(t);
}
function acctSignedMoney(n) { return `${n < 0 ? '−' : '+'}${money(Math.abs(n))}`; }
// Banks of credit cards in first-seen order: [{ bank, idx: [indexes into cards] }]; cards without a bank stay single.
function acctCardBanks(cards) {
  const out = [], seen = new Map();
  cards.forEach((c, i) => {
    const b = String(c.bank || '').trim();
    if (!b) { out.push({ bank: '', idx: [i] }); return; }
    if (!seen.has(b)) { seen.set(b, { bank: b, idx: [] }); out.push(seen.get(b)); }
    seen.get(b).idx.push(i);
  });
  return out;
}
// Account page groups (collapsible, each with its total). Collapsed groups / banks live in prefs() (per device).
// cardTiles / tiles are the per-account HTML aligned with cards / normal.
function acctGroupsHTML(cards, cardTiles, normal, tiles) {
  const collapsed = new Set(prefs().acctCollapsed || []), bankCollapsed = new Set(prefs().bankCollapsed || []);
  const head = (key, label, list) => `<button type="button" class="acct-group-head" data-acct-group="${key}" aria-expanded="${collapsed.has(key) ? 'false' : 'true'}"><span>${collapsed.has(key) ? '＋' : '−'} ${label} (${list.length})</span><span class="acct-group-total">${acctSignedMoney(acctGroupTotal(list))}</span></button>`;
  let body = '';
  for (const g of acctCardBanks(cards)) {
    if (!g.bank) { body += cardTiles[g.idx[0]]; continue; }
    const list = g.idx.map(i => cards[i]), off = bankCollapsed.has(g.bank), used = Math.abs(Math.min(0, acctGroupTotal(list)));
    body += `<div class="account-tile bank-row"><div class="account-tile-icon">${svg('bank')}</div><div class="account-tile-main"><b>${esc(g.bank)}</b><span>${list.length} 張信用卡</span></div><strong>${money(used)}</strong><button type="button" class="bank-toggle" data-bank-toggle="${esc(g.bank)}" aria-expanded="${off ? 'false' : 'true'}" aria-label="${off ? '展開' : '收合'} ${esc(g.bank)}">${off ? '⌄' : '⌃'}</button></div>`;
    if (!off) body += `<div class="bank-children">${g.idx.map(i => cardTiles[i]).join('')}</div>`;
  }
  let html = head('card', '信用卡', cards) + (collapsed.has('card') ? '' : `<div class="credit-list">${cards.length ? body : '<div class="empty">尚無信用卡</div>'}</div>`);
  for (const [key, label] of acctTypes().filter(([k]) => k !== 'card')) {
    const idx = normal.map((a, i) => [a, i]).filter(([a]) => (a.type || 'bank') === key).map(([, i]) => i);
    if (!idx.length) continue;
    html += head(key, label, idx.map(i => normal[i])) + (collapsed.has(key) ? '' : `<div class="normal-accounts">${idx.map(i => tiles[i]).join('')}</div>`);
  }
  if (!normal.length) html += '<div class="empty">尚無一般帳戶</div>';
  return html;
}
function acctToggleBank(name) {
  const set = new Set(prefs().bankCollapsed || []); if (set.has(name)) set.delete(name); else set.add(name);
  setPref('bankCollapsed', [...set]);
}
function acctToggleGroup(key) {
  const set = new Set(prefs().acctCollapsed || []); if (set.has(key)) set.delete(key); else set.add(key);
  setPref('acctCollapsed', [...set]);
}
// Credit-card fields from the account form (both "new" and "manage"); `old` supplies nothing but is kept for symmetry.
function acctCardSettingsFromForm(f) {
  const a = {};
  a.limit = Math.max(0, Number(f.get('alimit') || 0)); a.statement = Math.min(31, Math.max(1, Math.round(Number(f.get('astatement') || 15)))); a.due = Math.min(31, Math.max(1, Math.round(Number(f.get('adue') || 5))));
  const wk = v => (['next', 'prev'].includes(String(v)) ? String(v) : ''), num = k => { const raw = String(f.get(k) ?? '').trim(), n = Number(raw); return raw !== '' && Number.isFinite(n) && n >= 0 ? n : null; };
  const put = (k, v) => { if (!(v === null || v === '' || v === false)) a[k] = v; };
  put('bank', String(f.get('abank') ?? '').trim().slice(0, 30)); put('stmtWeekend', wk(f.get('astmtwk'))); put('dueWeekend', wk(f.get('aduewk')));
  const pf = String(f.get('apayfrom') || ''); put('payFrom', (state.accounts || []).some(x => x.type !== 'card' && String(x.id) === pf) ? pf : '');
  put('rewardPct', num('areward')); put('fxFeePct', num('afxfee')); put('lowAvail', num('alowavail')); put('offsetBill', !!f.get('aoffset'));
  return a;
}
function acctActive(list, keepId) { return (list || []).filter(a => !a.archived || String(a.id) === String(keepId ?? '')); }

function acctCurrencyField(cur, locked) {
  return `<label>幣別<input name="acur" list="acctCurList" maxlength="3" value="${esc(cur || 'TWD')}" ${locked ? 'readonly' : ''} autocapitalize="characters"><datalist id="acctCurList">${acctCurrencies().map(c => `<option value="${c}"></option>`).join('')}</datalist></label>`;
}

function acctEditFormHTML(a) {
  const locked = acctHasTx(a.id), card = a.type === 'card', bal = Number(a.balance || 0);
  const period = card ? cardPeriod(a, new Date(), 0) : null;
  return `<div class="acct-edit-top"><div class="account-detail-icon">${svgForAccount(a)}</div><small>餘額 ${esc(acctCur(a))}</small><strong class="${bal < 0 ? 'expense-text' : ''}">${acctMoney(bal, a)}</strong>${period ? `<small>帳單週期 ${period.start} ～ ${period.end}</small>` : ''}</div>
  <div class="form-grid">
    <label>帳戶名稱<input name="aname" required maxlength="30" value="${esc(a.name || '')}"></label>
    <label>類型<select name="atype">${acctTypes().map(([k, l]) => `<option value="${k}" ${(a.type || 'bank') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${acctCurrencyField(acctCur(a), locked)}
  </div>
  ${acctCardFieldsHTML(a, card)}
  <p class="hint">更改類型不會變動餘額與交易。信用卡的餘額為負數代表欠款；由一般帳戶改成信用卡時，請確認餘額符號。</p>
  <div class="form-grid form-grid-1"><label>備註<input name="anote" maxlength="100" value="${esc(a.note || '')}" placeholder="可留空，例如帳號末四碼"></label></div>
  <label class="proj-archive"><input type="checkbox" name="aarchived" ${a.archived ? 'checked' : ''}> 封存（不再出現在記帳的帳戶選單；餘額仍計入淨資產）</label>
  <label class="proj-archive"><input type="checkbox" name="aexclude" ${a.excludeNet ? 'checked' : ''}> 不納入總資產（概覽的淨資產、淨資產走勢與資產負債總覽都不計入這個帳戶）</label>
  ${card ? '' : `<div class="form-grid form-grid-1"><label>餘額不足提醒（餘額低於此金額時提醒，留空＝不提醒）<input name="alow" type="number" min="0" step="any" inputmode="decimal" value="${esc(a.lowBalance ?? '')}" placeholder="例如 3000"></label></div>`}
  ${locked ? '<p class="hint">這個帳戶已有交易，幣別不能修改。</p>' : ''}
  <div class="acct-manage-actions">
    <span class="hint">目前餘額 ${acctMoney(a.balance, a)}</span>
    <button type="button" class="secondary" data-acct-move="-1" data-acct-id="${esc(a.id)}" aria-label="往前移">↑</button><button type="button" class="secondary" data-acct-move="1" data-acct-id="${esc(a.id)}" aria-label="往後移">↓</button>
    <button type="button" class="secondary" data-acct-adjust="${esc(a.id)}">調整餘額</button>
    <button type="button" class="secondary danger-btn" data-acct-delete="${esc(a.id)}">刪除帳戶</button>
  </div>`;
}

function acctFromEditForm(f, old) {
  const name = String(f.get('aname') || '').trim().slice(0, 30);
  if (!name) return { error: '請輸入帳戶名稱' };
  const cur = String(f.get('acur') || acctCur(old)).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(cur)) return { error: '幣別請輸入 3 個英文字母，例如 TWD、USD' };
  if (cur !== acctCur(old) && acctHasTx(old.id)) return { error: '這個帳戶已有交易，幣別不能修改' };
  if ((state.accounts || []).some(a => a !== old && a.name === name && acctCur(a) === cur)) return { error: `已經有「${name}（${cur}）」` };
  const a = { ...old, name, currency: cur, note: String(f.get('anote') || '').trim(), archived: !!f.get('aarchived') };
  const want = String(f.get('atype') || old.type || 'bank'); a.type = acctTypes().some(([k]) => k === want) ? want : (old.type || 'bank');
  if (a.type !== 'card') for (const k of ['limit', 'statement', 'due', 'bank', 'stmtWeekend', 'dueWeekend', 'payFrom', 'rewardPct', 'fxFeePct', 'lowAvail', 'offsetBill']) delete a[k];
  else { for (const k of ['bank', 'stmtWeekend', 'dueWeekend', 'payFrom', 'rewardPct', 'fxFeePct', 'lowAvail', 'offsetBill']) delete a[k]; Object.assign(a, acctCardSettingsFromForm(f)); }
  if (!a.note) delete a.note;
  if (!a.archived) delete a.archived;
  if (a.type === 'card') delete a.lowBalance;
  if (f.get('aexclude')) a.excludeNet = true; else delete a.excludeNet;
  const low = Number(f.get('alow')); if (old.type !== 'card' && String(f.get('alow') ?? '').trim() !== '' && Number.isFinite(low) && low >= 0) a.lowBalance = low; else delete a.lowBalance;
  return { account: a };
}

function acctAdjustFormHTML(a) {
  return `<p>「${acctName(a)}」目前餘額 <b>${acctMoney(a.balance, a)}</b>。輸入實際餘額後，會建立一筆「餘額調整」交易補上差額，帳戶對帳也會一致。</p>
  <div class="form-grid">
    <label>實際餘額${a.type === 'card' ? '（欠款請輸入負數）' : ''}<input name="abalance" type="number" step="any" required value="${esc(a.balance)}"></label>
    <label>日期<input name="adate" type="date" required value="${esc(selectedDate || isoDate(new Date()))}"></label>
  </div>
  <div class="form-grid form-grid-1"><label>備註<input name="anote" maxlength="100" placeholder="例如：對帳後修正"></label></div>`;
}

// Adjust to an absolute balance by recording the difference as a balance_adjustment transaction.
function acctAdjustTo(a, target, date, note) {
  const diff = Math.round((Number(target) - Number(a.balance || 0)) * 100) / 100;
  if (!Number.isFinite(diff) || Math.abs(diff) < 0.005) return null;
  const t = { id: id(), date: date || isoDate(new Date()), time: '', name: '餘額調整', amount: diff, kind: 'balance_adjustment', category: '', account: a.id, note: note || '', tags: [], balanceAdjustment: true };
  state.transactions.push(t); adjust(t, 1);
  return t;
}

// ---- V26.11 transfers between accounts (incl. different currencies) ----
function transferNeedsFx(fromId, toId) { const a = acct(fromId), b = acct(toId); return !!(a?.id && b?.id && acctCur(a) !== acctCur(b)); }
// Balance effects of a manual transfer: source pays amount + fee; destination receives toAmount
// (its own currency) when the currencies differ, otherwise the same amount.
function transferFields(amount, fromId, toId, toAmountRaw, feeRaw) {
  const fee = Math.max(0, Number(feeRaw) || 0), fx = transferNeedsFx(fromId, toId), toAmount = Number(toAmountRaw);
  if (String(fromId) === String(toId)) return { error: '轉出與轉入帳戶不能相同' };
  if (fx && !(toAmount > 0)) return { error: `兩個帳戶幣別不同，請輸入轉入金額（${acctCur(acct(toId))}）` };
  const out = { fee: fee || undefined, balanceEffect: fee ? -(Math.abs(amount) + fee) : undefined };
  if (fx) { out.toAmount = toAmount; out.toBalanceEffect = toAmount; out.toCurrency = acctCur(acct(toId)); }
  else { out.toAmount = undefined; out.toBalanceEffect = undefined; out.toCurrency = undefined; }
  return out;
}
function updateTransferFx() {
  const f = document.getElementById('txForm'); if (!f?.elements) return;
  const isT = f.elements.kind?.value === 'transfer' || document.querySelector('input[name=kind]:checked')?.value === 'transfer';
  const fx = isT && transferNeedsFx(f.elements.account?.value, f.elements.toAccount?.value);
  const field = document.getElementById('transferFxField'); if (field) field.style.display = fx ? 'grid' : 'none';
  const cur = document.getElementById('transferFxCur'); if (cur) cur.textContent = fx ? acctCur(acct(f.elements.toAccount.value)) : '';
}
document.addEventListener('change', e => { if (e.target?.closest?.('#txForm') && ['account', 'toAccount', 'kind'].includes(e.target.name)) updateTransferFx(); });

document.addEventListener('change', e => { const s = e.target; if (s?.name === 'atype' && s.closest?.('#entityForm')) { const box = s.closest('#entityForm').querySelector('[data-acct-card-fields]'); if (box) box.hidden = s.value !== 'card'; } });
document.addEventListener('click', async e => {
  const bk = e.target.closest?.('[data-bank-toggle]'); if (bk) { acctToggleBank(bk.dataset.bankToggle); renderAccounts(); return; }
  const grp = e.target.closest?.('[data-acct-group]'); if (grp) { acctToggleGroup(grp.dataset.acctGroup); renderAccounts(); return; }
  const find = v => (state.accounts || []).find(a => String(a.id) === String(v));
  const mg = e.target.closest?.('[data-acct-manage]'); if (mg) { e.preventDefault(); e.stopPropagation(); const a = find(mg.dataset.acctManage); if (a) openEntity('accountEdit', a); return; }
  const mv = e.target.closest?.('[data-acct-move]'); if (mv) { const a = find(mv.dataset.acctId); if (a && acctMove(a, Number(mv.dataset.acctMove))) { await save(); render(); } return; }
  const adj = e.target.closest?.('[data-acct-adjust]'); if (adj) { const a = find(adj.dataset.acctAdjust); if (a) openEntity('accountAdjust', a); return; }
  const del = e.target.closest?.('[data-acct-delete]'); if (del) { closeModals(); await deleteAccount(del.dataset.acctDelete); }
});
