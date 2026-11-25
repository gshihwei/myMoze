// 信用卡帳戶設定（非工作日、主帳戶、回饋、額度提醒、分組）tests (V26.40). Run: node --test   (from repo root)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function bundle(state) {
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()), apply: () => any(), construct: () => any(), set: () => true });
  const document = new Proxy({}, { get: (t, k) => (k === 'getElementById' ? () => null : k === 'querySelectorAll' ? () => [] : any()) });
  const ctx = vm.createContext({ document, window: { MozeApp: {} }, navigator: {}, localStorage: any(), indexedDB: any(), alert() {}, confirm: () => true,
    console: { ...console, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {},
    Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, Object, crypto: { randomUUID: () => 'id' } });
  try { vm.runInContext(fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8'), ctx, { filename: 'app.bundle.js' }); } catch { /* UI bootstrap */ }
  vm.runInContext(`state=${JSON.stringify(state)}`, ctx);
  return { ctx, run: c => vm.runInContext(c, ctx), J: c => JSON.parse(vm.runInContext(`JSON.stringify(${c})`, ctx)) };
}
const card = (o = {}) => ({ id: 'c1', name: '卡', type: 'card', balance: -1000, limit: 10000, statement: 15, due: 5, ...o });
const mk = accounts => ({ accounts, categories: [], projects: [], loans: [], budgets: [], recurring: [], transactions: [] });

test('cardAdjustDate：週六日依設定順延／提前／維持，平日不動', () => {
  const { J } = bundle(mk([]));
  // 2026-11-14 週六、11-15 週日、11-16 週一
  assert.equal(J(`cardAdjustDate({}, new Date(2026, 10, 14), 'next').getDate()`), 16);
  assert.equal(J(`cardAdjustDate({}, new Date(2026, 10, 15), 'next').getDate()`), 16);
  assert.equal(J(`cardAdjustDate({}, new Date(2026, 10, 14), 'prev').getDate()`), 13);
  assert.equal(J(`cardAdjustDate({}, new Date(2026, 10, 15), 'prev').getDate()`), 13);
  assert.equal(J(`cardAdjustDate({}, new Date(2026, 10, 15), 'keep').getDate()`), 15);
  assert.equal(J(`cardAdjustDate({}, new Date(2026, 10, 17), 'next').getDate()`), 17);
});

test('帳單週期：預設行為不變；結帳日遇週日順延時，週期與下一期銜接不重疊', () => {
  const plain = card(), shifted = card({ stmtWeekend: 'next' });
  const { J } = bundle(mk([plain, shifted]));
  assert.deepEqual(J(`(({start,end}) => ({start,end}))(cardPeriod(state.accounts[0], new Date(2026, 10, 20), 0))`), { start: '2026-10-16', end: '2026-11-15' });
  // 2026-11-15 是週日 → 順延到 11-16；10-15 是週四
  assert.deepEqual(J(`(({start,end}) => ({start,end}))(cardPeriod(state.accounts[1], new Date(2026, 10, 20), 0))`), { start: '2026-10-16', end: '2026-11-16' });
  assert.deepEqual(J(`(({start,end}) => ({start,end}))(cardPeriod(state.accounts[1], new Date(2026, 11, 20), 0))`), { start: '2026-11-17', end: '2026-12-15' });
  // 結帳日當天（順延後的 11-16）仍屬上一期未結束：11-16 當天看到的是前一個已結期間
  assert.equal(J(`cardPeriod(state.accounts[1], new Date(2026, 10, 16), 0).end`), '2026-10-15');
});

test('繳款日遇非工作日：順延到下週一', () => {
  const { J } = bundle(mk([card({ due: 5, dueWeekend: 'next' }), card({ id: 'c2', due: 5 })]));
  // 結帳 2026-11-15（週日）→ 繳款 12/5 為週六 → 12/7
  const p = { start: '2026-10-16', end: '2026-11-15' };
  assert.equal(J(`isoDate(cardStatementDueDate(state.accounts[0], ${JSON.stringify(p)}))`), '2026-12-07');
  assert.equal(J(`isoDate(cardStatementDueDate(state.accounts[1], ${JSON.stringify(p)}))`), '2026-12-05');
});

test('帳戶表單：卡片欄位存取、無效值清除、離開信用卡時清掉全部卡片欄位', () => {
  const { J, run } = bundle(mk([card({ id: 'c1', name: 'X' }), { id: 'bank1', name: '主銀行', type: 'bank', balance: 0 }]));
  const form = new Map([['aname', 'X'], ['acur', 'TWD'], ['atype', 'card'], ['alimit', '50000'], ['astatement', '10'], ['adue', '25'], ['astmtwk', 'next'], ['aduewk', 'prev'],
    ['apayfrom', 'bank1'], ['areward', '1.5'], ['afxfee', '1.5'], ['alowavail', '8000'], ['aoffset', 'on']]);
  const a = J(`acctFromEditForm(new Map(${JSON.stringify([...form])}), state.accounts[0]).account`);
  assert.equal(a.stmtWeekend, 'next'); assert.equal(a.dueWeekend, 'prev'); assert.equal(a.payFrom, 'bank1');
  assert.equal(a.rewardPct, 1.5); assert.equal(a.fxFeePct, 1.5); assert.equal(a.lowAvail, 8000); assert.equal(a.offsetBill, true);
  const bad = J(`acctFromEditForm(new Map([['aname','X'],['acur','TWD'],['atype','card'],['astmtwk','hack'],['apayfrom','nope'],['areward','-3'],['alowavail','']]), state.accounts[0]).account`);
  assert.equal(bad.stmtWeekend, undefined); assert.equal(bad.payFrom, undefined); assert.equal(bad.rewardPct, undefined); assert.equal(bad.lowAvail, undefined);
  run(`Object.assign(state.accounts[0], { rewardPct: 2, payFrom: 'bank1', lowAvail: 5, stmtWeekend: 'next' })`);
  const out = J(`acctFromEditForm(new Map([['aname','X'],['acur','TWD'],['atype','bank']]), state.accounts[0]).account`);
  for (const k of ['limit', 'statement', 'due', 'rewardPct', 'payFrom', 'lowAvail', 'stmtWeekend', 'offsetBill']) assert.equal(out[k], undefined, k);
});

test('可用額度不足提醒：低於門檻才提醒，未設定／封存／非信用卡不提醒', () => {
  const { J } = bundle(mk([card({ balance: -9000, lowAvail: 2000 }), card({ id: 'c2', name: '另一張', balance: -1000, lowAvail: 2000 })]));
  assert.equal(J(`creditLowAvailHit({type:'card',limit:10000,balance:-9000,lowAvail:2000})`), true);
  assert.equal(J(`creditLowAvailHit({type:'card',limit:10000,balance:-8000,lowAvail:2000})`), false);
  assert.equal(J(`creditLowAvailHit({type:'card',limit:10000,balance:-9900})`), false);
  assert.equal(J(`creditLowAvailHit({type:'card',limit:10000,balance:-9900,lowAvail:2000,archived:true})`), false);
  assert.equal(J(`creditLowAvailHit({type:'bank',limit:10000,balance:-9900,lowAvail:2000})`), false);
  const l = J(`reminderList('2026-11-20T09:00:00', 3).filter(x => x.type === 'low')`);
  assert.equal(l.length, 1); assert.match(l[0].title, /可用額度不足/); assert.equal(l[0].amount, 1000);
});

test('紅利回饋與帳單折抵、國外手續費估算只顯示、不改餘額', () => {
  const { J } = bundle(mk([card({ rewardPct: 1, offsetBill: true, balance: -5000 })]));
  const h = J(`creditRewardHTML(state.accounts[0], 5000, 5000)`);
  assert.match(h, /預估回饋/); assert.match(h, /折抵後建議繳款/);
  assert.equal(J(`creditRewardHTML({type:'card'}, 5000, 5000)`), '');
  assert.match(J(`creditRewardHTML({type:'card',currency:'USD',fxFeePct:1.5}, 1000, 1000)`), /國外手續費/);
  assert.equal(J(`state.accounts[0].balance`), -5000);
});

test('帳戶頁分組：依類型分組、可摺疊、顯示數量', () => {
  const { J, run } = bundle(mk([card(), { id: 'b', name: '銀行', type: 'bank', balance: 1 }, { id: 'e', name: '街口', type: 'ewallet', balance: 2 }]));
  run(`prefs = () => ({ acctCollapsed: ['bank'] })`);
  const h = J(`acctGroupsHTML([state.accounts[0]], ['<i>卡</i>'], [state.accounts[1], state.accounts[2]], ['<i>銀</i>', '<i>街</i>'])`);
  assert.match(h, /信用卡 \(1\)/); assert.match(h, /銀行 \(1\)/); assert.match(h, /電子支付 \(1\)/);
  assert.match(h, /data-acct-group="bank" aria-expanded="false"/);
  assert.ok(!h.includes('<i>銀</i>')); assert.ok(h.includes('<i>街</i>')); assert.ok(h.includes('<i>卡</i>'));
});

test('編輯帳戶頂部顯示餘額與帳單週期；信用卡欄位區塊在信用卡時可見', () => {
  const { J } = bundle(mk([card(), { id: 'b', name: '銀行', type: 'bank', balance: 123 }]));
  const c = J('acctEditFormHTML(state.accounts[0])'), b = J('acctEditFormHTML(state.accounts[1])');
  assert.match(c, /acct-edit-top/); assert.match(c, /帳單週期/); assert.match(c, /name="astmtwk"/); assert.match(c, /name="apayfrom"/);
  assert.match(c, /data-acct-card-fields\s*>/); assert.match(b, /data-acct-card-fields hidden/); assert.ok(!b.includes('帳單週期'));
});

test('新增信用卡：表單含完整卡片欄位，acctCardSettingsFromForm 只保留有效設定', () => {
  const { J } = bundle(mk([{ id: 'bank1', name: '主銀行', type: 'bank', balance: 0 }]));
  assert.match(J('acctCardFieldsHTML({ limit: 50000 }, true)'), /name="apayfrom"/);
  const o = J(`acctCardSettingsFromForm(new Map([['alimit','80000'],['astatement','20'],['adue','8'],['apayfrom','bank1'],['areward','1'],['aoffset','on'],['astmtwk','next']]))`);
  assert.deepEqual(o, { limit: 80000, statement: 20, due: 8, stmtWeekend: 'next', payFrom: 'bank1', rewardPct: 1, offsetBill: true });
  assert.deepEqual(J(`acctCardSettingsFromForm(new Map([]))`), { limit: 0, statement: 15, due: 5 });
});

test('群組標題顯示加總；信用卡依「所屬銀行」分組，可收合並顯示張數與已使用合計', () => {
  const cards = [card({ id: 'c1', name: 'OP', bank: '富邦', balance: -100 }), card({ id: 'c2', name: 'JP', bank: '富邦', balance: -250 }), card({ id: 'c3', name: '單張', balance: -40 })];
  const { J, run } = bundle(mk([...cards, { id: 'b', name: '銀行', type: 'bank', balance: 1000 }, { id: 'u', name: '美金', type: 'bank', balance: 10, currency: 'ZZZ' }]));
  assert.equal(J('acctGroupTotal([state.accounts[3], state.accounts[4]])'), 1000);
  assert.equal(J('acctGroupTotal(state.accounts.slice(0, 3))'), -390);
  assert.equal(J('acctSignedMoney(-5)').startsWith('−'), true);
  const order = J('acctCardBanks(state.accounts.slice(0, 3))');
  assert.deepEqual(order, [{ bank: '富邦', idx: [0, 1] }, { bank: '', idx: [2] }]);
  run(`prefs = () => ({})`);
  const open = J(`acctGroupsHTML(state.accounts.slice(0, 3), ['<i>1</i>', '<i>2</i>', '<i>3</i>'], [state.accounts[3]], ['<i>b</i>'])`);
  assert.match(open, /2 張信用卡/); assert.match(open, /bank-children/); assert.match(open, /−\$390|−\$?390/); assert.ok(open.includes('<i>1</i><i>2</i>')); assert.ok(open.includes('<i>3</i>'));
  run(`prefs = () => ({ bankCollapsed: ['富邦'] })`);
  const shut = J(`acctGroupsHTML(state.accounts.slice(0, 3), ['<i>1</i>', '<i>2</i>', '<i>3</i>'], [], [])`);
  assert.ok(!shut.includes('<i>1</i>')); assert.ok(shut.includes('<i>3</i>')); assert.match(shut, /data-bank-toggle="富邦" aria-expanded="false"/);
});

test('所屬銀行欄位：存取、去空白、離開信用卡時清除', () => {
  const { J, run } = bundle(mk([card({ id: 'c1', name: 'X', bank: '舊銀行' })]));
  assert.equal(J(`acctCardSettingsFromForm(new Map([['abank','  玉山  ']])).bank`), '玉山');
  assert.equal(run(`acctCardSettingsFromForm(new Map([['abank','']])).bank`), undefined);
  const h = J('acctEditFormHTML(state.accounts[0])');
  assert.match(h, /<select name="abank">/); assert.match(h, /<option value="舊銀行" selected>/);
  assert.equal(run(`acctFromEditForm(new Map([['aname','X'],['acur','TWD'],['atype','bank']]), state.accounts[0]).account.bank`), undefined);
});

test('所屬銀行下拉：列出銀行類型帳戶，保留目前值，其他類型不列入', () => {
  const { J } = bundle(mk([card({ id: 'c1', bank: '玉山' }), { id: 'b1', name: '富邦', type: 'bank', balance: 0 }, { id: 'b2', name: '玉山', type: 'bank', balance: 0 }, { id: 'b3', name: '富邦', type: 'bank', balance: 0 },
    { id: 'w', name: '錢包', type: 'cash', balance: 0 }, { id: 'k', name: '券商', type: 'broker', balance: 0 }]));
  assert.deepEqual(J(`acctBankNames('')`), ['富邦', '玉山']);
  assert.deepEqual(J(`acctBankNames('已刪除銀行')`), ['富邦', '玉山', '已刪除銀行']);
  const o = J(`acctBankOptions('玉山')`);
  assert.match(o, /<option value="玉山" selected>/); assert.ok(!o.includes('錢包')); assert.ok(!o.includes('券商'));
});

test('外幣類型：依所屬銀行分組（含 TWD 加總與收合），沒填銀行的單獨一列；改類型會保留／清除銀行', () => {
  const fx = (id, name, bank, balance, cur) => ({ id, name, type: 'foreign', balance, currency: cur, ...(bank ? { bank } : {}) });
  const accounts = [fx('f1', '日幣', '玉山', 100, 'TWD'), fx('f2', '英鎊', '玉山', 50, 'TWD'), fx('f3', '美金', '', 30, 'TWD'), { id: 'b', name: '玉山', type: 'bank', balance: 1 }];
  const { J, run } = bundle(mk(accounts));
  assert.equal(J(`acctTypeLabel({type:'foreign'})`), '外幣');
  run(`prefs = () => ({})`);
  const normal = '[state.accounts[0], state.accounts[1], state.accounts[2], state.accounts[3]]', tiles = `['<i>日</i>', '<i>英</i>', '<i>美</i>', '<i>行</i>']`;
  const h = J(`acctGroupsHTML([], [], ${normal}, ${tiles})`);
  assert.match(h, /外幣 \(3\)/); assert.match(h, /2 個外幣帳戶/); assert.match(h, /data-bank-toggle="foreign:玉山"/);
  assert.ok(h.includes('<i>日</i><i>英</i>')); assert.ok(h.includes('<i>美</i>'));
  run(`prefs = () => ({ bankCollapsed: ['foreign:玉山'] })`);
  const shut = J(`acctGroupsHTML([], [], ${normal}, ${tiles})`);
  assert.ok(!shut.includes('<i>日</i>')); assert.ok(shut.includes('<i>美</i>'));
  // 表單：外幣顯示所屬銀行欄位；一般銀行帳戶隱藏；改類型保留外幣的銀行，離開外幣就清掉
  assert.match(J('acctEditFormHTML(state.accounts[0])'), /data-acct-bank-field\s*>/);
  assert.match(J('acctEditFormHTML(state.accounts[3])'), /data-acct-bank-field hidden/);
  assert.equal(J(`acctFromEditForm(new Map([['aname','日幣'],['acur','TWD'],['atype','foreign'],['abank','玉山']]), state.accounts[0]).account.bank`), '玉山');
  assert.equal(run(`acctFromEditForm(new Map([['aname','日幣'],['acur','TWD'],['atype','bank'],['abank','玉山']]), state.accounts[0]).account.bank`), undefined);
  assert.deepEqual(J(`acctBankFromForm(new Map([['abank',' 富邦 ']]))`), { bank: '富邦' });
  assert.deepEqual(J(`acctBankFromForm(new Map([]))`), {});
});

test('自動依幣別歸組：非 TWD 的帳戶（任何類型）歸到外幣組，信用卡不受影響；可設所屬銀行', () => {
  const accounts = [{ id: 'a', name: '日幣', type: 'bank', balance: 100, currency: 'JPY', bank: '玉山' }, { id: 'b', name: '台幣戶', type: 'bank', balance: 5 },
    { id: 'c', name: '美金現金', type: 'cash', balance: 3, currency: 'USD' }, { id: 'd', name: '外幣卡', type: 'card', balance: -10, currency: 'USD', limit: 1000 }, { id: 'e', name: '手動外幣', type: 'foreign', balance: 1 }];
  const { J, run } = bundle(mk(accounts));
  assert.deepEqual(J('state.accounts.map(acctGroupKey)'), ['foreign', 'bank', 'foreign', 'card', 'foreign']);
  assert.equal(J('acctUsesBank(state.accounts[0])'), true); assert.equal(J('acctUsesBank(state.accounts[1])'), false); assert.equal(J('acctUsesBank(state.accounts[3])'), true);
  run(`prefs = () => ({})`);
  const normal = '[state.accounts[0], state.accounts[1], state.accounts[2], state.accounts[4]]';
  const h = J(`acctGroupsHTML([state.accounts[3]], ['<i>卡</i>'], ${normal}, ['<i>日</i>', '<i>台</i>', '<i>美</i>', '<i>外</i>'])`);
  assert.match(h, /外幣 \(3\)/); assert.match(h, /銀行 \(1\)/); assert.ok(h.includes('<i>日</i>')); assert.ok(h.includes('<i>卡</i>'));
  // 表單：外幣幣別的銀行帳戶顯示所屬銀行欄位並可儲存；改回 TWD 就清除
  assert.match(J('acctEditFormHTML(state.accounts[0])'), /data-acct-bank-field\s*>/);
  assert.match(J('acctEditFormHTML(state.accounts[1])'), /data-acct-bank-field hidden/);
  assert.equal(J(`acctFromEditForm(new Map([['aname','日幣'],['acur','JPY'],['atype','bank'],['abank','富邦']]), state.accounts[0]).account.bank`), '富邦');
  run(`state.accounts[1].bank = '舊'`);
  assert.equal(run(`acctFromEditForm(new Map([['aname','台幣戶'],['acur','TWD'],['atype','bank'],['abank','舊']]), state.accounts[1]).account.bank`), undefined);
});
