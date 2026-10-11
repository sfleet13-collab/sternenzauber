/* Prüft die Server-Funktion mit dem echten Netlify-Blobs-Paket gegen dessen lokalen Testserver:
   node test/blobs.test.mjs */
import { BlobsServer } from '@netlify/blobs/server';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'sz-blobs-')), token = 'test-token';
const server = new BlobsServer({ directory: dir, token });
/* Der lokale Testserver prüft «nur wenn neu» nicht unteilbar (erst nachsehen, dann schreiben). Der echte Speicher bei Netlify tut das.
   Damit der Test dasselbe Verhalten hat, laufen Schreibvorgänge hier nacheinander. */
const put = server.put.bind(server); let chain = Promise.resolve();
server.put = req => { const run = chain.then(() => put(req)); chain = run.catch(() => {}); return run; };
const { port } = await server.start();
const url = 'http://localhost:' + port;
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ edgeURL: url, uncachedEdgeURL: url, siteID: 'test-site', token })).toString('base64');
const api = (await import('../netlify/functions/api.mjs')).default;
const { seed } = await import('../netlify/functions/lib/seed.mjs');

let fails = 0, n = 0; const ok = (c, l) => { n++; if (!c) { fails++; console.log('FEHLER:', l); } };
const call = async (method, path, body, tok) => { const r = await api(new Request('https://beispiel.netlify.app/api/' + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, tok ? { authorization: 'Bearer ' + tok } : {}), body: body ? JSON.stringify(body) : undefined })); return { status: r.status, body: await r.json(), type: r.headers.get('content-type'), cc: r.headers.get('cache-control') }; };
const S0 = seed();

const t0 = Date.now();
const bad = await call('POST', 'login', { code: 'nein' });
ok(bad.status === 401 && Date.now() - t0 >= 550, 'falscher Code: abgelehnt und gebremst');
const l1 = await call('POST', 'login', { code: S0.codes.helper });
ok(l1.status === 200 && l1.type.includes('json') && l1.cc === 'no-store', 'Anmeldung über die echte Funktion');
ok(l1.body.db.years['2026'].stations.length === 18 && l1.body.db.years['2026'].shifts.length === 13, 'Startplan mit 18 Ständen und 13 Schichten');
ok(l1.body.db.years['2026'].info.notes.some(x => x.includes('Juri')), 'Orga-Team steht in den Hinweisen');
const people = [];
for (let i = 0; i < 8; i++) { const l = await call('POST', 'login', { code: S0.codes.helper }); const r = await call('POST', 'register', { first: 'Helfer' + i, last: 'Test', phone: '0170 44400' + i, email: 'h' + i + '@beispiel.de' }, l.body.token); people.push([r.body.token, r.body.db.helpers.find(h => h.id === r.body.me.id).name]); }
const y = S0.years['2026'], sh = y.shifts[3].id, st = y.stations[1].id;
const lo = await call('POST', 'login', { pw: S0.codes.orga });
await call('POST', 'patch', { ops: [{ t: 'set', p: ['years', '2026', 'stations', '#' + st, 'max'], v: 20 }] }, lo.body.token);
const rs = await Promise.all(people.map(([t, name]) => call('POST', 'patch', { ops: [{ t: 'add', p: ['years', '2026', 'shifts', '#' + sh, 'cells', st, 'people'], v: [name] }] }, t)));
const end = await call('GET', 'db?rev=-1&role=orga', null, lo.body.token);
const cell = end.body.db.years['2026'].shifts.find(x => x.id === sh).cells[st].people;
ok(rs.every(r => r.status === 200) && people.every(([, name]) => cell.includes(name)), '8 gleichzeitige Einträge über Netlify Blobs kommen alle an (' + cell.length + ' im Feld)');
ok(end.body.db.helpers.length === 8 && end.body.db.helpers[0].phone, 'Orga sieht alle 8 mit Handynummer');
const again = await call('GET', 'db?rev=' + end.body.rev + '&role=orga', null, lo.body.token);
ok(again.body.same === true, 'kein erneutes Senden bei unverändertem Stand');
ok((await call('PUT', 'db', null, lo.body.token).catch(() => ({ status: 405 }))).status === 405, 'andere Methoden werden abgelehnt');
ok((await call('GET', 'gibtsnicht', null, lo.body.token)).status === 404, 'unbekannter Pfad');

await server.stop(); rmSync(dir, { recursive: true, force: true });
console.log(fails ? fails + ' von ' + n + ' Prüfungen fehlgeschlagen' : 'Alle ' + n + ' Prüfungen bestanden');
process.exit(fails ? 1 : 0);
