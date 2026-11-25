// 通知草稿與一句話記帳 tests (V26.95)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = () => ({ accounts: [{ id: 'a', name: '玉山', type: 'bank', balance: 0 }, { id: 'c', name: '台新飛狗', type: 'card', balance: 0, note: '末四碼 1234' }, { id: 'w', name: '錢包', type: 'cash', balance: 0 }], categories: [{ id: 'f', name: '飲食', kind: 'expense' }, { id: 'l', name: '午餐', kind: 'expense', parentId: 'f' }, { id: 't', name: '交通', kind: 'expense' }, { id: 's', name: '薪水', kind: 'income' }], projects: [], budgets: [], loans: [], recurring: [], transactions: [{ id: 1, kind: 'expense', name: '拿鐵', category: 'f', account: 'c', merchant: '星巴克', amount: 130, date: '2026-11-01', tags: [] }] });
const mk = () => { const b = bundle(st()); b.run('window.__drafts={list:[],recent:[],rules:{},accts:{},seq:0}'); return b; };
const N = 'new Date(2026,10,25,12,0)';
const P = (b, s) => b.J(`draftParse(${JSON.stringify(s)},${N})`);
test('解析常見通知', () => {
  const b = mk(); let d = P(b, '您的信用卡於 11/07 18:40 消費 TWD 1,280.00 於 麥當勞(台北南京店)'); assert.deepEqual([d.amount, d.cur, d.date, d.time, d.kind, d.status], [1280, 'TWD', '2026-11-07', '18:40', 'expense', '未記帳']);
  d = P(b, 'LINE Pay 付款 NT$ 880 付款完成。 商店名稱: Coupang'); assert.deepEqual([d.amount, d.key], [880, 'Coupang']); d = P(b, '您的現金回饋卡末四碼 1234 於 11/07 19:36 在 UBER 消費 NT$86'); assert.deepEqual([d.amount, d.acctText, d.key], [86, '1234', 'UBER']);
  d = P(b, '帳戶存入 2,500 元，餘額 NT$30,000'); assert.deepEqual([d.amount, d.kind, d.dir], [2500, 'income', 'in']); assert.equal(P(b, '餘額 NT$30,000').status, '無金額'); assert.equal(P(b, '12 月帳單繳款提醒 應繳金額 NT$5,000').status, '非交易'); const o = P(b, '您的驗證碼為 123456，刷卡 NT$500'); assert.equal(o.status, '非交易'); assert.ok(!o.text.includes('123456'));
  assert.equal(P(b, '刷卡 USD 12.5 於 Apple').cur, 'USD'); assert.equal(P(b, '12/31 消費 100 元').date, '2025-12-31');
});
test('草稿：帶入帳戶、學習規則、重複偵測', () => {
  const b = mk(); b.run(`var d=draftAdd('卡末四碼 1234 在 UBER 消費 NT$86',${N})`); assert.equal(b.run('draftFill(d).account'), 'c'); b.run("draftLearn(d,{kind:'expense',category:'t',account:'c',merchant:'Uber',project:''})"); b.run(`var e=draftAdd('卡末四碼 1234 在 UBER 消費 NT$120',${N})`); assert.deepEqual(b.J('[draftFill(e).category,draftFill(e).merchant]'), ['t', 'Uber']);
  assert.ok(b.J(`draftAdd('卡末四碼 1234 在 UBER 消費 NT$120',${N})`).error); assert.equal(b.run('draftDb().list.length'), 2); b.run("draftDone(d.id,'已記帳')"); assert.equal(b.run('draftDb().list.length'), 1);
});
test('兩則合成轉帳', () => { const b = mk(); b.run(`var o=draftAdd('玉山 轉出 1,015 元',${N}),i=draftAdd('錢包 轉入 1,000 元',${N})`); const t = b.J('draftTransfer(i,o).tx'); assert.deepEqual([t.account, t.toAccount, t.amount, t.fee], ['a', 'w', 1000, 15]); });
test('一句話：支出、收入、轉帳、借款、中文數字', () => {
  const b = mk(); b.run("catMemory=()=>null"); const S = s => b.J(`sayParse(${JSON.stringify(s)},${N})`);
  let r = S('昨天在全家買午餐 120 元 用玉山'); assert.deepEqual([r.amount, r.date, r.account, r.category, r.merchant], [120, '2026-11-24', 'a', 'l', '全家']); r = S('拿鐵 130'); assert.deepEqual([r.category, r.account, r.name], ['f', 'c', '拿鐵']);
  assert.deepEqual([S('收到薪水四萬五').kind, S('收到薪水四萬五').amount], ['income', 45000]); r = S('從玉山提款三千'); assert.deepEqual([r.kind, r.account, r.toAccount, r.amount], ['transfer', 'a', 'w', 3000]); r = S('跟小明借 500'); assert.deepEqual([r.tab, r.person], ['payable', '小明']); r = S('幫小華付 200 元'); assert.deepEqual([r.tab, r.person], ['receivable', '小華']); assert.equal(S('11月3日 搭車 60').date, '2026-11-03'); assert.equal(S('11月3日 搭車 60').amount, 60);
  assert.equal(b.run("zhNumber('一千二百')"), 1200); assert.equal(b.run("zhNumber('三百五')"), 350); assert.deepEqual(b.J("saySplit('午餐 120、飲料 50')"), ['午餐 120', '飲料 50']); assert.equal(b.J("saySplit('午餐、飲料 50')").length, 1);
});
