/* Lokaler Testserver: liefert public/ aus und beantwortet /api/… mit der echten Server-Funktion.
   Start: node test/dev-server.mjs [port]   (Daten liegen in einem Wegwerf-Ordner) */
import { BlobsServer } from '@netlify/blobs/server';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public'), port = Number(process.argv[2]) || 8788;
const blobs = new BlobsServer({ directory: mkdtempSync(join(tmpdir(), 'sz-dev-')), token: 'dev' });
const put = blobs.put.bind(blobs); let chain = Promise.resolve();
blobs.put = req => { const run = chain.then(() => put(req)); chain = run.catch(() => {}); return run; };
const b = await blobs.start(), burl = 'http://localhost:' + b.port;
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ edgeURL: burl, uncachedEdgeURL: burl, siteID: 'dev', token: 'dev' })).toString('base64');
const api = (await import('../netlify/functions/api.mjs')).default;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };

createServer(async (q, r) => {
  try {
    const url = new URL(q.url, 'http://localhost:' + port);
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of q) chunks.push(c);
      const res = await api(new Request(url, { method: q.method, headers: q.headers, body: q.method === 'GET' ? undefined : Buffer.concat(chunks) }));
      r.writeHead(res.status, Object.fromEntries(res.headers)); return r.end(await res.text()); }
    const file = join(root, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) { r.writeHead(403); return r.end(); }
    const data = await readFile(file); r.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }); r.end(data);
  } catch (e) { r.writeHead(404); r.end(); }
}).listen(port, () => console.log('Sternenzauber läuft auf http://localhost:' + port));
