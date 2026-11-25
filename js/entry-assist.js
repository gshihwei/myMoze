// 帳小簿 V26.13 — 記帳輔助：名稱／商家自動完成、依歷史帶入分類與帳戶、複製交易.
// Bundled after js/settings.js; uses app.js globals (state, editId, txForm, openTx, blockLoanTx,
// detailBg). Function declarations / var only.

// Distinct values ranked by how often (then how recently) they were used.
function entryRanked(field, kind, limit = 60) {
  const map = new Map(), recent = (state.transactions || []).slice(-3000);
  recent.forEach((t, i) => {
    if (kind && t.kind !== kind) return;
    const v = String(t[field] || '').trim(); if (!v) return;
    const r = map.get(v) || { v, n: 0, last: 0 }; r.n++; r.last = i; map.set(v, r);
  });
  return [...map.values()].sort((a, b) => b.n - a.n || b.last - a.last).slice(0, limit).map(r => r.v);
}

// The most recent transaction of this kind with exactly this name — the template to copy fields from.
function entryTemplate(name, kind) {
  const n = String(name || '').trim(); if (!n) return null;
  const list = state.transactions || [];
  for (let i = list.length - 1; i >= 0; i--) { const t = list[i]; if (t.name === n && (!kind || t.kind === kind) && t.kind !== 'loan' && t.kind !== 'loanPayment') return t; }
  return null;
}

function entryFillDatalists() {
  const kind = document.querySelector('input[name=kind]:checked')?.value || 'expense';
  const fill = (id, values) => { const dl = document.getElementById(id); if (dl) dl.innerHTML = values.map(v => `<option value="${esc(v)}"></option>`).join(''); };
  fill('nameSuggest', entryRanked('name', kind));
  fill('merchantSuggest', entryRanked('merchant', ''));
  fill('personSuggest', entryRanked('person', '').filter(p => p !== '不限定對象'));
}

// When a known name is typed or picked on a NEW transaction, prefill category / account / merchant
// that the user has not changed yet. Never touches the amount or an edited transaction.
function entryApplyTemplate() {
  if (editId || !txForm?.elements) return false;
  const kind = document.querySelector('input[name=kind]:checked')?.value || 'expense';
  const t = entryTemplate(txForm.elements.name?.value, kind); if (!t) return false;
  const el = txForm.elements, set = (name, v) => { if (el[name] && v !== undefined && v !== null && v !== '' && !el[name].dataset.userSet) { el[name].value = v; el[name].dispatchEvent(new Event('change', { bubbles: true })); } };
  if ([...(el.category?.options || [])].some(o => String(o.value) === String(t.category))) set('category', t.category);
  if ([...(el.account?.options || [])].some(o => String(o.value) === String(t.account))) set('account', t.account);
  if (!el.merchant?.value) set('merchant', t.merchant);
  if (!el.tags?.value && Array.isArray(t.tags) && t.tags.length) set('tags', t.tags.join(' '));
  if (t.kind === 'transfer' && [...(el.toAccount?.options || [])].some(o => String(o.value) === String(t.toAccount))) set('toAccount', t.toAccount);
  return true;
}

// A copy for re-entry: same details, new id, today's selected date, never pending / imported.
function entryCopyOf(t) {
  const c = JSON.parse(JSON.stringify(t));
  for (const k of ['id', '_importKey', 'imported', 'recordType', 'balanceEffect', 'toBalanceEffect', 'pending', 'pendingApplied', 'recurringId', 'recurringSeq', 'cardPayment', 'cardStatementKey', 'paymentId', 'refundOf', 'refundSplit', 'postDate', 'recon', 'depositOf', 'balanceTx', 'remindOn', 'installment']) delete c[k];
  c.date = selectedDate || isoDate(new Date()); c.time = nowTime();
  if (t.kind === 'transfer' && t.fee) c.fee = t.fee;
  return c;
}

document.addEventListener('input', e => {
  const t = e.target; if (!t?.closest?.('#txForm')) return;
  if (t.name === 'name') entryApplyTemplate();
});
document.addEventListener('change', e => {
  const t = e.target; if (!t?.closest?.('#txForm') || !e.isTrusted) return;
  if (['category', 'account', 'merchant', 'toAccount', 'tags'].includes(t.name)) t.dataset.userSet = '1';
  if (t.name === 'kind') entryFillDatalists();
});
document.addEventListener('click', e => {
  const b = e.target.closest?.('#detailCopy'); if (!b) return;
  const t = (state.transactions || []).find(x => String(x.id) === String(window.detailId)); if (!t || blockLoanTx(t)) return;
  detailBg.classList.remove('open'); openTx(t.kind, entryCopyOf(t));
});

// ---- V26.23 記帳範本 (per device, prefs().templates) ----
function tplList() { return Array.isArray(prefs().templates) ? prefs().templates : []; }
function tplFromTx(t, name) {
  const data = entryCopyOf(t); delete data.date; delete data.time; delete data.installment;
  return { id: id(), name: String(name || t.name || '範本').trim().slice(0, 20) || '範本', data };
}
function tplSave(t, name) { const list = [tplFromTx(t, name), ...tplList()].slice(0, 12); setPref('templates', list); return list[0]; }
function tplRemove(tid) { setPref('templates', tplList().filter(x => String(x.id) !== String(tid))); }
function tplOpen(tid) {
  const tp = tplList().find(x => String(x.id) === String(tid)); if (!tp) return false;
  openTx(tp.data.kind || 'expense', { ...tp.data, date: selectedDate || isoDate(new Date()), time: nowTime() }); return true;
}
function renderTemplates() {
  const box = document.getElementById('quickTemplates'); if (!box) return;
  const list = tplList();
  box.innerHTML = list.length ? list.map(x => `<span class="tpl-chip"><button type="button" data-tpl-up="${esc(x.id)}" aria-label="往前移">‹</button><button type="button" data-tpl-open="${esc(x.id)}">${esc(cat(x.data.category).icon)} ${esc(x.name)}${x.data.amount ? ` <small>${money(x.data.amount)}</small>` : ''}</button><button type="button" class="tpl-del" data-tpl-del="${esc(x.id)}" aria-label="刪除範本 ${esc(x.name)}">×</button></span>`).join('')
    : '<p class="hint">在交易明細按「存成範本」，常用的記帳就能一鍵開啟。</p>';
}
document.addEventListener('click', e => {
  const sv = e.target.closest?.('#detailTemplate');
  if (sv) { const t = (state.transactions || []).find(x => String(x.id) === String(window.detailId)); if (!t || blockLoanTx(t)) return; const n = prompt('範本名稱', t.name || ''); if (n === null) return; tplSave(t, n); renderTemplates(); alert('已存成範本，可在概覽的「快速記帳」使用。'); return; }
  const op = e.target.closest?.('[data-tpl-open]'); if (op) { tplOpen(op.dataset.tplOpen); return; }
  const dl = e.target.closest?.('[data-tpl-del]'); if (dl) { if (confirm('刪除這個範本？')) { tplRemove(dl.dataset.tplDel); renderTemplates(); } }
});
