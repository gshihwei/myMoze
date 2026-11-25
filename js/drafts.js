// 帳小簿 V26.95 — 通知草稿（貼上／分享通知文字）與一句話、語音記帳.
// Bundled after js/sys-plus.js. Function declarations / var only.
// Everything here is parsed on this device by rules (no AI, nothing is uploaded) and stays on this device until you save a record.

function draftDb() { if (!window.__drafts) { let d = {}; try { d = JSON.parse(localStorage.getItem('moze-drafts-v1') || '{}') || {}; } catch { } window.__drafts = { list: Array.isArray(d.list) ? d.list : [], recent: Array.isArray(d.recent) ? d.recent : [], rules: d.rules || {}, accts: d.accts || {}, seq: Number(d.seq) || 0 }; } return window.__drafts; }
function draftStore() { const d = draftDb(); d.list = d.list.slice(0, 200); d.recent = d.recent.slice(0, 100); try { localStorage.setItem('moze-drafts-v1', JSON.stringify(d)); } catch { } }
// ---- parsing one notification ----
function draftParse(text, now) {
  const s = String(text || '').replace(/\s+/g, ' ').trim(), n = now || new Date(), out = { text: s };
  if (!s) return { ...out, status: '無內容' };
  if (/驗證碼|OTP|密碼(?!.*消費)|動態密碼/i.test(s)) return { text: '（驗證碼通知，內容未保留）', status: '非交易' };
  const curOf = c => ({ 'NT$': 'TWD', 'NT': 'TWD', 'TWD': 'TWD', '元': 'TWD', 'US$': 'USD', 'USD': 'USD', 'HK$': 'HKD', 'HKD': 'HKD', 'JPY': 'JPY', '¥': 'JPY', '日圓': 'JPY', 'EUR': 'EUR', '€': 'EUR', 'CNY': 'CNY', 'RMB': 'CNY', 'KRW': 'KRW' }[String(c || '').toUpperCase()] || '');
  const re = /(NT\$|NT|TWD|US\$|USD|HK\$|HKD|JPY|EUR|€|CNY|RMB|KRW|¥|\$)\s*([\d,]+(?:\.\d+)?)(?!\s*%)|([\d,]+(?:\.\d+)?)\s*(元|日圓|USD|TWD|JPY|HKD|EUR)/gi; let m, best = null;
  while ((m = re.exec(s))) { const v = Number((m[2] || m[3]).replace(/,/g, '')), before = s.slice(Math.max(0, m.index - 8), m.index); if (!(v > 0) || /餘額|剩餘|額度|優惠|折抵|折扣|上限|滿|最低|應繳/.test(before)) continue; best = { v, cur: curOf(m[1] || m[4]) }; break; }
  if (/繳款(提醒|截止|期限)|帳單已(出|產生)|應繳(總額|金額)|活動|抽獎|登錄|專屬優惠/.test(s) && !/消費|付款|刷卡|扣款|轉帳|入帳|儲值/.test(s)) return { ...out, status: '非交易', amount: best?.v };
  if (!best) return { ...out, status: '無金額' };
  out.amount = best.v; out.cur = best.cur; out.status = '未記帳';
  let d = /(20\d{2})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})/.exec(s), y = n.getFullYear(), p2 = v => String(v).padStart(2, '0');
  if (d) out.date = `${d[1]}-${p2(d[2])}-${p2(d[3])}`; else if ((d = /(?:^|[^\d\/])(\d{1,2})\/(\d{1,2})(?![\d\/])/.exec(s)) && Number(d[1]) <= 12 && Number(d[2]) <= 31) { if (Number(d[1]) > n.getMonth() + 1) y--; out.date = `${y}-${p2(d[1])}-${p2(d[2])}`; } else out.date = isoDate(n);
  const t = /(\d{1,2}):(\d{2})/.exec(s); out.time = t ? `${p2(t[1])}:${t[2]}` : `${p2(n.getHours())}:${p2(n.getMinutes())}`;
  out.dir = /轉入|存入|入帳成功|匯入|收款|已入帳|退款/.test(s) ? 'in' : /轉出|提出|提款|匯出|轉帳(支出|成功)/.test(s) ? 'out' : ''; out.kind = out.dir === 'in' ? 'income' : 'expense';
  const a4 = /末四碼\D{0,4}(\d{4})|[(（](\d{4})[)）]|\*{1,}(\d{4})/.exec(s); if (a4) out.acctText = a4[1] || a4[2] || a4[3];
  const k = /商店名稱[:：]\s*([^\s。，,]+(?: [^\s。，,]+)?)/.exec(s) || /(?:於|在)\s*(?!\d)([^\d，。,]{2,20}?)\s*(?:消費|付款|刷卡)/.exec(s) || /(?:TWD|NT\$?|\$|元)\s*[\d,.]*\s*(?:於|在)\s*([^，。,]{2,20})/.exec(s) || /(?:轉入|轉出|轉帳|付款)(?:至|給|來自)\s*([^\s，。,]{2,20})/.exec(s); if (k) out.key = k[1].trim().replace(/[。.]$/, '');
  return out;
}
function draftAccount(d) {
  const db = draftDb(), acc = (state?.accounts || []).filter(a => !a.archived); if (d.acctText && db.accts[d.acctText] !== undefined) return db.accts[d.acctText];
  if (d.acctText) { const a = acc.find(x => String(x.note || '').includes(d.acctText) || String(x.name).includes(d.acctText)); if (a) return a.id; }
  const hit = acc.filter(a => a.name.length >= 2 && d.text.toLowerCase().includes(a.name.toLowerCase())).sort((x, y) => y.name.length - x.name.length)[0]; return hit ? hit.id : undefined;
}
function draftRuleKey(d) { return d.key ? 'k:' + d.key : 'f:' + d.text.replace(/[\d,.:\/]+/g, '#').slice(0, 60); }
// What the form starts with: the remembered rule for this keyword (or this kind of notification), then the account written in it.
function draftFill(d) {
  const r = draftDb().rules[draftRuleKey(d)] || {}, acc = draftAccount(d), t = { kind: d.dir ? d.kind : r.kind || d.kind, amount: d.amount, date: d.date, time: d.time, name: '', merchant: '', note: '', tags: [], person: '' };
  if (r.category !== undefined) t.category = r.category; if (r.project) t.project = r.project; if (d.key) { t.merchant = r.merchant ?? d.key; if (r.name) t.name = r.name; if (r.tags) t.tags = r.tags; }
  if (acc !== undefined) t.account = acc; else if (r.account !== undefined) t.account = r.account; const ac = t.account !== undefined ? acctCur(acct(t.account)) : 'TWD';
  if (d.cur && d.cur !== ac) t.orig = { cur: d.cur, amount: d.amount, rate: fxPair(d.cur, ac) || 1, auto: true };
  return t;
}
function draftLearn(d, t) {
  const db = draftDb(), r = { kind: t.kind, category: t.category, account: t.account, project: t.project || '' }; if (d.key) Object.assign(r, { merchant: t.merchant || '' }, db.rules[draftRuleKey(d)]?.name ? { name: db.rules[draftRuleKey(d)].name } : {}, db.rules[draftRuleKey(d)]?.tags ? { tags: db.rules[draftRuleKey(d)].tags } : {});
  db.rules[draftRuleKey(d)] = r; if (d.acctText && t.account !== undefined) db.accts[d.acctText] = t.account;
}
function draftAdd(text, now) {
  const db = draftDb(), d = draftParse(text, now); d.id = 'd' + (++db.seq); d.at = (now || new Date()).getTime();
  const same = db.recent.find(x => x.text === d.text && Math.abs(x.at - d.at) < 6e5 && d.status === '未記帳'); if (same) d.status = '重複';
  db.recent.unshift(d); if (d.status === '未記帳') db.list.unshift(d); draftStore(); return d.status === '未記帳' ? d : { ...d, error: d.status === '無金額' ? '文字裡找不到金額，沒有建立草稿。' : d.status === '重複' ? '同一則通知剛剛已經建立過。' : '這則看起來不是交易通知，沒有建立草稿。' };
}
function draftDone(id, status) { const db = draftDb(); db.list = db.list.filter(x => x.id !== id); const r = db.recent.find(x => x.id === id); if (r) r.status = status; draftStore(); }
// Candidates to link: two months before … one month after the notification; same amount first.
function draftLinkList(d, q) { const b = new Date(d.date + 'T00:00:00'), lo = isoDate(new Date(b.getFullYear(), b.getMonth() - 2, b.getDate())), hi = isoDate(new Date(b.getFullYear(), b.getMonth() + 1, b.getDate())), s = String(q || '').toLowerCase(); return (state.transactions || []).filter(t => t.date >= lo && t.date <= hi && (!s || `${t.name} ${t.merchant || ''} ${t.amount}`.toLowerCase().includes(s))).sort((x, y) => (Number(y.amount) === d.amount) - (Number(x.amount) === d.amount) || y.date.localeCompare(x.date)).slice(0, 60); }
// Two drafts (转出 + 轉入, within 30 minutes) → one transfer. Same currency: the difference becomes a fee / discount of the paying side.
function draftTransfer(a, b) {
  if (Math.abs(a.at - b.at) > 18e5) return { error: '兩則通知要在 30 分鐘內收到' }; const out = a.dir === 'in' ? b : a, inn = out === a ? b : a, t = { kind: 'transfer', amount: out.amount, date: out.date, time: out.time, name: '轉帳', tags: [] }, f = draftAccount(out), g = draftAccount(inn); if (f !== undefined) t.account = f; if (g !== undefined) t.toAccount = g;
  if ((out.cur || 'TWD') === (inn.cur || 'TWD')) { const diff = Math.round((out.amount - inn.amount) * 100) / 100; t.amount = inn.amount; if (diff > 0) t.fee = diff; else if (diff < 0) t.discount = -diff; } else t.toAmount = inn.amount;
  return { tx: t };
}
// After a record was saved from a draft.
function draftAfterSave() {
  const ids = window.__draftIds; if (!ids) return; window.__draftIds = null; const t = window.__savedTx; if (!t || !(state.transactions || []).some(x => x.id === t.id)) return; const db = draftDb(), l = ids.map(i => db.list.find(x => x.id === i)).filter(Boolean);
  for (const d of l) { if (l.length === 1 && t.kind !== 'transfer') draftLearn(d, t); draftDone(d.id, '已記帳'); }
  const d = l.length === 1 ? l[0] : null, dup = d && db.list.find(x => x.amount === d.amount && Math.abs(x.at - d.at) < 6e5 && x.id !== d.id); if (dup && confirm(`另一則草稿金額相同，是同一筆交易嗎？\n\n${dup.text}\n\n確定＝標為重複；取消＝保留`)) draftDone(dup.id, '已標為重複');
  noticeBadge();
}
function draftSt() { return window.__draftUi || (window.__draftUi = { open: null, link: null, q: '', pick: null, view: 'list' }); }
function draftAgo(at) { const m = Math.round((Date.now() - at) / 6e4); return m < 1 ? '剛剛' : m < 60 ? `${m} 分鐘前` : m < 1440 ? `${Math.round(m / 60)} 小時前` : `${Math.round(m / 1440)} 天前`; }
function draftsHTML() {
  const db = draftDb(), s = draftSt(); if (s.link) { const d = db.list.find(x => x.id === s.link); if (d) return `<h3 class="notice-h">連結記錄</h3><p class="hint">${esc(d.text)}</p><input id="draftQ" type="search" placeholder="搜尋" value="${esc(s.q)}">${draftLinkList(d, s.q).map(t => `<button type="button" class="notice-row" data-draft-link="${esc(t.id)}"><div class="notice-ico">${catIconHTML(cat(t.category))}</div><div class="day-main"><b>${esc(t.name)}</b><small>${fmtDate(t.date)} ${esc(t.merchant || '')}</small></div><div class="day-side"><b class="${Number(t.amount) === d.amount ? 'income-text' : ''}">${money(t.amount)}</b></div></button>`).join('')}<div class="form-actions"><button type="button" class="secondary" data-draft-unlink>返回</button></div>`; }
  if (s.view === 'recent') return `<h3 class="notice-h">近期通知 <button type="button" class="ghost" data-draft-view="list">返回草稿</button></h3>${db.recent.map(d => `<button type="button" class="notice-row" ${d.status === '未記帳' || d.status === '已標為重複' ? `data-draft-again="${esc(d.id)}"` : ''}><div class="notice-ico">💬</div><div class="day-main"><b>${esc(d.status)}</b><small>${esc(d.text.slice(0, 90))}</small></div><div class="day-side"><b>${d.amount ? money(d.amount) : ''}</b><small>${draftAgo(d.at)}</small></div></button>`).join('') || '<div class="recon-empty">沒有通知</div>'}`;
  if (s.view === 'rules') return `<h3 class="notice-h">帶入規則 <button type="button" class="ghost" data-draft-view="list">返回草稿</button></h3>${Object.entries(db.rules).map(([k, r]) => `<div class="notice-row"><div class="day-main"><b>${esc(k.startsWith('k:') ? k.slice(2) : '（沒有關鍵字）' + k.slice(2, 30))}</b><small>${esc([cat(r.category).name, acct(r.account).name, (state.projects || []).find(p => String(p.id) === String(r.project))?.name, r.merchant, r.name].filter(Boolean).join(' · '))}</small></div><div class="day-side">${k.startsWith('k:') ? `<button type="button" class="ghost" data-draft-rname="${esc(k)}">名稱／標籤</button>` : ''}<button type="button" class="ghost" data-draft-rdel="${esc(k)}" aria-label="移除">×</button></div></div>`).join('') || '<div class="recon-empty">還沒有規則</div>'}<h3 class="notice-h">帳戶</h3>${Object.entries(db.accts).map(([k, a]) => `<div class="notice-row"><div class="day-main"><b>${esc(k)}</b><small>${acctName(acct(a))}</small></div><button type="button" class="ghost" data-draft-adel="${esc(k)}" aria-label="移除">×</button></div>`).join('')}`;
  const pick = s.pick;
  return `<div class="draft-add"><textarea id="draftText" rows="2" placeholder="貼上銀行或支付 App 的通知文字"></textarea><div class="form-actions"><button type="button" class="ghost" data-draft-view="recent">近期通知</button><button type="button" class="ghost" data-draft-view="rules">帶入規則</button><button type="button" class="secondary" data-draft-paste>從剪貼簿</button><button type="button" class="primary" data-draft-new>建立草稿</button></div></div>${db.list.length ? `<div class="notice-total">${db.list.length} 筆 ${pick ? `<button type="button" class="ghost" data-draft-merge>轉帳</button><button type="button" class="ghost" data-draft-delmany>刪除（${pick.size}）</button><button type="button" class="ghost" data-draft-pick0>取消</button>` : '<button type="button" class="ghost" data-draft-pick1>選取</button>'}</div>` : '<div class="recon-empty">沒有草稿。可貼上通知，或從其他 App「分享」文字到帳小簿；iPhone 可用「捷徑」開啟 index.html?notify=通知文字。</div>'}${db.list.map(d => `<div class="draft-row${s.open === d.id ? ' open' : ''}"><button type="button" class="notice-row" data-draft-row="${esc(d.id)}"><div class="notice-ico">${pick ? (pick.has(d.id) ? '☑' : '☐') : '💬'}</div><div class="day-main"><b>${esc(d.key || '通知')}</b><small>${esc(d.text.slice(0, 100))}</small></div><div class="day-side"><b class="${d.kind === 'income' ? 'income-text' : 'expense-text'}">${acctMoney(d.amount, { currency: d.cur || 'TWD' })}</b><small>${draftAgo(d.at)}</small></div></button>${s.open === d.id ? `<div class="draft-mark"><p class="hint">${esc(d.text)}</p><div class="form-grid"><label>關鍵字（商家或對象，會變的那段文字）<input data-draft-key value="${esc(d.key || '')}"></label><label>帳戶文字（卡名或末四碼）<input data-draft-acct value="${esc(d.acctText || '')}"></label></div><div class="form-actions"><button type="button" class="secondary danger-btn" data-draft-del="${esc(d.id)}">刪除</button><button type="button" class="secondary" data-draft-golink="${esc(d.id)}">連結記錄</button><button type="button" class="primary" data-draft-rec="${esc(d.id)}">新增記錄</button></div></div>` : ''}</div>`).join('')}`;
}
function openDrafts() { noticeSt().tab = 'draft'; sheetEl('noticeBg').hidden = false; renderNotice(); }
function draftRecord(d) { const t = draftFill(d); document.getElementById('noticeBg').hidden = true; window.openTx(t.kind, t); window.__savedTx = null; window.__draftIds = [d.id]; }
// ---- 一句話 / 語音記帳 ----
function zhNumber(s) { // 一千二百 / 兩萬三 / 三百五
  const D = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }, U = { 十: 10, 百: 100, 千: 1000 }; let total = 0, sec = 0, num = 0, last = 0;
  for (const c of String(s)) { if (c in D) num = D[c]; else if (c in U) { sec += (num || (c === '十' ? 1 : 0)) * U[c]; last = U[c]; num = 0; } else if (c === '萬') { total += (sec + num) * 10000; sec = 0; num = 0; last = 10000; } else return NaN; }
  if (num && last >= 100) num *= last / 10; return total + sec + num;
}
function sayAmount(s) {
  const m = [...s.matchAll(/([\d,]+(?:\.\d+)?)\s*(萬|千|k|K)?\s*(?:元|塊錢?|圓|NT|USD|美金|日圓|日幣)?/g)].filter(x => /\d/.test(x[1]) && !/[年月日號點:：\/]/.test(s[x.index + x[0].length] || '') && !/[:：\/]$/.test(s.slice(0, x.index)));
  if (m.length) { const x = m.sort((a, b) => /元|塊|圓/.test(b[0]) - /元|塊|圓/.test(a[0]))[0]; return { v: Number(x[1].replace(/,/g, '')) * ({ 萬: 1e4, 千: 1e3, k: 1e3, K: 1e3 }[x[2]] || 1), text: x[0] }; }
  const z = /([零〇一二兩三四五六七八九十百千萬]{2,})\s*(?:元|塊錢?|圓)?|([一二兩三四五六七八九])\s*(?:元|塊錢?|圓)/.exec(s); if (z) { const v = zhNumber(z[1] || z[2]); if (v > 0) return { v, text: z[0] }; } return null;
}
function sayDate(s, now) {
  const n = now || new Date(), off = k => isoDate(new Date(n.getFullYear(), n.getMonth(), n.getDate() + k)); let m;
  if (/大前天/.test(s)) return { d: off(-3), text: '大前天' }; if (/前天/.test(s)) return { d: off(-2), text: '前天' }; if (/昨[天晚日]/.test(s)) return { d: off(-1), text: /昨[天晚日]/.exec(s)[0] }; if (/明天/.test(s)) return { d: off(1), text: '明天' };
  if ((m = /(\d{1,2})\s*[月\/]\s*(\d{1,2})\s*[日號]?/.exec(s)) && Number(m[1]) <= 12) return { d: isoDate(new Date(n.getFullYear() - (Number(m[1]) > n.getMonth() + 1 ? 1 : 0), Number(m[1]) - 1, Number(m[2]))), text: m[0] };
  if (/今[天晚早日]/.test(s)) return { d: off(0), text: /今[天晚早日]/.exec(s)[0] }; return { d: off(0), text: '' };
}
// One sentence → a prefilled record (kind, amount, date, account(s), category, name, person).
function sayParse(text, now) {
  let s = String(text || '').replace(/[，。！]/g, ' ').trim(); const out = { kind: 'expense', tags: [], merchant: '', note: '', person: '' }; let rest = s; const cut = x => { if (x) rest = rest.replace(x, ' '); };
  const d = sayDate(s, now); out.date = d.d; cut(d.text); const a = sayAmount(rest); if (a) { out.amount = a.v; cut(a.text); }
  const accs = (state?.accounts || []).filter(x => !x.archived && x.name).map(x => ({ x, i: rest.toLowerCase().indexOf(x.name.toLowerCase()) })).filter(y => y.i >= 0).sort((p, q) => q.x.name.length - p.x.name.length), used = []; for (const y of accs) if (!used.some(u => u.x.name.includes(y.x.name))) used.push(y); used.sort((p, q) => p.i - q.i);
  if (/轉帳|轉到|轉給|轉入|提款|領錢|領了|存入|存到/.test(s) && (used.length >= 2 || /提款|領錢|領了/.test(s))) {
    out.kind = 'transfer'; const t = tfDefaults(state, /提款|領錢|領了/.test(s) ? '提款' : /存/.test(s) ? '存款' : '轉帳', {}); out.account = used[0]?.x.id ?? t.from; out.toAccount = used[1]?.x.id ?? (String(t.to) === String(out.account) ? t.from : t.to); out.name = /提款|領/.test(s) ? '提款' : /存/.test(s) ? '存款' : '轉帳'; return out;
  }
  if (used[0]) { out.account = used[0].x.id; cut(used[0].x.name); }
  const lend = /借給|借出|代付|幫\s*(\S{1,6}?)\s*(付|代付|刷)/.exec(s), owe = /(跟|向)\s*(\S{1,6}?)\s*借/.exec(s);
  if (lend || owe) { out.tab = owe ? 'payable' : 'receivable'; const p = owe ? owe[2] : /借給\s*([^\s\d]{1,6}?)(?=\s|\d|$)/.exec(s)?.[1] || lend[1] || ''; out.person = p; out.preset = owe ? '借入' : /代付|幫/.test(s) ? '代付' : '借出'; }
  if (/收到|領到|薪水|薪資|獎金|收入|中獎|利息/.test(s) && !out.tab) out.kind = 'income';
  const shop = /(?:在|去)\s*([^\s\d]{2,12}?)\s*(?:買|吃|喝|花|消費|用|$)/.exec(rest); if (shop) { out.merchant = shop[1]; cut(shop[0].replace(/(買|吃|喝)$/, '')); }
  const cats = (state?.categories || []).filter(c => (c.kind || 'expense') === out.kind && !c.hidden && c.name), hit = cats.filter(c => s.includes(c.name)).sort((x, y) => (y.parentId ? 1 : 0) - (x.parentId ? 1 : 0) || y.name.length - x.name.length)[0];
  const name = rest.replace(/(我|今天|剛剛|買了?|吃了?|喝了?|花了?|付了?|用了?|刷卡|刷|搭了?|繳了?|收到|的|元|塊錢?|現金付)/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (hit) out.category = hit.id; else { const l = (state?.transactions || []).filter(t => t.kind === out.kind && t.name && name && (t.name === name || t.name.includes(name) || name.includes(t.name))), t = l[l.length - 1]; if (t) { out.category = t.category; if (out.account === undefined) out.account = t.account; if (!out.merchant) out.merchant = t.merchant || ''; } }
  if (out.account === undefined && out.category !== undefined) { const k = catMemory(out.category, out.kind); if (k) out.account = k.account; }
  if (name && name !== hit?.name) out.name = name; return out;
}
// 「午餐 120、飲料 50」→ several items when every part has its own amount.
function saySplit(text) { const p = String(text || '').split(/[、；;\n]|然後|還有|以及/).map(x => x.trim()).filter(Boolean); return p.length > 1 && p.every(x => sayAmount(x)) ? p : [String(text || '').trim()]; }
function sayOpen(text) {
  const el = sheetEl('sayBg'), mic = typeof window.SpeechRecognition !== 'undefined' || typeof window.webkitSpeechRecognition !== 'undefined'; el.hidden = false; el.style.zIndex = 60;
  el.innerHTML = `<div class="recon-sheet">${sheetHead('一句話記帳')}<div class="recon-list notice-list say-box"><textarea id="sayText" rows="3" placeholder="例如：昨天在全家買咖啡 55 元 用玉山">${esc(String(text || '').trim())}</textarea><div class="form-actions">${mic ? '<button type="button" class="secondary" data-say-mic>🎤 說話</button>' : ''}<button type="button" class="primary" data-say-go>帶入記帳</button></div><p class="hint">可說支出、收入、轉帳、提款、借給／跟誰借；一次多項用「、」分開會變成多類別。依規則在本機解析，帶入後請確認再存檔。${mic ? '語音辨識由瀏覽器提供，聲音可能會送到瀏覽器廠商處理。' : '這個瀏覽器不支援語音辨識，可用鍵盤的聽寫。'}</p></div></div>`;
}
function sayMic() {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!R) return; const r = new R(); r.lang = 'zh-TW'; r.interimResults = true; const b = document.querySelector('[data-say-mic]'), ta = document.getElementById('sayText'), base = ta.value ? ta.value + ' ' : ''; if (b) b.textContent = '● 聆聽中…';
  r.onresult = e => { ta.value = base + [...e.results].map(x => x[0].transcript).join(''); }; r.onend = () => { if (b) b.textContent = '🎤 說話'; }; r.onerror = e => { if (b) b.textContent = '🎤 說話'; if (e.error !== 'no-speech' && e.error !== 'aborted') alert('無法使用語音辨識：' + e.error); }; r.start();
}
function sayApply(text) {
  const parts = saySplit(text), l = parts.map(x => sayParse(x)); if (!l[0]?.amount) { alert('沒有找到金額'); return false; } document.getElementById('sayBg').hidden = true;
  if (l.length > 1 && l.every(x => x.kind !== 'transfer')) { const d = l[0].date; window.openTx('expense', { ...l[0], time: nowTime() }); setTimeout(() => { window.entryItems.load(l.map(x => ({ tab: x.tab || x.kind, kind: x.tab ? 'expense' : x.kind, preset: x.preset || '', category: x.category ?? l[0].category, expr: String(x.amount), account: x.account ?? efEl('account').value, project: x.project || '', person: x.person || '', name: x.name || '', cur: '', rewards: [] }))); efEl('date').value = d; efSync(); }, 150); return true; }
  const t = l[0]; if (t.tab) { window.openTx('expense'); setTimeout(() => { document.querySelector(`[data-etab-btn="${t.tab}"]`)?.click(); document.querySelector(`[data-preset="${t.preset}"]`)?.click(); window.entrySetAmount(t.amount); efEl('person').value = t.person; if (t.account !== undefined) { efEl('account').value = t.account; efEl('account').dispatchEvent(new Event('change', { bubbles: true })); } efEl('date').value = t.date; efSync(); }, 150); return true; }
  window.openTx(t.kind, { ...t, time: nowTime() }); return true;
}
document.addEventListener('click', async e => {
  const c = s => e.target.closest?.(s); let b; const s = draftSt(), db = draftDb();
  if (c('[data-say-mic]')) { sayMic(); return; } if (c('[data-say-go]')) { sayApply(document.getElementById('sayText').value); return; } if (c('[data-say-open]')) { sayOpen(''); return; }
  if (!c('#noticeBg')) return; const re = () => renderNotice();
  if (c('[data-draft-new]')) { const d = draftAdd(document.getElementById('draftText').value); if (d.error) alert(d.error); else s.open = d.id; re(); return; }
  if (c('[data-draft-paste]')) { try { const t = await navigator.clipboard.readText(), d = draftAdd(t); if (d.error) alert(d.error); else s.open = d.id; re(); } catch { alert('無法讀取剪貼簿，請直接貼在文字框。'); } return; }
  if ((b = c('[data-draft-view]'))) { s.view = b.dataset.draftView; re(); return; }
  if (c('[data-draft-pick1]')) { s.pick = new Set(); re(); return; } if (c('[data-draft-pick0]')) { s.pick = null; re(); return; }
  if (c('[data-draft-delmany]')) { if (s.pick.size && confirm(`刪除 ${s.pick.size} 筆草稿？`)) { for (const i of s.pick) draftDone(i, '已刪除'); s.pick = null; re(); } return; }
  if (c('[data-draft-merge]')) { const l = [...s.pick].map(i => db.list.find(x => x.id === i)); if (l.length !== 2) { alert('請勾選轉出、轉入兩筆草稿'); return; } const r = draftTransfer(l[0], l[1]); if (r.error) { alert(r.error); return; } s.pick = null; document.getElementById('noticeBg').hidden = true; window.openTx('transfer', r.tx); window.__savedTx = null; window.__draftIds = l.map(x => x.id); return; }
  if ((b = c('[data-draft-row]'))) { const i = b.dataset.draftRow; if (s.pick) { if (s.pick.has(i)) s.pick.delete(i); else s.pick.add(i); } else s.open = s.open === i ? null : i; re(); return; }
  if ((b = c('[data-draft-del]'))) { draftDone(b.dataset.draftDel, '已刪除'); re(); return; }
  if ((b = c('[data-draft-golink]'))) { s.link = b.dataset.draftGolink; s.q = ''; re(); return; } if (c('[data-draft-unlink]')) { s.link = null; re(); return; }
  if ((b = c('[data-draft-link]'))) { const d = db.list.find(x => x.id === s.link), t = txById(b.dataset.draftLink); if (d && t) { draftLearn(d, t); draftDone(d.id, '已記帳'); } s.link = null; re(); return; }
  if ((b = c('[data-draft-rec]'))) { const d = db.list.find(x => x.id === b.dataset.draftRec), w = b.closest('.draft-row'); if (!d) return; d.key = w.querySelector('[data-draft-key]').value.trim(); d.acctText = w.querySelector('[data-draft-acct]').value.trim(); draftStore(); draftRecord(d); return; }
  if ((b = c('[data-draft-again]'))) { const d = db.recent.find(x => x.id === b.dataset.draftAgain); if (d) { d.status = '未記帳'; if (!db.list.some(x => x.id === d.id)) db.list.unshift(d); draftStore(); s.view = 'list'; s.open = d.id; re(); } return; }
  if ((b = c('[data-draft-rdel]'))) { delete db.rules[b.dataset.draftRdel]; draftStore(); re(); return; } if ((b = c('[data-draft-adel]'))) { delete db.accts[b.dataset.draftAdel]; draftStore(); re(); return; }
  if ((b = c('[data-draft-rname]'))) { const r = db.rules[b.dataset.draftRname], n = prompt('固定帶入的名稱（可留空）', r.name || ''); if (n === null) return; const g = prompt('固定帶入的標籤（空白分隔，可留空）', (r.tags || []).join(' ')); if (g === null) return; r.name = n.trim(); r.tags = parseTags(g); draftStore(); re(); }
});
document.addEventListener('input', e => { if (e.target?.id === 'draftQ') { draftSt().q = e.target.value; renderNotice(); const i = document.getElementById('draftQ'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); } });
