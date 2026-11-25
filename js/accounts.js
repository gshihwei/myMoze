// 帳小簿 V26.10 — 帳戶管理.
// Bundled after js/projects.js; uses app.js globals (state, esc, money, acct, acctName, acctMoney,
// acctCur, adjust, isoDate, selectedDate, openEntity, deleteAccount, save, render, id).
// Function declarations / var only.
//
// Account record: { id, name, type: 'cash' | 'bank' | 'ewallet' | 'broker' | 'foreign' | 'card', balance, currency?, limit?, statement?, due?, note?, archived? }

function acctCurrencies() { return ['TWD', 'USD', 'JPY', 'EUR', 'CNY', 'HKD', 'KRW', 'GBP', 'AUD', 'SGD', 'CAD', 'THB']; }
function acctTypes() { return [['bank', '銀行'], ['cash', '現金'], ['ewallet', '電子支付'], ['broker', '證券戶'], ['foreign', '外幣'], ['card', '信用卡']]; }
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
// ---- V26.53 account picture (resized client-side to a small data URL; stored on the account, syncs with it) ----
function acctImageValid(s) { return typeof s === 'string' && s.length <= 120000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s); }
function acctImageFromForm(f) { const v = String(f.get('aimage') ?? ''); return acctImageValid(v) ? { image: v } : {}; }
function acctImageFieldHTML(a) {
  const has = acctImageValid(a?.image);
  return `<div class="acct-image-field"><div class="acct-image-preview" data-acct-image-preview>${svgForAccount(a || {})}</div><div class="acct-image-actions"><label class="secondary file-btn">選擇圖片<input type="file" accept="image/*" id="acctImageFile" hidden></label><button type="button" class="secondary" data-acct-image-clear ${has ? '' : 'hidden'}>移除圖片</button><small>會縮成小圖並隨帳戶同步</small></div><input type="hidden" name="aimage" value="${has ? esc(a.image) : ''}"></div>`;
}
// Center-crop to a square and scale to `size` px; resolves a data URL (webp when the browser can, else png).
function acctResizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      try {
        const side = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = size;
        c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        let out = c.toDataURL('image/webp', 0.85); if (!/^data:image\/(webp|png|jpeg)/.test(out)) out = c.toDataURL('image/png');
        URL.revokeObjectURL(url); resolve(out);
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}
// Crop geometry: image w x h shown at scale s0*z (s0 makes it just cover a circle of diameter D), centre shifted by (ox,oy).
// Returns the clamped offsets and the source square (sx,sy,side) in image pixels.
function acctCropRect(w, h, D, z, ox, oy) {
  const s = (D / Math.min(w, h)) * Math.max(1, z), mx = Math.max(0, (w * s - D) / 2), my = Math.max(0, (h * s - D) / 2);
  ox = Math.max(-mx, Math.min(mx, ox)); oy = Math.max(-my, Math.min(my, oy));
  const side = D / s;
  return { s, ox, oy, side, sx: w / 2 - ox / s - side / 2, sy: h / 2 - oy / s - side / 2 };
}
// Opens a pan/zoom dialog with a circular frame; resolves a data URL of the framed square (or null if cancelled).
function acctCropDialog(file, host) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.onload = () => {
      const D = 240, S = 280, w = img.naturalWidth, h = img.naturalHeight; let z = 1, ox = 0, oy = 0;
      const box = document.createElement('div'); box.className = 'crop-overlay';
      box.innerHTML = `<div class="crop-card"><div class="crop-stage" style="width:${S}px;height:${S}px"><img alt="" draggable="false"><div class="crop-ring" style="width:${D}px;height:${D}px"></div></div><input type="range" class="crop-zoom" min="1" max="5" step="0.01" value="1" aria-label="縮放"><p class="crop-hint">拖曳移動，滑桿或滾輪縮放</p><div class="crop-actions"><button type="button" class="secondary" data-crop="cancel">取消</button><button type="button" class="primary" data-crop="ok">完成</button></div></div>`;
      const im = box.querySelector('.crop-stage img'), zoom = box.querySelector('.crop-zoom');
      const paint = () => {
        const r = acctCropRect(w, h, D, z, ox, oy); ox = r.ox; oy = r.oy;
        im.style.cssText = `width:${w * r.s}px;height:${h * r.s}px;left:${S / 2 - (w * r.s) / 2 + ox}px;top:${S / 2 - (h * r.s) / 2 + oy}px`;
      };
      im.src = url; paint();
      const stage = box.querySelector('.crop-stage'); let drag = null;
      stage.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, ox, oy }; stage.setPointerCapture?.(e.pointerId); });
      stage.addEventListener('pointermove', e => { if (!drag) return; ox = drag.ox + e.clientX - drag.x; oy = drag.oy + e.clientY - drag.y; paint(); });
      const end = () => { drag = null; }; stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
      stage.addEventListener('wheel', e => { e.preventDefault(); z = Math.max(1, Math.min(5, z * (e.deltaY < 0 ? 1.08 : 1 / 1.08))); zoom.value = z; paint(); }, { passive: false });
      zoom.addEventListener('input', () => { z = +zoom.value; paint(); });
      const done = out => { box.remove(); URL.revokeObjectURL(url); resolve(out); };
      box.addEventListener('click', e => {
        const b = e.target.closest('[data-crop]'); if (!b) return;
        if (b.dataset.crop === 'cancel') return done(null);
        const r = acctCropRect(w, h, D, z, ox, oy), size = 96, c = document.createElement('canvas'); c.width = c.height = size;
        c.getContext('2d').drawImage(img, r.sx, r.sy, r.side, r.side, 0, 0, size, size);
        let out = c.toDataURL('image/webp', 0.85); if (!/^data:image\/(webp|png|jpeg)/.test(out)) out = c.toDataURL('image/png');
        done(out);
      });
      (host || document.body).appendChild(box);
    };
    img.src = url;
  });
}
document.addEventListener('change', async e => {
  const inp = e.target; if (inp?.id !== 'acctImageFile') return;
  const form = inp.closest('#entityForm'), file = inp.files && inp.files[0]; if (!form || !file) return;
  try {
    let data = await acctCropDialog(file, inp.closest('dialog')); inp.value = '';
    if (!data) return;
    if (!acctImageValid(data)) { alert('這張圖片太大或格式不支援，請換一張。'); return; }
    form.querySelector('[name=aimage]').value = data;
    const pv = form.querySelector('[data-acct-image-preview]'); if (pv) pv.innerHTML = `<img class="acct-img" src="${data}" alt="">`;
    const clr = form.querySelector('[data-acct-image-clear]'); if (clr) clr.hidden = false;
  } catch { alert('讀不到這張圖片，請換一張。'); }
});
document.addEventListener('click', e => {
  const clr = e.target.closest?.('[data-acct-image-clear]'); if (!clr) return;
  const form = clr.closest('#entityForm'); if (!form) return;
  form.querySelector('[name=aimage]').value = '';
  const pv = form.querySelector('[data-acct-image-preview]'), typeSel = form.querySelector('[name=atype],[name=accountType]');
  if (pv) pv.innerHTML = svg(accountIcon({ type: typeSel?.value || 'bank' })); clr.hidden = true;
});

// Apply a { 帳戶名稱: data URL } map to the accounts with the same name (spaces normalised).
// Accounts that already have a picture are kept unless `overwrite`. Returns { applied, kept, unmatched }.
function acctNameKey(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function acctApplyImages(map, accounts, overwrite) {
  const by = new Map(); for (const [k, v] of Object.entries(map || {})) if (acctImageValid(v)) by.set(acctNameKey(k), v);
  let applied = 0, kept = 0; const used = new Set();
  for (const a of (accounts || [])) {
    const key = acctNameKey(a.name); if (!by.has(key)) continue; used.add(key);
    if (acctImageValid(a.image) && !overwrite) { kept++; continue; }
    a.image = by.get(key); applied++;
  }
  return { applied, kept, unmatched: [...by.keys()].filter(k => !used.has(k)).length };
}
// Accounts that carry their own picture AND whose name matches a built-in icon (these would switch to the default).
function acctResettableImages(accounts) { return (accounts || []).filter(a => a && a.image && acctDefaultIcon(a.name)); }
function acctResetImages(accounts) { const list = acctResettableImages(accounts); for (const a of list) delete a.image; return list.length; }
document.addEventListener('click', async e => {
  if (!e.target.closest?.('#resetAcctImages')) return;
  const n = acctResettableImages(state.accounts).length;
  if (!n) { alert('沒有需要清除的帳戶：目前沒有「自己設定圖片、名稱又對得到預設圖示」的帳戶。'); return; }
  if (!confirm(`有 ${n} 個帳戶設定了自己的圖片，而且名稱對得到內建預設圖示。\n要清除這些自訂圖片、改用預設圖示嗎？\n（名稱對不到預設圖示的帳戶不受影響）`)) return;
  acctResetImages(state.accounts); await save(); render();
  alert(`已有 ${n} 個帳戶改用預設圖示。`);
});
document.addEventListener('click', e => { if (e.target.closest?.('#importAcctImages')) document.getElementById('acctImagesFile')?.click(); });
document.addEventListener('change', async e => {
  const inp = e.target; if (inp?.id !== 'acctImagesFile' || !inp.files?.[0]) return;
  let map; try { map = JSON.parse(await inp.files[0].text()); } catch { alert('這不是有效的圖片檔（需要 JSON）。'); inp.value = ''; return; }
  inp.value = '';
  const preview = acctApplyImages(map, JSON.parse(JSON.stringify(state.accounts || [])), false), more = acctApplyImages(map, JSON.parse(JSON.stringify(state.accounts || [])), true);
  if (!more.applied) { alert('沒有名稱相符的帳戶，沒有更動。'); return; }
  let overwrite = false;
  if (preview.kept && more.applied > preview.applied) overwrite = confirm(`有 ${preview.kept} 個帳戶已經設定過圖片。\n要用這個檔案的圖片取代它們嗎？\n（按「取消」＝保留已有圖片，只補上沒有圖片的 ${preview.applied} 個帳戶）`);
  const r = acctApplyImages(map, state.accounts, overwrite);
  if (!r.applied) { alert('所有相符的帳戶都已經有圖片，沒有更動。'); return; }
  await save(); render();
  alert(`已為 ${r.applied} 個帳戶設定圖片${r.kept ? `，保留 ${r.kept} 個原有圖片` : ''}。`);
});

// ---- V26.40 credit-card account settings (MOZE-style) ----
function acctWeekendOptions(cur) { return [['keep', '依原日期'], ['next', '順延到下週一'], ['prev', '提前到週五']].map(([k, l]) => `<option value="${k}" ${(cur || 'keep') === k ? 'selected' : ''}>${l}</option>`).join(''); }
// Bank choices for a credit card: names of the bank-type accounts, plus the card's current value so it is never lost.
function acctBankNames(current) {
  const names = [...new Set((state.accounts || []).filter(x => x.type === 'bank').map(x => String(x.name || '').trim()).filter(Boolean))];
  const cur = String(current || '').trim(); if (cur && !names.includes(cur)) names.push(cur);
  return names;
}
function acctBankOptions(current) { const cur = String(current || '').trim(); return acctBankNames(cur).map(b => `<option value="${esc(b)}" ${b === cur ? 'selected' : ''}>${esc(b)}</option>`).join(''); }
function acctBankFieldHTML(a, show) {
  return `<div class="form-grid form-grid-1" data-acct-bank-field ${show ? '' : 'hidden'}><label>所屬銀行（從銀行帳戶選擇，帳戶頁依銀行分組）<select name="abank"><option value="">不指定</option>${acctBankOptions(a.bank)}</select></label></div>`;
}
function acctBankFromForm(f) { const b = String(f.get('abank') ?? '').trim().slice(0, 30); return b ? { bank: b } : {}; }
function acctCardFieldsHTML(a, card) {
  const sources = (state.accounts || []).filter(x => x.type !== 'card' && String(x.id) !== String(a.id));
  return `<div class="acct-card-fields" data-acct-card-fields ${card ? '' : 'hidden'}><div class="form-grid">
    <label>信用額度<input name="alimit" type="number" min="0" step="any" value="${esc(a.limit ?? 0)}"></label>
    <label>可用額度不足提醒（低於此金額提醒，留空＝不提醒）<input name="alowavail" type="number" min="0" step="any" inputmode="decimal" value="${esc(a.lowAvail ?? '')}" placeholder="例如 10000"></label>
    <label>結帳日<input name="astatement" type="number" min="1" max="31" value="${esc(a.statement ?? 15)}"></label>
    <label>結帳日遇非工作日<select name="astmtwk">${acctWeekendOptions(a.stmtWeekend)}</select></label>
    <label>繳款日<input name="adue" type="number" min="1" max="31" value="${esc(a.due ?? 5)}"></label>
    <label>繳款日遇非工作日<select name="aduewk">${acctWeekendOptions(a.dueWeekend)}</select></label>
    <label>主帳戶（繳款時預設的扣款帳戶）<select name="apayfrom"><option value="">不指定</option>${sources.map(x => `<option value="${esc(x.id)}" ${String(a.payFrom ?? '') === String(x.id) ? 'selected' : ''}>${esc(acctName(x))}</option>`).join('')}</select></label>
    <label>紅利回饋 %<input name="areward" type="number" min="0" step="any" inputmode="decimal" value="${esc(a.rewardPct ?? '')}" placeholder="例如 1"></label>
    <label>國外交易手續費 %（外幣卡，僅估算顯示）<input name="afxfee" type="number" min="0" step="any" inputmode="decimal" value="${esc(a.fxFeePct ?? '')}" placeholder="例如 1.5"></label></div>
    <label class="proj-archive"><input type="checkbox" name="aoffset" ${a.offsetBill ? 'checked' : ''}> 帳單折抵（建議繳款金額先扣掉預估回饋）</label>${acctCardPlusHTML(a)}</div>`;
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
  const ov = stmtOverrideOf(card, y, m); if (ov) { const [oy, om, od] = ov.split('-').map(Number); return new Date(oy, om - 1, od); }
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
// Which account-page group an account belongs to: cards stay cards; any other account whose currency is not TWD
// (or whose type is 外幣) goes to the 外幣 group automatically; the rest follow their type.
function acctGroupKey(a) {
  if (a?.type === 'card') return 'card';
  if (a?.type === 'foreign' || acctCur(a) !== 'TWD') return 'foreign';
  return a?.type || 'bank';
}
function acctUsesBank(a) { return a?.type === 'card' || a?.type === 'foreign' || acctCur(a) !== 'TWD'; }
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
// Credit cards and foreign-currency accounts are shown under their bank (account.bank) with a chevron.
// cardTiles / tiles are the per-account HTML aligned with cards / normal.
function acctBankRows(list, tiles, key, unit, bankCollapsed) {
  let body = '';
  for (const g of acctCardBanks(list)) {
    if (!g.bank) { body += tiles[g.idx[0]]; continue; }
    const sub = g.idx.map(i => list[i]), total = acctGroupTotal(sub), tkey = key === 'card' ? g.bank : `${key}:${g.bank}`, off = bankCollapsed.has(tkey);
    const amount = key === 'card' ? money(Math.abs(Math.min(0, total))) : `${total < 0 ? '−' : ''}${money(Math.abs(total))}`;
    body += `<div class="account-tile bank-row${selectedBank && selectedBank.key === key && selectedBank.bank === g.bank ? ' active' : ''}" data-bank-key="${key}" data-bank-name="${esc(g.bank)}" role="button" tabindex="0"><div class="account-tile-icon">${svg('bank')}</div><div class="account-tile-main"><b>${esc(g.bank)}</b><span>${sub.length} ${unit}</span></div><strong>${amount}</strong><button type="button" class="bank-toggle" data-bank-toggle="${esc(tkey)}" aria-expanded="${off ? 'false' : 'true'}" aria-label="${off ? '展開' : '收合'} ${esc(g.bank)}">${off ? '⌄' : '⌃'}</button></div>`;
    if (!off) body += `<div class="bank-children">${g.idx.map(i => tiles[i]).join('')}</div>`;
  }
  return body;
}
function acctGroupsHTML(cards, cardTiles, normal, tiles) {
  const collapsed = new Set(prefs().acctCollapsed || []), bankCollapsed = new Set(prefs().bankCollapsed || []);
  const head = (key, label, list) => `<button type="button" class="acct-group-head" data-acct-group="${key}" aria-expanded="${collapsed.has(key) ? 'false' : 'true'}"><span>${collapsed.has(key) ? '＋' : '−'} ${label} (${list.length})</span><span class="acct-group-total">${acctSignedMoney(acctGroupTotal(list))}</span></button>`;
  let html = head('card', '信用卡', cards) + (collapsed.has('card') ? '' : `<div class="credit-list">${cards.length ? acctBankRows(cards, cardTiles, 'card', '張信用卡', bankCollapsed) : '<div class="empty">尚無信用卡</div>'}</div>`);
  for (const [key, label] of acctTypes().filter(([k]) => k !== 'card')) {
    const idx = normal.map((a, i) => [a, i]).filter(([a]) => acctGroupKey(a) === key).map(([, i]) => i);
    if (!idx.length) continue;
    const list = idx.map(i => normal[i]), ts = idx.map(i => tiles[i]);
    html += head(key, label, list) + (collapsed.has(key) ? '' : `<div class="normal-accounts">${key === 'foreign' ? acctBankRows(list, ts, 'foreign', '個外幣帳戶', bankCollapsed) : ts.join('')}</div>`);
  }
  if (!normal.length && !cards.length) html += '<div class="empty">尚無帳戶</div>';
  return html;
}
// ---- V26.50 account detail sections (帳務統計 / 繳款記錄 / 帳戶資訊 / 子帳戶), modelled on MOZE ----
var selectedBank;   // { key: 'card' | 'foreign', bank } while a bank's detail sheet is open
// V26.66: which statement a card line belongs to is decided by its posting date (入帳日), not the purchase date;
// refunds (income with refundOf) on the card reduce the statement.
function cardTxDate(t) { return t.postDate || t.date; }
function cardSpendTxs(card, start, end) {
  return (state.transactions || []).filter(t => String(t.account) === String(card.id) && !t.cardPayment && (t.kind === 'expense' || (t.kind === 'income' && t.refundOf) || (t.kind === 'balance_adjustment' && t.stmtInst)) && !isUnappliedPending(t) && cardTxDate(t) >= start && cardTxDate(t) <= end);
}
function cardLineAmount(t) { const v = Number(t.amount || 0); return t.kind === 'balance_adjustment' ? -v : t.kind === 'income' ? -Math.abs(v) : Math.abs(v); }
function cardSpendSum(list) { return Math.round(list.reduce((s, t) => s + cardLineAmount(t), 0) * 100) / 100; }
function creditStmt(card, base, offset) {
  const period = cardPeriod(card, base, offset);
  const spend = cardSpendSum(cardSpendTxs(card, period.start, period.end));
  const paid = creditStatementPayments(card, period).reduce((s, t) => s + Number(t.amount || 0), 0);
  return { period, spend, paid, owed: Math.max(0, Math.round((spend - paid) * 100) / 100) };
}
// 新增花費 / 上期欠款 / 應繳 / 已繳 / 剩餘 for the statement `offset` periods back (0 = last closed statement).
function creditStats(card, base, offset) {
  const b = base || new Date(), cur = creditStmt(card, b, offset || 0), prev = creditStmt(card, b, (offset || 0) - 1);
  const payable = cur.spend + prev.owed;
  return { period: cur.period, spend: cur.spend, prevOwed: prev.owed, payable, paid: cur.paid, remaining: Math.max(0, Math.round((payable - cur.paid) * 100) / 100) };
}
function sumCreditStats(list) { return list.reduce((s, x) => ({ spend: s.spend + x.spend, prevOwed: s.prevOwed + x.prevOwed, payable: s.payable + x.payable, paid: s.paid + x.paid, remaining: s.remaining + x.remaining }), { spend: 0, prevOwed: 0, payable: 0, paid: 0, remaining: 0 }); }
function infoRow(label, value, cls) { return `<div class="info-row"><span>${esc(label)}</span><b class="${cls || ''}">${value}</b></div>`; }
function creditStatsHTML(st) {
  return `<section class="detail-sec"><h4>帳務統計</h4>${infoRow('新增花費', `${st.spend ? '−' : ''}${money(st.spend)}`, st.spend ? 'expense-text' : '')}${infoRow('上期欠款', money(st.prevOwed))}${infoRow('應繳金額', `${st.payable ? '−' : ''}${money(st.payable)}`, st.payable ? 'expense-text' : '')}${infoRow('已繳金額', `${st.paid ? '+' : ''}${money(st.paid)}`, st.paid ? 'income-text' : '')}${infoRow('剩餘帳款', st.remaining ? money(st.remaining) : '已繳清 ✓', st.remaining ? '' : 'income-text')}</section>`;
}
function acctInfoHTML(a) {
  const card = a.type === 'card', n = state.transactions.filter(t => String(t.account) === String(a.id) || String(t.toAccount ?? '') === String(a.id)).length;
  const due = card ? isoDate(cardStatementDueDate(a, cardPeriod(a, new Date(), 0))) : '';
  const payFrom = card && a.payFrom ? (state.accounts.find(x => String(x.id) === String(a.payFrom))?.name || '') : '';
  const rows = [infoRow('餘額', acctMoney(a.balance, a), Number(a.balance) < 0 ? 'expense-text' : ''), infoRow('記帳筆數', n), infoRow('主幣種', esc(acctCur(a))), infoRow('帳戶分組', esc(acctTypeLabel(a)))];
  if (a.bank) rows.push(infoRow('所屬銀行', esc(a.bank)));
  if (card) rows.push(infoRow('信用額度', a.limit ? money(a.limit) : '尚未設定'), infoRow('結帳日', `每月 ${a.statement || 15} 日`), infoRow('繳款期限', due), infoRow('主帳戶', payFrom ? esc(payFrom) : '無'), infoRow('紅利回饋', a.rewardPct ? `${a.rewardPct}%` : '無'));
  rows.push(infoRow('不計入總資產', a.excludeNet ? '是' : '否'), infoRow('封存帳戶', a.archived ? '是' : '否'));
  return `<section class="detail-sec"><h4>帳戶資訊 <button type="button" class="ghost detail-gear" data-acct-manage="${esc(a.id)}" aria-label="管理 ${esc(a.name)}">管理 ⚙</button></h4>${rows.join('')}</section>`;
}
function bankCards(sel) { return (state.accounts || []).filter(a => acctGroupKey(a) === sel.key && String(a.bank || '').trim() === sel.bank); }
function bankDetailHTML(sel) {
  const list = bankCards(sel), card = sel.key === 'card', total = acctGroupTotal(list);
  const subs = list.map(a => `<button type="button" class="sub-acct" data-open-card-from-bank="${esc(a.id)}"><span>${esc(a.name)}${acctCur(a) !== 'TWD' ? ` (${esc(acctCur(a))})` : ''}</span><b>${card ? money(Math.abs(Number(a.balance || 0))) : acctMoney(a.balance, a)}</b></button>`).join('');
  let html = `<div class="detail-close-row"><button type="button" class="secondary" data-close-bank>← 返回帳戶</button></div><div class="credit-detail-head"><div><div class="eyebrow">${card ? '信用卡' : '外幣帳戶'}</div><h3>${esc(sel.bank)}</h3><div class="hint">${list.length} ${card ? '張信用卡' : '個外幣帳戶'}</div></div></div>`;
  if (card) {
    html += bankCombinedHTML(list);
    const used = list.reduce((s, a) => s + Math.abs(Math.min(0, Number(a.balance || 0))), 0), shared = list.filter(a => a.shareLimit), limit = list.filter(a => !a.shareLimit).reduce((s, a) => s + Number(a.limit || 0), 0) + Math.max(0, ...shared.map(a => Number(a.limit || 0)));
    html += `<section class="detail-sec"><h4>帳戶資訊</h4>${infoRow('已使用', money(used), used ? 'expense-text' : '')}${infoRow('信用額度合計', limit ? money(limit) : '尚未設定')}${infoRow('可用額度', limit ? money(Math.max(0, limit - used)) : '—')}${infoRow('信用卡張數', list.length)}</section>`;
  } else html += `<section class="detail-sec"><h4>帳戶資訊</h4>${infoRow('折合 TWD', `${total < 0 ? '−' : ''}${money(Math.abs(total))}`, total < 0 ? 'expense-text' : '')}${infoRow('帳戶數', list.length)}</section>`;
  html += `<section class="detail-sec"><h4>子帳戶</h4><div class="sub-accts">${subs || '<div class="empty">沒有子帳戶</div>'}</div></section>`;
  const ids = new Set(list.map(a => String(a.id))), txs = (state.transactions || []).filter(t => ids.has(String(t.account)) && !isUnappliedPending(t)).sort((x, y) => String(y.date).localeCompare(String(x.date)) || String(y.time || '').localeCompare(String(x.time || ''))).slice(0, 40);
  const rows = txs.map(t => `<div class="account-detail-row"><span class="account-detail-date">${esc(t.date)}</span><div><b>${esc(t.name || '')}</b><div class="tx-meta">${esc(acct(t.account).name || '')}</div></div><div class="amount ${t.kind === 'income' ? 'income-text' : 'expense-text'}">${t.kind === 'income' ? '+' : '−'}${money(Math.abs(Number(t.amount || 0)))}</div></div>`).join('');
  return html + `<section class="detail-sec pane-tx"><h4>最近交易 <span class="hint">${txs.length} 筆</span></h4>${rows || '<div class="empty">沒有交易記錄</div>'}</section>`;
}
function renderBankDetail() {
  const el = document.getElementById('creditAccountDetail'); if (!el) return;
  if (!selectedBank || !bankCards(selectedBank).length) { selectedBank = null; el.hidden = true; return; }
  el.hidden = false; el.innerHTML = bankDetailHTML(selectedBank);
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
function acctCardSettingsFromForm(f, old) {
  const a = {};
  a.limit = Math.max(0, Number(f.get('alimit') || 0)); a.statement = Math.min(31, Math.max(1, Math.round(Number(f.get('astatement') || 15)))); a.due = Math.min(31, Math.max(1, Math.round(Number(f.get('adue') || 5))));
  const wk = v => (['next', 'prev'].includes(String(v)) ? String(v) : ''), num = k => { const raw = String(f.get(k) ?? '').trim(), n = Number(raw); return raw !== '' && Number.isFinite(n) && n >= 0 ? n : null; };
  const put = (k, v) => { if (!(v === null || v === '' || v === false)) a[k] = v; };
  put('bank', String(f.get('abank') ?? '').trim().slice(0, 30)); put('stmtWeekend', wk(f.get('astmtwk'))); put('dueWeekend', wk(f.get('aduewk')));
  const pf = String(f.get('apayfrom') || ''); put('payFrom', (state.accounts || []).some(x => x.type !== 'card' && String(x.id) === pf) ? pf : '');
  put('rewardPct', num('areward')); put('fxFeePct', num('afxfee')); put('lowAvail', num('alowavail')); put('offsetBill', !!f.get('aoffset')); Object.assign(a, acctCardPlusFromForm(f, old));
  return a;
}
function acctActive(list, keepId) { return (list || []).filter(a => !a.archived || String(a.id) === String(keepId ?? '')); }

function acctCurrencyField(cur, locked) {
  return `<label>幣別<input name="acur" list="acctCurList" maxlength="6" value="${esc(cur || 'TWD')}" ${locked ? 'readonly' : ''} autocapitalize="characters"><datalist id="acctCurList">${acctCurrencies().map(c => `<option value="${c}"></option>`).join('')}</datalist></label>`;
}

function acctEditFormHTML(a) {
  const locked = acctHasTx(a.id), card = a.type === 'card', bal = Number(a.balance || 0);
  const period = card ? cardPeriod(a, new Date(), 0) : null;
  return `<div class="acct-edit-top"><div class="account-detail-icon">${svgForAccount(a)}</div><small>餘額 ${esc(acctCur(a))}</small><strong class="${bal < 0 ? 'expense-text' : ''}">${acctMoney(bal, a)}</strong>${period ? `<small>帳單週期 ${period.start} ～ ${period.end}</small>` : ''}</div>
  ${acctImageFieldHTML(a)}
  <div class="form-grid">
    <label>帳戶名稱<input name="aname" required maxlength="30" value="${esc(a.name || '')}"></label>
    <label>類型<select name="atype">${acctTypes().map(([k, l]) => `<option value="${k}" ${(a.type || 'bank') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${acctCurrencyField(acctCur(a), locked)}
  </div>
  ${acctCustomCurHTML(a)}
  ${acctBankFieldHTML(a, acctUsesBank(a))}
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
  if (!/^[A-Z]{2,6}$/.test(cur)) return { error: '幣別請輸入 2～6 個英文字母，例如 TWD、USD' };
  if (cur !== acctCur(old) && acctHasTx(old.id)) return { error: '這個帳戶已有交易，幣別不能修改' };
  if ((state.accounts || []).some(a => a !== old && a.name === name && acctCur(a) === cur)) return { error: `已經有「${name}（${cur}）」` };
  const a = { ...old, name, currency: cur, note: String(f.get('anote') || '').trim(), archived: !!f.get('aarchived') };
  const want = String(f.get('atype') || old.type || 'bank'); a.type = acctTypes().some(([k]) => k === want) ? want : (old.type || 'bank');
  if (a.type !== 'card') { for (const k of ['limit', 'statement', 'due', 'bank', 'stmtWeekend', 'dueWeekend', 'payFrom', 'rewardPct', 'fxFeePct', 'lowAvail', 'offsetBill', 'shareLimit', 'autoPay', 'autoPaySince', 'stmtOverride']) delete a[k]; if (a.type === 'foreign' || cur !== 'TWD') Object.assign(a, acctBankFromForm(f)); }
  else { for (const k of ['bank', 'stmtWeekend', 'dueWeekend', 'payFrom', 'rewardPct', 'fxFeePct', 'lowAvail', 'offsetBill', 'shareLimit', 'autoPay', 'autoPaySince']) delete a[k]; Object.assign(a, acctCardSettingsFromForm(f, old)); if (a.statement !== old.statement || (a.stmtWeekend || '') !== (old.stmtWeekend || '')) delete a.stmtOverride; }
  if (!a.note) delete a.note;
  if (!a.archived) delete a.archived;
  delete a.image; Object.assign(a, acctImageFromForm(f));
  for (const k of ['curRate', 'curBase', 'curSym', 'curDigits']) delete a[k]; Object.assign(a, acctCustomCurFromForm(f));
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

function acctSyncBankField(form) {
  const bank = form?.querySelector?.('[data-acct-bank-field]'); if (!bank) return;
  const type = form.querySelector('[name=atype],[name=accountType]')?.value || '', cur = String(form.querySelector('[name=acur]')?.value || 'TWD').trim().toUpperCase();
  bank.hidden = !(type === 'card' || type === 'foreign' || (cur && cur !== 'TWD'));
}
document.addEventListener('change', e => { const s = e.target; if ((s?.name === 'atype' || s?.name === 'accountType') && s.closest?.('#entityForm')) { const form = s.closest('#entityForm'), box = form.querySelector('[data-acct-card-fields]'); if (box && s.name === 'atype') box.hidden = s.value !== 'card'; acctSyncBankField(form); } });
document.addEventListener('input', e => { if (e.target?.name === 'acur' && e.target.closest?.('#entityForm')) acctSyncBankField(e.target.closest('#entityForm')); });
document.addEventListener('click', async e => {
  const row = e.target.closest?.('.bank-row');
  if (row) { const t = e.target.closest('[data-bank-toggle]'); if (t) acctToggleBank(t.dataset.bankToggle); else { selectedBank = { key: row.dataset.bankKey, bank: row.dataset.bankName }; selectedCreditCardId = null; selectedAccountId = null; } renderAccounts(); return; }
  if (e.target.closest?.('[data-close-bank]')) { selectedBank = null; renderAccounts(); return; }
  const fromBank = e.target.closest?.('[data-open-card-from-bank]'); if (fromBank) { openCreditAccount(fromBank.dataset.openCardFromBank); return; }
  if (e.target.closest?.('[data-close-credit]')) { selectedCreditCardId = null; renderAccounts(); return; }
  const bk = e.target.closest?.('[data-bank-toggle]'); if (bk) { acctToggleBank(bk.dataset.bankToggle); renderAccounts(); return; }
  const grp = e.target.closest?.('[data-acct-group]'); if (grp) { acctToggleGroup(grp.dataset.acctGroup); renderAccounts(); return; }
  const find = v => (state.accounts || []).find(a => String(a.id) === String(v));
  const mg = e.target.closest?.('[data-acct-manage]'); if (mg) { e.preventDefault(); e.stopPropagation(); const a = find(mg.dataset.acctManage); if (a) openEntity('accountEdit', a); return; }
  const mv = e.target.closest?.('[data-acct-move]'); if (mv) { const a = find(mv.dataset.acctId); if (a && acctMove(a, Number(mv.dataset.acctMove))) { await save(); render(); } return; }
  const adj = e.target.closest?.('[data-acct-adjust]'); if (adj) { const a = find(adj.dataset.acctAdjust); if (a) openEntity('accountAdjust', a); return; }
  const del = e.target.closest?.('[data-acct-delete]'); if (del) { closeModals(); await deleteAccount(del.dataset.acctDelete); }
});
