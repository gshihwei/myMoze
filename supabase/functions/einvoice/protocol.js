// 帳小簿 — 電子發票 App 通訊協定（登入封包、JWT 簽章、發票清單與明細）.
// Ported from ALL SET (https://github.com/TedLin1993/all-set-tw, apps/worker/src/sources/einvoice/*), MIT License:
//   Copyright (c) 2026 Kuan-Yin Chen, Copyright (c) 2026 Zih-Jian Lin.
//   Full license text: LICENSE-ALLSET in this folder.
// This is not an official MOF API: it follows the e-invoice app's protocol and may stop working when the app changes.
// Plain ES module (no Deno / Node specifics) so the Edge Function and the Node tests share it. Never logs credentials.

export const HOSTS = { middle: 'https://uia.einvoice.nat.gov.tw', big: 'https://upi.einvoice.nat.gov.tw' };
export const APP = { version: '6.800.2', build: 66, ua: 'okhttp/5.3.0' };
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const enc = s => new TextEncoder().encode(s);
const b64 = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const b64url = bytes => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const str = v => (typeof v === 'string' ? v : v == null ? '' : String(v));
const rec = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : undefined);

export function swapPairs(v) { let o = ''; for (let i = 0; i < v.length; i += 2) o += (v[i + 1] ?? '') + (v[i] ?? ''); return o; }
export function randomAlnum(n) { const r = new Uint32Array(n); crypto.getRandomValues(r); return Array.from(r, x => ALNUM[x % ALNUM.length]).join(''); }
async function keyIv(a, b) {
  const seed = `${swapPairs(b)}${swapPairs(a)}${[...a].reverse().join('')}${[...b].reverse().join('')}`;
  const key = new Uint8Array(await crypto.subtle.digest('SHA-256', enc(seed)));
  return { key, iv: enc(`${a.slice(-6)}${b.slice(-6)}`) };
}
async function aes(mode, data, key, iv) {
  const k = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, [mode]);
  return new Uint8Array(await crypto.subtle[mode]({ name: 'AES-GCM', iv, tagLength: 128 }, k, data));
}
// ldata = A|base64(AES-GCM(json))|B → { value, ctx } (ctx decrypts a reply that comes without A and B)
export async function encryptLData(obj, a = randomAlnum(16), b = randomAlnum(16)) {
  const ctx = await keyIv(a, b); return { value: `${a}|${b64(await aes('encrypt', enc(JSON.stringify(obj)), ctx.key, ctx.iv))}|${b}`, ctx };
}
async function decryptWith(encoded, ctx) { const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)); return JSON.parse(new TextDecoder().decode(await aes('decrypt', bytes, ctx.key, ctx.iv))); }
export async function decryptLData(value) {
  const p = String(value).split('|'); if (p.length !== 3 || p[0].length !== 16 || p[2].length !== 16) throw new Error('ldata 格式無效');
  return decryptWith(p[1], await keyIv(p[0], p[2]));
}
// HS256 JWT, secret = loginSsMe, 40 seconds; `now` already corrected by the server time offset.
export async function signInvoiceJwt(reqdata, s, now = Math.floor(Date.now() / 1000) + (s.serverTimeOffset || 0) - 10) {
  const claims = { comms: { iat: now, exp: now + 40, liat: s.loginLiat, appid: s.loginAppId, barcode: s.carrierCode || '', keyType: '2' }, reqdata };
  const input = `${b64url(enc(JSON.stringify({ alg: 'HS256', typ: 'JWT', ver: '1.0' })))}.${b64url(enc(JSON.stringify(claims)))}`;
  const k = await crypto.subtle.importKey('raw', enc(s.loginSsMe), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc(input))))}`;
}
export function sessionFrom(data, fb = {}) {
  const v = rec(data) || {}, now = Number(v.now);
  const s = { sid: str(v.sid ?? fb.sid), token: str(v.token ?? fb.token), iv: str(v.iv ?? fb.iv) || undefined, clientCode: str(v.clientCode ?? fb.clientCode) || undefined,
    loginAppId: str(v.appid ?? v.loginAppId ?? fb.loginAppId), loginLiat: Number(v.liat ?? v.loginLiat ?? fb.loginLiat ?? 0), loginSsMe: str(v.ssme ?? v.loginSsMe ?? fb.loginSsMe),
    ltoken: str(v.ltoken ?? fb.ltoken) || undefined, hkey: str(v.hkey ?? v.skey ?? fb.hkey) || undefined, carrierCode: str(v.carrier_code ?? v.carrierCode ?? fb.carrierCode) || undefined,
    serverTimeOffset: Number.isFinite(now) ? Math.trunc(now - Date.now() / 1000) : fb.serverTimeOffset };
  if (!s.sid || !s.token || !s.loginAppId || !s.loginSsMe || !Number.isFinite(s.loginLiat)) throw new Error('登入回應缺少必要的 session 欄位');
  return s;
}
// ---- dates: an invoice period is two months; current + previous, the current one capped at today ----
const ymd = d => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
export function periods(now = new Date(), count = 2) {
  const cur = now.getFullYear() * 6 + Math.floor(now.getMonth() / 2), out = [];
  for (let i = 0; i < count; i++) { const ix = cur - i, y = Math.floor(ix / 6), m = (ix % 6) * 2, s = new Date(y, m, 1), e = new Date(y, m + 2, 0); out.push({ startDate: ymd(s), endDate: ymd(e > now ? now : e), key: `${y}-${String(m + 1).padStart(2, '0')}` }); }
  return out;
}
// ---- response parsing ----
export function findArray(v, keys, depth = 0) {
  if (depth > 5 || v == null) return []; if (Array.isArray(v)) return v; if (typeof v !== 'object') return [];
  for (const k of keys) if (Array.isArray(v[k])) return v[k]; for (const c of Object.values(v)) { const f = findArray(c, keys, depth + 1); if (f.length) return f; } return [];
}
const first = (...vs) => { for (const v of vs) { if (typeof v === 'string' && v.trim()) return v.trim(); if (typeof v === 'number' && Number.isFinite(v)) return String(v); } return ''; };
const num = (...vs) => { for (const v of vs) { if (v === undefined || v === null || v === '') continue; const n = Number(String(v).replace(/,/g, '')); if (Number.isFinite(n)) return n; } return 0; };
// → { date: 'YYYY-MM-DD', time: 'HH:MM' | '', api: 'YYYY/MM/DD' }
export function invDate(v) {
  const two = n => String(n).padStart(2, '0');
  if (typeof v === 'string' && v.trim()) {
    const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(v.trim());
    if (m) return { date: `${m[1]}-${two(m[2])}-${two(m[3])}`, time: m[4] ? `${two(m[4])}:${m[5]}` : '', api: `${m[1]}/${two(m[2])}/${two(m[3])}` };
    const c = /^(\d{8})$/.exec(v.trim()); if (c) { const s = c[1]; return { date: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`, time: '', api: `${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6)}` }; }
  }
  const r = rec(v), ep = Number(r?.time);
  if (Number.isFinite(ep) && ep > 0) { const d = new Date(ep + 8 * 3600e3), dd = `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`; return { date: dd, time: `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`, api: dd.replace(/-/g, '/') }; }
  const y = Number(r?.year), mo = Number(r?.month), da = Number(r?.date);
  if ([y, mo, da].every(Number.isFinite)) { const yy = y < 1911 ? y + 1911 : y, dd = `${yy}-${two(mo)}-${two(da)}`; return { date: dd, time: '', api: dd.replace(/-/g, '/') }; }
  return { date: '', time: '', api: '' };
}
export function normHeaders(payload) {
  return findArray(payload, ['invoices', 'invoice', 'invoiceList', 'invList', 'headers', 'header', 'invoiceHeaders', 'details', 'result', 'data', 'list'])
    .filter(x => x && typeof x === 'object').map(x => { const d = invDate(x.invDate ?? x.invoiceDate ?? x.date), t = first(x.invoiceTime, x.invTime);
      return { no: first(x.invNum, x.invoiceNumber).toUpperCase(), date: d.date, time: d.time || (/^\d{1,2}:\d{2}/.test(t) ? t.slice(0, 5).padStart(5, '0') : ''), api: d.api, total: num(x.amount, x.total, x.totalAmount),
        seller: first(x.sellerID, x.sellerBan), sellerName: first(x.sellerName, x.seller, x.sellerNameE), sellerAddr: first(x.sellerAddress, x.sellerAddr), code: first(x.randomNumber), term: first(x.invPeriod, x.invTerm) }; })
    .filter(x => /^[A-Z]{2}\d{8}$/.test(x.no) && x.date);
}
// → [[name, qty, unitPrice]] keeping qty × price = amount
export function normDetail(payload) {
  return findArray(payload, ['details', 'items', 'itemList', 'invoiceDetails', 'result', 'data', 'list']).filter(x => x && typeof x === 'object').map(x => {
    const name = (first(x.description, x.itemName, x.name) || '品項').slice(0, 60), q = num(x.quantity, x.qty), p = num(x.unitPrice, x.price), a = num(x.amount, x.subtotal);
    return q && Math.round(q * p) === Math.round(a) ? [name, q, p] : [name, 1, a];
  });
}
// ---- client ----
function headers(form) { return { Accept: 'application/json', 'Content-Type': form ? 'application/x-www-form-urlencoded; charset=utf-8' : 'application/json; charset=utf-8', 'User-Agent': APP.ua, appver: APP.version, appbn: String(APP.build), platform: 'android', version: APP.version }; }
async function call(fetchFn, url, init, timeoutMs = 20000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { ...init, signal: ac.signal }), text = await res.text(); let body; try { body = text ? JSON.parse(text) : {}; } catch { body = text; }
    const root = rec(body), path = new URL(url).pathname;
    if (!res.ok) throw Object.assign(new Error(`財政部服務 ${path} HTTP ${res.status}${first(root?.message, root?.msg) ? '：' + first(root?.message, root?.msg) : ''}`), { status: res.status });
    if (typeof root?.result === 'number' && root.result !== 0) {
      let msg = first(root.message, root.msg, root.description, rec(root.payload)?.message); if (!msg && typeof root.payload === 'string') try { msg = first(rec(await decryptLData(root.payload))?.message); } catch { }
      throw Object.assign(new Error(`財政部服務回應錯誤（代碼 ${root.result}）${msg ? '：' + msg : ''}`), { code: root.result });
    }
    return body;
  } catch (e) { if (e?.name === 'AbortError') throw new Error('財政部服務逾時'); throw e; } finally { clearTimeout(t); }
}
async function middleBody(body, ctx) {
  const r = rec(body), v = r ? (r.payload ?? r.data ?? r.result ?? r) : body; if (typeof v !== 'string') return v;
  if (!v.includes('|')) try { return await decryptWith(v, ctx); } catch { }
  try { return await decryptLData(v); } catch { return v; }
}
function device(o) { const id = o.androidId || 'zhangxiaobu-pwa'; return { os: 'a', os_version: '15', model: 'Android', pdid: `a:${id}`, ptoken: '', appver: APP.version, appbn: APP.build, lang: 'zh', ccs: 'tw' }; }
export function makeClient(fetchFn = (...a) => fetch(...a), hosts = HOSTS) {
  const mid = async (path, inner) => { const e = await encryptLData(inner); const body = await call(fetchFn, hosts.middle + path, { method: 'POST', headers: headers(false), body: JSON.stringify({ ldata: e.value }) }); return middleBody(body, e.ctx); };
  const big = async (path, jwt) => call(fetchFn, hosts.big + path, { method: 'POST', headers: headers(true), body: new URLSearchParams({ einvoiceJwt: jwt }).toString() });
  return {
    async login({ mobile, password, carrier = '', androidId, clientCode = randomAlnum(8) }) {
      const dev = device({ androidId }), data = await mid('/mid/v1/login', { type: 0, account: mobile, password, carrier_code: carrier, ckey: clientCode, device: dev, ts: Math.floor(Date.now() / 1000), pdid: dev.pdid });
      return sessionFrom(data, { clientCode, carrierCode: carrier || undefined });
    },
    async loginToken(s, { androidId } = {}) {
      if (!s?.ltoken) throw new Error('沒有 ltoken'); const dev = device({ androidId });
      return sessionFrom(await mid('/mid/v1/logintoken', { ltoken: s.ltoken, ckey: s.clientCode || randomAlnum(8), device: dev, ts: Math.floor(Date.now() / 1000), pdid: dev.pdid }), s);
    },
    async headers(s, startDate, endDate, page = 1) { return normHeaders(await big('/einvoice/carriers/query-invoices-header', await signInvoiceJwt({ version: '1.0', cardType: '3J0002', cardNo: s.carrierCode || '', action: 'carrierInvChk', startDate, endDate, onlyWinningInv: 'A', page }, s))); },
    async detail(s, invNum, invDateApi) { return normDetail(await big('/einvoice/carriers/query-invoices-details', await signInvoiceJwt({ version: '1.0', cardType: '3J0002', cardNo: s.carrierCode || '', action: 'carrierInvDetail', invNum, invDate: invDateApi }, s))); },
  };
}
// Browsers may call this function only from these sites (plus localhost for development). Add others with the
// ALLOWED_ORIGINS secret (comma separated). Requests still need a signed-in user of this Supabase project.
export const DEFAULT_ORIGINS = ['https://gshihwei.github.io'];
export function allowOrigin(origin, extra = '') {
  const o = String(origin || ''); if (!o) return '';
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(o)) return o;
  return [...DEFAULT_ORIGINS, ...String(extra || '').split(',').map(x => x.trim()).filter(Boolean)].includes(o) ? o : '';
}
// Only well-formed values are passed on to the MOF.
function need(v, re, what) { const x = str(v); if (!re.test(x)) throw new Error(`${what}格式不正確`); return x; }
const RE_DATE = /^\d{4}\/\d{2}\/\d{2}$/;
// One request from the app → one reply. Shared by the Edge Function and the tests.
export async function handle(body, fetchFn) {
  const c = makeClient(fetchFn), a = body?.action, s = rec(body?.session);
  if (a === 'login') {
    if (!body.mobile || !body.password) throw new Error('需要手機號碼與密碼'); const pw = String(body.password); if (pw.length > 64) throw new Error('密碼格式不正確');
    const carrier = str(body.carrier).toUpperCase(); if (carrier && !/^\/[0-9A-Z.+-]{7}$/.test(carrier)) throw new Error('手機條碼格式不正確');
    return { session: await c.login({ mobile: need(body.mobile, /^09\d{8}$/, '手機號碼'), password: pw, carrier, androidId: str(body.androidId) || undefined }) };
  }
  if (!s) throw new Error('缺少 session');
  if (a === 'logintoken') return { session: await c.loginToken(s, { androidId: str(body.androidId) || undefined }) };
  if (a === 'headers') { const page = Math.trunc(Number(body.page) || 1); if (page < 1 || page > 50) throw new Error('頁碼不正確'); return { invoices: await c.headers(s, need(body.startDate || periods()[0].startDate, RE_DATE, '日期'), need(body.endDate || periods()[0].endDate, RE_DATE, '日期'), page) }; }
  if (a === 'detail') return { items: await c.detail(s, need(body.invNum, /^[A-Z]{2}\d{8}$/, '發票號碼'), need(body.invDate, RE_DATE, '日期')) };
  throw new Error('未知的 action');
}
