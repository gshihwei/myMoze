// 帳小簿 V26.10 — 帳戶管理.
// Bundled after js/projects.js; uses app.js globals (state, esc, money, acct, acctName, acctMoney,
// acctCur, adjust, isoDate, selectedDate, openEntity, deleteAccount, save, render, id).
// Function declarations / var only.
//
// Account record: { id, name, type: 'cash' | 'bank' | 'ewallet' | 'card', balance, currency?, limit?, statement?, due?, note?, archived? }

function acctCurrencies() { return ['TWD', 'USD', 'JPY', 'EUR', 'CNY', 'HKD', 'KRW', 'GBP', 'AUD', 'SGD', 'CAD', 'THB']; }
function acctTypes() { return [['bank', '銀行'], ['cash', '現金'], ['ewallet', '電子支付'], ['card', '信用卡']]; }
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
function acctActive(list, keepId) { return (list || []).filter(a => !a.archived || String(a.id) === String(keepId ?? '')); }

function acctCurrencyField(cur, locked) {
  return `<label>幣別<input name="acur" list="acctCurList" maxlength="3" value="${esc(cur || 'TWD')}" ${locked ? 'readonly' : ''} autocapitalize="characters"><datalist id="acctCurList">${acctCurrencies().map(c => `<option value="${c}"></option>`).join('')}</datalist></label>`;
}

function acctEditFormHTML(a) {
  const locked = acctHasTx(a.id), card = a.type === 'card';
  return `<div class="form-grid">
    <label>帳戶名稱<input name="aname" required maxlength="30" value="${esc(a.name || '')}"></label>
    <label>類型<select name="atype">${acctTypes().map(([k, l]) => `<option value="${k}" ${(a.type || 'bank') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${acctCurrencyField(acctCur(a), locked)}
  </div>
  <div class="form-grid" data-acct-card-fields ${card ? '' : 'hidden'}><label>信用額度<input name="alimit" type="number" min="0" step="any" value="${esc(a.limit ?? 0)}"></label><label>結帳日<input name="astatement" type="number" min="1" max="31" value="${esc(a.statement ?? 15)}"></label><label>繳款日<input name="adue" type="number" min="1" max="31" value="${esc(a.due ?? 5)}"></label></div>
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
  if (a.type !== 'card') { delete a.limit; delete a.statement; delete a.due; }
  else { a.limit = Math.max(0, Number(f.get('alimit') || 0)); a.statement = Math.min(31, Math.max(1, Math.round(Number(f.get('astatement') || 15)))); a.due = Math.min(31, Math.max(1, Math.round(Number(f.get('adue') || 5)))); }
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
  const find = v => (state.accounts || []).find(a => String(a.id) === String(v));
  const mg = e.target.closest?.('[data-acct-manage]'); if (mg) { e.preventDefault(); e.stopPropagation(); const a = find(mg.dataset.acctManage); if (a) openEntity('accountEdit', a); return; }
  const mv = e.target.closest?.('[data-acct-move]'); if (mv) { const a = find(mv.dataset.acctId); if (a && acctMove(a, Number(mv.dataset.acctMove))) { await save(); render(); } return; }
  const adj = e.target.closest?.('[data-acct-adjust]'); if (adj) { const a = find(adj.dataset.acctAdjust); if (a) openEntity('accountAdjust', a); return; }
  const del = e.target.closest?.('[data-acct-delete]'); if (del) { closeModals(); await deleteAccount(del.dataset.acctDelete); }
});
