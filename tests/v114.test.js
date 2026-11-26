// 財政部發票 CSV 匯入 tests (V26.114) — sample data is made up.
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const H = '﻿載具自訂名稱,發票日期,發票號碼,發票金額,發票狀態,折讓,賣方統一編號,賣方名稱,賣方地址,買方統編,消費明細_數量,消費明細_單價,消費明細_金額,消費明細_品名\n';
const CSV = H + [
  '手機條碼,20261002,AB00000001,1490,開立已確認,否,11111111,良興股份有限公司,某地址,,1,1490,1490,無線耳機',
  '手機條碼,20261002,AB00000001,-50,開立已確認,否,11111111,良興股份有限公司,某地址,,1,-50,-50,活動優惠',
  '手機條碼,20261002,AB00000001,0,開立已確認,否,11111111,良興股份有限公司,某地址,,1,0,0,贈品',
  '手機條碼,20261002,AB00000001,-15,開立已確認,否,11111111,良興股份有限公司,某地址,,1,-15,-15,商品折扣',
  '全家會員載具,20261107,CD00000002,54,開立已確認,否,22222222,全家便利商店股份有限公司某某分公司,某地址,,1,54,54,全脂鮮乳',
  '手機條碼,20261106,EF00000***,,作廢已確認,否,33333333,富邦媒體科技股份有限公司,某地址,,,,,',
  '手機條碼,20261105,GH00000004,,作廢已確認,否,44444444,某某有限公司,某地址,,,,,',
  '手機條碼,20261105,JK00000005,28,開立已確認,否,55555555,全聯實業股份有限公司某某分公司,某地址,,2,14,28,"燕麥飲, 小"',
  '捐贈或作廢之發票，字軌號碼均會隱末3碼',
  '注意：本功能所下載之雲端發票明細檔案可能因賣方營業人後續作廢或折讓等原因而產生誤差。'].join('\n');
const st = () => ({ accounts: [{ id: 'cash', name: '現金', type: 'cash', balance: 0 }], projects: [], budgets: [], loans: [], recurring: [], transactions: [], categories: [{ id: 'food', name: '飲食', kind: 'expense' }, { id: 'drink', name: '飲料', kind: 'expense', parentId: 'food' }, { id: 'tc', name: '3C', kind: 'expense' }, { id: 'oth', name: '其他', kind: 'expense' }] });
const fresh = () => { const b = bundle(st()); b.run("window.__inv={list:[],win:{}};prefs=()=>({});inboxTouch=()=>{};var __k=0;id=()=>'i'+(++__k)"); return b; };

test('一張發票合成一筆：品項、折扣、作廢與隱碼略過', () => {
  const b = fresh(), p = b.J(`invCsvParse(${JSON.stringify(CSV)})`);
  assert.equal(p.invoices.length, 3); assert.equal(p.voided, 1); assert.equal(p.masked, 1);
  const a = p.invoices[0]; assert.equal(a.no, 'AB00000001'); assert.equal(a.date, '2026-10-02'); assert.equal(a.total, 1425); assert.equal(a.items.length, 4); assert.equal(a.sellerName, '良興股份有限公司');
  assert.deepEqual(p.invoices[2].items[0], ['燕麥飲, 小', 2, 14]);
  assert.equal(b.run(`invCsvParse('a,b\\n1,2').error.length > 0`), true);
});
test('商家短名', () => {
  const b = fresh();
  assert.equal(b.run("invShopName('新加坡商蝦皮娛樂電商有限公司台灣分公司')"), '蝦皮購物');
  assert.equal(b.run("invShopName('全家便利商店股份有限公司新竹新莊分公司')"), '全家');
  assert.equal(b.run("invShopName('日月亭股份有限公司新竹明志書院營業所')"), '日月亭');
});
test('匯入進未歸帳清單，重複匯入不會加兩次', () => {
  const b = fresh(), r = b.J(`invCsvImport(${JSON.stringify(CSV)})`);
  assert.equal(r.added, 3); assert.equal(r.voided, 1); assert.equal(r.latest, '2026-11-07');
  assert.equal(b.run('invDb().list.length'), 3); assert.equal(b.run("invDb().list.find(x=>x.no==='CD00000002').sellerName"), '全家便利商店股份有限公司某某分公司');
  const r2 = b.J(`invCsvImport(${JSON.stringify(CSV)})`); assert.equal(r2.added, 0); assert.equal(r2.dup, 3); assert.equal(b.run('invDb().list.length'), 3);
});
test('猜類別並一次記帳：金額、折扣、備註、連結發票', () => {
  const b = fresh(); b.run(`invCsvImport(${JSON.stringify(CSV)})`);
  assert.equal(b.run("invGuessCat(invDb().list.find(x=>x.no==='AB00000001'))"), 'tc');
  assert.equal(b.run("invGuessCat(invDb().list.find(x=>x.no==='CD00000002'))"), 'drink');
  const l = b.J("invBulkSave([{no:'AB00000001',category:'tc'},{no:'CD00000002',category:'drink'}],'cash')");
  assert.equal(l.length, 2); const t = l[0];
  assert.equal(t.amount, 1425); assert.equal(t.discount, 65); assert.equal(t.name, '無線耳機'); assert.equal(t.merchant, '良興'); assert.equal(t.invoiceNo, 'AB00000001'); assert.ok(t.note.includes('無線耳機'));
  assert.equal(b.run('invDb().list.length'), 1); assert.equal(b.run("state.accounts[0].balance"), -1479);
  const r = b.J(`invCsvImport(${JSON.stringify(CSV)})`); assert.equal(r.linked, 2); assert.equal(r.added, 0);
});
test('可能已手動記過的支出', () => {
  const b = fresh(); b.run(`invCsvImport(${JSON.stringify(CSV)})`); b.run("state.transactions.push({id:'x',kind:'expense',amount:54,date:'2026-11-08',name:'牛奶',account:'cash',category:'drink'})");
  assert.equal(b.run("invMaybeRecorded(invDb().list.find(x=>x.no==='CD00000002')).id"), 'x');
  assert.equal(b.run("invMaybeRecorded(invDb().list.find(x=>x.no==='JK00000005'))"), null);
});
