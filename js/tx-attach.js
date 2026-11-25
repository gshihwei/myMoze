// 帳小簿 V26.70 — 交易圖片附件、發票號碼／隨機碼、手機條碼 (Code 39).
// Bundled after js/entry-plus.js. Function declarations / var only.
// Attachments are small data URLs stored on the transaction (`attachments`), so they sync with it:
// at most 3 pictures, each scaled to 900 px and at most 120,000 characters.

function attachMax() { return 3; }
function attachList(t) { return (Array.isArray(t?.attachments) ? t.attachments : []).filter(acctImageValid).slice(0, attachMax()); }
// Scale to fit `max` px (no crop); tries smaller sizes / quality until it fits the limit.
function attachResize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.onload = () => {
      try {
        for (const [max, ql] of [[900, 0.75], [720, 0.65], [560, 0.55], [420, 0.5], [300, 0.45]]) {
          const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          const out = c.toDataURL('image/jpeg', ql); if (acctImageValid(out)) { URL.revokeObjectURL(url); resolve(out); return; }
        }
        URL.revokeObjectURL(url); reject(new Error('too large'));
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.src = url;
  });
}
function attachDraftList() { return window.__attachDraft || (window.__attachDraft = []); }
function attachRender() {
  const box = document.getElementById('attachBox'); if (!box) return;
  box.innerHTML = attachDraftList().map((s, i) => `<span class="attach-thumb"><img src="${s}" alt="附件 ${i + 1}"><button type="button" data-attach-del="${i}" aria-label="移除附件">×</button></span>`).join('') + (attachDraftList().length < attachMax() ? '<label class="attach-add" aria-label="加入圖片">📷<input type="file" accept="image/*" id="attachFile" hidden></label>' : '');
}
function attachOpen(t) {
  window.__attachDraft = t && t.id ? attachList(t) : []; attachRender();
  const el = txForm?.elements; if (el?.invoiceNo) { el.invoiceNo.value = t?.id ? t.invoiceNo || '' : ''; el.invoiceCode.value = t?.id ? t.invoiceCode || '' : ''; }
}
// → { invoiceNo, invoiceCode } (empty allowed) or { error }
function invoiceParse(no, code) {
  const n = String(no || '').toUpperCase().replace(/[\s-]/g, ''), c = String(code || '').replace(/\s/g, '');
  if (n && !/^[A-Z]{2}\d{8}$/.test(n)) return { error: '發票號碼格式是 2 個英文字母＋8 個數字' };
  if (c && !/^\d{4}$/.test(c)) return { error: '隨機碼是 4 個數字' };
  return { invoiceNo: n, invoiceCode: c };
}
function attachApply(t, f) {
  const inv = invoiceParse(f.get('invoiceNo'), f.get('invoiceCode')); if (inv.error) return inv;
  for (const k of ['invoiceNo', 'invoiceCode']) if (inv[k]) t[k] = inv[k]; else delete t[k];
  if (attachDraftList().length) t.attachments = attachDraftList().slice(0, attachMax()); else delete t.attachments;
  return {};
}
function attachDetailHTML(t) {
  const l = attachList(t); let h = '';
  if (t.invoiceNo) h += txExtraBox('發票', `${esc(t.invoiceNo)}${t.invoiceCode ? `　隨機碼 ${esc(t.invoiceCode)}` : ''}`);
  if (l.length) h += `<div class="detail-box detail-wide"><small>附件</small><div class="attach-view">${l.map(s => `<img src="${s}" alt="附件" data-attach-view>`).join('')}</div></div>`;
  return h;
}
// ---- Code 39 (手機條碼載具) ----
function code39Table() {
  return { '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
    A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
    K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
    U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '+': 'nwnnnwnwn', '/': 'nwnwnnnwn', '$': 'nwnwnwnnn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn' };
}
function carrierValid(s) { return /^\/[0-9A-Z.+-]{7}$/.test(String(s || '')); }
// bars as [x, width] in narrow units, plus the total width; wide = 3 narrow
function code39Bars(text) {
  const T = code39Table(), bars = []; let x = 10;
  for (const ch of `*${text}*`) { const p = T[ch]; if (!p) return null; [...p].forEach((e, i) => { const w = e === 'w' ? 3 : 1; if (i % 2 === 0) bars.push([x, w]); x += w; }); x += 1; }
  return { bars, width: x - 1 + 10 };
}
function code39SVG(text) {
  const b = code39Bars(text); if (!b) return '';
  return `<svg class="code39" viewBox="0 0 ${b.width} 60" preserveAspectRatio="none" role="img" aria-label="手機條碼"><rect width="${b.width}" height="60" fill="#fff"/>${b.bars.map(([x, w]) => `<rect x="${x}" y="5" width="${w}" height="50" fill="#000"/>`).join('')}</svg>`;
}
function renderCarrier() {
  const box = document.getElementById('carrierBox'); if (!box) return; const c = String(prefs().carrier || '');
  box.innerHTML = `<label class="setting"><span>手機條碼</span><input id="carrierInput" maxlength="8" value="${esc(c)}" placeholder="/ABC1234" autocapitalize="characters"></label>${carrierValid(c) ? `<div class="carrier-code">${code39SVG(c)}<b>${esc(c)}</b><button type="button" class="ghost" id="carrierCopy">複製</button></div>` : c ? '<p class="hint">手機條碼是「/」加 7 個字元（數字、大寫英文、. + -）。</p>' : ''}`;
}
document.addEventListener('change', async e => {
  const t = e.target;
  if (t?.id === 'carrierInput') { setPref('carrier', t.value.trim().toUpperCase()); renderCarrier(); }
  if (t?.id === 'attachFile' && t.files?.[0]) { try { attachDraftList().push(await attachResize(t.files[0])); attachRender(); } catch { alert('讀不到這張圖片，或圖片太大。'); } }
});
document.addEventListener('click', e => {
  const d = e.target.closest?.('[data-attach-del]'); if (d) { attachDraftList().splice(Number(d.dataset.attachDel), 1); attachRender(); return; }
  const v = e.target.closest?.('[data-attach-view]'); if (v) { const o = document.createElement('div'); o.className = 'attach-full'; const i = document.createElement('img'); i.src = v.src; o.append(i); o.onclick = () => o.remove(); document.body.append(o); return; }
  if (e.target.closest?.('#carrierCopy')) navigator.clipboard?.writeText(String(prefs().carrier || '')).then(() => alert('已複製手機條碼')).catch(() => {});
});
