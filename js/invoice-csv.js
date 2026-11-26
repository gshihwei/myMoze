// 帳小簿 V26.114 — 匯入財政部「電子發票整合服務平台」下載的發票明細 CSV，並可一次把未歸帳發票記成支出.
// Bundled after js/adv-rows.js. Function declarations / var only. The file is read only in this browser.
// CSV: one row per item (discounts are negative rows); 載具自訂名稱,發票日期,發票號碼,發票金額,發票狀態,折讓,賣方統一編號,賣方名稱,賣方地址,買方統編,消費明細_數量,消費明細_單價,消費明細_金額,消費明細_品名

function invCsvRows(text) {
  const out = []; let row = [], f = '', q = false; const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; continue; }
    if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(f); out.push(row); row = []; f = ''; } else f += ch;
  }
  if (f || row.length) { row.push(f); out.push(row); } return out.map(r => r.map(x => x.trim()));
}
function invCsvNum(v) { const n = Number(String(v || '').replace(/[,\s$]/g, '')); return Number.isFinite(n) ? n : NaN; }
// → { invoices: [{ no, date, total, seller, sellerName, carrier, allowance, items }], voided, masked, error }
function invCsvParse(text) {
  const rows = invCsvRows(text), h = rows.findIndex(r => r.includes('發票號碼') && r.includes('發票日期'));
  if (h < 0) return { error: '這不是財政部的發票明細 CSV（找不到「發票號碼」「發票日期」欄位）', invoices: [], voided: 0, masked: 0 };
  const hd = rows[h], ix = n => hd.indexOf(n), I = { car: ix('載具自訂名稱'), date: ix('發票日期'), no: ix('發票號碼'), amt: ix('發票金額'), st: ix('發票狀態'), al: ix('折讓'), sid: ix('賣方統一編號'), sn: ix('賣方名稱'), addr: ix('賣方地址'), q: ix('消費明細_數量'), p: ix('消費明細_單價'), a: ix('消費明細_金額'), name: ix('消費明細_品名') };
  const map = new Map(), voided = new Set(), masked = new Set();
  for (const r of rows.slice(h + 1)) {
    const no = String(r[I.no] || '').toUpperCase(), d = String(r[I.date] || '').replace(/\D/g, '');
    if (!no || d.length !== 8) continue;
    if (!/^[A-Z]{2}\d{8}$/.test(no)) { masked.add(no); continue; }
    if (/作廢/.test(r[I.st] || '')) { voided.add(no); continue; }
    let inv = map.get(no);
    if (!inv) { inv = { no, code: '', date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, total: 0, seller: r[I.sid] || '', sellerName: r[I.sn] || '', sellerAddr: r[I.addr] || '', carrier: r[I.car] || '', allowance: r[I.al] === '是', items: [] }; map.set(no, inv); }
    const name = (r[I.name] || '').slice(0, 60), q = invCsvNum(r[I.q]), p = invCsvNum(r[I.p]); let a = invCsvNum(r[I.a]); if (!Number.isFinite(a)) a = invCsvNum(r[I.amt]);
    if (!name && !Number.isFinite(a)) continue; if (!Number.isFinite(a)) a = 0;
    inv.items.push(Number.isFinite(q) && Number.isFinite(p) && q && Math.round(q * p) === Math.round(a) ? [name || '品項', q, p] : [name || '品項', 1, a]);
    inv.total = Math.round((inv.total + a) * 100) / 100;
  }
  for (const no of map.keys()) voided.delete(no);
  return { invoices: [...map.values()].filter(i => i.items.length), voided: voided.size, masked: masked.size };
}
// Short shop name for the merchant field: brand when known, else the company name without 股份有限公司 / 分公司.
function invShopName(full) {
  const s = String(full || ''); if (!s) return '';
  const brands = [['蝦皮', '蝦皮購物'], ['富邦媒體', 'momo購物'], ['網路家庭', 'PChome'], ['統一超商', '7-ELEVEN'], ['全家便利', '全家'], ['萊爾富', '萊爾富'], ['來來超商', 'OK超商'], ['全聯', '全聯'], ['家樂福', '家樂福'], ['好市多', 'Costco'], ['大潤發', '大潤發'], ['美廉社', '美廉社'], ['統一星巴克', '星巴克'], ['麥當勞', '麥當勞'], ['路易莎', '路易莎'], ['台灣中油', '中油'], ['台塑石化', '台塑石化'], ['酷澎', '酷澎'], ['康是美', '康是美'], ['屈臣氏', '屈臣氏'], ['寶雅', '寶雅'], ['宜家', 'IKEA'], ['優衣庫', 'UNIQLO'], ['良興', '良興']];
  const b = brands.find(([k]) => s.includes(k)); if (b) return b[1];
  let n = s.replace(/^(英屬維京群島商|英屬開曼群島商|開曼群島商|薩摩亞商|新加坡商|香港商|美商|日商|英商|荷蘭商|德商|法商|韓商|瑞士商)/, '');
  const cut = ['股份有限公司', '有限公司', '企業社', '商行', '分公司', '營業所']; for (const c of cut) { const i = n.indexOf(c); if (i > 0) n = n.slice(0, i); }
  return n.replace(/^(台灣|臺灣)(?=.{2,})/, '').slice(0, 20);
}
// Adds the invoices to the 未歸帳 list on this device. → { added, dup, linked, voided, masked, latest, error }
function invCsvImport(text) {
  const p = invCsvParse(text); if (p.error) return { error: p.error };
  let added = 0, dup = 0, linked = 0, latest = '';
  for (const x of p.invoices) {
    const r = invAdd({ ...x, count: x.items.length });
    if (r.error) { linked++; continue; } const e = invDb().list.find(i => i.no === x.no);
    if (e) for (const k of ['sellerName', 'sellerAddr', 'carrier']) if (x[k] && !e[k]) { e[k] = x[k]; e.mt = Date.now(); } if (e && x.allowance) e.allowance = true; if (r.dup) { dup++; continue; }
    added++; if (x.date > latest) latest = x.date;
  }
  invStore(); return { added, dup, linked, voided: p.voided, masked: p.masked, latest, total: p.invoices.length };
}
// ---- category guess ----
function invCatByNames(names) {
  const l = (state.categories || []).filter(c => c.kind === 'expense' && !c.hidden);
  for (const n of names) { const c = l.find(x => x.name === n) || l.find(x => x.parentId && x.name.includes(n)) || l.find(x => x.name.includes(n)); if (c) return c; }
  return null;
}
function invCatRules() {
  return [[/停車/, ['停車費', '停車']], [/(加油|汽油|柴油|中油|台塑石化)/, ['加油', '油錢', '油資']], [/(貓|狗|寵物|飼料|貓砂|罐罐)/, ['寵物']],
    [/(耳機|滑鼠|鍵盤|電腦|筆電|手機|充電|行動電源|記憶卡|硬碟|螢幕|3C)/i, ['3C', '電子', '電腦', '數位']], [/(咖啡|拿鐵|奶茶|紅茶|綠茶|鮮乳|牛乳|牛奶|豆漿|飲料|燕麥飲|果汁)/, ['飲料', '飲品', '咖啡']],
    [/(衛生紙|洗衣|洗碗|牙膏|洗髮|沐浴|垃圾袋|清潔)/, ['日用品', '生活用品', '家用']], [/(藥|維他命|口罩|OK繃)/, ['藥品', '醫療', '保健']],
    [/(便當|餐|麵|飯|堡|雞|披薩|壽司|早午)/, ['外食', '餐飲', '午餐', '晚餐']], [/(全家|7-ELEVEN|統一超商|萊爾富|OK超商|便利商店)/, ['超商', '便利商店', '零食', '日用品']],
    [/(全聯|家樂福|好市多|Costco|大潤發|美廉社|超市)/, ['超市', '日用品', '食材', '生活用品']], [/(蝦皮|momo|PChome|酷澎|網路家庭|富邦媒體)/, ['網購', '購物']]];
}
// Category last used for this seller, else from the item names, else from the shop. → category id or ''
function invGuessCat(inv) {
  const last = invCategory(inv); if (last?.category && cat(last.category)) return String(last.category);
  const items = (inv.items || []).filter(x => invItemAmount(x) > 0).map(x => x[0]).join(' '), shop = `${inv.sellerName || ''} ${invShopName(inv.sellerName)}`;
  for (const text of [items, shop]) for (const [re, names] of invCatRules()) if (re.test(text)) { const c = invCatByNames(names); if (c) return String(c.id); }
  const o = invCatByNames(['其他']); return o ? String(o.id) : '';
}
function invTxName(inv) {
  const l = (inv.items || []).filter(x => invItemAmount(x) > 0); if (!l.length) return invShopName(inv.sellerName) || '發票消費';
  const n = l[0][0].replace(/^[【\[(（][^】\])）]{0,20}[】\])）]\s*/, '').trim().slice(0, 30) || l[0][0].slice(0, 30); return l.length > 1 ? `${n} 等 ${l.length} 項` : n;
}
// An expense the user may already have written by hand (same amount, within a day, no invoice yet).
function invMaybeRecorded(inv) { return (state.transactions || []).find(t => t.kind === 'expense' && !invOfTx(t).length && Math.abs(Number(t.amount) - Number(inv.total)) < 0.01 && Math.abs((new Date(t.date) - new Date(inv.date)) / 864e5) <= 1) || null; }
// Writes one expense per invoice and links the invoice to it. picks = [{ no, category }] → the new transactions
function invBulkSave(picks, account) {
  const out = [], db = invDb();
  for (const pk of picks) {
    const inv = db.list.find(x => x.no === pk.no); if (!inv || !(Number(inv.total) > 0)) continue;
    const disc = -(inv.items || []).reduce((s, x) => s + Math.min(0, invItemAmount(x)), 0);
    const t = { id: id(), date: inv.date, time: '', kind: 'expense', amount: Number(inv.total), category: pk.category || '', account, toAccount: '', project: '', merchant: invSellerName(inv) || invShopName(inv.sellerName), person: '', name: invTxName(inv), note: '', tags: [], pending: false };
    if (disc > 0) { t.fee = 0; t.discount = disc; t.feeIncluded = true; }
    state.transactions.push(t); adjust(t, 1); invLink(inv, t, inv.items?.length ? 'replace' : ''); out.push(t);
  }
  return out;
}
// ---- 一次記帳 sheet ----
function invBulkSt() { return window.__invBulk || (window.__invBulk = { off: {}, cats: {}, account: '' }); }
function invBulkList() { return invDb().list.filter(i => Number(i.total) > 0 && !i.hidden).sort((a, b) => String(a.date).localeCompare(String(b.date))); }
function invBulkHTML() {
  const b = invBulkSt(), l = invBulkList(), accts = (state.accounts || []).filter(a => !a.archived && !a.hidden);
  if (!b.account || !accts.some(a => String(a.id) === String(b.account))) { const last = (state.transactions || []).filter(t => t.kind === 'expense' && invOfTx(t).length).pop(); b.account = String(last?.account || accts[0]?.id || ''); }
  const cats = (state.categories || []).filter(c => c.kind === 'expense' && !c.hidden), label = c => { const p = c.parentId ? cat(c.parentId) : null; return p ? `${p.name}／${c.name}` : c.name; };
  const on = l.filter(i => !b.off[i.no]), sum = on.reduce((s, i) => s + Number(i.total), 0);
  const rows = l.map(i => { if (b.cats[i.no] === undefined) { b.cats[i.no] = invGuessCat(i); if (invMaybeRecorded(i) && b.off[i.no] === undefined) b.off[i.no] = true; } const m = invMaybeRecorded(i), c = b.cats[i.no];
    return `<div class="ivb-row${b.off[i.no] ? ' off' : ''}"><label class="ivb-check"><input type="checkbox" data-ivb-sel="${esc(i.no)}"${b.off[i.no] ? '' : ' checked'}></label><div class="ivb-main"><b>${esc(invTxName(i))}</b><small>${fmtDate(i.date)}　${esc(invSellerName(i) || invShopName(i.sellerName) || i.seller)}${i.allowance ? '　<span class="expense-text">有折讓</span>' : ''}</small>${m ? `<small class="hint">可能已記過：${esc(m.name)} ${fmtDate(m.date)}</small>` : ''}<select data-ivb-cat="${esc(i.no)}" aria-label="類別"><option value="">選擇類別</option>${cats.map(x => `<option value="${esc(x.id)}"${String(x.id) === String(c) ? ' selected' : ''}>${esc(label(x))}</option>`).join('')}</select></div><b class="ivb-amt">${money(i.total)}</b></div>`; }).join('');
  return `<div class="recon-sheet">${sheetHead('發票一次記帳', '<button type="button" class="ghost" data-ivb-back>返回</button>')}<div class="recon-list notice-list"><p class="hint">每張發票記成一筆支出，品項寫進備註，負的折扣列放進「折扣」。可能已手動記過的預設不勾。</p><label class="setting"><span>付款帳戶</span><select id="ivbAcct">${accts.map(a => `<option value="${esc(a.id)}"${String(a.id) === String(b.account) ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label><div class="form-actions"><button type="button" class="ghost" data-ivb-all="1">全選</button><button type="button" class="ghost" data-ivb-all="0">全不選</button></div>${rows || '<div class="recon-empty">沒有未歸帳的發票</div>'}</div><div class="form-actions"><button type="button" class="secondary" data-ivb-back>取消</button><button type="button" class="primary" data-ivb-ok${on.length ? '' : ' disabled'}>記帳 ${on.length} 筆　${money(sum)}</button></div></div>`;
}
document.addEventListener('click', async e => {
  const c = s => e.target.closest?.(s); let b; if (!c('#invBg')) return; const s = invSt(), B = invBulkSt();
  if (c('[data-inv-bulk]')) { window.__invBulk = null; s.bulk = true; renderInvoices(); return; }
  if (c('[data-ivb-back]')) { s.bulk = false; renderInvoices(); return; }
  if ((b = c('[data-ivb-all]'))) { for (const i of invBulkList()) B.off[i.no] = b.dataset.ivbAll !== '1'; renderInvoices(); return; }
  if (c('[data-ivb-ok]')) {
    const picks = invBulkList().filter(i => !B.off[i.no]).map(i => ({ no: i.no, category: B.cats[i.no] || '' })), miss = picks.filter(p => !p.category).length;
    if (!picks.length) return; if (!B.account) { alert('請先選擇付款帳戶'); return; } if (miss) { alert(`還有 ${miss} 張發票沒有選類別`); return; }
    const l = invBulkSave(picks, B.account); await save(); s.bulk = false; s.tab = 'ok'; render(); renderInvoices(); toast(`已記帳 ${l.length} 筆`);
  }
});
document.addEventListener('change', async e => {
  const t = e.target; if (!t?.closest?.('#invBg')) return; const B = invBulkSt();
  if (t.dataset?.ivbSel) { B.off[t.dataset.ivbSel] = !t.checked; renderInvoices(); return; }
  if (t.dataset?.ivbCat) { B.cats[t.dataset.ivbCat] = t.value; return; }
  if (t.id === 'ivbAcct') { B.account = t.value; return; }
  if (t.id === 'invCsvFile' || t.dataset?.invCsv !== undefined) {
    const files = [...t.files]; t.value = ''; let r = { added: 0, dup: 0, linked: 0, voided: 0, masked: 0, latest: '' }, err = '';
    for (const f of files) { const buf = await f.arrayBuffer(); let text = new TextDecoder('utf-8').decode(buf); if (text.includes('�')) try { text = new TextDecoder('big5').decode(buf); } catch { } const x = invCsvImport(text); if (x.error) { err = x.error; continue; } for (const k of ['added', 'dup', 'linked', 'voided', 'masked']) r[k] += x[k]; if (x.latest > r.latest) r.latest = x.latest; }
    const s = invSt(); if (r.latest) { s.period = invPeriod(r.latest); s.tab = 'un'; } renderInvoices();
    const msg = [`新增 ${r.added} 張發票`, r.dup && `${r.dup} 張已在清單`, r.linked && `${r.linked} 張已歸帳`, r.voided && `${r.voided} 張已作廢略過`, r.masked && `${r.masked} 張號碼不完整略過`].filter(Boolean).join('，');
    if (err && !r.added && !r.dup && !r.linked) alert(err); else alert(msg + (r.added ? '\n\n可以一張張「新增記錄／連結」，或按「一次記帳」全部記成支出。' : ''));
  }
});
