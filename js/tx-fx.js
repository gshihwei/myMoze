// 帳小簿 V26.68 — 跨幣種記帳、自訂幣種、國外交易手續費.
// Bundled after js/tx-post.js. Function declarations / var only.
// A transaction's `amount` is always in its account's currency; `orig` = { cur, amount, rate, auto } keeps the foreign amount.
// Custom currencies (points, miles…) live on the account: curRate (1 unit = curRate curBase), curBase, curSym, curDigits.

function customCur(cur) { cur = String(cur || '').toUpperCase(); return (state?.accounts || []).find(a => Number(a.curRate) > 0 && acctCur(a) === cur) || null; }
function customCurRate(cur) { // units per 1 TWD, or null
  const a = customCur(cur); if (!a) return null;
  const base = String(a.curBase || 'TWD').toUpperCase(); if (base === String(cur).toUpperCase() || (base !== 'TWD' && customCur(base))) return null;
  const b = base === 'TWD' ? 1 : fxRate(base); return b ? b / Number(a.curRate) : null;
}
function curText(n, cur) {
  const c = customCur(cur), d = c && Number.isFinite(Number(c.curDigits)) ? Number(c.curDigits) : 2;
  const num = Number(n || 0).toLocaleString('zh-TW', { maximumFractionDigits: d });
  return c ? (c.curSym ? `${num.startsWith('-') ? '-' : ''}${c.curSym}${num.replace('-', '')}` : `${cur} ${num}`) : acctMoney(n, { currency: cur });
}
function curDigits(cur) { const c = customCur(cur); if (c) return Number.isFinite(Number(c.curDigits)) ? Number(c.curDigits) : 2; return ['TWD', 'JPY', 'KRW'].includes(cur) ? 0 : 2; }
function curRound(n, cur) { const p = 10 ** curDigits(cur); return Math.round(Number(n || 0) * p) / p; }
// 1 unit of `from` = fxPair() units of `to`; null when a rate is missing.
function fxPair(from, to) { const a = fxRate(from), b = fxRate(to); return a && b ? b / a : null; }
function fxConvert(n, from, to) { const r = fxPair(from, to); return r ? curRound(Number(n || 0) * r, to) : null; }
// Form → { amount (account currency), orig } or { error }. Same currency → { amount }.
function fxFromForm(amount, o) {
  const cur = String(o.cur || '').toUpperCase(), acc = String(o.acctCur || 'TWD').toUpperCase();
  if (!cur || cur === acc) return { amount };
  const auto = !!o.auto, conv = auto ? fxConvert(amount, cur, acc) : Number(o.conv || 0);
  if (!(conv > 0)) return { error: auto ? `目前沒有 ${cur} 的匯率，請關閉「採用線上匯率」並輸入換算後的 ${acc} 金額` : `請輸入換算後的 ${acc} 金額` };
  return { amount: conv, orig: { cur, amount, rate: Math.round(conv / amount * 1e6) / 1e6, auto } };
}
function fxFeeAmount(card, amount) { const p = Number(card?.fxFeePct || 0); if (!(card?.type === 'card' && p > 0)) return 0; const v = Math.abs(amount) * p / 100, k = 10 ** curDigits(acctCur(card)); return card.fxFeeRound === 'floor' ? Math.floor(v * k + 1e-9) / k : card.fxFeeRound === 'ceil' ? Math.ceil(v * k - 1e-9) / k : curRound(v, acctCur(card)); }
// 國外交易手續費: a linked 手續費 expense on the same card and date.
function fxFeeCreate(t) {
  const fee = fxFeeAmount(acct(t.account), t.installment ? t.installment.amount : t.amount); if (!(fee > 0) || t.kind !== 'expense') return null;
  const c = entryEnsureCategory(state, '手續費', 'expense');
  const x = { id: id(), date: t.date, time: t.time || '', kind: 'expense', amount: fee, account: t.account, category: c.id, name: '國外交易手續費', merchant: t.merchant || '', project: t.project || '', person: '', note: t.name || '', tags: [], feeOf: t.id };
  if (t.postDate) x.postDate = t.postDate; if (t.pending) { x.pending = true; x.pendingApplied = t.pendingApplied; }
  state.transactions.push(x); adjust(x, 1); return x;
}
function fxCurOptions(sel) {
  const fav = Array.isArray(prefs().favCur) ? prefs().favCur : [];
  return [...new Set([sel, 'TWD', ...fav, ...(state.accounts || []).map(acctCur), ...acctCurrencies()])].filter(Boolean).map(c => `<option value="${esc(c)}"${c === sel ? ' selected' : ''}>${esc(c)}</option>`).join('');
}
// keeps the entry form's currency widgets in step; `t` is given once when the form opens
function fxSyncUI(t) {
  const el = txForm?.elements, sel = document.getElementById('entryCurSel'); if (!el || !sel) return;
  const a = acct(el.account?.value), ac = acctCur(a), kind = document.querySelector('input[name=kind]:checked')?.value;
  const tab = document.getElementById('modalBg')?.dataset.etab, ok = (kind === 'expense' || kind === 'income') && tab !== 'receivable' && tab !== 'payable';
  if (t !== undefined) { sel.dataset.cur = t?.orig?.cur || ''; el.convAuto.checked = t?.orig ? !!t.orig.auto : true; el.convAmount.value = t?.orig ? entryBaseAmount(t) : ''; el.fxFeeOn.dataset.set = ''; }
  const cur = ok && sel.dataset.cur ? sel.dataset.cur : ac;
  sel.innerHTML = fxCurOptions(cur); sel.value = cur; sel.disabled = !ok;
  const foreign = cur !== ac, row = document.getElementById('fxRow'); if (row) row.hidden = !foreign;
  const lab = document.getElementById('fxLabel'); if (lab) lab.textContent = `轉換成 ${ac}`;
  const n = Number(el.amount?.value || 0);
  if (foreign && el.convAuto.checked) { const v = n ? fxConvert(n, cur, ac) : ''; el.convAmount.value = v === null ? '' : v; }
  const conv = Number(el.convAmount.value || 0), hint = document.getElementById('fxHint');
  if (hint) hint.textContent = !foreign ? '' : conv > 0 && n > 0 ? `1 ${cur} ≈ ${(conv / n).toLocaleString('zh-TW', { maximumFractionDigits: 6 })} ${ac}${el.convAuto.checked ? '（線上匯率，收到帳單後可改成實際金額）' : '（手動）'}` : fxPair(cur, ac) ? '' : `沒有 ${cur} 的線上匯率，請手動輸入`;
  const fr = document.getElementById('fxFeeRow'), fee = fxFeeAmount(a, conv || n), can = kind === 'expense' && a?.type === 'card' && Number(a.fxFeePct) > 0 && !editId;
  if (fr) fr.hidden = !can;
  if (can && el.fxFeeOn.dataset.set !== '1') el.fxFeeOn.checked = foreign; if (!can) el.fxFeeOn.checked = false;
  const fl = document.getElementById('fxFeeLabel'); if (fl) fl.textContent = `國外交易手續費 ${a?.fxFeePct || 0}%${fee ? `（約 ${acctMoney(fee, a)}）` : ''}`;
}
function acctCustomCurHTML(a) {
  const base = String(a?.curBase || 'TWD');
  return `<details class="acct-customcur"${a?.curRate ? ' open' : ''}><summary>自訂幣種（點數、哩程、虛擬貨幣）</summary><div class="form-grid"><label>1 單位 =<input name="acurrate" type="number" min="0" step="any" value="${esc(a?.curRate ?? '')}" placeholder="例如 1（留空＝一般幣別）"></label><label>基準幣種<input name="acurbase" maxlength="6" value="${esc(base)}"></label><label>顯示符號<input name="acursym" maxlength="6" value="${esc(a?.curSym || '')}" placeholder="例如 P"></label><label>小數位數<input name="acurdigits" type="number" min="0" max="8" value="${esc(a?.curDigits ?? 0)}"></label></div><p class="hint">幣別代碼填自訂代碼（2～6 個英文字母，例如 LP）。</p></details>`;
}
function acctCustomCurFromForm(f) {
  const r = Number(f.get('acurrate') || 0); if (!(r > 0)) return {};
  const d = Math.floor(Number(f.get('acurdigits')));
  const o = { curRate: r, curBase: String(f.get('acurbase') || 'TWD').trim().toUpperCase() || 'TWD', curDigits: d >= 0 && d <= 8 ? d : 0 };
  const s = String(f.get('acursym') || '').trim().slice(0, 6); if (s) o.curSym = s; return o;
}
document.addEventListener('change', e => {
  const t = e.target; if (!t?.closest?.('#txForm')) return;
  if (t.id === 'entryCurSel') { t.dataset.cur = t.value; const fav = [t.value, ...(prefs().favCur || [])]; setPref('favCur', [...new Set(fav)].filter(c => c !== 'TWD').slice(0, 5)); txForm.elements.convAuto.checked = true; }
  if (t.name === 'fxFeeOn') t.dataset.set = '1';
  if (['entryCurSel'].includes(t.id) || ['account', 'convAuto', 'convAmount', 'kind', 'fxFeeOn'].includes(t.name)) fxSyncUI();
});
document.addEventListener('input', e => {
  const t = e.target; if (!t?.closest?.('#txForm')) return;
  if (t.name === 'convAmount') { txForm.elements.convAuto.checked = false; fxSyncUI(); } else if (t.name === 'amount') fxSyncUI();
});
document.addEventListener('click', e => { if (e.target.closest?.('#entryCurSel')) e.stopPropagation(); }, true);
