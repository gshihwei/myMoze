// 帳小簿銀行同步 — shared helpers for the bank connectors.
import crypto from 'node:crypto';

export const isRecord = v => Boolean(v && typeof v === 'object' && !Array.isArray(v));
export const str = v => (typeof v === 'string' ? v : v == null ? '' : String(v));
export const hasText = v => typeof v === 'string' && v.trim().length > 0;
export const opt = v => { const s = str(v).trim(); return s || undefined; };
export const arr = v => (Array.isArray(v) ? v : []);
export const rec = v => (isRecord(v) ? v : {});
export const recAt = (v, k) => (isRecord(v) && isRecord(v[k]) ? v[k] : {});
export const arrAt = (v, k) => (isRecord(v) && Array.isArray(v[k]) ? v[k] : []);
export const last4 = v => str(v).match(/(\d{4})\D*$/)?.[1];
export const sha256Hex = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// Amounts as banks print them: "1,234", "(50)", "$ 99.5".
export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const n = str(v).trim().replace(/[,$\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(n)) return undefined;
  const x = Number(n); return Number.isFinite(x) ? x : undefined;
}

// "2026/11/27", "1151127" (ROC), "20261127", "2026-11-27T10:00" → "2026-11-27"
export function isoDate(v) {
  const t = str(v).trim(), d = (t.split(/[T\s]/, 1)[0] || '').replace(/\./g, '/');
  const p = /^(\d{3,4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(d) || /^(\d{3,4})(\d{2})(\d{2})$/.exec(d); if (!p) return undefined;
  const y = Number(p[1]) < 1911 ? Number(p[1]) + 1911 : Number(p[1]), m = Number(p[2]), day = Number(p[3]), x = new Date(Date.UTC(y, m - 1, day));
  if (m < 1 || m > 12 || x.getUTCFullYear() !== y || x.getUTCMonth() !== m - 1 || x.getUTCDate() !== day) return undefined;
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
// "HH:MM" from a time or date-time string, or ''.
export function hhmm(v) { const m = /(?:^|[T\s])(\d{1,2})[:：](\d{2})/.exec(str(v)); return m && Number(m[1]) < 24 ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; }

// Today in Taipei as YYYY-MM-DD, n months ago, etc.
export function taipeiNow(now = new Date()) { return new Date(now.getTime() + 8 * 3600e3); }
export function taipeiDate(now = new Date()) { return taipeiNow(now).toISOString().slice(0, 10); }

// Long digit runs in descriptions are account or card numbers: keep only the last four.
export function maskDigits(s) { return str(s).replace(/\d[\d -]{6,}\d/g, m => { const d = m.replace(/\D/g, ''); return d.length >= 8 ? `…${d.slice(-4)}` : m; }).replace(/\s+/g, ' ').trim(); }

// RSA PKCS#1 v1.5 encryption with BigInt, so odd exponents and bare moduli work without OpenSSL key parsing.
export function rsaPkcs1Encrypt(modulus, exponent, message, rand = n => crypto.randomBytes(n)) {
  const k = Math.ceil(modulus.toString(2).length / 8); if (message.length > k - 11) throw new Error('RSA payload too long');
  const ps = Buffer.alloc(k - message.length - 3); let i = 0;
  while (i < ps.length) for (const b of rand(ps.length - i)) { if (b !== 0 && i < ps.length) ps[i++] = b; }
  const em = Buffer.concat([Buffer.from([0, 2]), ps, Buffer.from([0]), Buffer.from(message)]);
  let r = 1n, base = BigInt('0x' + em.toString('hex')) % modulus, e = exponent;
  while (e > 0n) { if (e & 1n) r = (r * base) % modulus; e >>= 1n; base = (base * base) % modulus; }
  let hex = r.toString(16); if (hex.length % 2) hex = '0' + hex; const out = Buffer.from(hex, 'hex');
  return out.length >= k ? out.subarray(out.length - k) : Buffer.concat([Buffer.alloc(k - out.length), out]);
}

// PKCS#1 "RSA PUBLIC KEY" or SPKI PEM → { modulus, exponent } as BigInt.
export function rsaFromPem(pem) {
  const der = Buffer.from(String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');
  const node = (b, o) => { const tag = b[o]; let len = b[o + 1], c = o + 2; if (len & 0x80) { const n = len & 0x7f; len = 0; for (let j = 0; j < n; j++) len = len * 256 + b[c + j]; c += n; } return { tag, value: b.subarray(c, c + len), next: c + len }; };
  const kids = b => { const out = []; let o = 0; while (o < b.length) { const n = node(b, o); out.push(n); o = n.next; } return out; };
  const root = node(der, 0), rk = kids(root.value), seq = rk.length >= 2 && rk[0].tag === 0x02 ? root : node(rk[1].value.subarray(1), 0), [n, e] = kids(seq.value);
  const big = v => BigInt('0x' + (Buffer.from(v[0] === 0 ? v.subarray(1) : v).toString('hex') || '0'));
  return { modulus: big(n.value), exponent: big(e.value) };
}

export class NeedUserError extends Error { constructor(message, code = 'NEED_USER') { super(message); this.name = 'NeedUserError'; this.code = code; this.needUser = true; } }
export class BankError extends Error { constructor(message, code = 'BANK') { super(message); this.name = 'BankError'; this.code = code; } }

// Gives every account a distinct public id without the full account number.
export function uniqueId(used, id) { let x = id, i = 2; while (used.has(x)) x = `${id}-${i++}`; used.add(x); return x; }
