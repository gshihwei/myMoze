// 帳小簿 V26.97 — 電子發票：掃描 QRCode、發票明細、歸帳（連結／新增／多類別）、一筆多張、手動對獎.
// Bundled after js/gestures.js. Function declarations / var only. Uses js/vendor/jsQR.js (Apache-2.0) only while scanning.
// t.invoices = [{ no, code, date, total, seller, items: [[name, qty, price]] }]; invoices not linked yet wait on this device.

function invDb() { if (!window.__inv) { let d = {}; try { d = JSON.parse(localStorage.getItem('moze-invoices-v1') || '{}') || {}; } catch { } window.__inv = { list: Array.isArray(d.list) ? d.list : [], win: d.win || {} }; } return window.__inv; }
function invStore() { const d = invDb(); d.list = d.list.slice(0, 500); try { localStorage.setItem('moze-invoices-v1', JSON.stringify(d)); } catch { } if (typeof inboxTouch === 'function') inboxTouch(); }
// Left QR of a Taiwanese e-invoice (77 fixed characters, then ":" fields); the right one starts with "**".
function invParse(raw) {
  const s = String(raw || ''); if (s.startsWith('**')) return { right: true, items: invItems(s.slice(2).split(':')) };
  const m = /^([A-Z]{2}\d{8})(\d{3})(\d{2})(\d{2})(\d{4})([0-9A-Fa-f]{8})([0-9A-Fa-f]{8})(\d{8})(\d{8}).{24}/.exec(s); if (!m) return null;
  const y = Number(m[2]) + 1911, date = `${y}-${m[3]}-${m[4]}`; if (!(Number(m[3]) >= 1 && Number(m[3]) <= 12 && Number(m[4]) >= 1 && Number(m[4]) <= 31)) return null;
  const parts = s.slice(77).replace(/^:/, '').split(':'); // **********, items here, items total, encoding, name, qty, price…
  const fields = /^\*+$/.test(parts[0] || '') ? parts.slice(1) : parts, count = Number(fields[1]) || 0, enc = fields[2];
  return { no: m[1], date, code: m[5], sales: parseInt(m[6], 16), total: parseInt(m[7], 16), buyer: m[8] === '00000000' ? '' : m[8], seller: m[9], count, items: invItems(fields.slice(3), enc) };
}
function invItems(f, enc) {
  const out = []; let l = f.map(x => x.trim()); if (enc === '2') try { l = new TextDecoder('utf-8').decode(Uint8Array.from(atob(f.join(':')), c => c.charCodeAt(0))).split(':'); } catch { }
  for (let i = 0; i + 2 < l.length + 0 && out.length < 60; i += 3) { const n = l[i], q = Number(l[i + 1]), p = Number(l[i + 2]); if (!n || !Number.isFinite(q) || !Number.isFinite(p)) break; out.push([n.slice(0, 60), q, p]); } return out;
}
function invItemAmount(x) { return Math.round(x[1] * x[2]); }
function invNote(inv) { return (inv.items || []).map(x => `◎ ${x[0]} ($${x[2]}) × ${x[1]} = $${invItemAmount(x)}`).join('\n'); }
function invOfTx(t) { const l = Array.isArray(t?.invoices) ? t.invoices : []; return t?.invoiceNo && !l.some(i => i.no === t.invoiceNo) ? [{ no: t.invoiceNo, code: t.invoiceCode || '', date: t.date, total: Number(t.amount) }, ...l] : l; }
function invKnown(no) { return (state.transactions || []).find(t => invOfTx(t).some(i => i.no === no)) || null; }
// → the pool entry, or { error }. A right-hand code adds its items to the invoice scanned just before.
function invAdd(p) {
  const db = invDb(); if (!p) return { error: '這不是電子發票的 QRCode（請掃左邊那一個）' };
  if (p.right) { const last = db.list[0]; if (last && last.items.length < (last.count || 99) && !last.rightDone) { last.items.push(...p.items.filter(x => !last.items.some(y => y[0] === x[0] && y[2] === x[2]))); last.rightDone = true; invStore(); return last; } return { error: '先掃左邊的 QRCode' }; }
  if (db.list.some(x => x.no === p.no)) return { ...db.list.find(x => x.no === p.no), dup: true }; const t = invKnown(p.no); if (t) return { error: `發票 ${p.no} 已歸在「${t.name}」` };
  const i = { no: p.no, code: p.code, date: p.date, total: p.total, seller: p.seller || '', count: p.count || 0, items: p.items || [], at: Date.now() }; prefs().inboxGone = (prefs().inboxGone || []).filter(k => k !== 'i' + i.no); db.list.unshift(i); invStore(); return i;
}
function invLink(inv, t, note) {
  const i = { no: inv.no, code: inv.code, date: inv.date, total: inv.total, seller: inv.seller, items: (inv.items || []).slice(0, 40) }; t.invoices = [...invOfTx(t).filter(x => x.no !== i.no), i]; if (!t.invoiceNo) { t.invoiceNo = i.no; t.invoiceCode = i.code; } else t.invoices = t.invoices.filter(x => x.items || x.no !== t.invoiceNo);
  const n = invNote(inv); if (n && note === 'append') t.note = [t.note, n].filter(Boolean).join('\n'); else if (n && note === 'replace') t.note = n;
  const db = invDb(); db.list = db.list.filter(x => x.no !== inv.no); inboxGone(inv); invStore(); return t;
}
function invUnlink(t, no) { const l = invOfTx(t), i = l.find(x => x.no === no); t.invoices = l.filter(x => x.no !== no && x.items); if (!t.invoices.length) delete t.invoices; if (t.invoiceNo === no) { const n = t.invoices?.[0]; if (n) { t.invoiceNo = n.no; t.invoiceCode = n.code; } else { delete t.invoiceNo; delete t.invoiceCode; } } if (i?.items) { prefs().inboxGone = (prefs().inboxGone || []).filter(k => k !== 'i' + i.no); invDb().list.unshift(i); invStore(); } }
// Category last used with this seller / these items.
function invCategory(inv, name) { const l = (state.transactions || []).filter(t => t.kind === 'expense' && (invOfTx(t).some(i => i.seller && i.seller === inv.seller) || (name && t.name === name))); return l[l.length - 1]; }
function invSellerName(inv) { const t = (state.transactions || []).filter(x => x.merchant && invOfTx(x).some(i => i.seller && i.seller === inv.seller)); return t.length ? t[t.length - 1].merchant : ''; }
function invRecord(inv, multi) {
  const last = invCategory(inv), base = { kind: 'expense', date: inv.date, time: nowTime(), amount: inv.total, name: '', merchant: invSellerName(inv), tags: [], person: '', note: multi ? '' : invNote(inv), ...(last ? { category: last.category, account: last.account, project: last.project || '' } : {}) };
  document.getElementById('invBg').hidden = true; window.openTx('expense', base); window.__savedTx = null; window.__invSave = inv;
  setTimeout(() => {
    const el = txForm.elements; el.invoiceNo.value = inv.no; el.invoiceCode.value = inv.code;
    if (multi) { const its = inv.items.filter(x => invItemAmount(x) > 0), neg = -inv.items.reduce((s, x) => s + Math.min(0, invItemAmount(x)), 0), sum = its.reduce((s, x) => s + invItemAmount(x), 0); window.entryItems.load(its.map((x, i) => { const c = invCategory({}, x[0]) || last; return { tab: 'expense', kind: 'expense', category: c?.category ?? el.category.value, expr: String(invItemAmount(x)), account: last?.account ?? el.account.value, project: last?.project || '', name: '', cur: '', rewards: [], discount: i ? 0 : Math.max(0, Math.min(invItemAmount(x) - 1, neg || sum - inv.total)), invoiceNo: i ? '' : inv.no, invoiceCode: i ? '' : inv.code, preset: '' }; })); }
    efSync();
  }, 200);
}
function invAfterSave() { const inv = window.__invSave; if (!inv) return; window.__invSave = null; const t = window.__savedTx; if (!t) return; const x = (state.transactions || []).find(y => y.id === t.id); const g = x ? splitGroupOf(x) : []; const target = g.length > 1 ? g.find(y => y.invoiceNo === inv.no) || x : x; if (!target) return; invLink(inv, target, ''); save(); }
// ---- 對獎 ---- period key: first month of the two-month period, e.g. 2026-09.
function invPeriod(date) { const [y, m] = String(date).split('-').map(Number); return `${y}-${String(m % 2 ? m : m - 1).padStart(2, '0')}`; }
function invDrawDate(key) { const [y, m] = key.split('-').map(Number), d = new Date(y, m + 1, 25); return isoDate(d); }
// win = { special: '8 digits', grand: '8 digits', first: ['8 digits' × 3] }
function invPrize(no, win) {
  const n = String(no || '').slice(-8); if (!/^\d{8}$/.test(n) || !win) return null; if (n === win.special) return { p: '特別獎', v: 10000000 }; if (n === win.grand) return { p: '特獎', v: 2000000 }; let best = null;
  for (const f of win.first || []) for (const [k, p, v] of [[8, '頭獎', 200000], [7, '二獎', 40000], [6, '三獎', 10000], [5, '四獎', 4000], [4, '五獎', 1000], [3, '六獎', 200]]) if (f.slice(-k) === n.slice(-k)) { if (!best || v > best.v) best = { p, v }; break; } return best;
}
function invAll(period) {
  const out = []; for (const t of (state.transactions || [])) for (const i of invOfTx(t)) if (!period || invPeriod(i.date || t.date) === period) out.push({ inv: i, t }); for (const i of invDb().list) if (!period || invPeriod(i.date) === period) out.push({ inv: i, t: null }); return out.sort((a, b) => String(b.inv.date).localeCompare(String(a.inv.date)));
}
function invSt() { return window.__invUi || (window.__invUi = { period: invPeriod(isoDate(new Date())), tab: 'un', open: null, link: null, q: '' }); }
function renderInvoices() {
  const el = document.getElementById('invBg'); if (!el || el.hidden) return; const s = invSt(), db = invDb(), all = invAll(s.period), un = all.filter(x => !x.t), ok = all.filter(x => x.t), win = db.win[s.period], [y, m] = s.period.split('-').map(Number), p2 = v => String(v).padStart(2, '0');
  if (s.link) { const inv = db.list.find(x => x.no === s.link); if (inv) { const l = (state.transactions || []).filter(t => t.kind === 'expense' && Math.abs((new Date(t.date) - new Date(inv.date)) / 864e5) < 40 && (!s.q || `${t.name} ${t.merchant || ''} ${t.amount}`.toLowerCase().includes(s.q.toLowerCase()))).sort((a, b) => (Number(b.amount) === inv.total) - (Number(a.amount) === inv.total) || Math.abs(new Date(a.date) - new Date(inv.date)) - Math.abs(new Date(b.date) - new Date(inv.date))).slice(0, 60); el.innerHTML = `<div class="recon-sheet">${sheetHead(`發票歸帳 ${esc(inv.no)} ${money(inv.total)}`, '<button type="button" class="ghost" data-inv-back>返回</button>')}<div class="recon-search"><input id="invQ" type="search" placeholder="搜尋" value="${esc(s.q)}"></div><div class="recon-list notice-list">${l.map(t => `<button type="button" class="notice-row" data-inv-link="${esc(t.id)}"><div class="notice-ico">${catIconHTML(cat(t.category))}</div><div class="day-main"><b>${esc(t.name)}</b><small>${fmtDate(t.date)} ${esc(t.merchant || '')}</small></div><div class="day-side"><b class="${Number(t.amount) === inv.total ? 'income-text' : ''}">${money(t.amount)}</b></div></button>`).join('') || '<div class="recon-empty">附近日期沒有支出記錄</div>'}</div></div>`; return; } s.link = null; }
  const row = ({ inv, t }) => { const z = win ? invPrize(inv.no, win) : null; return `<div class="draft-row${s.open === inv.no ? ' open' : ''}"><button type="button" class="notice-row" data-inv-row="${esc(inv.no)}"><div class="notice-ico inv-state">${win ? (z ? '🎉' : '未中') : '未<br>開獎'}</div><div class="day-main"><b>${esc(inv.no)}</b><small>${fmtDate(inv.date)} ${esc(t ? t.name : invSellerName(inv) || (inv.seller ? '統編 ' + inv.seller : ''))}</small>${z ? `<small class="income-text">${z.p} ${money(z.v)}</small>` : ''}</div><div class="day-side"><b>${money(inv.total)}</b></div></button>${s.open === inv.no ? `<div class="draft-mark">${(inv.items || []).map(x => `<div class="info-row"><span>${esc(x[0])} × ${x[1]}</span><b>${money(invItemAmount(x))}</b></div>`).join('') || '<p class="hint">沒有明細</p>'}<div class="form-actions">${t ? `<button type="button" class="secondary" data-inv-unlink="${esc(inv.no)}">取消連結</button><button type="button" class="secondary" data-tx-open="${esc(t.id)}">查看記錄</button>` : `<button type="button" class="secondary danger-btn" data-inv-del="${esc(inv.no)}">刪除</button><button type="button" class="secondary" data-inv-golink="${esc(inv.no)}">連結</button>${(inv.items || []).filter(x => invItemAmount(x) > 0).length > 1 ? `<button type="button" class="secondary" data-inv-multi="${esc(inv.no)}">建立多類別</button>` : ''}<button type="button" class="primary" data-inv-new="${esc(inv.no)}">新增記錄</button>`}</div></div>` : ''}</div>`; };
  const list = s.tab === 'un' ? un : ok, hit = win ? all.map(x => invPrize(x.inv.no, win)).filter(Boolean) : [];
  el.innerHTML = `<div class="recon-sheet">${sheetHead('電子發票', '<button type="button" class="icon" data-inv-scan aria-label="掃描">⛶</button>')}<div class="recon-period"><button type="button" data-inv-off="-2">‹</button><strong>${y - 1911} 年 ${p2(m)} － ${p2(m + 1)} 月</strong><button type="button" data-inv-off="2">›</button></div><div class="entry-tabs"><button type="button" data-inv-tab="un" class="${s.tab === 'un' ? 'active' : ''}">未歸帳（${un.length}）</button><button type="button" data-inv-tab="ok" class="${s.tab === 'ok' ? 'active' : ''}">已歸帳（${ok.length}）</button></div><div class="recon-list notice-list"><div class="form-actions"><button type="button" class="secondary" data-inv-scan>掃描 QRCode</button><label class="secondary file-btn">從圖片<input type="file" accept="image/*" id="invFile" hidden multiple></label><button type="button" class="secondary" data-inv-manual>手動輸入</button></div>${list.map(row).join('') || '<div class="recon-empty">這一期沒有發票</div>'}<details class="stmt-adjust"${win ? '' : ' open'}><summary>對獎（開獎日 ${fmtDate(invDrawDate(s.period))}）${hit.length ? `　🎉 ${hit.length} 張共 ${money(hit.reduce((a, z) => a + z.v, 0))}` : win ? '　沒有中獎' : ''}</summary><p class="hint">瀏覽器不能直接向財政部取號碼，請照官網輸入。雲端發票專屬獎不在此比對。實際中獎以財政部公告為準。</p><div class="form-grid"><label>特別獎<input id="ivS" inputmode="numeric" maxlength="8" value="${esc(win?.special || '')}"></label><label>特獎<input id="ivG" inputmode="numeric" maxlength="8" value="${esc(win?.grand || '')}"></label><label>頭獎（空白分隔）<input id="ivF" inputmode="numeric" value="${esc((win?.first || []).join(' '))}"></label></div><button type="button" class="secondary" data-inv-win>儲存並對獎</button></details></div></div>`;
}
// ---- scanning ----
function invLoadQR() { return window.jsQR ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = './js/vendor/jsQR.js'; s.onload = () => ok(); s.onerror = () => no(new Error('無法載入掃描程式')); document.head.append(s); }); }
async function invDecode(canvas) {
  if (typeof BarcodeDetector !== 'undefined') try { const l = await new BarcodeDetector({ formats: ['qr_code'] }).detect(canvas); if (l.length) return l.map(x => x.rawValue); } catch { }
  await invLoadQR(); const g = canvas.getContext('2d', { willReadFrequently: true }), out = [], try1 = (x, w) => { if (w < 60) return; const im = g.getImageData(x, 0, w, canvas.height), r = window.jsQR(im.data, w, canvas.height); if (r) { let v = r.data; if (!v && r.binaryData?.length) v = new TextDecoder('big5').decode(new Uint8Array(r.binaryData)); if (v && !out.includes(v)) out.push(v); } };
  try1(0, canvas.width); if (canvas.width > canvas.height * 0.8) { try1(0, Math.floor(canvas.width / 2)); try1(Math.floor(canvas.width / 2), canvas.width - Math.floor(canvas.width / 2)); } return out;
}
function invHandle(codes) { const p = codes.map(invParse).filter(Boolean).sort((a, b) => (a.right ? 1 : 0) - (b.right ? 1 : 0)); let msg = '', n = 0; for (const x of p) { const r = invAdd(x); if (r.error) msg = r.error; else { if (!r.dup) n++; msg = `${r.no} ${money(r.total)}${r.dup ? '（已在清單）' : ''}`; if (!x.right) { invSt().period = invPeriod(r.date); invSt().open = r.no; } } } return { n, msg, any: p.length > 0 }; }
async function invScan() {
  if (!navigator.mediaDevices?.getUserMedia) { alert('這個瀏覽器不能使用相機，請改用「從圖片」。'); return; } let st; try { st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } }); } catch (e) { alert('無法開啟相機：' + (e.message || e)); return; }
  const el = sheetEl('scanBg'); el.hidden = false; el.style.zIndex = 70; el.innerHTML = `<div class="scan"><video playsinline muted></video><p id="scanMsg">把發票左邊的 QRCode 放進畫面，可連續掃描多張</p><button type="button" class="primary" data-scan-stop>完成</button></div>`;
  const v = el.querySelector('video'); v.srcObject = st; await v.play(); const c = document.createElement('canvas'); window.__scan = { st, on: true, last: '' };
  const loop = async () => { const S = window.__scan; if (!S?.on) return; if (v.videoWidth) { const k = Math.min(1, 900 / v.videoWidth); c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k); c.getContext('2d', { willReadFrequently: true }).drawImage(v, 0, 0, c.width, c.height); try { const l = await invDecode(c), key = l.join('|'); if (l.length && key !== S.last) { S.last = key; const r = invHandle(l), m = document.getElementById('scanMsg'); if (m && r.msg) m.textContent = r.msg; if (r.n) navigator.vibrate?.(30); } } catch (x) { const m = document.getElementById('scanMsg'); if (m) m.textContent = x.message || String(x); } } setTimeout(loop, 250); }; loop();
}
function invScanStop() { const S = window.__scan; if (S) { S.on = false; S.st.getTracks().forEach(t => t.stop()); window.__scan = null; } const el = document.getElementById('scanBg'); if (el) el.hidden = true; renderInvoices(); }
function openInvoices() { sheetEl('invBg').hidden = false; renderInvoices(); }
function invDetailHTML(t) { const l = invOfTx(t).filter(i => i.items || i.no !== t.invoiceNo); return l.length ? txExtraBox(`發票明細（${l.length} 張）`, l.map(i => `${esc(i.no)} ${money(i.total)}${(i.items || []).length ? `<small class="hint"><br>${i.items.map(x => `${esc(x[0])} × ${x[1]} ${money(invItemAmount(x))}`).join('<br>')}</small>` : ''}`).join('<br>'), true) : ''; }
document.addEventListener('click', async e => {
  const c = s => e.target.closest?.(s); let b; const s = invSt(), db = invDb(), find = n => db.list.find(x => x.no === n), re = renderInvoices;
  if (c('#openInvoices') || c('[data-qa=invoice]')) { openInvoices(); return; } if (c('[data-scan-stop]')) { invScanStop(); return; }
  if (c('#efScan')) { openInvoices(); invScan(); return; } if (!c('#invBg')) return;
  if (c('[data-inv-scan]')) { invScan(); return; } if ((b = c('[data-inv-off]'))) { const [y, m] = s.period.split('-').map(Number), d = new Date(y, m - 1 + Number(b.dataset.invOff), 1); s.period = invPeriod(isoDate(d)); re(); return; }
  if ((b = c('[data-inv-tab]'))) { s.tab = b.dataset.invTab; re(); return; } if ((b = c('[data-inv-row]'))) { s.open = s.open === b.dataset.invRow ? null : b.dataset.invRow; re(); return; }
  if ((b = c('[data-inv-del]'))) { if (confirm('刪除這張發票？')) { inboxGone({ no: b.dataset.invDel }); db.list = db.list.filter(x => x.no !== b.dataset.invDel); invStore(); re(); } return; }
  if ((b = c('[data-inv-golink]'))) { s.link = b.dataset.invGolink; s.q = ''; re(); return; } if (c('[data-inv-back]')) { s.link = null; re(); return; }
  if ((b = c('[data-inv-link]'))) { const inv = find(s.link), t = txById(b.dataset.invLink); s.link = null; if (inv && t) { const note = !inv.items.length ? '' : !t.note ? 'replace' : prefs().invNote || await uiAsk({ icon: '!', title: '提醒', text: '原本記錄已有備註，要覆蓋原本備註還是直接附加在備註後面？', options: [['replace', '覆蓋'], ['append', '附加'], ['keep', '忽略']], cancel: false }); invLink(inv, t, note); await save(); render(); } re(); return; }
  if ((b = c('[data-inv-unlink]'))) { const x = invAll().find(y => y.inv.no === b.dataset.invUnlink && y.t); if (x && confirm('取消這張發票與記錄的連結？')) { invUnlink(x.t, b.dataset.invUnlink); await save(); render(); } re(); return; }
  if ((b = c('[data-inv-new]'))) { invRecord(find(b.dataset.invNew), false); return; } if ((b = c('[data-inv-multi]'))) { invRecord(find(b.dataset.invMulti), true); return; }
  if (c('[data-tx-open]')) { document.getElementById('invBg').hidden = true; return; }
  if (c('[data-inv-manual]')) { const no = prompt('發票號碼（2 個英文字母＋8 個數字）'); if (no === null) return; const p = invoiceParse(no, ''); if (p.error || !p.invoiceNo) { alert(p.error || '請輸入發票號碼'); return; } const amt = Number(prompt('金額') || 0); if (!(amt > 0)) return; const d = prompt('日期', isoDate(new Date())); if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return; const r = invAdd({ no: p.invoiceNo, code: '', date: d, total: amt, items: [] }); if (r.error) alert(r.error); else { s.period = invPeriod(d); s.open = r.no; s.tab = 'un'; } re(); return; }
  if (c('[data-inv-win]')) { const v = i => document.getElementById(i).value.replace(/\s+/g, ' ').trim(), w = { special: v('ivS'), grand: v('ivG'), first: v('ivF').split(/[ ,、]+/).filter(Boolean) }; if ([w.special, w.grand, ...w.first].some(x => x && !/^\d{8}$/.test(x)) || !w.first.length) { alert('號碼都是 8 位數字，至少要有頭獎號碼'); return; } db.win[s.period] = w; invStore(); re(); }
});
document.addEventListener('change', async e => {
  if (e.target?.id !== 'invFile') return; const files = [...e.target.files]; let n = 0, msg = '', any = false;
  for (const f of files) { try { const bm = await createImageBitmap(f), k = Math.min(1, 1600 / Math.max(bm.width, bm.height)), c = document.createElement('canvas'); c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k); c.getContext('2d', { willReadFrequently: true }).drawImage(bm, 0, 0, c.width, c.height); const r = invHandle(await invDecode(c)); n += r.n; msg = r.msg || msg; any = any || r.any; } catch (x) { msg = x.message || String(x); } }
  renderInvoices(); toast(any ? `${n} 張新發票　${msg}` : msg || '圖片裡找不到發票 QRCode');
});
document.addEventListener('input', e => { if (e.target?.id === 'invQ') { invSt().q = e.target.value; renderInvoices(); const i = document.getElementById('invQ'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); } });
