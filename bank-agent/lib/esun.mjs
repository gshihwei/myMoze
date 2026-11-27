// 帳小簿銀行同步 — 玉山銀行 (E.SUN) connector: logs in through the mobile web bank in a private Edge window on this
// computer, then reads deposits and credit cards with the bank page's own API calls.
// Ported from ALL SET / 不用記帳 (github.com/TedLin1993/all-set-tw, MIT License, © 2026 Kuan-Yin Chen, Zih-Jian Lin):
// apps/worker/src/sources/esun/{connector,portal}.ts. Changes: local puppeteer-core + Edge instead of Cloudflare Browser
// Run, a fresh login each run (no stored cookies), output in 帳小簿's feed shape. See bank-agent/LICENSE-ALLSET.txt.
import fs from 'node:fs';
import path from 'node:path';
import { BankError, hasText, isoDate, last4, NeedUserError, num, str, taipeiNow, uniqueId } from './util.mjs';

const PORTAL_URL = 'https://ebank.esunbank.com.tw/esb/';
const IESC_ORIGIN = 'https://iesc.esunbank.com';
const MONTHS = 3;
const BILL_NOT_CLOSED = 'CARD-2026';
const P = {
  cardInit: 'mib-ccm-portal/ccmB1/ccmB1001/home/init', cardOverview: 'mib-ccm-portal/ccmB1/ccmB1001/home/getCardOverview', depInit: 'mib-ctw-portal/ctw01/ctw01002/home/init',
  twPre: 'mib-ctw-portal/ctw01/ctw01002/home/preQueryTWTransactionDetail', frPre: 'mib-ctw-portal/ctw01/ctw01002/home/preQueryFRTransactionDetail',
  twSearch: 'mib-ctw-portal/ctw01/ctw01002/search/queryTWTransactionDetail', frSearch: 'mib-ctw-portal/ctw01/ctw01002/search/queryFRTransactionDetail',
};

export function findEdge() {
  const c = [process.env.ZXB_BROWSER, 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')];
  return c.find(p => p && fs.existsSync(p)) || null;
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const step = (log, s) => log?.(`玉山：${s}`);

async function loginPage(page, cfg) {
  await page.waitForSelector('input[name="id"]', { timeout: 30000 });
  // the shared header/footer scripts must finish before the login button sends doAction
  await page.waitForFunction(() => Boolean(document.querySelector('header.mib-header')) && Boolean(document.querySelector('footer.mib-footer')), { timeout: 20000 }).catch(() => undefined);
  await page.type('input[name="id"]', cfg.userId.toUpperCase());
  await page.type('input[name="userName"]', cfg.account);
  await page.type('input[name="pxssword"]', cfg.password);
  const resp = page.waitForResponse(r => r.url().includes('/cpo08/cpo08001/home/doAction'), { timeout: 30000 });
  await page.click('button.btn-main-fill');
  await page.waitForFunction(() => document.querySelectorAll('.input-error-message').length > 0, { timeout: 1000 }).catch(() => undefined);
  const errs = await page.evaluate(() => Array.from(document.querySelectorAll('.input-error-message')).map(e => e.textContent?.trim()).filter(Boolean));
  if (errs.length) throw new NeedUserError(`玉山登入欄位有誤：${errs.join(' ')}（執行 node cli.mjs setup 更新）`, 'ESUN_FORM');
  let result = await (await resp).json();
  if (result.resultCode === '9005') { // already signed in elsewhere: confirm like the web bank
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent?.trim() === '確定登入'), { timeout: 5000 });
    const again = page.waitForResponse(r => r.url().includes('/cpo08/cpo08001/home/doAction'), { timeout: 30000 });
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === '確定登入')?.click());
    result = await (await again).json();
  }
  if (result.resultCode !== '0000') {
    const msg = str(result.resultDescription || result.resultMessage || '').slice(0, 60);
    throw new NeedUserError(`玉山登入失敗（${result.resultCode ?? '未知'}）${msg ? '：' + msg : ''}。請確認帳號密碼，或到玉山網銀確認是否需要變更密碼。`, 'ESUN_LOGIN');
  }
}

// 玉山 2026-11: 首頁「刷卡明細」是 div[role="link"]，不是 button。
async function clickControl(page, label) {
  await page.waitForFunction(l => Array.from(document.querySelectorAll('button, a, [role="link"]')).some(e => { const b = e.getBoundingClientRect(); return e.textContent?.trim() === l && b.width > 0 && b.height > 0; }), { timeout: 15000 }, label);
  await page.evaluate(l => Array.from(document.querySelectorAll('button, a, [role="link"]')).find(e => { const b = e.getBoundingClientRect(); return e.textContent?.trim() === l && b.width > 0 && b.height > 0; })?.click(), label);
}
async function openIescPage(browser, portal) {
  await clickControl(portal, '刷卡明細');
  const end = Date.now() + 15000; let page;
  while (Date.now() < end && !page) { page = (await browser.pages()).find(p => p.url().startsWith(`${IESC_ORIGIN}/`)); if (!page) await wait(250); }
  if (!page) throw new BankError('玉山信用卡頁面沒有開啟。');
  await page.waitForFunction(() => Boolean(sessionStorage.getItem('accessToken')) && (Boolean(document.querySelector('input[placeholder*="未入帳"]')) || document.body.innerText.includes('未入帳') || document.body.innerText.includes('尚未持有本行信用卡')), { timeout: 20000 });
  return page;
}
async function readRealtime(page) {
  await page.waitForFunction(() => Boolean(document.querySelector('input[placeholder*="未入帳"]')) || document.body.innerText.includes('未入帳'), { timeout: 20000 });
  const opened = await page.evaluate(() => {
    const input = document.querySelector('input[placeholder*="未入帳"]'); if (input) { input.click(); return true; }
    const el = Array.from(document.querySelectorAll('*')).filter(i => (i.textContent?.trim() ?? '').startsWith('未入帳') && (i.textContent?.length ?? 0) < 15).sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0];
    el?.click(); return Boolean(el);
  });
  if (!opened) throw new BankError('玉山未入帳選單沒有開啟。');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('li')).some(i => i.textContent?.trim() === '即時消費紀錄'), { timeout: 10000 });
  const resp = page.waitForResponse(r => r.url().includes('/GW/realTime/getDetailResult'), { timeout: 20000 });
  if (!(await page.evaluate(() => { const e = Array.from(document.querySelectorAll('li')).find(i => i.textContent?.trim() === '即時消費紀錄'); e?.click(); return Boolean(e); }))) throw new BankError('玉山即時消費選項不見了。');
  return (await resp).json();
}
function postPortal(page, p, body, reset) {
  return page.evaluate(async (rp, b, r) => {
    const s = window.mibApiService; if (!s?.uuid) throw new Error('E.SUN portal session is missing.'); if (r) s.txnFlowToken = '';
    const txnTime = new Date(Date.now() + 28800000).toISOString().replace('T', ' ').slice(0, 19);
    const res = await fetch(`/esb/${rp}`, { method: 'POST', headers: { 'Content-Type': 'application/json', uniqueKey: s.uuid }, body: JSON.stringify({ header: { txnTime, txnFlowToken: r ? '' : (s.txnFlowToken ?? '') }, requestBody: b }) });
    const text = await res.text(); let d; try { d = JSON.parse(text); } catch { return { resultCode: `HTTP_${res.status}` }; }
    if (d.txnFlowToken) s.txnFlowToken = d.txnFlowToken; return d;
  }, p, body, Boolean(reset));
}
function postIesc(page, p, body) {
  return page.evaluate(async (rp, b) => {
    const res = await fetch(`/GW/${rp}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('accessToken') ?? ''}` }, body: JSON.stringify(b) });
    const a = res.headers.get('authorization'); if (a) sessionStorage.setItem('accessToken', a.replace(/^Bearer\s+/i, '')); return res.json();
  }, p, body);
}

const portalData = v => (v?.resultCode === '0000' ? v.resultBody : undefined);
const iesc = v => v?.body;
function iescOk(v, label) { if (v?.body?.rtnCode === 'S') return; const r = v?.body?.rtnCode ?? [v?.status, v?.msg?.join(',')].filter(Boolean).join(' '); throw new BankError(`玉山信用卡 ${label} 查詢失敗（${r || '未知'}）`); }
function portalOk(v, label) { if (v?.resultCode !== '0000') throw new BankError(`玉山 ${label} 查詢失敗（${v?.resultCode ?? '未知'}）`); }
const slashDate = d => { const s = taipeiNow(d); return `${s.getUTCFullYear()}/${String(s.getUTCMonth() + 1).padStart(2, '0')}/${String(s.getUTCDate()).padStart(2, '0')}`; };

async function snapshot(api) {
  let hasCard = true;
  try { const b = iesc(await api.iesc('common/isCardholder', {})); hasCard = !(b?.rtnCode === 'S' && b.credit === false); } catch { hasCard = true; }
  const out = { hasCard, realtime: null, history: [], billSummary: null, billPeriod: null, overview: null };
  if (hasCard) {
    out.realtime = await api.realtime(); iescOk(out.realtime, 'realtime');
    const seen = new Set(); let cursor = 1;
    while (out.history.length < 8 && !seen.has(cursor)) { seen.add(cursor); const raw = await api.iesc('creditLastYear/getFilterResult', { cursor }); iescOk(raw, 'history'); out.history.push(raw); const n = iesc(raw)?.cursor; if (typeof n !== 'number' || n === cursor || n <= 0) break; cursor = n; }
    const bp = await api.iesc('cardBill/getLastBillYearMonth', { cardType: 'C' }); iescOk(bp, 'bill-period');
    let period = iesc(bp)?.lastBillYearMonth; period = period == null ? null : String(period);
    if (period) {
      let s = await api.iesc('creditBill/getSummaryResult', { billPeriod: period });
      if (s?.status === BILL_NOT_CLOSED) { const i = Number(period.slice(0, 4)) * 12 + Number(period.slice(4, 6)) - 2; period = `${Math.floor(i / 12)}${String((i % 12) + 1).padStart(2, '0')}`; s = await api.iesc('creditBill/getSummaryResult', { billPeriod: period }); }
      iescOk(s, 'bill'); out.billSummary = s; out.billPeriod = period;
    }
    try { await api.portal(P.cardInit, {}, true); out.overview = await api.portal(P.cardOverview, {}); } catch { out.overview = null; }
  }
  const start = new Date(); start.setMonth(start.getMonth() - MONTHS);
  const range = { startDate: slashDate(start), endDate: slashDate(new Date()) };
  out.tw = await deposits(api, P.twPre, P.twSearch, 'tw', range); out.fr = await deposits(api, P.frPre, P.frSearch, 'fr', range);
  return out;
}
async function deposits(api, pre, search, kind, range) {
  portalOk(await api.portal(P.depInit, {}, true), 'deposit-init');
  const first = await api.portal(pre, { account: null });
  if (first?.resultCode === 'S001' && (kind === 'fr' ? /查無外幣帳號|尚未開立外幣帳戶/ : /查無臺幣帳號|尚未開立臺幣帳戶/).test(first.resultDescription ?? '')) return [];
  portalOk(first, 'deposit-prequery'); const f = portalData(first) ?? {};
  const listed = ((kind === 'tw' ? f.twAccountList : f.frAccountList) ?? []).map(i => i.accountNo?.trim() ?? '').filter(Boolean), cur = f.demandDeptAcc?.trim();
  const accounts = [...new Set(cur ? [cur, ...listed.filter(x => x !== cur)] : listed)], out = [];
  for (const no of accounts.length ? accounts : ['']) {
    let body = f;
    if (no && no !== f.demandDeptAcc) { portalOk(await api.portal(P.depInit, {}, true), 'deposit-init'); const raw = await api.portal(pre, { account: no }); portalOk(raw, 'deposit-prequery'); body = portalData(raw) ?? {}; }
    const groups = []; let start = 1, fallback = false;
    for (let i = 0; i < 6; i++) {
      const raw = await api.portal(search, { account: body.demandDeptAcc || no, ...range, startIndex: start, count: 100, customerInputHashtag: [] });
      if (raw?.resultCode !== '0000') { fallback = true; break; }
      const g = raw.resultBody?.queryDeptTxDtlResult?.detailListData ?? [], n = g.reduce((s, x) => s + (x.detailInfo?.length ?? 0), 0);
      if (i === 0 && n === 0) { fallback = true; break; } groups.push(...g); if (n < 100) break; start += 100;
    }
    const details = (fallback ? body.queryDeptTxDtlResult?.detailListData ?? [] : groups).flatMap(g => g.detailInfo ?? []);
    const accountNo = body.demandDeptAcc?.trim() ?? '', alias = body.accountAlias?.trim() ?? '';
    if (kind === 'tw') out.push({ accountNo, alias, currency: 'TWD', balance: num(body.twCurrInfo?.realBalance) ?? 0, details });
    else { const cs = body.currInfoList ?? []; if (!cs.length) out.push({ accountNo, alias, currency: 'TWD', balance: num(body.totalTWBalance) ?? 0, details }); else cs.forEach((c, i) => out.push({ accountNo, alias, currency: c.currency?.trim() || 'TWD', balance: num(c.totalAmount) ?? 0, details: details.filter(d => (d.currency ? d.currency === c.currency : i === 0)) })); }
  }
  return out.filter(x => x.accountNo);
}

// ---- normalisation (connector.ts) ----
const timelineYear = v => { const y = str(v).trim(); if (/^\d{3}$/.test(y)) return String(Number(y) + 1911); if (/^\d{4}$/.test(y)) return y; return String(taipeiNow().getUTCFullYear()); };
const compactMD = v => { const d = str(v).replace(/\D/g, ''); return d.length === 4 ? `${d.slice(0, 2)}/${d.slice(2)}` : v; };
function monthDay(year, md) { const m = str(md).trim().replace(/\./g, '/').match(/^(\d{1,2})\/(\d{1,2})$/); return m ? `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : undefined; }
const REFUND = /退款|退貨|折抵|折讓|回饋|沖銷|貸方|繳款|自動轉帳扣繳|refund|credit|payment/i;

export function parseEsun(s) {
  const used = new Set(), accounts = [], tx = [];
  // credit cards: realtime (pending) and the last year's history, posted rows replacing their pending twins
  const cands = [];
  const addMonths = (payload, feed) => { for (const m of iesc(payload)?.transList ?? []) { const y = timelineYear(m.year); for (const d of m.transDetailList ?? []) {
    const v = num(d.paymentAmount ?? d.transAmount ?? d.amount) ?? 0, signed = d.positiveTrans === false || v < 0 ? -Math.abs(v) : Math.abs(v), store = d.merchantName?.trim() || '玉山信用卡交易';
    const md = d.transTime?.match(/^(\d{1,2}\/\d{1,2})/)?.[1] ?? compactMD(d.transMonthDay), life = feed === 'realtime' ? '未入帳' : d.statusName === '未入帳' || d.statusName === '已入帳' ? d.statusName : d.status === 'N' ? '未入帳' : '已入帳';
    const date = monthDay(y, md ?? compactMD(d.postingMonthDay)), amount = signed < 0 || REFUND.test(store) ? Math.abs(signed) : -Math.abs(signed), card = last4(d.cardNo), cur = d.paymentCurrency || d.currency || d.transCurrency || 'TWD';
    cands.push({ feed, life, date, time: d.transTime?.match(/(\d{1,2}:\d{2})/)?.[1]?.padStart(5, '0') || '', amount, currency: cur, desc: store, card, key: [date, card || 'main', store, Math.round(signed), cur].join(':') });
  } } };
  for (const p of s.history || []) addMonths(p, 'history'); addMonths(s.realtime, 'realtime');
  const start = new Date(); start.setMonth(start.getMonth() - MONTHS); const cutoff = start.toISOString().slice(0, 10);
  const groups = new Map(); for (const c of cands) { if (!c.date || c.date < cutoff) continue; groups.set(c.key, [...(groups.get(c.key) || []), c]); }
  const cardIds = new Set(cands.map(c => c.card).filter(Boolean));
  for (const no of (iesc(s.realtime)?.cardInfoList ?? []).map(c => last4(c.cardNo)).filter(Boolean)) cardIds.add(no);
  // ALL SET's lifecycle rule: in one group (same day, card, store, amount) a posted history row replaces a pending one,
  // and history rows replace realtime rows one for one; only extra realtime rows stay as pending.
  // The n-th purchase of a group keeps the same id when it moves from pending to posted.
  for (const [key, g] of groups) {
    const hist = g.filter(c => c.feed !== 'realtime'), rt = g.filter(c => c.feed === 'realtime');
    const posted = hist.filter(c => c.life === '已入帳'), pend = hist.filter(c => c.life === '未入帳'), other = hist.filter(c => c.life !== '已入帳' && c.life !== '未入帳');
    const H = posted.length && pend.length ? [...posted.map((c, i) => ({ ...c, time: c.time || pend[i]?.time || '' })), ...pend.slice(posted.length), ...other] : hist;
    [...H.map((c, i) => ({ ...c, time: c.time || rt[i]?.time || '' })), ...rt.slice(H.length)].forEach((c, i) => tx.push({ key: `esun-card:${key}:${i + 1}`, acct: 'esun:card', date: c.date, time: c.time, amount: c.amount, currency: c.currency, desc: c.desc, card: c.card, status: c.life === '未入帳' ? 'pending' : undefined }));
  }
  if (s.hasCard) {
    // 玉山 reports one bill and one balance for all of a customer's cards, so they share one account.
    const ov = portalData(s.overview), st = ov?.currentStatement?.find(i => i.currency === 'TWD') ?? ov?.currentStatement?.[0], un = ov?.nextStatement?.find(i => i.currency === 'TWD') ?? ov?.nextStatement?.[0];
    const bill = iesc(s.billSummary)?.billInfo, total = bill?.billTotalInfoList?.[0], amount = num(st?.totalAmountDue ?? total?.billTotalAmount), unposted = num(un?.unpostedAmount) ?? 0, paid = ov?.creditCardFeePaid === true;
    const unpaid = paid ? Math.min(amount ?? 0, 0) : amount ?? 0, bal = Math.round(-(unpaid + unposted) * 100) / 100, flex = v => (v ? isoDate(v) : undefined);
    const pd = str(s.billPeriod).replace(/\D/g, ''), period = pd.length === 6 ? `${pd.slice(0, 4)}-${pd.slice(4)}` : pd.length === 5 ? `${Number(pd.slice(0, 3)) + 1911}-${pd.slice(3)}` : flex(bill?.billDate)?.slice(0, 7);
    used.add('esun:card');
    accounts.push({ id: 'esun:card', name: `玉山信用卡${cardIds.size ? `（末四碼 ${[...cardIds].join('、')}）` : ''}`, type: 'card', currency: st?.currency || total?.billTotalCurrency || 'TWD', balance: bal === 0 ? 0 : bal, ...(period ? { bill: { period, amount, min: num(st?.minimumAmountDue ?? bill?.minimumPaymentInfoList?.[0]?.minimumPaymentAmount), due: flex(ov?.currentStatementPaymentDueDate ?? bill?.paymentDueDate), closing: flex(ov?.nextStatementBillingDate ?? bill?.billDate), paid: paid || undefined } } : {}) });
  }
  // deposits
  for (const [list, foreign] of [[s.tw || [], false], [s.fr || [], true]]) for (const a of list) {
    const id = uniqueId(used, `esun:dep:${last4(a.accountNo) || 'x'}${foreign ? ':' + a.currency : ''}`), l4 = last4(a.accountNo);
    accounts.push({ id, name: a.alias && l4 ? `${a.alias} 末四碼 ${l4}` : `${foreign ? `玉山外幣（${a.currency}）` : '玉山臺幣'} 末四碼 ${l4 || ''}`.trim(), type: 'bank', currency: a.currency, balance: a.balance });
    const occ = new Map();
    for (const d of a.details) {
      const date = isoDate(d.txDate); if (!date || date < cutoff) continue;
      const credit = str(d.debitCredit).toUpperCase() === 'CR', amt = Math.round(Math.abs(num(String(d.amount ?? '0').replace(/^-/, '')) ?? 0)) * (credit ? 1 : -1), desc = str(d.detailTitle).trim() || '玉山銀行交易';
      const key = ['esun-dep', date, str(d.txTime), a.accountNo, a.currency, desc, amt, str(d.balance), str(d.passbookRemark)].join(':'), o = (occ.get(key) ?? 0) + 1; occ.set(key, o);
      tx.push({ key: `${key}:${o}`, acct: id, date, time: str(d.txTime).slice(0, 5), amount: amt, currency: d.currency || a.currency, desc, party: str(d.passbookRemark).trim() || undefined });
    }
  }
  return { accounts, tx };
}

export function createEsun({ log, show = false } = {}) {
  return {
    id: 'esun', name: '玉山銀行',
    async sync(cfg) {
      if (!hasText(cfg.userId) || !hasText(cfg.account) || !hasText(cfg.password)) throw new NeedUserError('請先執行 node cli.mjs setup 儲存玉山身分證字號、使用者名稱與網銀密碼。', 'ESUN_SETUP');
      const exe = findEdge(); if (!exe) throw new NeedUserError('找不到 Edge 或 Chrome。可以設定環境變數 ZXB_BROWSER 指到瀏覽器執行檔。', 'NO_BROWSER');
      let puppeteer; try { puppeteer = (await import('puppeteer-core')).default; } catch { throw new NeedUserError('還沒安裝 puppeteer-core：請在 bank-agent 資料夾執行 npm install。', 'NO_PUPPETEER'); }
      const { DIR } = await import('./secure-store.mjs');
      // A separate, throw-away profile: the user's own Edge windows and sign-ins are never touched.
      const profile = path.join(DIR, 'browser-esun'); fs.rmSync(profile, { recursive: true, force: true });
      const browser = await puppeteer.launch({ executablePath: exe, headless: !show, userDataDir: profile, args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync'] });
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844, isMobile: true });
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/147.0.0.0 Mobile/15E148 Safari/604.1');
        step(log, '開啟網銀'); await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        step(log, '登入'); await loginPage(page, cfg);
        step(log, '讀取信用卡與存款');
        const iescPage = await openIescPage(browser, page);
        const snap = await snapshot({ portal: (p, b, r) => postPortal(page, p, b, r), iesc: (p, b) => postIesc(iescPage, p, b), realtime: () => readRealtime(iescPage) });
        return parseEsun(snap);
      } catch (e) {
        if (e?.needUser || e instanceof BankError) throw e;
        throw new BankError(`玉山網銀頁面和預期的不一樣（${str(e?.name || 'Error')}）。可能是網銀改版，或需要額外驗證；可以加 --show 看畫面。`);
      } finally { await browser.close().catch(() => undefined); fs.rmSync(profile, { recursive: true, force: true }); }
    },
  };
}
