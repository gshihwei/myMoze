// 帳小簿 Edge Function「einvoice」— 代替網頁連到財政部電子發票服務（瀏覽器無法直接連線）。
// Deploy: supabase functions deploy einvoice   (keep the default JWT check: only users signed in to this project can call it)
// Stateless: it stores nothing and never logs phone numbers, passwords or tokens.
import { handle } from './protocol.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: '只接受 POST' }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: '請求格式錯誤' }, 400); }
  try {
    return reply(await handle(body, fetch));
  } catch (e) {
    const err = e as { message?: string; code?: number; status?: number };
    // 200 with an error field, so the app can read the message (supabase-js hides bodies of non-2xx replies)
    return reply({ error: err?.message || '發生未知錯誤', code: err?.code ?? null, status: err?.status ?? null });
  }
});
