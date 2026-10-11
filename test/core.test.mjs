/* Prüft die Regeln des Helferplans ohne Netlify: node test/core.test.mjs */
import { handle } from '../netlify/functions/lib/core.mjs';
import { diff, applyOps, clone } from '../netlify/functions/lib/patch.mjs';
import { seed } from '../netlify/functions/lib/seed.mjs';
import { scenario } from './scenario.mjs';

export function memoryStore() { let data = null, etag = 0; const backups = {};
  return { delay: 0, backups,
    async get() { return data === null ? null : { data: JSON.parse(data), etag: String(etag) }; },
    async set(d, o) { if (o.isNew ? data !== null : String(etag) !== o.etag) return false; data = JSON.stringify(d); etag++; return true; },
    async secret() { return 'test-geheimnis'; },
    async backup(tag, d) { backups[tag] = d; },
    raw: () => JSON.parse(data) }; }

let fails = 0, n = 0;
const ok = (cond, label) => { n++; if (!cond) { fails++; console.log('FEHLER:', label); } };
const store = memoryStore();
const call = (method, path, body, token, extra) => handle(Object.assign({ method, path, body, auth: token ? 'Bearer ' + token : '' }, extra || {}), store, seed);

await scenario({ call, raw: () => store.raw(), backups: () => Object.keys(store.backups).length, S0: seed(), ok });

// --- diff / applyOps
const a = { x: { p: ['A', 'B'], l: [{ id: 'eins', v: 1 }, { id: 'zwei', v: 2 }] }, k: 1 }, b2 = { x: { p: ['B', 'C'], l: [{ id: 'zwei', v: 3 }, { id: 'drei', v: 9 }] }, n: 'neu' };
ok(JSON.stringify(applyOps(clone(a), diff(a, b2))) === JSON.stringify({ x: { p: ['B', 'C'], l: [{ id: 'zwei', v: 3 }, { id: 'drei', v: 9 }] }, n: 'neu' }), 'diff und applyOps ergeben den Zielstand');

console.log(fails ? fails + ' von ' + n + ' Prüfungen fehlgeschlagen' : 'Alle ' + n + ' Prüfungen bestanden');
process.exit(fails ? 1 : 0);
