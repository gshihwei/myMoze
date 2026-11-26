// 財政部下載範圍與登出提醒 (V26.122) tests — the MOF service is mocked.
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const base = () => ({ accounts: [{ id: 'a', name: '現金', balance: 0 }], projects: [], budgets: [], loans: [], recurring: [], categories: [], transactions: [] });

test('回查期別：照財政部網站的例子（10 月可查 3–10 月），跨年也正確', () => {
  const b = bundle(base());
  assert.deepEqual(b.J('einvPeriods(new Date(2026,9,15),4).map(p=>[p.startDate,p.endDate])'), [['2026/09/01', '2026/10/15'], ['2026/07/01', '2026/08/31'], ['2026/05/01', '2026/06/30'], ['2026/03/01', '2026/04/30']]);
  assert.deepEqual(b.J('einvPeriods(new Date(2027,0,5),3).map(p=>p.label)'), ['2027 年 1–2 月', '2026 年 11–12 月', '2026 年 9–10 月']);
  assert.equal(b.J('einvPeriods(new Date(2026,10,26)).length'), 2);
  assert.deepEqual(b.J('[einvBack(null),einvBack({back:12}),einvBack({back:7}),einvBack({back:"18"})]'), [4, 12, 4, 18]);
});

function dlBundle(failFrom) {
  const b = bundle(base());
  b.run(`window.__inv={list:[],win:{}};var __P={};prefs=()=>__P;inboxTouch=()=>{};invStore=()=>{};renderInvoices=()=>{};einvLs=()=>null;var __logins=0;
    einvSession=async()=>{__logins++;return{loginSsMe:'K'}};var __asked=[];
    window.MozeSync={invoke:async(n,body)=>{if(body.action==='headers'){if(body.page===1)__asked.push(body.startDate);
      if(${failFrom ? `body.startDate<'${failFrom}'` : 'false'})return{data:{error:'查無資料'}};
      return{data:{invoices:body.page===1?[{no:'AB'+body.startDate.replace(/\\D/g,'').slice(0,6)+'01',date:body.startDate.replace(/\\//g,'-'),api:body.startDate,total:10}]:[]}}}
      return{data:{items:[['品項',1,10]]}}}}`);
  return b;
}
test('手動下載依設定回查；較早的期別失敗就停在能查到的最早一期', async () => {
  const b = dlBundle('2026/05/01');
  const r = await b.run('einvDownload({back:6})'); // today 2026-11-26: 11–12, 9–10, 7–8, 5–6 work; 3–4 fails
  assert.equal(r.added, 4); assert.equal(r.stopped, true); assert.match(r.oldest, /5–6 月/);
  assert.equal(b.run('__logins'), 2, '只重新登入一次');
  assert.match(b.run('einvResultText(' + JSON.stringify(r) + ')'), /更早的期別財政部沒有提供/);
});
test('本期或上一期失敗仍視為錯誤；不限制時全部查完', async () => {
  await assert.rejects(dlBundle('2099/01/01').run('einvDownload({back:4})'), /查無資料/);
  const b = dlBundle(''), r = await b.run('einvDownload({back:12})');
  assert.equal(r.stopped, false); assert.equal(b.J('__asked').length, 12); assert.equal(r.added, 12);
});
test('每天自動下載只查兩期，手動依設定', async () => {
  const b = bundle(base());
  b.run(`var __back=[];einvDownload=async o=>{__back.push(o.back);return{added:0}};einvCred=()=>({back:12});toast=()=>{}`);
  await b.run('einvRun(true)'); await b.run('einvRun(false)');
  assert.deepEqual(b.J('__back'), [2, 12]);
});
test('設定頁提醒會登出手機 App，並可選範圍', () => {
  const b = bundle(base());
  b.run(`einvCred=()=>({mobile:'0912345678',carrier:'/ABC1234',back:6});var __el={style:{},hidden:true,innerHTML:''};sheetEl=()=>__el;sheetHead=t=>t`);
  b.run('einvOpenSetup()'); const h = b.run('__el.innerHTML');
  assert.match(h, /einv-warn[^>]*>[^<]*App 會被登出/);
  assert.match(h, /<option value="6" selected>最近 6 期/);
  assert.match(h, /<option value="4">最近 4 期（約 8 個月，同財政部網站）/);
});
