// 帳小簿銀行同步 — 中國信託 (CTBC) mobile-banking API connector.
// Ported from ALL SET / 不用記帳 (github.com/TedLin1993/all-set-tw, MIT License, © 2026 Kuan-Yin Chen, Zih-Jian Lin):
// apps/worker/src/sources/ctbc/{mobile-api,card-data,protocol}.ts. Changes: Node crypto instead of node-forge, interactive
// two-stage verification in the terminal instead of a saved pending session, output in 帳小簿's feed shape, no foreign
// deposits or loans yet. See bank-agent/LICENSE-ALLSET.txt.
import crypto from 'node:crypto';
import { arr, arrAt, BankError, hasText, isoDate, isRecord, last4, NeedUserError, num, opt, rec, recAt, rsaPkcs1Encrypt, sha256Hex, str, taipeiNow, uniqueId } from './util.mjs';

const ORIGIN = 'https://eb.ctbcbank.com/IMP';
const APPLICATION = 'EBMW_Adapter';
const RESOURCE_URL = `${ORIGIN}/api/adapters/${APPLICATION}/resource/ebmwResource`;
const APP_VERSION = '5.2.28';
const WEB_VERSION = '(1020)';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP3A.241005.015; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.58 Mobile Safari/537.36';
// MobileFirst client-credential value shipped in the public Android package (not a user secret).
const PUBLIC_CLIENT_TOKEN = '2ae74c0ad7a14739a2aab7340616d70e';
const TIMEOUT = 45000;
const PIN_RSA_E = 0x9719n;
const PIN_RSA_N = BigInt('0xDF63FFC2F35068BA9A964D234C3400E6394148BC69DF0DD8257340747AD73BF8514C76254F5BEA223BFF76B63840034518E0FA0A1E1905129EC69203A0873A63E5238FFE538DBEFBB64F9318C0BEEF75595DE991E004213B7FE9DA62229BDA1722B45ABAF906F26CF6D88B5BE8F18C26FCA630C6813B0D370E64E1C8D80A790F936C064A5620BFA2C6EE4B5BB962F7703A258028D53923866E43C98C36758262D6DE9D02DECFD74B211E3233924D499B864E1CA86DF012EAFFC9933A0CD2E011843B772E53C6435F78A60437E82D1677664221D01F59797D28771B2AE207EAB00E8500AA2A4FB61FF330B59FC5B699A241D9A44139CF876A74F0DE180107D7DF');
export const MONTHS = 3;

const R = {
  login: '/twrbm-general/ot001/010', twoStageStatus: '/twrbm-general/ot001/002', twoStageEmail: '/twrbm-general/ot001/003', twoStageEmailVerify: '/twrbm-general/ot001/004', logout: '/twrbm-general/ot002/010',
  depositOverview: '/twrbm-deposit/qu001/010', depositInit: '/twrbm-deposit/qu002/010', depositTx: '/twrbm-deposit/qu002/011',
  cardBills: '/twrbm-card/qu002/010', cardBillDetail: '/twrbm-card/qu002/011', cardBillPage: '/twrbm-card/qu002/016',
  unbilledInit: '/twrbm-card/qu006/010', unbilled: '/twrbm-card/qu006/011', unbilledPage: '/twrbm-card/qu006/015', realtime: '/twrbm-card/qu041/010', realtimePage: '/twrbm-card/qu041/015', cardSummary: '/twrbm-card/qu046/010',
};
const PASSWORD_CHANGE = '中國信託要求變更密碼，自動同步已暫停。請到官方 App 變更後，再執行 node cli.mjs setup 更新密碼。';
const VERIFY_IN_APP = '中國信託要求裝置驗證或一次性密碼，目前無法自動完成；請先使用官方 App 登入一次。';
const EXPIRED = () => new NeedUserError('中國信託登入驗證已過期或未核准，請重新執行同步。', 'CTBC_VERIFICATION_EXPIRED');

const randomDigits = (n, rand) => { const b = rand(n); let s = ''; for (let i = 0; i < n; i++) s += String((b[i] ?? 0) % 10); return s; };
// The App's makeEncryptPINClear: XOR with random digits, AES-256-CBC (zero IV) with a PBKDF2 key, key wrapped by RSA.
export function encryptPin(value, rand = n => crypto.randomBytes(n), rsa = key => rsaPkcs1Encrypt(PIN_RSA_N, PIN_RSA_E, key)) {
  if (!value) throw new NeedUserError('中國信託登入欄位不可為空白。');
  const xorKey = randomDigits(value.length, rand); let xorText = '';
  for (let i = 0; i < value.length; i++) xorText += String.fromCharCode(value.charCodeAt(i) ^ xorKey.charCodeAt(i));
  const clear = `${String(value.length).padStart(2, '0')}${xorKey}${xorText}`;
  const key = crypto.pbkdf2Sync(Buffer.from(randomDigits(10, rand), 'latin1'), Buffer.from(rand(16)), 1, 32, 'sha1');
  const c = crypto.createCipheriv('aes-256-cbc', key, Buffer.alloc(16)), enc = Buffer.concat([c.update(Buffer.from(clear, 'utf8')), c.final()]);
  return `${enc.toString('hex')}|${Buffer.from(rsa(key)).toString('hex').padStart(512, '0')}`;
}

const data = r => recAt(r, 'rsData');
function isVerificationFlagKey(k) { return /^(?:need|require|required|pending|challenge).*(?:otp|verify|verification|binddevice|twostage)/i.test(k) || /(?:otp|verify|verification|binddevice|twostage).*(?:required|pending|challenge)$/i.test(k); }
function containsVerificationFlag(d, pat) { return Object.entries(d).some(([k, v]) => isVerificationFlagKey(k) && (!pat || pat.test(k)) && (v === true || v === 1 || /^(?:y|yes|required|pending|true|1)$/i.test(str(v).trim()))); }
function hasContactVerification(d) { const v = rec(d.verifyData).verify; return v === '11' || v === '21'; }
function isVerificationResponse(r) {
  const code = str(r.code || r.statusCode); if (['0526', '2802', '2911', '4002', '4050', '9015', '9030'].includes(code)) return true;
  const d = data(r); return d.forcePwdChange != null || d.isTwoStageLogin === true || hasText(d.deviceBindBlackListCheckTimestamp) || hasText(d.verifySharedDeviceTimestamp) || hasContactVerification(d) || containsVerificationFlag(d);
}
function isNoCreditCardMessage(v) { if (typeof v !== 'string') return false; const m = v.replace(/\s+/g, '').replace(/^\d{4}[:：]/, ''); return /^(?:您)?(?:目前)?(?:(?:尚未|未|沒有|無)(?:持有|申辦|申請)?(?:本行)?信用卡|沒有(?:本行)?有效卡|非(?:本行)?(?:信用卡)?(?:持卡人|卡友)|非(?:本行)?信用卡客戶)(?=[，,。.!！；;]|$)/.test(m); }
const isNoCreditCardCode = r => str(r.sys || r.systemId) === 'SVC' && str(r.code) === '9902';

class Session {
  constructor(fetcher, deviceCode, seed, opts) { this.fetcher = fetcher; this.deviceCode = deviceCode; this.deviceIxd = deviceCode.replace(/-/g, ''); this.seed = seed || ''; this.opts = opts; this.clientNo = Date.now().toString(); this.accessToken = ''; this.xAuthToken = ''; this.transactionToken = 'mfpInit'; this.loggedIn = false; this.haveCC = ''; }
  async bootstrap() {
    const u = new URL(`${ORIGIN}/oauth/token`); u.searchParams.set('grant_type', 'client_credentials'); u.searchParams.set('scope', 'PUBLIC'); u.searchParams.set('client_id', APPLICATION); u.searchParams.set('client_secret', PUBLIC_CLIENT_TOKEN);
    this.accessToken = str((await this.post(u, '', { 'Content-Type': 'application/x-www-form-urlencoded' })).access_token);
    if (!this.accessToken) throw new BankError('中國信託行動銀行服務初始化失敗。');
    const init = await this.post(`${ORIGIN}/main/init`, JSON.stringify({ application: APPLICATION, deviceCode: this.deviceCode, deviceManufacturer: 'Google', deviceModel: 'Pixel 8', devicePlatform: 'Android', deviceVersion: '15', pclientTime: Date.now(), randomNumber: '', clientPubk: '' }), this.baseHeaders());
    if (str(init.statusCode) !== '0000') throw new BankError('中國信託行動銀行服務初始化失敗。');
    const hs = await this.postResource(this.envelope({}), { 'X-Request-Type': 'handshakewb' });
    if (hs.success !== true) throw new BankError('中國信託行動銀行安全連線失敗。');
    this.updateToken(hs);
    // Like the App: keep the first seed for this virtual device.
    if (!this.seed) { this.seed = str(data(hs).seed); if (this.seed) await this.opts.onDeviceSeed?.(this.seed); }
  }
  async login(c) {
    const req = { loginType: 'PW', custId: c.userId, uniNo: '', bankIdNo: '', cardIdNo: '', isMvpApp: false, isCoverApp: false, custSeqFIDO: '', version: APP_VERSION, twoStageVerify: true, userAgent: USER_AGENT, deviceBindBlackList: 'Y', checkDeviceShare: 'Y', userId: encryptPin(c.account), pin: encryptPin(c.password) };
    await this.finishLogin(await this.resource(R.login, req), req, this.opts.interact);
  }
  async finishLogin(response, req, interact) {
    for (let i = 0; i < 2; i++) {
      const d = data(response); if (isVerificationResponse(response) || d.forcePwdChange != null || hasText(d.deviceBindBlackListCheckTimestamp)) break;
      const dup = str(d.dupLoginCheckTimestamp).trim(); if (!dup) break; req.dupLoginCheckTimestamp = dup; response = await this.resource(R.login, req);
    }
    const d = data(response);
    if (d.forcePwdChange != null) { this.loggedIn = true; throw new NeedUserError(PASSWORD_CHANGE, 'CTBC_PASSWORD_CHANGE'); }
    if (d.isTwoStageLogin === true && !hasText(d.dupLoginCheckTimestamp) && !hasText(d.deviceBindBlackListCheckTimestamp) && !hasText(d.verifySharedDeviceTimestamp) && !hasContactVerification(d) && !containsVerificationFlag(d)) {
      if (!interact) throw new NeedUserError('中國信託這次登入要在 App 或 Email 確認。請在電腦上手動執行一次「node cli.mjs sync ctbc」（不加 --auto）。', 'CTBC_TWO_STAGE');
      await this.twoStage(hasText(d.twoStageVerifyEmail) && hasText(d.twoStageVerifyEmailAuthId) ? 'email' : 'app', interact);
      // The App continues with the same encrypted PINs and session.
      const next = { ...req, loginType: 'TWO_STAGE_VERIFY' }; return this.finishLogin(await this.resource(R.login, next), next, null);
    }
    if (d.needBindDevice === true || hasText(d.dupLoginCheckTimestamp) || hasText(d.deviceBindBlackListCheckTimestamp) || isVerificationResponse(response)) throw new NeedUserError(VERIFY_IN_APP, 'CTBC_VERIFY_IN_APP');
    this.loggedIn = true; this.haveCC = str(d.haveCC);
  }
  async twoStage(method, interact) {
    for (let i = 0; i < 8; i++) {
      if (method === 'app') {
        const a = (await interact.ask('請在已綁定的中國信託 App 核准這次登入，完成後按 Enter（輸入 e 改用 Email 驗證碼）：')).trim().toLowerCase();
        if (a === 'e') { const e = data(await this.resource(R.twoStageEmail, { genType: '2' })); if (!hasText(e.twoStageVerifyEmail) || !hasText(e.twoStageVerifyEmailAuthId)) throw EXPIRED(); method = 'email'; continue; }
        const s = data(await this.resource(R.twoStageStatus, {}));
        if (s.keepListen === true) { interact.say('還沒收到核准，請在 App 按「確認」後再按 Enter。'); continue; }
        if (s.keepListen !== false || s.twoStageVerifySuccess !== true) throw EXPIRED(); return;
      }
      const otp = (await interact.ask('請輸入中國信託寄到 Email 的四位數驗證碼：')).trim();
      if (!/^\d{4}$/.test(otp)) { interact.say('驗證碼是四位數字。'); continue; }
      const r = await this.resource(R.twoStageEmailVerify, { twoStageVerifyEmailAuthCode: otp });
      if (str(r.code) !== '0000' && str(r.statusCode) !== '0000' && r.success !== true) throw EXPIRED(); return;
    }
    throw EXPIRED();
  }
  async logout() { if (!this.loggedIn) return; try { await this.resource(R.logout, {}); } catch { /* best effort */ } finally { this.loggedIn = false; } }
  async resource(resource, rqData) {
    const h = {}; if (this.transactionToken === 'mfpInit') h['X-Requested-With'] = 'MFPInit'; if (!this.loggedIn) h['X-Request-Type'] = 'preLogin'; if (this.xAuthToken) h['x-auth-token'] = this.xAuthToken;
    const r = await this.postResource(this.envelope(rqData, resource), h); this.updateToken(r); this.assertOk(r, resource); return r;
  }
  envelope(rqData, resource) {
    const e = { deviceIxd: this.deviceIxd, trackingIxd: crypto.randomUUID(), txnIxd: '', model: 'Google Pixel 8', platform: 'Android', version: '15', network: 'wifi', appVer: APP_VERSION, clientNo: this.clientNo, clientTime: Date.now().toString(), locale: 'zh_TW', fromSys: '0', seed: this.seed, deviceToken: '', buildDisplay: 'AP3A.241005.015', rqData, webVer: WEB_VERSION };
    if (resource) e.resource = resource; if (this.transactionToken !== 'mfpInit') e.token = this.transactionToken; return e;
  }
  postResource(body, headers) { const s = JSON.stringify(body); return this.post(RESOURCE_URL, s, { ...this.baseHeaders(), checksum: sha256Hex(s), deviceCode: this.deviceCode, ...headers }); }
  baseHeaders() { return { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, Authorization: `Bearer ${this.accessToken}` }; }
  async post(url, body, headers) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      let r; try { r = await this.fetcher(url, { method: 'POST', headers, body, signal: ctl.signal }); } catch { throw new BankError('中國信託行動銀行服務暫時無法連線。'); }
      if (!r.ok) throw new BankError(`中國信託行動銀行服務暫時無法連線（HTTP ${r.status}）。`);
      let d; try { d = JSON.parse(await r.text()); } catch { throw new BankError('中國信託行動銀行回應格式已變更。'); }
      if (!isRecord(d)) throw new BankError('中國信託行動銀行回應格式已變更。');
      const next = r.headers.get('x-auth-token'); if (next) this.xAuthToken = next; return d;
    } finally { clearTimeout(timer); }
  }
  updateToken(r) { const t = str(r.token); if (t) this.transactionToken = t; }
  assertOk(r, resource) {
    const isLogin = resource === R.login, isTwo = [R.twoStageStatus, R.twoStageEmail, R.twoStageEmailVerify].includes(resource), code = str(r.code), status = str(r.statusCode), sys = str(r.sys || r.systemId);
    if ((resource === R.cardBills || resource.startsWith('/twrbm-fx/')) && isVerificationResponse(r)) throw new NeedUserError('中國信託登入需要重新驗證，請先到官方 App 完成驗證。', 'CTBC_VERIFY_IN_APP');
    if (resource === R.cardBills && isNoCreditCardMessage(r.message)) return;
    if (resource === R.cardBills && isNoCreditCardCode(r) && this.haveCC !== '1') return;
    if (resource === R.depositOverview && sys === 'SVC' && code === '9993') return; // card-only customer
    if (!isLogin && !isTwo && (code === '8888' || (sys === 'ESB' && code === '9201'))) return;
    if (!((code && code !== '0000') || (status && status !== '0000') || r.success === false)) return;
    if (isLogin && data(r).forcePwdChange != null) throw new NeedUserError(PASSWORD_CHANGE, 'CTBC_PASSWORD_CHANGE');
    if (isTwo) throw EXPIRED();
    if (isVerificationResponse(r)) throw new NeedUserError('中國信託登入需要重新驗證，請先到官方 App 完成驗證。', 'CTBC_VERIFY_IN_APP');
    if (isLogin && /密碼|代號|身分證|錯誤/.test(str(r.desc || r.message))) throw new NeedUserError(`中國信託登入失敗：${str(r.desc || r.message).slice(0, 60)}（請確認帳號密碼，執行 node cli.mjs setup 更新）`, 'CTBC_LOGIN_FAILED');
    throw new BankError('中國信託資料同步暫時無法完成。');
  }
}

// ---- paging helpers (card-data.ts) ----
const invalid = () => new BankError('中國信託信用卡明細或分頁完整性無法確認。');
function rows(v) { if (!Array.isArray(v) || v.some(x => x === null || typeof x !== 'object' || Array.isArray(x))) throw invalid(); return v; }
async function query(request, resource, d, emptyUnbilled = false) {
  let r; try { r = await request(resource, d); } catch (e) { if (e?.needUser) throw e; throw new BankError('中國信託信用卡明細查詢未完成。'); }
  const body = rec(r.rsData);
  if (emptyUnbilled && r.code === '8888') { if (body.allItems != null && (!Array.isArray(body.allItems) || body.allItems.length)) throw invalid(); if (body.totalRow != null && Number(body.totalRow) !== 0) throw invalid(); return { allItems: [] }; }
  if ((r.code != null && r.code !== '0000') || (r.statusCode != null && r.statusCode !== '0000') || r.success === false) throw invalid();
  return body;
}
function pagination(d, length, mode) {
  if (mode === 'realtime' && d.noMore != null && typeof d.noMore !== 'boolean') throw invalid();
  const paging = mode === 'realtime' ? d.noMore === false : d.displayPaging === true || d.displayPaging === 'Y';
  const size = d.pageCount == null || d.pageCount === '' ? 100 : Number(d.pageCount), total = d.totalRow == null ? length : Number(d.totalRow);
  if (!Number.isInteger(size) || size < 1 || !Number.isInteger(total) || total < 0 || total < length) throw invalid();
  if (paging && d.totalRow == null) throw invalid();
  const pages = paging ? Math.max(1, Math.ceil(total / size)) : 1; if (pages > 20 || (!paging && total !== length)) throw invalid();
  return { pages, total };
}
export async function fetchCardStatements(request, overview) {
  const d = rec(overview.rsData); if (!isRecord(d.billData)) throw invalid(); const billData = {};
  for (const [cur, values] of Object.entries(d.billData)) {
    if (!/^[A-Z]{3}$/.test(cur)) throw invalid();
    const periods = Object.entries(rec(values)).filter(([, g]) => rec(g).summary !== null);
    if (periods.some(([p]) => !/^\d{4}[/-](0[1-9]|1[0-2])$/.test(p))) throw invalid();
    const sel = {};
    for (const [month, g] of periods.sort(([a], [b]) => b.replace('/', '-').localeCompare(a.replace('/', '-'))).slice(0, MONTHS)) {
      const detail = await query(request, R.cardBillDetail, { curCode: cur, month, billCycle: d.billCycle }), bills = [...rows(detail.bills)], { pages, total } = pagination(detail, bills.length, 'statement');
      for (let n = 2; n <= pages; n++) bills.push(...rows((await query(request, R.cardBillPage, { curCode: cur, month, pageNum: n })).bills));
      if (bills.length !== total) throw invalid();
      sel[month] = { ...rec(g), ...detail, summary: detail.summary ?? rec(g).summary, bills };
    }
    billData[cur] = sel;
  }
  return { ...overview, rsData: { ...d, billData } };
}
export async function fetchPagedCardItems(request, first, page, d, mode) {
  const init = await query(request, first, d, mode === 'unbilled'), all = [...rows(init.allItems)], { pages, total } = pagination(init, all.length, mode);
  for (let n = 2; n <= pages; n++) all.push(...rows((await query(request, page, { pageNum: n })).allItems));
  if (all.length !== total) throw invalid();
  return { rsData: { ...init, allItems: all } };
}
function monthlyRanges(months, now = new Date()) {
  const t = taipeiNow(now), out = [], c = d => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  for (let o = 0; o < Math.max(1, Math.min(6, months)); o++) {
    const start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - o, 1)), end = o === 0 ? t : new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - o + 1, 0));
    out.push({ startDate: c(start), endDate: c(end) });
  }
  return out;
}
function depositAccountsOf(overview) {
  const info = arr(rec(rec(data(overview).twdAcctSummaryResponse).demDepBalSummaryResponse).infoList);
  return info.flatMap(v => (isRecord(v) && str(v.accountId).trim() ? [str(v.accountId).trim()] : []));
}
function selectTxAccountId(payload, requested) {
  const d = data(payload), selected = str(d.accountId).trim();
  const l = [...arr(d.accountSelections), ...arr(d.accountInfoList), ...arr(d.selectList)].flatMap(v => (isRecord(v) && str(v.accountId ?? v.acctId).trim() ? [str(v.accountId ?? v.acctId).trim()] : []));
  return l.find(v => v === selected) ?? l.find(v => v === requested) ?? l[0] ?? (selected || requested);
}
async function fetchDepositTransactions(s, overview) {
  const out = [];
  for (const accountId of depositAccountsOf(overview)) {
    const q = selectTxAccountId(await s.resource(R.depositInit, { accountId }), accountId);
    for (const range of monthlyRanges(MONTHS)) for (const item of arr(data(await s.resource(R.depositTx, { accountId: q, ...range, keyWord: '', type: 'custom' })).detailList)) if (isRecord(item)) out.push({ ...item, sourceAccountId: accountId });
  }
  return { rsData: { detailList: out } };
}
function currencyCodes(d) {
  return [...new Set([...arr(d.curOptions), ...arr(d.curDataList)].flatMap(v => { if (!isRecord(v)) return []; const c = str(v.curCode).trim().toUpperCase(); return c ? [c === 'NTD' ? 'TWD' : c] : []; }))];
}

export function createCtbc({ fetcher = globalThis.fetch.bind(globalThis), interact = null, onDevice } = {}) {
  return {
    id: 'ctbc', name: '中國信託',
    async sync(cfg) {
      if (!hasText(cfg.userId) || !hasText(cfg.account) || !hasText(cfg.password)) throw new NeedUserError('請先執行 node cli.mjs setup 儲存中國信託身分證字號、使用者代號與網銀密碼。', 'CTBC_SETUP');
      const deviceCode = cfg.deviceCode || crypto.randomUUID(); if (!cfg.deviceCode) await onDevice?.({ deviceCode });
      const s = new Session(fetcher, deviceCode, cfg.deviceSeed, { interact, onDeviceSeed: seed => onDevice?.({ deviceCode, deviceSeed: seed }) });
      const req = (r, d) => s.resource(r, d);
      try {
        await s.bootstrap(); await s.login(cfg);
        const depositOverview = await s.resource(R.depositOverview, {}), depositTransactions = await fetchDepositTransactions(s, depositOverview);
        const bills = s.haveCC === '0' ? undefined : await s.resource(R.cardBills, {});
        const noCard = !bills || (!isVerificationResponse(bills) && (isNoCreditCardMessage(bills.message) || isNoCreditCardCode(bills) || (Array.isArray(data(bills).cardDataList) && !data(bills).cardDataList.length && isRecord(data(bills).billData) && !Object.keys(data(bills).billData).length)));
        const creditCards = noCard ? undefined : await fetchCardStatements(req, bills);
        if (creditCards) await s.resource(R.cardSummary, {});
        let unbilled;
        if (creditCards) {
          const all = [], init = await s.resource(R.unbilledInit, {}), curs = currencyCodes(data(init));
          for (const cur of curs.length ? curs : ['TWD']) for (const it of arr(data(await fetchPagedCardItems(req, R.unbilled, R.unbilledPage, { curCode: cur }, 'unbilled')).allItems)) all.push(isRecord(it) ? { ...it, sourceCurrency: cur } : it);
          unbilled = { rsData: { allItems: all } };
        }
        const realtime = creditCards ? await fetchPagedCardItems(req, R.realtime, R.realtimePage, {}, 'realtime') : undefined;
        return parseCtbc({ depositOverview, depositTransactions, creditCards, unbilled, realtime });
      } finally { await s.logout(); }
    },
  };
}

// ---- parsing (protocol.ts), output in 帳小簿's feed shape ----
const TWD = 'TWD';
function curCode(v) { const c = str(v).trim().toUpperCase(); if (!c || c === '000' || c === 'NTD') return TWD; if (c === '840') return 'USD'; if (c === '392') return 'JPY'; if (c === '978') return 'EUR'; return /^[A-Z]{3}$/.test(c) ? c : undefined; }
// Card statements use MMDDYY; other feeds full years.
function cardDate(v) { const t = str(v).trim(); if (/^\d{6}$/.test(t)) return t === '000000' ? undefined : isoDate(`20${t.slice(4)}-${t.slice(0, 2)}-${t.slice(2, 4)}`); return isoDate(v); }
function period(k) { const m = /^(\d{3,4})[/-]?(\d{1,2})$/.exec(k); if (!m) return undefined; const y = Number(m[1]) < 1911 ? Number(m[1]) + 1911 : Number(m[1]), mo = Number(m[2]); return mo >= 1 && mo <= 12 && y >= 2000 ? `${y}-${String(mo).padStart(2, '0')}` : undefined; }
function taipeiTime(v) { const m = /^(.+?)[T ](\d{1,2})[:：](\d{2})/.exec(str(v).trim()); return m && isoDate(m[1]) && Number(m[2]) < 24 ? `${m[2].padStart(2, '0')}:${m[3]}` : ''; }
const authHash = v => { const c = str(v).trim(); return c && !/^0+$/.test(c) ? sha256Hex(c) : undefined; };
const merchantKey = v => str(v).replace(/[\s\-_－—*＊()（）,.，。]/g, '').toLowerCase();
const REFUND = /退款|退貨|折讓|沖銷|回饋|繳款|refund|credit|payment/i;
function displayLast4(v) { const t = str(v).trim(), i = t.lastIndexOf('_'); return last4(i < 0 ? t : t.slice(0, i)); }
function txCard(v) { const c = [v.cardNoSuffixFour, v.cardNo, v.fullCardNo].map(displayLast4).filter(Boolean); return new Set(c).size === 1 ? c[0] : undefined; }
const isPayment = t => t.amount > 0 && /繳款|扣繳|自扣|payment/i.test(t.desc || '');

export function parseCtbc(p) {
  const used = new Set(), accounts = [], tx = [];
  // deposits
  const deps = arr(rec(rec(data(p.depositOverview).twdAcctSummaryResponse).demDepBalSummaryResponse).infoList).flatMap(v => (isRecord(v) && str(v.accountId).trim() && num(v.balance) != null ? [v] : []));
  const depId = new Map();
  for (const v of deps) {
    const n = str(v.accountId).trim(), id = uniqueId(used, `ctbc:dep:${last4(n) || 'x'}`), nick = opt(v.accountNickName); depId.set(n, id);
    accounts.push({ id, name: nick && last4(n) ? `${nick} 末四碼 ${last4(n)}` : `中國信託存款 末四碼 ${last4(n) || ''}`.trim(), type: 'bank', currency: TWD, balance: num(v.balance) });
  }
  const occ = new Map();
  for (const v of arrAt(data(p.depositTransactions), 'detailList')) {
    if (!isRecord(v)) continue; const n = str(v.sourceAccountId).trim(), dr = num(v.dbAmt) ?? 0, cr = num(v.crAmt) ?? 0, amount = cr !== 0 ? Math.abs(cr) : -Math.abs(dr);
    if (!n || amount === 0) continue; const acct = depId.get(n) || uniqueId(used, `ctbc:dep:${last4(n) || 'x'}`); if (!depId.has(n)) depId.set(n, acct);
    const date = isoDate(v.trnDtFull), desc = opt(v.memo1) || opt(v.passBookMemo) || opt(v.memo2) || '中國信託帳戶交易';
    const key = ['ctbc-dep', n, date ?? '', amount, desc, str(v.defaultSeq), num(v.balanceAmt) ?? ''].join(':'), o = (occ.get(key) ?? 0) + 1; occ.set(key, o);
    tx.push({ key: `${key}:${o}`, acct, date, time: taipeiTime(v.trnDtFull), amount, currency: TWD, desc, party: opt(v.memo2) });
  }
  // credit cards: up to MONTHS statements per currency
  const groups = [];
  for (const [ck, cv] of Object.entries(recAt(data(p.creditCards), 'billData'))) {
    const currency = curCode(ck) ?? TWD; if (!isRecord(cv)) continue;
    for (const [pk, gv] of Object.entries(cv)) {
      if (!isRecord(gv)) continue; const s = isRecord(gv.summary) ? gv.summary : gv, billingPeriod = period(pk) ?? isoDate(s.billDt)?.slice(0, 7) ?? isoDate(s.pmtExpDt)?.slice(0, 7); if (!billingPeriod) continue;
      groups.push({ currency, billingPeriod, currentPayment: num(s.currPmtAmt), minimumPayment: num(s.minPmtAmt), due: cardDate(s.pmtExpDt), closing: cardDate(s.billDt), statementAmount: num(s.billAmt), previousBalance: num(s.prevBal), cyclePayment: num(s.pmtAmt), bills: arrAt(gv, 'bills').filter(isRecord) });
    }
  }
  const byCur = new Map(); for (const g of groups.sort((a, b) => b.billingPeriod.localeCompare(a.billingPeriod))) { const l = byCur.get(g.currency) || []; if (l.length < MONTHS) l.push(g); byCur.set(g.currency, l); }
  const selected = [...byCur.values()].flat();
  const cardAcct = cur => `ctbc:card${cur === TWD ? '' : ':' + cur}`;
  const posted = [];
  for (const g of selected) for (const b of g.bills) {
    const purchase = cardDate(b.purchaseDt), postedDate = cardDate(b.postingDt) ?? cardDate(b.clearingDt) ?? purchase, desc = opt(b.description) || opt(b.merchantChiName) || '中國信託信用卡消費';
    const raw = g.currency === TWD ? num(b.ntAmt) : num(b.foreignAmt) ?? num(b.ntAmt); if (raw === 0) continue;
    if (raw == null || !postedDate) throw new BankError('中信已入帳明細日期或金額格式無法辨識。');
    const amount = raw < 0 || REFUND.test(desc) ? Math.abs(raw) : -Math.abs(raw), c4 = last4(str(b.cardNoSuffixFour)) ?? last4(str(b.cardNo)) ?? last4(str(b.fullCardNo));
    posted.push({ acct: cardAcct(g.currency), date: purchase || postedDate, time: '', amount, currency: g.currency, desc, card: txCard(b), auth: authHash(b.authCode), identity: [g.currency, purchase ?? '', amount, c4, merchantKey(desc), str(b.sorting)].join(':') });
  }
  const unbilled = arrAt(data(p.unbilled), 'allItems').flatMap(v => {
    if (!isRecord(v)) return []; const purchase = cardDate(v.purchaseDt), postedDate = cardDate(v.postingDt) ?? purchase, raw = num(v.purchaseAmt) ?? num(v.ntAmt) ?? num(v.txnAmt);
    if (raw === 0) return []; if (!postedDate || raw == null) throw new BankError('中信未出帳明細日期或金額格式無法辨識。');
    const desc = opt(v.description) || opt(v.merchantChiName) || opt(v.merchName) || '中國信託信用卡消費', amount = raw < 0 || REFUND.test(`${desc} ${opt(v.txnType) ?? ''}`) ? Math.abs(raw) : -Math.abs(raw);
    const currency = curCode(v.sourceCurrency ?? v.curCode) ?? TWD, c4 = last4(str(v.cardNoSuffixFour)) ?? last4(str(v.cardNo));
    return [{ acct: cardAcct(currency), date: purchase || postedDate, time: '', amount, currency, desc, card: txCard(v), auth: authHash(v.authCode), identity: [currency, purchase ?? postedDate, amount, c4, merchantKey(desc), str(v.authCode), str(v.acwRefNbr)].join(':') }];
  });
  const pending = arrAt(data(p.realtime), 'allItems').flatMap(v => {
    if (!isRecord(v)) return []; const date = isoDate(v.txnDate) ?? isoDate(v.txnDateTime), raw = num(v.txnAmt); if (raw === 0) return [];
    if (!date || raw == null) throw new BankError('中信即時授權日期或金額格式無法辨識。');
    const desc = opt(v.merchName) || '中國信託信用卡消費', amount = raw < 0 || REFUND.test(`${desc} ${opt(v.txnType) ?? ''}`) ? Math.abs(raw) : -Math.abs(raw), c4 = last4(str(v.cardNoSuffixFour)) ?? last4(str(v.cardNo));
    return [{ acct: cardAcct(TWD), date, time: taipeiTime(v.txnDateTime), amount, currency: TWD, desc, card: txCard(v), auth: authHash(v.authCode), status: 'pending', identity: [TWD, date, amount, c4, merchantKey(desc), str(v.authCode)].join(':') }];
  });
  // A posted row takes over the identity of its single matching authorisation (same auth code, currency, amount, day).
  const match = (a, b) => a.auth && a.auth === b.auth && (!a.card || !b.card || a.card === b.card) && a.currency === b.currency && a.amount === b.amount && (!a.date || !b.date || a.date === b.date);
  const cands = [...posted, ...unbilled].map(t => pending.filter(x => match(t, x))), used2 = new Set();
  const settled = [...posted, ...unbilled].map((t, i) => { const m = cands[i]; if (m.length !== 1 || cands.filter(g => g.includes(m[0])).length !== 1) return t; used2.add(m[0]); return { ...t, identity: m[0].identity, time: m[0].time || t.time }; });
  const occ2 = new Map();
  for (const t of [...settled, ...pending.filter(x => !used2.has(x))]) { const o = (occ2.get(t.identity) ?? 0) + 1; occ2.set(t.identity, o); tx.push({ key: `ctbc-card:${t.identity}:${o}`, acct: t.acct, date: t.date, time: t.time, amount: t.amount, currency: t.currency, desc: t.desc, card: t.card, status: t.status }); }
  // card accounts: liability = remaining due on the newest statement + unbilled spending (negative = owed)
  const payments = new Map(), spend = new Map();
  for (const t of unbilled) { if (isPayment(t)) payments.set(t.currency, (payments.get(t.currency) ?? 0) + t.amount); else spend.set(t.currency, (spend.get(t.currency) ?? 0) - t.amount); }
  const curs = new Set([...selected.map(g => g.currency), ...unbilled.map(t => t.currency), ...pending.map(t => t.currency)]);
  for (const cur of curs) {
    const g = selected.find(x => x.currency === cur), due = g ? g.currentPayment ?? g.statementAmount : undefined, remaining = due == null ? 0 : Math.max(0, due) - (payments.get(cur) ?? 0);
    const bal = Math.round(-(remaining + (spend.get(cur) ?? 0)) * 100) / 100, a = { id: cardAcct(cur), name: `中國信託信用卡${cur === TWD ? '' : `（${cur}）`}`, type: 'card', currency: cur, balance: bal === 0 ? 0 : bal };
    if (g) { const paidAmt = payments.get(cur) ?? 0; a.bill = { period: g.billingPeriod, amount: g.statementAmount, min: g.minimumPayment, due: g.due, closing: g.closing, paid: g.statementAmount != null ? paidAmt >= g.statementAmount : undefined }; }
    accounts.push(a);
  }
  return { accounts, tx };
}
