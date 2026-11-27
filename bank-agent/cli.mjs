#!/usr/bin/env node
// 帳小簿銀行同步 — runs on your own Windows computer. Logs in to your banks, reads the last three months of
// transactions and balances, and writes them into your own 帳小簿 cloud data, where the app's 「銀行同步」 page shows them.
//
//   node cli.mjs setup               sign in to 帳小簿 cloud, then add banks (guided)
//   node cli.mjs login               sign in to 帳小簿 cloud only
//   node cli.mjs add esun|ctbc       save or update one bank's login
//   node cli.mjs remove esun|ctbc    forget one bank's login
//   node cli.mjs sync [bank] [--auto] [--show]   sync now (--auto: no questions, for the schedule; --show: show the browser)
//   node cli.mjs schedule [07:30 ...]  sync every day at these times (Windows Task Scheduler)
//   node cli.mjs unschedule          remove the daily task
//   node cli.mjs status              what is set up and how the last syncs went
//
// Passwords are kept only on this computer, encrypted with Windows (DPAPI, your Windows account).
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ask, askHidden, say } from './lib/prompt.mjs';
import { DIR, loadSecrets, saveSecrets } from './lib/secure-store.mjs';
import { readSyncConfig, Supa } from './lib/supa.mjs';
import { buildFeed, feedId } from './lib/feed.mjs';
import { createCtbc } from './lib/ctbc.mjs';
import { createEsun } from './lib/esun.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..');
const BANKS = { esun: { name: '玉山銀行', fields: [['userId', '身分證字號'], ['account', '使用者名稱'], ['password', '網銀密碼']] }, ctbc: { name: '中國信託', fields: [['userId', '身分證字號'], ['account', '使用者代號'], ['password', '網銀密碼']] } };
const TASK = '帳小簿銀行同步';
// Error codes that mean the bank refused the user id or password.
const LOGIN_REJECTED = new Set(['CTBC_LOGIN_FAILED', 'ESUN_LOGIN', 'ESUN_FORM']);
const HELP = `帳小簿銀行同步：在這台電腦登入銀行，把最近三個月的明細和餘額寫進你的帳小簿雲端。

  node cli.mjs setup                    第一次使用：登入帳小簿雲端，再設定銀行
  node cli.mjs login                    重新登入帳小簿雲端
  node cli.mjs add esun | ctbc          新增或更新玉山（esun）／中信（ctbc）的登入資料
  node cli.mjs remove esun | ctbc       刪除某家銀行的登入資料
  node cli.mjs sync [esun|ctbc]         現在同步（加 --show 會顯示瀏覽器畫面）
  node cli.mjs schedule [07:30 19:30]   每天固定時間自動同步
  node cli.mjs unschedule               取消每天自動同步
  node cli.mjs status                   查看設定和最近同步的結果

銀行密碼只用 Windows 加密存在這台電腦（${DIR}），不會上傳。`;
const LOG = () => path.join(DIR, 'sync.log'), STATUS = () => path.join(DIR, 'status.json'), LOCK = () => path.join(DIR, 'sync.lock');

function log(line) {
  const s = `${new Date().toISOString()} ${line}`; say(line);
  try { fs.mkdirSync(DIR, { recursive: true }); const old = fs.existsSync(LOG()) ? fs.readFileSync(LOG(), 'utf8').split('\n').filter(Boolean).slice(-300) : []; fs.writeFileSync(LOG(), [...old, s].join('\n') + '\n'); } catch { /* logging must not break a sync */ }
}
const readStatus = () => { try { return JSON.parse(fs.readFileSync(STATUS(), 'utf8')); } catch { return {}; } };
const writeStatus = s => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(STATUS(), JSON.stringify(s, null, 1)); };

async function cloud(secrets) {
  const supa = new Supa(readSyncConfig(ROOT));
  if (!secrets.supabase?.refreshToken) throw Object.assign(new Error('還沒登入帳小簿雲端：請先執行 node cli.mjs login'), { needUser: true });
  try { await supa.refresh(secrets.supabase.refreshToken); } catch (e) { if (e.status === 400 || e.status === 401) throw Object.assign(new Error('帳小簿雲端登入已失效：請重新執行 node cli.mjs login'), { needUser: true }); throw e; }
  // refresh tokens are single-use: keep the new one at once
  secrets.supabase = { ...secrets.supabase, refreshToken: supa.refreshToken, userId: supa.user.id }; await saveSecrets(secrets);
  return supa;
}

async function cmdLogin(secrets) {
  say('登入帳小簿雲端（跟 App 的「雲端同步」同一個帳號）。密碼只用來登入這一次，不會存下來。');
  const email = await ask('Email：'), password = await askHidden('密碼：');
  const supa = new Supa(readSyncConfig(ROOT)); await supa.signIn(email, password);
  secrets.supabase = { refreshToken: supa.refreshToken, userId: supa.user.id, email: supa.user.email }; await saveSecrets(secrets);
  say(`已登入：${supa.user.email}`);
}
async function cmdAdd(secrets, bank) {
  const b = BANKS[bank]; if (!b) throw new Error(`不支援的銀行：${bank}（可以用 ${Object.keys(BANKS).join('、')}）`);
  say(`設定${b.name}。輸入的內容不會顯示，只加密存在這台電腦。`);
  const old = secrets.banks[bank] || {}, cfg = { ...old }; delete cfg.paused;
  if (old.paused) say(`${b.name}上次登入被銀行拒絕。請先用銀行 App 或網銀確認帳號密碼可以登入，再在這裡輸入（輸錯太多次網銀會被鎖住）。`);
  for (const [k, label] of b.fields) { const v = await askHidden(`${label}${old[k] ? '（直接按 Enter 保留原本的）' : ''}：`); if (v) cfg[k] = k === 'userId' ? v.trim().toUpperCase() : v; if (!cfg[k]) throw new Error(`${label}不能空白`); }
  if (bank === 'ctbc' && (old.userId !== cfg.userId || old.account !== cfg.account)) { delete cfg.deviceCode; delete cfg.deviceSeed; }
  secrets.banks[bank] = cfg; await saveSecrets(secrets); say(`已儲存${b.name}。可以執行 node cli.mjs sync ${bank} 試一次。`);
}

async function syncBank(supa, secrets, bank, { auto, show }) {
  const b = BANKS[bank], cfg = secrets.banks[bank], interact = !auto && process.stdin.isTTY ? { ask, say } : null;
  const connector = bank === 'ctbc' ? createCtbc({ interact, onDevice: async d => { secrets.banks.ctbc = { ...secrets.banks.ctbc, ...d }; await saveSecrets(secrets); } }) : createEsun({ log, show });
  let result, error, needUser = false;
  if (cfg.paused) {
    // Banks lock online banking after a few wrong passwords: after one rejected login, stop trying until the user re-enters it.
    error = `${b.name}上次登入被銀行拒絕（帳號或密碼不對），為了避免網銀被鎖住，已暫停自動登入。請先用銀行 App 或網銀確認可以登入，再執行 node cli.mjs add ${bank} 重新輸入。`; needUser = true;
    log(`${b.name}：已暫停（上次登入被拒絕）`);
  } else {
    log(`${b.name}：開始同步`);
    try { result = await connector.sync(cfg); } catch (e) {
      error = e?.message || String(e); needUser = !!e?.needUser;
      if (LOGIN_REJECTED.has(e?.code)) { secrets.banks[bank] = { ...secrets.banks[bank], paused: true }; await saveSecrets(secrets); error += `\n為了避免網銀被鎖住，之後不會再自動登入${b.name}，直到你執行 node cli.mjs add ${bank} 重新輸入。`; }
    }
  }
  await supa.update('categories', feedId(bank), prev => buildFeed(prev, { source: bank, name: b.name, result, error, needUser }));
  const st = readStatus(); st[bank] = { at: new Date().toISOString(), ok: !!result, error: error || '', accounts: result?.accounts.length, tx: result?.tx.length }; writeStatus(st);
  if (result) log(`${b.name}：完成，${result.accounts.length} 個帳戶、${result.tx.length} 筆明細`); else log(`${b.name}：${needUser ? '需要你處理' : '失敗'}：${error}`);
  return result ? 0 : needUser ? 2 : 1;
}
async function cmdSync(secrets, only, opts) {
  fs.mkdirSync(DIR, { recursive: true });
  try { const st = fs.statSync(LOCK()); if (Date.now() - st.mtimeMs < 30 * 60e3) { say('另一個同步正在執行'); return 1; } } catch { /* no lock */ }
  fs.writeFileSync(LOCK(), String(process.pid));
  try {
    const banks = (only ? [only] : Object.keys(secrets.banks)).filter(k => BANKS[k]);
    if (only && !secrets.banks[only]) throw new Error(`還沒設定${BANKS[only]?.name || only}：請先執行 node cli.mjs add ${only}`);
    if (!banks.length) throw new Error('還沒設定任何銀行：請先執行 node cli.mjs setup');
    const supa = await cloud(secrets); let code = 0;
    for (const k of banks) code = Math.max(code, await syncBank(supa, secrets, k, opts));
    return code;
  } finally { fs.rmSync(LOCK(), { force: true }); }
}

function powershell(script, env) {
  return new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true, env: { ...process.env, ...env } }, (err, out, errText) => (err ? reject(new Error(String(errText || err.message).trim().slice(0, 300))) : resolve(String(out).trim()))));
}
async function cmdSchedule(times) {
  const l = (times.length ? times : ['07:30']).map(t => { if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error(`時間格式要像 07:30：${t}`); return t; });
  // Values go through environment variables, so paths with spaces or Chinese need no quoting tricks.
  await powershell("$a=New-ScheduledTaskAction -Execute $env:ZXB_NODE -Argument ('\"' + $env:ZXB_CLI + '\" sync --auto') -WorkingDirectory $env:ZXB_DIR; $t=@($env:ZXB_TIMES -split ',' | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }); $s=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 20); Register-ScheduledTask -TaskName $env:ZXB_TASK -Action $a -Trigger $t -Settings $s -Description '帳小簿：從銀行讀取明細與餘額' -Force | Out-Null",
    { ZXB_NODE: process.execPath, ZXB_CLI: path.join(HERE, 'cli.mjs'), ZXB_DIR: HERE, ZXB_TIMES: l.join(','), ZXB_TASK: TASK });
  say(`已設定每天 ${l.join('、')} 自動同步（電腦當時沒開，下次開機後會補跑）。同步時會出現一個命令視窗，完成後自動關閉。`);
}
async function cmdUnschedule() { await powershell('Unregister-ScheduledTask -TaskName $env:ZXB_TASK -Confirm:$false -ErrorAction SilentlyContinue', { ZXB_TASK: TASK }); say('已取消每天自動同步。'); }
async function cmdStatus(secrets) {
  say(`資料夾：${DIR}`); say(`雲端帳號：${secrets.supabase?.email || '（尚未登入）'}`);
  const st = readStatus();
  for (const [k, b] of Object.entries(BANKS)) { const s = st[k]; say(`${b.name}：${secrets.banks[k] ? (secrets.banks[k].paused ? '已暫停（上次登入被拒絕，執行 node cli.mjs add ' + k + ' 重新輸入）' : '已設定') : '未設定'}${s ? `，上次 ${new Date(s.at).toLocaleString('zh-TW', { hour12: false })} ${s.ok ? `成功（${s.accounts} 個帳戶、${s.tx} 筆）` : `失敗：${s.error}`}` : ''}`); }
  try { say(`每天自動同步：${(await powershell("$t=Get-ScheduledTask -TaskName $env:ZXB_TASK -ErrorAction SilentlyContinue; if($t){($t.Triggers | ForEach-Object { ([datetime]$_.StartBoundary).ToString('HH:mm') }) -join ','}else{''}", { ZXB_TASK: TASK })).trim().replace(/,/g, '、') || '未設定'}`); } catch { /* not on Windows */ }
}

async function main(argv) {
  const [cmd, ...rest] = argv, flags = new Set(rest.filter(a => a.startsWith('--'))), args = rest.filter(a => !a.startsWith('--'));
  const secrets = await loadSecrets();
  switch (cmd) {
    case 'setup': {
      if (!secrets.supabase?.refreshToken || (await ask('要重新登入帳小簿雲端嗎？(y/N)：')).toLowerCase() === 'y') await cmdLogin(secrets);
      for (const [k, b] of Object.entries(BANKS)) if ((await ask(`要設定${b.name}嗎？(y/N)：`)).toLowerCase() === 'y') await cmdAdd(secrets, k);
      if ((await ask('要現在同步一次嗎？(Y/n)：')).toLowerCase() !== 'n') return cmdSync(secrets, null, { auto: false, show: flags.has('--show') });
      return 0;
    }
    case 'login': await cmdLogin(secrets); return 0;
    case 'add': await cmdAdd(secrets, args[0]); return 0;
    case 'remove': if (!BANKS[args[0]]) throw new Error('要指定 esun 或 ctbc'); delete secrets.banks[args[0]]; await saveSecrets(secrets); say(`已刪除${BANKS[args[0]].name}的登入資料。`); return 0;
    case 'sync': if (args[0] && !BANKS[args[0]]) throw new Error(`不支援的銀行：${args[0]}`); return cmdSync(secrets, args[0], { auto: flags.has('--auto'), show: flags.has('--show') });
    case 'schedule': await cmdSchedule(args); return 0;
    case 'unschedule': await cmdUnschedule(); return 0;
    case 'status': await cmdStatus(secrets); return 0;
    default: say(HELP); return cmd ? 1 : 0;
  }
}

main(process.argv.slice(2)).then(code => process.exit(code ?? 0), e => { log(`錯誤：${e?.message || e}`); process.exit(e?.needUser ? 2 : 1); });
