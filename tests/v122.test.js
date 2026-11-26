// 財政部下載範圍與登出提醒 (V26.122) tests — the MOF service is mocked.
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const base = () => ({ accounts: [{ id: 'a', name: '現金', balance: 0 }], projects: [], budgets: [], loans: [], recurring: [], categories: [], transactions: [] });

test('回查期別：照財政部網站的例子（10 月可查 3–10 月），跨年也正確', () => {
  const b = bundle(base());
  assert.deepEqual(b.J('einvPeriods(new Date(2026,9,15),4).map(p=>[p.startDate,p.endDate])'), [['2026/09/01', '2026/10/15'], ['2026/07/01', '2026/08/31'], ['2026/05/01', '2026/06/30'], ['2026/03/01', '2026/04/30']]);
  assert.deepEqual(b.J('einvPeriods(new Date(2027,0,5),3).map(p=>p.label)'), ['2027 年 1–2 月', '2026 年 11–12 月', '2026 年 9–10 月']);
  assert.equal(b.J('einvPeriods(new Date(2026,10,26)).length'), 2);
  // 財政部保留：雙月 4 期、單月 5 期；舊設定（4/6/12/18）都當成「全部」
  const nov = 'new Date(2026,10,26)', oct = 'new Date(2026,9,15)';
  assert.deepEqual(b.J(`[einvBack(null,${nov}),einvBack({back:0},${oct}),einvBack({back:18},${nov}),einvBack({back:"2"},${nov})]`), [5, 4, 5, 2]);
  assert.deepEqual(b.J(`einvPeriods(${nov},einvBack(null,${nov})).map(p=>p.startDate)`), ['2026/11/01', '2026/09/01', '2026/07/01', '2026/05/01', '2026/03/01']);
});

function dlBundle(failFrom, emptyBefore) {
  const b = bundle(base());
  b.run(`window.__inv={list:[],win:{}};var __P={};prefs=()=>__P;inboxTouch=()=>{};invStore=()=>{};renderInvoices=()=>{};einvLs=()=>null;var __logins=0;
    einvSession=async()=>{__logins++;return{loginSsMe:'K'}};var __asked=[];
    window.MozeSync={invoke:async(n,body)=>{if(body.action==='headers'){if(body.page===1)__asked.push(body.startDate);
      if(${failFrom ? `body.startDate<'${failFrom}'` : 'false'})return{data:{error:'查無資料'}};
      return{data:{invoices:body.page===1${emptyBefore ? `&&body.startDate>='${emptyBefore}'` : ''}?[{no:'AB'+body.startDate.replace(/\\D/g,'').slice(0,6)+'01',date:body.startDate.replace(/\\//g,'-'),api:body.startDate,total:10}]:[]}}}
      return{data:{items:[['品項',1,10]]}}}}`);
  return b;
}
test('手動下載依設定回查；較早的期別失敗就停在能查到的最早一期', async () => {
  const b = dlBundle('2026/05/01');
  const r = await b.run('einvDownload({back:6})'); // today 2026-11-26: 11–12, 9–10, 7–8, 5–6 work; 3–4 fails
  assert.equal(r.added, 4); assert.equal(r.stopped, true); assert.match(r.oldest, /5–6 月/);
  assert.equal(b.run('__logins'), 2, '只重新登入一次');
  assert.match(b.run('einvResultText(' + JSON.stringify(r) + ')'), /最早到 2026 年 5–6 月.*更早的期別查詢失敗/);
});
test('太舊的期別回傳空清單：訊息寫出真正有發票的最早一期', async () => {
  const b = dlBundle('', '2026/03/01'), r = await b.run('einvDownload({back:18})');
  assert.equal(r.added, 5); assert.equal(r.stopped, false); assert.equal(r.oldest, '2026 年 3–4 月');
  assert.match(b.run('einvResultText(' + JSON.stringify(r) + ')'), /^最早到 2026 年 3–4 月，新增 5 張/);
  assert.match(b.run('einvResultText({added:0})'), /^財政部沒有發票/);
});
test('本期或上一期失敗仍視為錯誤；不限制時全部查完', async () => {
  await assert.rejects(dlBundle('2099/01/01').run('einvDownload({back:4})'), /查無資料/);
  const b = dlBundle(''), r = await b.run('einvDownload({back:12})');
  assert.equal(r.stopped, false); assert.equal(b.J('__asked').length, 12); assert.equal(r.added, 12);
});
test('每天自動下載只查兩期，手動依設定', async () => {
  const b = bundle(base());
  b.run(`var __back=[];einvDownload=async o=>{__back.push(o.back);return{added:0}};var __c={back:0};einvCred=()=>__c;toast=()=>{}`);
  await b.run('einvRun(true)'); await b.run('einvRun(false)'); b.run('__c={back:2}'); await b.run('einvRun(false)');
  const v = b.J('__back'); assert.equal(v[0], 2); assert.ok(v[1] === 4 || v[1] === 5); assert.equal(v[2], 2);
});
test('設定頁提醒會登出手機 App，並可選範圍', () => {
  const b = bundle(base());
  b.run(`einvCred=()=>({mobile:'0912345678',carrier:'/ABC1234',back:6});var __el={style:{},hidden:true,innerHTML:''};sheetEl=()=>__el;sheetHead=t=>t`);
  b.run('einvOpenSetup()'); const h = b.run('__el.innerHTML');
  assert.match(h, /einv-warn[^>]*>[^<]*App 會被登出/);
  assert.match(h, /<option value="0" selected>財政部保留的全部（最近 4–5 期）/);
  assert.match(h, /<option value="2">本期與上一期/); assert.match(h, /只保留最近 4–5 期/);
});
