// 帳小簿 V26.101 — 共用選單視窗、幣種視窗與幣種設定、外幣明細切換.
// Bundled after js/report-view.js. Function declarations / var only.

// MOZE-style popup: uiAsk({ icon, title, text, options: [[key, label, 'danger'?]], cancel }) → Promise(key | null)
function uiAsk(o) {
  return new Promise(done => {
    const el = document.createElement('div'); el.className = 'ask-bg'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', o.title || '選項');
    el.innerHTML = `<div class="ask-card"><span class="ask-ico">${esc(o.icon || '⚙')}</span>${o.title ? `<h3>${esc(o.title)}</h3>` : ''}${o.text ? `<p>${esc(o.text).replace(/\n/g, '<br>')}</p>` : ''}${(o.options || []).map(([k, l, c]) => `<button type="button" data-ask="${esc(k)}" class="${c === 'danger' ? 'expense-text' : ''}">${esc(l)}</button>`).join('')}${o.cancel === false ? '' : '<button type="button" data-ask-cancel>取消</button>'}</div>`;
    const end = v => { el.remove(); document.removeEventListener('keydown', key, true); done(v); }, key = e => { if (e.key === 'Escape') { e.stopPropagation(); end(null); } };
    el.addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('[data-ask]'); if (b) end(b.dataset.ask); else if (e.target === el || e.target.closest('[data-ask-cancel]')) end(null); });
    document.addEventListener('keydown', key, true); document.body.append(el); el.querySelector('button')?.focus();
  });
}
// ---- currencies ----
function curNames() { return { TWD: '新台幣', USD: '美元', JPY: '日圓', EUR: '歐元', CNY: '人民幣', HKD: '港幣', KRW: '韓元', GBP: '英鎊', AUD: '澳幣', SGD: '新加坡幣', CAD: '加拿大幣', THB: '泰銖', MYR: '馬來西亞令吉', VND: '越南盾', PHP: '菲律賓披索', IDR: '印尼盾', INR: '印度盧比', CHF: '瑞士法郎', NZD: '紐西蘭幣', MOP: '澳門幣', SEK: '瑞典克朗', NOK: '挪威克朗', DKK: '丹麥克朗', ZAR: '南非蘭特', TRY: '土耳其里拉', AED: '阿聯迪拉姆', MXN: '墨西哥披索', BRL: '巴西里耳', PLN: '波蘭茲羅提', CZK: '捷克克朗', HUF: '匈牙利福林', ILS: '以色列謝克爾', EGP: '埃及鎊', BTC: 'Bitcoin', ETH: 'Ethereum', USDT: 'Tether', USDC: 'USD Coin', SOL: 'Solana', BNB: 'BNB', XRP: 'XRP', DOGE: 'Dogecoin', ADA: 'Cardano', AVAX: 'Avalanche', DOT: 'Polkadot', LINK: 'Chainlink', LTC: 'Litecoin', BCH: 'Bitcoin Cash', TRX: 'TRON', XAU: '黃金（盎司）', XAG: '白銀（盎司）', XPT: '白金（盎司）' }; }
function curCryptos() { return ['BTC', 'ETH', 'USDT', 'USDC', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK', 'LTC', 'BCH', 'TRX']; }
function curCfg(c) { return prefs().curCfg?.[String(c || '').toUpperCase()] || {}; }
function curCustoms() { return Array.isArray(prefs().curCustom) ? prefs().curCustom : []; }
function curFav() { const l = Array.isArray(prefs().favCur) ? prefs().favCur : []; return l.filter(c => c !== 'TWD'); }
function curFavSet(c, on) { c = String(c || '').toUpperCase(); if (!/^[A-Z]{2,6}$/.test(c) || c === 'TWD') return false; const l = curFav().filter(x => x !== c); setPref('favCur', on ? [...l, c].slice(0, 30) : l); return true; }
function curKind(c) { return customCur(c) ? 'custom' : curCryptos().includes(c) ? 'crypto' : 'fx'; }
// Own symbol / decimals of a built-in currency; '' when nothing was changed.
function curCfgText(n, cur) { const c = curCfg(cur); if (!c.sym && c.dg === undefined) return ''; const d = c.dg === undefined ? curDigits(cur) : Number(c.dg), v = Math.abs(Number(n || 0)).toLocaleString('zh-TW', { maximumFractionDigits: d }); return `${Number(n) < 0 ? '-' : ''}${c.sym || cur + ' '}${v}`; }
function curRateText(c) { const r = fxPair(c, 'TWD'); return r ? Number(r.toPrecision(9)).toLocaleString('zh-TW', { maximumFractionDigits: 8 }) : '—'; }
function curListFor(q, tab) { const s = String(q || '').toLowerCase(), all = Object.keys(curNames()).filter(c => c !== 'TWD' && (tab === 'crypto') === curCryptos().includes(c)); return all.filter(c => !s || c.toLowerCase().includes(s) || String(curNames()[c]).toLowerCase().includes(s)); }
function curUi() { return window.__curUi || (window.__curUi = { add: '', edit: '', q: '' }); }
function curPageHTML() {
  const s = curUi(), row = c => `<div class="info-row"><button type="button" class="tx-link" data-cur-edit="${esc(c)}">${esc(c)}</button><span class="cur-r">${curRateText(c)}<button type="button" class="ghost" data-cur-rm="${esc(c)}" aria-label="移除 ${esc(c)}">⊖</button></span></div>`, fav = curFav(), sec = (t, k, l) => `<h3 class="notice-h">${t}<button type="button" class="ghost" data-cur-add="${k}" aria-label="新增">＋</button></h3>${l.map(row).join('') || '<p class="hint">尚無</p>'}`, back = '<button type="button" class="ghost" data-cur-back>返回</button>';
  if (s.add && s.add !== 'custom') return `<div class="recon-sheet">${sheetHead(s.add === 'crypto' ? '加密幣種' : '外匯幣種', back)}<div class="recon-search"><input id="curQ" type="search" placeholder="搜尋代碼或名稱" value="${esc(s.q)}"></div><div class="recon-list notice-list">${curListFor(s.q, s.add).map(c => `<button type="button" class="ef-row${fav.includes(c) ? ' on' : ''}" data-cur-fav="${c}"><span class="ef-name">${c}</span><b>${esc(curNames()[c])}${fav.includes(c) ? ' ★' : ''}</b></button>`).join('')}${/^[A-Za-z]{2,6}$/.test(s.q) && !curNames()[s.q.toUpperCase()] ? `<button type="button" class="ef-row" data-cur-fav="${esc(s.q.toUpperCase())}"><span class="ef-name">${esc(s.q.toUpperCase())}</span><b>加入這個代碼</b></button>` : ''}</div></div>`;
  if (s.add === 'custom' || s.edit) {
    const c = s.edit, cu = curCustoms().find(x => x.code === c), custom = s.add === 'custom' || !!cu, g = curCfg(c), acc = c && !cu ? customCur(c) : null;
    return `<div class="recon-sheet">${sheetHead(custom ? '自訂幣種' : esc(c), back)}<div class="recon-list notice-list"><div class="adv-rows">${custom ? `<label>名稱<input id="cuName" maxlength="20" value="${esc(cu?.name || '')}" placeholder="例如 紅利貝多芬"></label><label>英文代碼<input id="cuCode" maxlength="6" value="${esc(c || '')}" ${cu ? 'readonly' : ''} placeholder="SUN"></label>` : `<label>名稱<span>${esc(curNames()[c] || c)}</span></label><label>英文代碼<span>${esc(c)}</span></label>`}<label>幣種符號<input id="cuSym" maxlength="6" value="${esc(custom ? cu?.sym || '' : g.sym || '')}" placeholder="${esc(c || 'E$')}"></label>${custom ? `<label>基準幣種<input id="cuBase" maxlength="6" value="${esc(cu?.base || 'TWD')}"></label><label>1 單位 ＝ 多少基準幣種<input id="cuRate" type="number" min="0" step="any" value="${esc(cu?.rate ?? 1)}"></label>` : ''}<label>小數位數<input id="cuDg" type="number" min="0" max="8" value="${esc(custom ? cu?.digits ?? 0 : g.dg ?? curDigits(c))}"></label></div>${acc ? '<p class="hint">這個幣種目前由帳戶設定定義，匯率請到帳戶修改。</p>' : ''}<div class="form-actions"><button type="button" class="primary" data-cur-save>儲存</button></div></div></div>`;
  }
  const accCustom = [...new Set((state.accounts || []).filter(a => Number(a.curRate) > 0).map(acctCur))].filter(c => !curCustoms().some(x => x.code === c));
  return `<div class="recon-sheet">${sheetHead('幣種')}<div class="recon-list notice-list"><h3 class="notice-h">主幣種</h3>${infoRow('TWD', '新台幣')}${sec('常用外匯幣種', 'fx', fav.filter(c => curKind(c) === 'fx'))}${sec('常用加密幣種', 'crypto', fav.filter(c => curKind(c) === 'crypto'))}${sec('自訂幣種', 'custom', [...curCustoms().map(x => x.code), ...accCustom])}<p class="hint">數字是 1 單位換算成新台幣；匯率每 12 小時更新，可在設定的「匯率」手動修改。點代碼可改符號與小數位數。</p></div></div>`;
}
function renderCurPage() { const el = document.getElementById('curPageBg'); if (el && !el.hidden) el.innerHTML = curPageHTML(); }
// v = { name, code, sym, base, rate, digits } → error text or ''
function curSaveCustom(v) {
  const code = String(v.code || '').trim().toUpperCase(), base = String(v.base || 'TWD').trim().toUpperCase(), rate = Number(v.rate);
  if (!/^[A-Z]{2,6}$/.test(code)) return '英文代碼是 2～6 個英文字母'; if (!(rate > 0)) return '請輸入換算比例'; if (base === code) return '基準幣種不能是自己';
  if (curNames()[code] || (customCur(code) && !curCustoms().some(x => x.code === code))) return `「${code}」已經存在`;
  setPref('curCustom', [...curCustoms().filter(x => x.code !== code), { code, name: String(v.name || code).trim().slice(0, 20), sym: String(v.sym || '').trim().slice(0, 6), base, rate, digits: Math.min(8, Math.max(0, Math.floor(Number(v.digits) || 0))) }]); return '';
}
// ---- 幣種 dialog in the entry form ----
function curSheetRender() {
  const box = document.getElementById('curList'), sel = document.getElementById('entryCurSel'); if (!box || !sel) return; const cur = sel.value, st = document.getElementById('curStar');
  box.innerHTML = [...sel.options].map(o => `<button type="button" data-cur-set="${esc(o.value)}" class="${o.value === cur ? 'on' : ''}">${esc(o.value)}</button>`).join(''); if (st) { const on = curFav().includes(cur) || cur === 'TWD'; st.textContent = on ? '★' : '☆'; st.dataset.cur = cur; }
  const a = document.getElementById('curAmt'); if (a) a.textContent = Number(efEl('amount')?.value || 0).toLocaleString('zh-TW', { maximumFractionDigits: 8 });
  const same = document.getElementById('curSame'); if (same) same.hidden = document.getElementById('fxRow')?.hidden === false;
}
function curBtnSync() { const b = document.getElementById('entryCurBtn'), s = document.getElementById('entryCurSel'); if (b && s) { b.textContent = s.value; b.disabled = s.disabled; } }
document.addEventListener('click', e => {
  const c = s => e.target.closest?.(s), g = i => document.getElementById(i)?.value; let b; const s = curUi();
  if (c('#entryCurBtn')) { document.getElementById('curSheet').hidden = false; document.getElementById('entrySide')?.classList.remove('open'); curSheetRender(); return; }
  if ((b = c('[data-cur-set]'))) { const x = document.getElementById('entryCurSel'); x.value = b.dataset.curSet; x.dispatchEvent(new Event('change', { bubbles: true })); curSheetRender(); return; }
  if (c('[data-cursheet-ok]') || e.target.id === 'curSheet') { document.getElementById('curSheet').hidden = true; efSync(); return; }
  if ((b = c('#curStar'))) { curFavSet(b.dataset.cur, !curFav().includes(b.dataset.cur)); curSheetRender(); return; }
  if (c('[data-cur-more]') || c('#openCurPage')) { s.add = s.edit = s.q = ''; const el = sheetEl('curPageBg'); el.style.zIndex = 420; el.hidden = false; renderCurPage(); return; }
  if (!c('#curPageBg')) return;
  if (c('[data-cur-back]')) { s.add = s.edit = s.q = ''; renderCurPage(); return; } if ((b = c('[data-cur-add]'))) { s.add = b.dataset.curAdd; s.q = ''; renderCurPage(); return; } if ((b = c('[data-cur-edit]'))) { s.edit = b.dataset.curEdit; renderCurPage(); return; }
  if ((b = c('[data-cur-fav]'))) { curFavSet(b.dataset.curFav, !curFav().includes(b.dataset.curFav)); renderCurPage(); fxSyncUI(); return; }
  if ((b = c('[data-cur-rm]'))) {
    const k = b.dataset.curRm;
    if (curCustoms().some(x => x.code === k)) { if ((state.accounts || []).some(a => acctCur(a) === k) || (state.transactions || []).some(t => t.orig?.cur === k)) { alert('還有帳戶或記錄使用這個幣種'); return; } if (confirm(`刪除自訂幣種 ${k}？`)) setPref('curCustom', curCustoms().filter(x => x.code !== k)); }
    else if (customCur(k)) alert('這個幣種由帳戶定義，請到帳戶修改。'); else curFavSet(k, false);
    renderCurPage(); fxSyncUI(); return;
  }
  if (c('[data-cur-save]')) {
    if (s.add === 'custom' || curCustoms().some(x => x.code === s.edit)) { const er = curSaveCustom({ name: g('cuName'), code: g('cuCode'), sym: g('cuSym'), base: g('cuBase'), rate: g('cuRate'), digits: g('cuDg') }); if (er) { alert(er); return; } }
    else { const k = s.edit, all = { ...(prefs().curCfg || {}) }, sy = String(g('cuSym') || '').trim().slice(0, 6), dg = Math.min(8, Math.max(0, Math.floor(Number(g('cuDg')) || 0))); delete all[k]; setPref('curCfg', all); if (sy || dg !== curDigits(k)) setPref('curCfg', { ...all, [k]: { ...(sy ? { sym: sy } : {}), dg } }); }
    s.add = s.edit = ''; renderCurPage(); try { render(); } catch { }
  }
});
document.addEventListener('input', e => { if (e.target?.id === 'curQ') { curUi().q = e.target.value; renderCurPage(); const i = document.getElementById('curQ'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); } });
// 採用線上匯率 can only be switched on by hand (it goes off by itself when the amount or the rate is edited).
document.addEventListener('change', e => { if (e.target?.name === 'convAuto') { e.target.checked = true; setTimeout(curSheetRender, 10); } }, true);
// ---- detail: switch between the foreign and the account amount ----
document.addEventListener('click', e => {
  const b = e.target.closest?.('[data-dc-fx]'); if (!b) return; const t = txById(window.detailId), x = document.querySelector('.dc-title strong'); if (!t?.orig || !x) return;
  const f = x.dataset.f !== '1', s = /^[+−]/.test(x.textContent.trim()) ? x.textContent.trim()[0] : ''; x.dataset.f = f ? '1' : ''; x.textContent = s + (f ? acctMoney(t.orig.amount, { currency: t.orig.cur }) : acctMoney(Math.abs(txEffect(t) || t.amount), acct(t.account)));
});
