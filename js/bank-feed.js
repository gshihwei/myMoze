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
// What a bank row is waiting for, shown in the 「全部明細」 list.
function bankKind(i) { return i.t ? 'done' : !i.a ? 'unmapped' : i.skip ? 'skip' : i.early ? 'early' : 'todo'; }
function bankNewest(l) { return l.slice().sort((p, q) => (q.x.date + (q.x.time || '')).localeCompare(p.x.date + (p.x.time || ''))); }
// 帳小簿 accounts a bank account can map to: cards to cards, everything else to non-cards.
function bankMapOpts(b) { return (state.accounts || []).filter(x => !x.archived && (b.type === 'card' ? x.type === 'card' : x.type !== 'card')); }
function bankWords(src) { return { esun: /玉山|e\.?sun/i, ctbc: /中信|中國信託|ctbc/i }[src] || null; }
// One unmapped 帳小簿 account whose name names this bank (and the last four digits, when several do), in the same currency.
function bankSuggest(f, b) {
  const w = bankWords(f?.source); if (!w || bankLinked(b.id)) return null;
  const l4 = (String(b.id).match(/:(\d{4})(?::|$)/) || [])[1], l = bankMapOpts(b).filter(x => !x.bankLink && acctCur(x) === bankCur(b.currency) && w.test(String(x.name || '')));
  const hit = l4 ? l.filter(x => String(x.name || '').includes(l4)) : [];
  return hit.length === 1 ? hit[0] : l.length === 1 ? l[0] : null;
}
// How far the 帳小簿 balance (without future-dated records) is from the bank's, or null when they cannot be compared.
function bankDiff(a, b, fut) { if (!a || b.balance == null || acctCur(a) !== bankCur(b.currency)) return null; return Math.round((Number(b.balance) - acctNow(a, fut || acctFuture())) * 100) / 100; }
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
// Which cloud account this device reads: the computer program must sign in to the same one.
function bankWhereHTML() {
  const m = window.MozeSync, who = m?.account?.() || '', at = m?.lastSyncAt?.() || '';
  if (m?.offline?.()) return '<div class="bank-err">這台裝置在「離線模式」，不會讀取雲端資料。請到「設定 → 雲端同步」關閉離線模式。</div>';
  if (!m?.isLoggedIn?.()) return '<div class="bank-err">這台裝置還沒登入雲端同步，讀不到電腦程式寫進雲端的資料。請先到「設定 → 雲端同步」登入，電腦程式要用同一個帳號。</div>';
  return `<div class="bank-where"><small>這台裝置的雲端帳號</small><b>${esc(who)}</b><small>上次同步 ${at ? esc(bankAge(at)) : '—'}</small><button type="button" class="ghost bank-adj" data-bank-refresh>立即同步</button>
  <p class="hint">如果電腦已經同步成功，這裡還是沒有資料：請在電腦執行 <code>node cli.mjs status</code>，看「雲端帳號」是否跟上面一樣。不一樣的話，執行 <code>node cli.mjs login</code> 改登入這個帳號，再執行 <code>node cli.mjs sync</code>。</p></div>`;
}
function bankSetupHTML() {
  return `<div class="bank-setup"><b>還沒有銀行資料</b>${bankWhereHTML()}<p>銀行同步要在你的 Windows 電腦上執行一支小程式：它在電腦上登入銀行，讀取最近三個月的明細和餘額，再寫進你的帳小簿雲端，這一頁就會出現。銀行密碼只用 Windows 加密存在那台電腦，不會上傳。</p>
  <ol><li>安裝 Node.js 22 以上（nodejs.org）</li><li>下載帳小簿程式碼，在 <code>bank-agent</code> 資料夾執行 <code>npm install</code></li><li>執行 <code>node cli.mjs setup</code>，依提示登入雲端、輸入銀行帳密</li><li>執行 <code>node cli.mjs schedule</code> 設定每天自動同步</li></ol>
  <p class="hint">目前支援玉山銀行、中國信託。詳細說明在 <a href="https://github.com/gshihwei/myMoze/blob/main/bank-agent/README.md" target="_blank" rel="noopener noreferrer">bank-agent/README.md</a>。</p></div>`;
}
function bankAcctHTML(f, b, fut) {
  const a = bankLinked(b.id), opts = bankMapOpts(b), n = (f.tx || []).filter(x => x.acct === b.id).length, sug = bankSuggest(f, b);
  const bill = b.bill && b.bill.amount != null ? `　本期帳單 ${money(b.bill.amount)}${b.bill.due ? `，${esc(fmtDate(b.bill.due))} 前繳` : ''}${b.bill.paid ? '（已繳）' : ''}` : '';
  let cmp = '';
  if (a && b.balance != null) {
    const d = bankDiff(a, b, fut);
    if (d === null) cmp = `<small class="hint">幣別不同，無法比對餘額</small>`;
    else cmp = `<small>帳小簿 ${acctMoney(acctNow(a, fut), a)}　${Math.abs(d) < 1 ? '<span class="income-text">✓ 餘額一致</span>' : `<span class="expense-text">相差 ${acctMoney(Math.abs(d), a)}</span> <button type="button" class="ghost bank-adj" data-bank-adj="${esc(b.id)}" data-bank-src="${esc(f.source)}">調成銀行餘額</button>`}</small>`;
  } else if (!a) cmp = `<small class="hint">${n ? `${n} 筆明細，` : ''}選擇對應的帳小簿帳戶後才能比對餘額、記帳${sug ? `　<button type="button" class="ghost bank-adj" data-bank-sug="${esc(b.id)}" data-bank-src="${esc(f.source)}" data-bank-to="${esc(sug.id)}">對應到「${esc(sug.name)}」</button>` : ''}</small>`;
  return `<div class="bank-acct"><div class="day-main"><b>${esc(b.name)}</b><small>銀行 ${b.balance != null ? acctMoney(Number(b.balance), { currency: bankCur(b.currency) }) : '—'}${bill}</small>${cmp}</div>
    <div class="bank-map"><select data-bank-map="${esc(b.id)}" data-bank-src="${esc(f.source)}" aria-label="對應的帳小簿帳戶"><option value="">不對應</option>${opts.map(x => `<option value="${esc(x.id)}"${a && String(a.id) === String(x.id) ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}<option value="__new">＋ 建立新帳戶</option></select>${a ? `<label class="bank-from">從 <input type="date" data-bank-from="${esc(a.id)}" value="${esc(a.bankFrom || '')}"> 起對帳</label>` : ''}</div></div>`;
}
function bankKindName(k) { return { done: '已對應', unmapped: '帳戶未對應', skip: '已略過', early: '對帳起始日前', todo: '待處理' }[k] || ''; }
function bankRowHTML(i, view) {
  const k = bankKind(i), kind = view === 'all' ? (k === 'unmapped' || k === 'early' ? 'none' : k) : view, chip = view === 'all' ? `<span class="bank-chip bank-${k}">${bankKindName(k)}</span>` : '';
  const x = i.x, cls = x.amount < 0 ? 'expense-text' : 'income-text', sub = [`${fmtDate(x.date)}${x.time ? ' ' + x.time : ''}`, i.a ? i.a.name : (i.f.accounts.find(b => b.id === x.acct)?.name || ''), x.card ? `卡 ${x.card}` : '', x.status === 'pending' ? '未入帳' : ''].filter(Boolean).join('・');
  const act = kind === 'todo' ? `<button type="button" class="ghost" data-bank-rec="${esc(x.id)}">記帳</button><button type="button" class="ghost" data-bank-link="${esc(x.id)}">連結</button><button type="button" class="ghost" data-bank-skip="${esc(x.id)}">略過</button>`
    : kind === 'done' ? `<button type="button" class="ghost" data-bank-unlink="${esc(x.id)}">取消對應</button>` : `<button type="button" class="ghost" data-bank-unskip="${esc(x.id)}">恢復</button>`;
  return `<div class="notice-row bank-row"><div class="day-main"><b>${chip}${esc(x.desc)}</b><small>${esc(sub)}${x.party ? `<br>${esc(x.party)}` : ''}</small>${kind === 'done' && i.t ? `<small class="hint">↔ ${esc(i.t.name || cat(i.t.category)?.name || '記錄')}　${fmtDate(i.t.date)}</small>` : ''}</div><div class="day-side"><b class="${cls}">${x.amount < 0 ? '−' : '+'}${acctMoney(Math.abs(x.amount), i.a || { currency: bankCur(x.currency) })}</b></div>${kind === 'none' ? '' : `<span class="bank-act">${act}</span>`}</div>`;
}
function bankLinkHTML(i, ix) {
  const l = bankCands(i, ix, true).sort((p, q) => (q.eff === Math.round(i.x.amount * 100)) - (p.eff === Math.round(i.x.amount * 100)) || Math.abs(bankDayDiff(p.t.date, i.x.date)) - Math.abs(bankDayDiff(q.t.date, i.x.date))).slice(0, 40);
  return `<div class="recon-sheet">${sheetHead('連結到記錄', '<button type="button" class="ghost" data-bank-back>返回</button>')}<div class="recon-list notice-list">${bankRowHTML(i, 'none')}<p class="hint">同一個帳戶、前後 10 天內還沒對應的記錄；金額相同的排在前面。</p>${l.map(e => `<button type="button" class="notice-row bank-row" data-bank-pick="${esc(e.t.id)}"><div class="day-main"><b>${esc(e.t.name || cat(e.t.category)?.name || '記錄')}</b><small>${fmtDate(e.t.date)} ${esc(e.t.merchant || '')}${e.eff === Math.round(i.x.amount * 100) ? '　<span class="inv-cand">金額相同</span>' : ''}</small></div><div class="day-side"><b>${acctMoney(Math.abs(e.eff / 100), i.a)}</b></div></button>`).join('') || '<div class="recon-empty">找不到可以連結的記錄</div>'}</div></div>`;
}
function renderBank() {
  const el = document.getElementById('bankBg'); if (!el || el.hidden) return; const s = bankSt(), feeds = bankFeeds(), ix = bankIndex();
  if (s.link) { const i = bankItemById(s.link); if (i?.a) { el.innerHTML = bankLinkHTML(i, ix); return; } s.link = null; }
  const head = sheetHead('銀行同步', window.MozeSync?.isLoggedIn?.() ? '<button type="button" class="ghost" data-bank-refresh>重新整理</button>' : '');
  if (!feeds.length) { el.innerHTML = `<div class="recon-sheet">${head}<div class="recon-list notice-list">${bankSetupHTML()}</div></div>`; return; }
  const fut = acctFuture(), all = bankItems(ix), todo = bankTodo(all), done = all.filter(i => i.t), skip = all.filter(i => i.skip && !i.t), unmapped = all.filter(i => !i.a).length;
  const heads = feeds.map(f => `<div class="bank-feed"><div class="bank-head"><b>${esc(f.name)}</b><small>${f.ok ? `${bankAge(f.at)} 同步` : `上次成功 ${bankAge(f.okAt) || '—'}`}</small></div>
    ${f.ok ? '' : `<div class="bank-err">${f.need ? '需要你處理：' : '同步失敗：'}${esc(f.error || '')}</div>`}${f.ok && bankStale(f) >= 3 ? `<div class="bank-err">已經 ${bankStale(f)} 天沒有同步，請確認電腦上的同步程式有在執行。</div>` : ''}
    ${(f.accounts || []).map(b => bankAcctHTML(f, b, fut)).join('')}</div>`).join('');
  const list = bankNewest(s.tab === 'done' ? done : s.tab === 'skip' ? skip : s.tab === 'all' ? all : todo);
  const tabs = `<div class="entry-tabs">${[['todo', `待處理 ${todo.length || ''}`], ['done', `已對應 ${done.length || ''}`], ['skip', `已略過 ${skip.length || ''}`], ['all', `全部明細 ${all.length || ''}`]].map(([k, l]) => `<button type="button" data-bank-tab="${k}" class="${k === s.tab ? 'active' : ''}">${l}</button>`).join('')}</div>`;
  const hint = s.tab === 'todo' ? `<p class="hint">同一個帳戶、金額相同、前後 3 天內只有一筆的記錄，會自動對應。${unmapped ? `還有 ${unmapped} 筆明細的帳戶沒有對應，請先在上面選擇帳小簿帳戶。` : ''}</p>` : '';
  el.innerHTML = `<div class="recon-sheet">${head}<div class="recon-list notice-list">${heads}${tabs}${hint}${list.slice(0, 300).map(i => bankRowHTML(i, s.tab)).join('') || '<div class="recon-empty">沒有項目</div>'}</div></div>`;
}
// Until any bank account is mapped there is nothing to do yet, so the page opens on every bank row.
function bankAnyMapped() { return bankFeeds().some(f => (f.accounts || []).some(b => bankLinked(b.id))); }
async function bankPull(manual) {
  const m = window.MozeSync; if (!m?.isLoggedIn?.()) return false;
  try { await m.syncNow(manual ? 'manual' : 'silent'); } catch { return false; }
  const n = bankAutoMatch(); if (n) { await save(); render(); toast(`已自動對應 ${n} 筆銀行明細`); }
  return true;
}
async function openBank() {
  sheetEl('bankBg').hidden = false; const s = bankSt(); s.link = null; if (!s.picked) s.tab = bankAnyMapped() ? 'todo' : 'all';
  const n = bankAutoMatch(); if (n) { await save(); render(); toast(`已自動對應 ${n} 筆銀行明細`); }
  renderBank();
  // fetch what the computer program wrote since the last sync
  if (await bankPull(false)) { if (!s.picked) s.tab = bankAnyMapped() ? 'todo' : 'all'; renderBank(); }
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
  if ((b = c('[data-bank-tab]'))) { s.tab = b.dataset.bankTab; s.picked = true; renderBank(); return; }
  if ((b = c('[data-bank-refresh]'))) { b.disabled = true; b.textContent = '更新中…'; if (await bankPull(true)) toast('已更新銀行資料'); renderBank(); return; }
  if ((b = c('[data-bank-sug]'))) { const f = bankFeeds().find(x => x.source === b.dataset.bankSrc); if (f && acct(b.dataset.bankTo)) { bankMap(b.dataset.bankSug, b.dataset.bankTo, f); const n = bankAutoMatch(); await save(); render(); toast(n ? `已對應，並自動對應 ${n} 筆明細` : '已對應'); } renderBank(); return; }
  if ((b = c('[data-bank-adj]'))) {
    const f = bankFeeds().find(x => x.source === b.dataset.bankSrc), bk = f?.accounts.find(x => x.id === b.dataset.bankAdj), a = bk && bankLinked(bk.id), d = a ? bankDiff(a, bk) : null;
    if (d === null || Math.abs(d) < 0.005) { renderBank(); return; }
    const left = bankTodo(bankItems()).filter(i => i.a === a).length;
    if ((await uiAsk({ icon: '＄', title: '調成銀行餘額', text: `在「${a.name}」記一筆 ${d < 0 ? '−' : '+'}${acctMoney(Math.abs(d), a)} 的餘額調整，讓餘額跟銀行一樣。${left ? `\n\n這個帳戶還有 ${left} 筆銀行明細沒記帳，建議先記帳或連結，再調整剩下的差額。` : ''}`, options: [['ok', '記一筆餘額調整']] })) !== 'ok') return;
    acctAdjustTo(a, Math.round((Number(a.balance || 0) + d) * 1e4) / 1e4, '', '銀行同步對帳'); await save(); render(); toast('已調整餘額'); renderBank(); return;
  }
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
