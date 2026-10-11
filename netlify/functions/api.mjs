/* Server-Funktion: nimmt die Anfragen der App unter /api/… an und speichert den Helferplan in Netlify Blobs.
   Die Regeln stehen in lib/core.mjs. */
import { getStore } from '@netlify/blobs';
import { handle } from './lib/core.mjs';
import { seed } from './lib/seed.mjs';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

function storage() {
  const blobs = getStore({ name: 'helferplan', consistency: 'strong' });
  return {
    async get() { const r = await blobs.getWithMetadata('db', { type: 'json' }); return r && r.data ? { data: r.data, etag: r.etag } : null; },
    async set(data, o) { const r = await blobs.setJSON('db', data, o.isNew ? { onlyIfNew: true } : o.etag ? { onlyIfMatch: o.etag } : {}); return !!r.modified; },
    /* Sperre: «anlegen, nur wenn es sie noch nicht gibt» kann immer nur einer gewinnen. Eine vergessene Sperre verfällt nach 8 Sekunden. */
    async lock() { const mine = Date.now() + '-' + Math.random().toString(36).slice(2);
      for (let i = 0; i < 45; i++) {
        if ((await blobs.set('sperre', mine, { onlyIfNew: true })).modified) return async () => { await blobs.delete('sperre'); };
        const cur = await blobs.get('sperre', { type: 'text' });
        if (cur && Date.now() - parseInt(cur, 10) > 8000) { if ((await blobs.get('sperre', { type: 'text' })) === cur) await blobs.delete('sperre'); continue; }
        await new Promise(r => setTimeout(r, 60 + Math.random() * 120));
      }
      throw Object.assign(new Error('busy'), { status: 503, code: 'busy' }); },
    async secret() {
      let s = await blobs.get('secret', { type: 'text' });
      if (!s) { const a = new Uint8Array(32); crypto.getRandomValues(a);
        await blobs.set('secret', Array.from(a, b => b.toString(16).padStart(2, '0')).join(''), { onlyIfNew: true });
        s = await blobs.get('secret', { type: 'text' }); }
      return s; },
    /* einmal am Tag eine Sicherungskopie des Stands vor der ersten Änderung */
    async backup(tag, data) { await blobs.setJSON('sicherung/' + tag, data); },
  };
}

export default async (req) => {
  const url = new URL(req.url), path = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  let body = null;
  if (req.method === 'POST') {
    const text = await req.text();
    if (text.length > 400000) return json(413, { error: 'big' });
    try { body = text ? JSON.parse(text) : {}; } catch (e) { return json(400, { error: 'bad' }); }
  } else if (req.method !== 'GET') return json(405, { error: 'method' });
  const out = await handle({ method: req.method, path, rev: url.searchParams.get('rev'), role: url.searchParams.get('role'), body, auth: req.headers.get('authorization') }, storage(), seed);
  return json(out.status, out.body);
};

export const config = { path: '/api/*' };
