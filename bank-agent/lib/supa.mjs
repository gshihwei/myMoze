// 帳小簿銀行同步 — writes the bank feed into the user's own Supabase rows (same project, same RLS as the app).
import fs from 'node:fs';
import path from 'node:path';

// URL and publishable key come from the app's own js/sync-config.js (public values, already in the repo).
export function readSyncConfig(root) {
  const s = fs.readFileSync(path.join(root, 'js', 'sync-config.js'), 'utf8');
  const url = /url:\s*["']([^"']+)["']/.exec(s)?.[1], key = /publishableKey:\s*["']([^"']+)["']/.exec(s)?.[1];
  if (!url || !key) throw new Error('讀不到 js/sync-config.js 的 Supabase 設定');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw new Error('Supabase 網址格式不對');
  return { url, key };
}

export class Supa {
  constructor({ url, key, fetch = globalThis.fetch }) { this.url = url; this.key = key; this.fetch = fetch; this.access = ''; this.refreshToken = ''; this.user = null; }
  async call(p, init = {}, auth = true) {
    const headers = { apikey: this.key, 'content-type': 'application/json', ...(auth && this.access ? { authorization: `Bearer ${this.access}` } : {}), ...(init.headers || {}) };
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 30000);
    try {
      const r = await this.fetch(this.url + p, { ...init, headers, signal: ctl.signal }), text = await r.text();
      let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      if (!r.ok) { const msg = data?.error_description || data?.msg || data?.message || `HTTP ${r.status}`; const e = new Error(`雲端：${msg}`); e.status = r.status; throw e; }
      return data;
    } finally { clearTimeout(timer); }
  }
  takeSession(d) {
    if (!d?.access_token || !d?.refresh_token || !d?.user?.id) throw new Error('雲端登入沒有回傳完整的工作階段');
    this.access = d.access_token; this.refreshToken = d.refresh_token; this.user = { id: d.user.id, email: d.user.email || '' }; return this.user;
  }
  async signIn(email, password) { return this.takeSession(await this.call('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) }, false)); }
  async refresh(token) { return this.takeSession(await this.call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: token }) }, false)); }
  async getRecord(entity, id) {
    const l = await this.call(`/rest/v1/moze_records?select=record_id,data,version,deleted&entity=eq.${encodeURIComponent(entity)}&record_id=eq.${encodeURIComponent(id)}`);
    return Array.isArray(l) && l[0] ? l[0] : null;
  }
  async writeRecord(entity, id, data, baseVersion) {
    return this.call('/rest/v1/rpc/moze_write_record', { method: 'POST', body: JSON.stringify({ p_entity: entity, p_record_id: id, p_data: data, p_deleted: false, p_base_version: baseVersion, p_device_id: 'bank-agent' }) });
  }
  // Read-modify-write with the app's optimistic version check; retries when another device wrote in between.
  async update(entity, id, make) {
    for (let i = 0; i < 4; i++) {
      const cur = await this.getRecord(entity, id), data = make(cur && !cur.deleted ? cur.data : null);
      const r = await this.writeRecord(entity, id, data, cur ? Number(cur.version) || 0 : 0);
      if (r?.status === 'applied') return r.row;
    }
    throw new Error('雲端資料一直在變更，稍後再試');
  }
}
