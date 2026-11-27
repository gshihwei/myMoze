// 帳小簿 V26.126 — 銀行同步: shows what the computer program bank-agent/ read from the banks (hidden category records
// __bank_<source>__ written to the user's own cloud rows), maps bank accounts to 帳小簿 accounts, pairs bank rows with
// records (same account, same amount, within 3 days, unique on both sides), records the rest in one tap, and compares
// balances. Bundled after js/inv-match.js. Function declarations / var only.

function bankFeeds() { return (state?.categories || []).filter(c => c?.kind === 'prefs' && /^__bank_[a-z0-9]+__$/.test(String(c.id)) && c.bank && Array.isArray(c.bank.tx)).map(c => c.bank); }
function bankLinked(id) { return (state.accounts || []).find(a => a.bankLink === id) || null; }
// Feed values come from the cloud: only plain currency codes reach the page.
function bankCur(c) { return /^[A-Z]{3}$/.test(String(c || '')) ? c : 'TWD'; }
function bankSt() { return window.__bank || (window.__bank = { tab: 'todo', link: null }); }
function bankDayDiff(a, b) { const x = invDayNum(a), y = invDayNum(b); return x === null || y === null ? null : x - y; }
// Each record's effect on each account (the same numbers the balances use), indexed by account.
function bankIndex() {
  const by = new Map(), ids = new Set(); for (const f of bankFeeds()) for (const x of f.tx) ids.add(x.id);
  const used = new Map();
  for (const t of state.transactions || []) {
    if (t.bankId && ids.has(String(t.bankId))) used.set(String(t.bankId), t);
    for (const [aid, eff] of ledgerEffects(t)) { const k = String(aid); if (!by.has(k)) by.set(k, []); by.get(k).push({ t, eff: Math.round(Number(eff) * 100) }); }
  }
  return { by, ids, used };
}
function bankItems(ix = bankIndex()) {
  const out = [];
  for (const f of bankFeeds()) for (const x of f.tx) { const a = bankLinked(x.acct); out.push({ f, x, a, t: ix.used.get(x.id) || null, skip: !!a && (a.bankSkip || []).includes(x.id), early: !!a && !!a.bankFrom && x.date < a.bankFrom }); }
  return out;
}
function bankTodo(l) { return l.filter(i => i.a && !i.t && !i.skip && !i.early); }
// A record is free for this bank row when it is not paired with another row that still exists.
function bankFree(t, x, ix) { return (!t.bankId || t.bankId === x.id || !ix.ids.has(String(t.bankId))) && !(t.bankNo || []).includes(x.id); }
function bankCands(i, ix, wide) {
  const amt = Math.round(Number(i.x.amount) * 100), seen = new Set();
  return (ix.by.get(String(i.a.id)) || []).filter(e => { const g = bankDayDiff(e.t.date, i.x.date); if (g === null || seen.has(e.t) || !bankFree(e.t, i.x, ix)) return false; const ok = wide ? Math.abs(g) <= 10 : e.eff === amt && Math.abs(g) <= 3; if (ok) seen.add(e.t); return ok; });
}
function bankAutoPairs(ix = bankIndex()) {
  const todo = bankTodo(bankItems(ix)), c = todo.map(i => bankCands(i, ix)), n = new Map();
  for (const l of c) for (const e of l) n.set(e.t, (n.get(e.t) || 0) + 1);
  return todo.flatMap((i, k) => (c[k].length === 1 && n.get(c[k][0].t) === 1 ? [[i, c[k][0].t]] : []));
}
function bankAutoMatch() { const p = bankAutoPairs(); for (const [i, t] of p) { t.bankId = i.x.id; if (t.bankNo) t.bankNo = t.bankNo.filter(k => k !== i.x.id); } return p.length; }
function bankItemById(k) { return bankItems().find(i => i.x.id === k) || null; }

// ---- actions ----
function bankRecord(i) {
  const x = i.x, a = i.a, abs = Math.abs(Number(x.amount)), pay = a.type === 'card' && x.amount > 0 && /繳款|扣繳|自扣|payment/i.test(x.desc);
  const kind = pay ? 'transfer' : x.amount < 0 ? 'expense' : 'income';
  const base = { kind, date: x.date, time: x.time || nowTime(), amount: abs, name: '', merchant: pay ? '' : String(x.party || x.desc).slice(0, 40), tags: [], person: '', note: '', ...(pay ? { account: a.payFrom || '', toAccount: a.id } : { account: a.id }) };
  if (kind === 'expense' && typeof invGuessCat === 'function') { const g = invGuessCat({ items: [[x.desc, 1, abs]], sellerName: x.party || x.desc }); if (g) base.category = g; }
  sheetEl('bankBg').hidden = true; window.openTx(kind, base); window.__savedTx = null; window.__bankSave = x.id;
}
// called from closeModals() after the entry form closes
function bankAfterSave() {
  const k = window.__bankSave; window.__bankSave = null; const t = window.__savedTx && txById(window.__savedTx.id);
  if (k && t) { t.bankId = k; save(); }
  const el = sheetEl('bankBg'); el.hidden = false; renderBank();
}
function bankMap(bankId, value, feed) {
  for (const a of state.accounts || []) if (a.bankLink === bankId) { delete a.bankLink; delete a.bankFrom; }
  if (!value) return null;
  const b = (feed?.accounts || []).find(x => x.id === bankId), tomorrow = isoDate(new Date(Date.now() + 864e5)), ago = isoDate(new Date(Date.now() - 30 * 864e5));
  if (value === '__new') {
    // A new account starts at today's bank balance, so only later bank rows need recording.
    const type = b?.type === 'card' ? 'card' : b?.currency && b.currency !== 'TWD' ? 'foreign' : 'bank', a = { id: id(), name: String(b?.name || '銀行帳戶').slice(0, 40), currency: b?.currency || 'TWD', type, balance: Number(b?.balance) || 0, bankLink: bankId, bankFrom: tomorrow };
    state.accounts.push(a); return a;
  }
  const a = acct(value); if (!a) return null; a.bankLink = bankId; a.bankFrom = a.bankFrom || ago; return a;
}

// ---- page ----
function bankAge(iso) { const t = Date.parse(iso || ''); if (!Number.isFinite(t)) return ''; const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function bankStale(f) { const t = Date.parse(f.okAt || ''); return !Number.isFinite(t) ? 99 : Math.floor((Date.now() - t) / 864e5); }
function bankSetupHTML() {
  const signed = typeof prefSyncUser === 'function' && prefSyncUser();
  return `<div class="bank-setup"><b>還沒有銀行資料</b><p>銀行同步要在你的 Windows 電腦上執行一支小程式：它在電腦上登入銀行，讀取最近三個月的明細和餘額，再寫進你的帳小簿雲端，這一頁就會出現。銀行密碼只用 Windows 加密存在那台電腦，不會上傳。</p>
  ${signed ? '' : '<p class="expense-text">請先在「設定 → 雲端同步」登入，電腦程式要用同一個帳號。</p>'}
  <ol><li>安裝 Node.js 22 以上（nodejs.org）</li><li>下載帳小簿程式碼，在 <code>bank-agent</code> 資料夾執行 <code>npm install</code></li><li>執行 <code>node cli.mjs setup</code>，依提示登入雲端、輸入銀行帳密</li><li>執行 <code>node cli.mjs schedule</code> 設定每天自動同步</li></ol>
  <p class="hint">目前支援玉山銀行、中國信託。詳細說明在 <a href="https://github.com/gshihwei/myMoze/blob/main/bank-agent/README.md" target="_blank" rel="noopener noreferrer">bank-agent/README.md</a>。</p></div>`;
}
function bankAcctHTML(f, b, fut) {
  const a = bankLinked(b.id), opts = (state.accounts || []).filter(x => !x.archived && (b.type === 'card' ? x.type === 'card' : x.type !== 'card'));
  const bill = b.bill && b.bill.amount != null ? `　本期帳單 ${money(b.bill.amount)}${b.bill.due ? `，${esc(fmtDate(b.bill.due))} 前繳` : ''}${b.bill.paid ? '（已繳）' : ''}` : '';
  let cmp = '';
  if (a && b.balance != null) {
    if (acctCur(a) !== bankCur(b.currency)) cmp = `<small class="hint">幣別不同，無法比對餘額</small>`;
    else { const mine = acctNow(a, fut), d = Math.round((mine - Number(b.balance)) * 100) / 100; cmp = `<small>帳小簿 ${acctMoney(mine, a)}　${Math.abs(d) < 1 ? '<span class="income-text">✓ 餘額一致</span>' : `<span class="expense-text">相差 ${acctMoney(Math.abs(d), a)}</span>`}</small>`; }
  }
  return `<div class="bank-acct"><div class="day-main"><b>${esc(b.name)}</b><small>銀行 ${b.balance != null ? acctMoney(Number(b.balance), { currency: bankCur(b.currency) }) : '—'}${bill}</small>${cmp}</div>
    <div class="bank-map"><select data-bank-map="${esc(b.id)}" data-bank-src="${esc(f.source)}" aria-label="對應的帳小簿帳戶"><option value="">不對應</option>${opts.map(x => `<option value="${esc(x.id)}"${a && String(a.id) === String(x.id) ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}<option value="__new">＋ 建立新帳戶</option></select>${a ? `<label class="bank-from">從 <input type="date" data-bank-from="${esc(a.id)}" value="${esc(a.bankFrom || '')}"> 起對帳</label>` : ''}</div></div>`;
}
function bankRowHTML(i, kind) {
  const x = i.x, cls = x.amount < 0 ? 'expense-text' : 'income-text', sub = [`${fmtDate(x.date)}${x.time ? ' ' + x.time : ''}`, i.a ? i.a.name : (i.f.accounts.find(b => b.id === x.acct)?.name || ''), x.card ? `卡 ${x.card}` : '', x.status === 'pending' ? '未入帳' : ''].filter(Boolean).join('・');
  const act = kind === 'todo' ? `<button type="button" class="ghost" data-bank-rec="${esc(x.id)}">記帳</button><button type="button" class="ghost" data-bank-link="${esc(x.id)}">連結</button><button type="button" class="ghost" data-bank-skip="${esc(x.id)}">略過</button>`
    : kind === 'done' ? `<button type="button" class="ghost" data-bank-unlink="${esc(x.id)}">取消對應</button>` : `<button type="button" class="ghost" data-bank-unskip="${esc(x.id)}">恢復</button>`;
  return `<div class="notice-row bank-row"><div class="day-main"><b>${esc(x.desc)}</b><small>${esc(sub)}${x.party ? `<br>${esc(x.party)}` : ''}</small>${kind === 'done' && i.t ? `<small class="hint">↔ ${esc(i.t.name || cat(i.t.category)?.name || '記錄')}　${fmtDate(i.t.date)}</small>` : ''}</div><div class="day-side"><b class="${cls}">${x.amount < 0 ? '−' : '+'}${acctMoney(Math.abs(x.amount), i.a || { currency: bankCur(x.currency) })}</b></div>${kind === 'none' ? '' : `<span class="bank-act">${act}</span>`}</div>`;
}
function bankLinkHTML(i, ix) {
  const l = bankCands(i, ix, true).sort((p, q) => (q.eff === Math.round(i.x.amount * 100)) - (p.eff === Math.round(i.x.amount * 100)) || Math.abs(bankDayDiff(p.t.date, i.x.date)) - Math.abs(bankDayDiff(q.t.date, i.x.date))).slice(0, 40);
  return `<div class="recon-sheet">${sheetHead('連結到記錄', '<button type="button" class="ghost" data-bank-back>返回</button>')}<div class="recon-list notice-list">${bankRowHTML(i, 'none')}<p class="hint">同一個帳戶、前後 10 天內還沒對應的記錄；金額相同的排在前面。</p>${l.map(e => `<button type="button" class="notice-row bank-row" data-bank-pick="${esc(e.t.id)}"><div class="day-main"><b>${esc(e.t.name || cat(e.t.category)?.name || '記錄')}</b><small>${fmtDate(e.t.date)} ${esc(e.t.merchant || '')}${e.eff === Math.round(i.x.amount * 100) ? '　<span class="inv-cand">金額相同</span>' : ''}</small></div><div class="day-side"><b>${acctMoney(Math.abs(e.eff / 100), i.a)}</b></div></button>`).join('') || '<div class="recon-empty">找不到可以連結的記錄</div>'}</div></div>`;
}
function renderBank() {
  const el = document.getElementById('bankBg'); if (!el || el.hidden) return; const s = bankSt(), feeds = bankFeeds(), ix = bankIndex();
  if (s.link) { const i = bankItemById(s.link); if (i?.a) { el.innerHTML = bankLinkHTML(i, ix); return; } s.link = null; }
  if (!feeds.length) { el.innerHTML = `<div class="recon-sheet">${sheetHead('銀行同步')}<div class="recon-list notice-list">${bankSetupHTML()}</div></div>`; return; }
  const fut = acctFuture(), all = bankItems(ix), todo = bankTodo(all), done = all.filter(i => i.t), skip = all.filter(i => i.skip && !i.t), unmapped = all.filter(i => !i.a).length;
  const heads = feeds.map(f => `<div class="bank-feed"><div class="bank-head"><b>${esc(f.name)}</b><small>${f.ok ? `${bankAge(f.at)} 同步` : `上次成功 ${bankAge(f.okAt) || '—'}`}</small></div>
    ${f.ok ? '' : `<div class="bank-err">${f.need ? '需要你處理：' : '同步失敗：'}${esc(f.error || '')}</div>`}${f.ok && bankStale(f) >= 3 ? `<div class="bank-err">已經 ${bankStale(f)} 天沒有同步，請確認電腦上的同步程式有在執行。</div>` : ''}
    ${(f.accounts || []).map(b => bankAcctHTML(f, b, fut)).join('')}</div>`).join('');
  const list = s.tab === 'done' ? done : s.tab === 'skip' ? skip : todo;
  const tabs = `<div class="entry-tabs">${[['todo', `待處理 ${todo.length || ''}`], ['done', `已對應 ${done.length || ''}`], ['skip', `已略過 ${skip.length || ''}`]].map(([k, l]) => `<button type="button" data-bank-tab="${k}" class="${k === s.tab ? 'active' : ''}">${l}</button>`).join('')}</div>`;
  const hint = s.tab === 'todo' ? `<p class="hint">同一個帳戶、金額相同、前後 3 天內只有一筆的記錄，會自動對應。${unmapped ? `還有 ${unmapped} 筆明細的帳戶沒有對應，請先在上面選擇帳小簿帳戶。` : ''}</p>` : '';
  el.innerHTML = `<div class="recon-sheet">${sheetHead('銀行同步')}<div class="recon-list notice-list">${heads}${tabs}${hint}${list.slice(0, 300).map(i => bankRowHTML(i, s.tab)).join('') || '<div class="recon-empty">沒有項目</div>'}</div></div>`;
}
async function openBank() {
  sheetEl('bankBg').hidden = false; bankSt().link = null;
  const n = bankAutoMatch(); if (n) { await save(); render(); toast(`已自動對應 ${n} 筆銀行明細`); }
  renderBank();
}
// 通知中心: failed syncs and rows still to record.
function bankNoticeList() {
  const out = [], feeds = bankFeeds(); if (!feeds.length) return out;
  for (const f of feeds) { if (!f.ok) out.push({ f, text: `${f.name}${f.need ? '需要你處理' : '同步失敗'}`, sub: f.error || '' }); else if (bankStale(f) >= 3) out.push({ f, text: `${f.name}已經 ${bankStale(f)} 天沒有同步`, sub: '請確認電腦上的同步程式' }); }
  const ix = bankIndex(), n = bankTodo(bankItems(ix)).length - bankAutoPairs(ix).length; if (n > 0) out.push({ text: `${n} 筆銀行明細還沒記帳`, sub: '打開「銀行同步」記帳、連結或略過' });
  return out;
}
function bankNoticeHTML(l) { return l.map(x => `<button type="button" class="notice-row${x.f ? ' overdue' : ''}" data-bank-open><div class="notice-ico">🏦</div><div class="day-main"><b>${esc(x.text)}</b><small>${esc(x.sub)}</small></div></button>`).join(''); }

document.addEventListener('click', async e => {
  const c = q => e.target.closest?.(q); let b;
  if (c('#moreBank') || c('[data-bank-open]')) { document.getElementById('moreBg')?.classList.remove('open'); const n = document.getElementById('noticeBg'); if (n) n.hidden = true; await openBank(); return; }
  if (!c('#bankBg')) return; const s = bankSt();
  if ((b = c('[data-bank-tab]'))) { s.tab = b.dataset.bankTab; renderBank(); return; }
  if (c('[data-bank-back]')) { s.link = null; renderBank(); return; }
  if ((b = c('[data-bank-rec]'))) { const i = bankItemById(b.dataset.bankRec); if (i?.a) bankRecord(i); return; }
  if ((b = c('[data-bank-link]'))) { s.link = b.dataset.bankLink; renderBank(); return; }
  if ((b = c('[data-bank-pick]'))) { const i = bankItemById(s.link), t = txById(b.dataset.bankPick); if (i && t) { t.bankId = i.x.id; if (t.bankNo) t.bankNo = t.bankNo.filter(k => k !== i.x.id); s.link = null; await save(); render(); toast('已連結'); } renderBank(); return; }
  if ((b = c('[data-bank-skip]'))) { const i = bankItemById(b.dataset.bankSkip); if (i?.a) { i.a.bankSkip = [...new Set([...(i.a.bankSkip || []), i.x.id])].slice(-500); await save(); } renderBank(); return; }
  if ((b = c('[data-bank-unskip]'))) { const i = bankItemById(b.dataset.bankUnskip); if (i?.a) { i.a.bankSkip = (i.a.bankSkip || []).filter(k => k !== i.x.id); await save(); } renderBank(); return; }
  // unpairing remembers "not this one", so the automatic pairing does not put it back
  if ((b = c('[data-bank-unlink]'))) { const i = bankItemById(b.dataset.bankUnlink); if (i?.t) { delete i.t.bankId; i.t.bankNo = [...new Set([...(i.t.bankNo || []), i.x.id])].slice(-10); await save(); render(); } renderBank(); }
});
document.addEventListener('change', async e => {
  const t = e.target; if (!t?.closest?.('#bankBg')) return;
  if (t.matches('[data-bank-map]')) { const f = bankFeeds().find(x => x.source === t.dataset.bankSrc), a = bankMap(t.dataset.bankMap, t.value, f); const n = bankAutoMatch(); await save(); render(); if (a && t.value === '__new') toast(`已建立「${a.name}」，餘額 ${acctMoney(a.balance, a)}`); else if (n) toast(`已自動對應 ${n} 筆`); renderBank(); return; }
  if (t.matches('[data-bank-from]')) { const a = acct(t.dataset.bankFrom); if (a && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) { a.bankFrom = t.value; await save(); } renderBank(); }
});
