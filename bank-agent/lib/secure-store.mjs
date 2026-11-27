// 帳小簿銀行同步 — secrets kept only on this computer, encrypted with Windows DPAPI (current Windows user).
// Bank passwords never leave this machine except to the bank itself; nothing here is written to the repo folder.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DIR = process.env.ZXB_BANK_DIR || path.join(process.env.APPDATA || os.homedir(), 'zhangxiaobu-bank');
const FILE = () => path.join(DIR, 'secrets.dat');

function powershell(script, input) {
  return new Promise((resolve, reject) => {
    const p = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true, maxBuffer: 32 << 20 }, (err, out, errText) => {
      if (err) reject(new Error(`Windows 加密失敗：${String(errText || err.message).trim().slice(0, 200)}`)); else resolve(String(out).trim());
    });
    p.stdin.end(input);
  });
}
// Base64 in and out keeps the PowerShell pipe ASCII-only.
const PROTECT = "Add-Type -AssemblyName System.Security;$i=[Console]::In.ReadToEnd().Trim();$b=[Convert]::FromBase64String($i);[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,'CurrentUser'))";
const UNPROTECT = "Add-Type -AssemblyName System.Security;$i=[Console]::In.ReadToEnd().Trim();$b=[Convert]::FromBase64String($i);[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'))";

export async function protect(text) { if (process.platform !== 'win32') throw new Error('銀行同步程式目前只支援 Windows'); return powershell(PROTECT, Buffer.from(text, 'utf8').toString('base64')); }
export async function unprotect(blob) { if (process.platform !== 'win32') throw new Error('銀行同步程式目前只支援 Windows'); return Buffer.from(await powershell(UNPROTECT, blob), 'base64').toString('utf8'); }

// { supabase: { refreshToken, userId, email }, banks: { esun: {...}, ctbc: {...} } }
export async function loadSecrets() {
  let blob; try { blob = fs.readFileSync(FILE(), 'utf8').trim(); } catch { return { banks: {} }; }
  if (!blob) return { banks: {} };
  const s = JSON.parse(await unprotect(blob)); s.banks = s.banks || {}; return s;
}
export async function saveSecrets(s) {
  fs.mkdirSync(DIR, { recursive: true });
  const blob = await protect(JSON.stringify(s)), tmp = FILE() + '.tmp';
  fs.writeFileSync(tmp, blob, { mode: 0o600 }); fs.renameSync(tmp, FILE());
}
