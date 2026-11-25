// 帳小簿 V26.103 — 信用帳戶頁、更多功能選單、繳款（轉帳版面）、帳戶 CSV.
// Bundled after js/adv-plus.js. Function declarations / var only.

function cvSt() { return window.__cv || (window.__cv = { tab: 'tx', asc: false }); }
function cardViewRows(card, off) {
  const st = creditStats(card, new Date(), off), s = creditStmt(card, new Date(), off), items = reconItems(card, st.period, 'asc'), done = items.filter(t => t.recon).length, inst = Math.round((state.transactions || []).filter(t => t.stmtInst && t.stmtInstNo === 0 && String(t.account) === String(card.id) && t.date >= st.period.start && t.date <= st.period.end).reduce((a, t) => a + Number(t.amount || 0), 0) * 100) / 100;
  // 新增花費 is what was bought; a statement instalment is shown on its own line, as on the bank's bill
  return { period: st.period, spend: Math.round((st.spend + inst) * 100) / 100, prev: st.prevOwed, payable: Math.round((st.payable + inst) * 100) / 100, paid: st.paid, inst, done, total: items.length, left: st.remaining, owed: s.owed };
}
function cardViewHTML(card) {
  const off = creditStatementOffset, r = cardViewRows(card, off), s = cvSt(), neg = v => (v ? `−${acctMoney(v, card)}` : acctMoney(0, card)), due = cardStatementDueDate(card, r.period), status = creditStatementStatus(card, r.period, r.paid, r.payable), u = creditUsage(card);
  const pays = creditStatementPayments(card, r.period), key = t => cardTxDate(t) + (t.time || ''), tx = reconItems(card, r.period, 'asc').sort((a, b) => (s.asc ? 1 : -1) * key(a).localeCompare(key(b))), cur = r.period.end >= isoDate(new Date());
  const sw = `<select class="acct-switch" data-acct-switch aria-label="切換帳戶">${acctOrdered(state.accounts).filter(x => x.type === 'card').map(x => `<option value="${esc(x.id)}"${x.id === card.id ? ' selected' : ''}>${acctName(x)}</option>`).join('')}</select>`;
  const head = `<div class="detail-close-row"><button type="button" class="secondary" data-close-credit>← 返回帳戶</button></div><div class="cv-head">${sw}<span><button type="button" class="icon" data-acct-history="${esc(card.id)}" aria-label="歷史統計">▤</button><button type="button" class="icon" data-acct-menu="${esc(card.id)}" aria-label="更多功能">⋯</button></span></div><div class="entry-tabs"><button type="button" data-cv-tab="tx" class="${s.tab === 'tx' ? 'active' : ''}">交易明細</button><button type="button" data-cv-tab="info" class="${s.tab === 'info' ? 'active' : ''}">帳戶資訊</button></div>`;
  if (s.tab === 'info') return `${head}<div class="cv-info"><div class="cv-ico">${svgForAccount(card)}</div><div class="cv-bal"><small>餘額 ${esc(acctCur(card))}</small><strong class="${card.balance < 0 ? 'expense-text' : 'income-text'}">${acctMoney(Math.abs(card.balance), card)}</strong></div>${card.note ? `<p class="hint">${esc(card.note)}</p>` : ''}</div>${acctInfoHTML(card)}${limitGroupHTML(card)}${creditRewardHTML(card, r.spend, r.owed)}`;
  const row = t => `<button type="button" class="notice-row" data-tx-open="${esc(t.id)}"><div class="notice-ico">${catIconHTML(cat(t.category))}</div><div class="day-main"><small>${fmtDate(t.date)} ${WEEKDAYS[new Date(t.date + 'T00:00:00').getDay()]} ${esc(t.time || '')}</small><b>${esc(t.name)}</b><small>${esc([t.postDate ? `延後入帳於 ${fmtDate(t.postDate)}` : '', t.installment ? `分期 #${t.installment.n} / ${t.installment.total}` : '', t.merchant].filter(Boolean).join('・'))}</small></div><div class="day-side"><b class="${cardLineAmount(t) < 0 ? 'income-text' : 'expense-text'}">${cardLineAmount(t) < 0 ? '−' : ''}${acctMoney(Math.abs(t.amount), card)}</b><small>${t.recon ? '✓ ' : ''}${esc((state.projects || []).find(p => String(p.id) === String(t.project))?.name || '')}</small></div></button>`;
  return `${head}<div class="credit-period"><button type="button" data-credit-prev aria-label="上一期">‹</button><strong>${fmtDate(r.period.start)} － ${fmtDate(r.period.end)}</strong><button type="button" data-credit-next ${off >= 1 ? 'disabled' : ''} aria-label="下一期">›</button></div>
  <section class="cv-stats">${infoRow('新增花費', neg(r.spend))}${infoRow('上期欠款', neg(r.prev))}${infoRow('應繳金額', neg(r.payable))}${infoRow('已繳金額', r.paid ? `+${acctMoney(r.paid, card)}` : acctMoney(0, card))}${infoRow('帳單分期', r.inst ? `+${acctMoney(r.inst, card)}` : r.owed > 0 ? '<button type="button" class="tx-link" data-cv-inst>進行分期</button>' : '---')}${infoRow('對帳筆數', `${r.done} / ${r.total}${r.total && r.done === r.total ? ' ✅' : ''}`)}${infoRow('剩餘帳款', r.left > 0 ? `<span class="expense-text">−${acctMoney(r.left, card)}</span>` : cur ? acctMoney(0, card) : '✔ 已繳清')}</section>
  <div class="credit-cycle-status"><span class="credit-status credit-status-${status.key}">${cur ? '本期尚未結帳' : status.label}</span><b>繳費期限 ${fmtDate(isoDate(due))}</b></div><div class="credit-bar-row"><span>可用額度 ${acctMoney(u.available, card)}</span><span>額度 ${acctMoney(u.limit, card)}</span></div><div class="credit-bar"><i style="width:${Math.min(100, u.pct)}%"></i></div>
  <div id="cvTools">${stmtAdjustHTML(card)}${stmtInstHTML(card, r.owed)}</div>
  <div class="credit-section"><div class="credit-section-head"><h4>繳款記錄（${pays.length}）</h4><span class="credit-section-actions"><button type="button" class="ghost" data-recon-open="${esc(card.id)}" aria-label="對帳模式">☑ 對帳</button><button type="button" class="ghost" data-cv-pay aria-label="新增繳款" ${r.owed > 0 ? '' : 'disabled'} data-inline-payment="${esc(card.id)}">＋</button></span></div>${pays.length ? pays.map(p => `<button type="button" class="notice-row" data-tx-open="${esc(p.id)}"><div class="notice-ico">💳</div><div class="day-main"><small>${fmtDate(p.date)} ${esc(p.time || '')}</small><b>${esc(p.offsetKey ? p.name : '信用卡繳款')}</b><small>${p.offsetKey ? '' : `${acctName(acct(p.account))} ➝ ${acctName(card)}`}</small></div><div class="day-side"><b class="income-text">${acctMoney(p.toAmount ?? p.amount, card)}</b><small>${p.offsetKey ? '帳單折抵' : '還款'}</small></div></button>`).join('') : `<button type="button" class="credit-empty cv-start" data-recon-open="${esc(card.id)}">點擊開始對帳 🔍</button>`}</div>
  <div class="credit-section pane-tx"><div class="credit-section-head"><h4>一般記錄（${tx.length}）</h4><span class="credit-section-actions"><button type="button" class="ghost" data-cv-sort aria-label="排序">${s.asc ? '△' : '▽'}</button><button type="button" class="ghost" data-cv-add="${esc(card.id)}" aria-label="新增記錄">＋</button></span></div>${tx.length ? tx.map(row).join('') : '<div class="credit-empty">這一期沒有記錄</div>'}</div>`;
}
// ---- 繳款: the transfer form, already filled in; saving marks it as this statement's payment ----
function cardPayOpen(card, off) {
  const st = creditStmt(card, new Date(), off), src = (state.accounts || []).filter(a => a.type !== 'card' && !a.archived); if (!src.length) { alert('沒有可用的扣款帳戶'); return; } const amount = Math.min(st.owed, Math.max(0, Math.abs(Math.min(0, Number(card.balance || 0))))) || st.owed; if (!(amount > 0)) { alert('這一期已經繳清'); return; }
  const from = src.find(a => String(a.id) === String(card.payFrom)) || src.find(a => acctCur(a) === acctCur(card)) || src[0]; openTransfer({ preset: '信用卡繳款', from: from.id, to: card.id });
  setTimeout(() => { window.__cardPay = { card: card.id, key: creditStatementKey(card, st.period), off }; modalTitle.textContent = '新增還款'; window.entrySetAmount(acctCur(from) === acctCur(card) ? amount : fxConvert(amount, acctCur(card), acctCur(from)) || amount); if (efEl('name')) efEl('name').value = `${card.name} 繳款`; efPicked(true); efSync(); }, 160);
}
function cardPayApply(t) { const p = window.__cardPay; if (!p || t.kind !== 'transfer' || String(t.toAccount) !== String(p.card)) return t; t.cardPayment = true; t.cardStatementKey = p.key; return t; }
// ---- account CSV ----
function acctCSV(aid) {
  const a = acct(aid), q = v => `"${String(v ?? '').replace(/"/g, '""')}"`, rows = [['日期', '時間', '名稱', '類別', '商家', '專案', '金額', '餘額', '標籤', '備註']];
  for (const r of passbook(a.id)) rows.push([r.t.date, r.t.time || '', r.t.name, cat(r.t.category).name, r.t.merchant || '', (state.projects || []).find(p => String(p.id) === String(r.t.project))?.name || '', r.effect, r.after, (r.t.tags || []).join(' '), r.t.note || '']);
  return '﻿' + rows.map(x => x.map(q).join(',')).join('\r\n');
}
function saveText(name, text, type) { const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob([text], { type: type || 'text/csv;charset=utf-8' })); l.download = name; l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 1000); }
async function acctMenu(a) {
  const card = a.type === 'card', k = await uiAsk({ icon: '⋯', title: '更多功能', options: [['hist', '歷史統計數據'], ...(card ? [['adj', '調整本期結帳日']] : []), ['bal', '調整餘額'], ['recon', '對帳模式'], ['csv', '匯出 CSV'], ['calc', '重新計算餘額'], ['edit', '編輯帳戶'], ['del', '刪除帳戶', 'danger']] });
  if (k === 'hist') openAcctHistory(a.id); else if (k === 'adj') { cvSt().tab = 'tx'; renderAccounts(); const d = document.querySelector('#cvTools details'); if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); } }
  else if (k === 'bal') openEntity('accountAdjust', a); else if (k === 'recon') { if (card) openReconMode(a.id); else { apSt(a); document.querySelector('[data-ap-recon]')?.click(); } }
  else if (k === 'csv') saveText(`帳小簿-${a.name}-${isoDate(new Date())}.csv`, acctCSV(a.id)); else if (k === 'calc') document.getElementById('reconcileAccounts')?.click(); else if (k === 'edit') openEntity('accountEdit', a); else if (k === 'del') deleteAccount(a.id);
}
// 分組／主帳戶總額計算: every account, or only those counted in the total (pref groupTotal / mainTotal = 'net').
function acctTotalList(list, pref) { return prefs()[pref] === 'net' ? list.filter(a => !a.excludeNet) : list; }
document.addEventListener('click', e => {
  const c = s => e.target.closest?.(s); let b;
  if ((b = c('[data-cv-tab]'))) { cvSt().tab = b.dataset.cvTab; renderCreditAccountDetail(); return; }
  if (c('[data-cv-sort]')) { cvSt().asc = !cvSt().asc; renderCreditAccountDetail(); return; }
  if ((b = c('[data-acct-menu]'))) { acctMenu(acct(b.dataset.acctMenu)); return; }
  if (c('[data-cv-pay]')) { const a = acct(selectedCreditCardId); if (a?.id) cardPayOpen(a, creditStatementOffset); return; }
  if (c('[data-cv-inst]')) { const d = [...document.querySelectorAll('#cvTools details')].at(-1); if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); } return; }
  if ((b = c('[data-cv-add]'))) { const i = b.dataset.cvAdd; window.openTx('expense'); setTimeout(() => { const s = txForm.elements.account; s.value = i; s.dataset.userSet = '1'; s.dispatchEvent(new Event('change', { bubbles: true })); }, 120); }
});
