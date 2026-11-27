// 帳小簿銀行同步 — turns a connector result into the hidden record the app reads (categories/__bank_<source>__).
// Only what the app needs is kept: last four digits, dates, amounts, descriptions with long numbers masked. No raw bank payloads.
import { maskDigits, sha256Hex, str, taipeiDate } from './util.mjs';

export const KEEP_DAYS = 120;
export const MAX_TX = 1500;
export const feedId = source => `__bank_${source}__`;

const round = v => Math.round(Number(v) * 100) / 100;
function cleanAccount(a) {
  const out = { id: str(a.id).slice(0, 60), name: maskDigits(a.name).slice(0, 60), type: a.type === 'card' ? 'card' : 'bank', currency: /^[A-Z]{3}$/.test(a.currency) ? a.currency : 'TWD' };
  if (Number.isFinite(Number(a.balance))) out.balance = round(a.balance);
  if (a.bill && typeof a.bill === 'object') {
    const b = {}; for (const k of ['amount', 'min']) if (Number.isFinite(Number(a.bill[k]))) b[k] = round(a.bill[k]);
    for (const k of ['period', 'due', 'closing']) if (a.bill[k]) b[k] = str(a.bill[k]).slice(0, 10);
    if (typeof a.bill.paid === 'boolean') b.paid = a.bill.paid; out.bill = b;
  }
  return out;
}
export function cleanTx(source, t) {
  const desc = maskDigits(t.desc).slice(0, 80) || '銀行交易', party = maskDigits(t.party).slice(0, 80);
  const out = { id: `${source}:${sha256Hex(str(t.key)).slice(0, 20)}`, acct: str(t.acct).slice(0, 60), date: str(t.date).slice(0, 10), amount: round(t.amount), currency: /^[A-Z]{3}$/.test(t.currency) ? t.currency : 'TWD', desc };
  if (t.time) out.time = str(t.time).slice(0, 5);
  if (party && party !== desc) out.party = party;
  if (t.status === 'pending') out.status = 'pending';
  if (t.card) out.card = str(t.card).slice(-4);
  return out;
}

// prev = the record now in the cloud (or null). result = { accounts, tx } on success; error/needUser on failure.
export function buildFeed(prev, { source, name, result, error, needUser, now = new Date() }) {
  const p = prev?.bank || {}, at = now.toISOString(), keepFrom = taipeiDate(new Date(now.getTime() - KEEP_DAYS * 864e5));
  let accounts = Array.isArray(p.accounts) ? p.accounts : [], tx = Array.isArray(p.tx) ? p.tx : [], okAt = p.okAt || '';
  if (result) {
    accounts = (result.accounts || []).map(cleanAccount);
    const fresh = (result.tx || []).map(t => cleanTx(source, t)).filter(t => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && t.amount !== 0);
    const seen = new Set(fresh.map(t => t.id));
    // Older rows the bank no longer lists stay (the app may have matched them); pending card authorisations do not,
    // because every fetch returns the complete pending list and a posted row replaces them.
    const kept = tx.filter(t => !seen.has(t.id) && t.status !== 'pending' && t.date >= keepFrom);
    const byId = new Map(); for (const t of [...fresh, ...kept]) if (!byId.has(t.id)) byId.set(t.id, t);
    tx = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '')).slice(0, MAX_TX);
    okAt = at;
  }
  const bank = { v: 1, source, name, at, ok: !!result, okAt, accounts, tx };
  if (!result) { bank.error = str(error || '同步失敗').slice(0, 200); if (needUser) bank.need = true; }
  return { id: feedId(source), kind: 'prefs', name: `銀行同步：${name}`, icon: '🏦', hidden: true, order: 1e9, at: Date.now(), bank };
}
