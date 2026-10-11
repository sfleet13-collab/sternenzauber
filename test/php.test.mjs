/* Prüft die PHP-Fassung (Hostinger) mit derselben Prüfliste über echte HTTP-Aufrufe.
   Start: node test/php.test.mjs   (braucht php im Pfad; startet selbst einen Testserver mit mehreren Arbeitern) */
import { spawn } from 'node:child_process';
import { cpSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenario } from './scenario.mjs';
import { seed } from '../netlify/functions/lib/seed.mjs';
const S0 = seed();

const here = dirname(fileURLToPath(import.meta.url)), site = join(here, 'tmp', 'php-site'), port = 8791, base = 'http://127.0.0.1:' + port + '/';
rmSync(site, { recursive: true, force: true }); cpSync(join(here, '..', 'hostinger'), site, { recursive: true });
const php = spawn('php', ['-S', '127.0.0.1:' + port, '-t', site], { env: Object.assign({}, process.env, { PHP_CLI_SERVER_WORKERS: '8', SZ_TEST: '1' }), stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));

let fails = 0, n = 0; const ok = (c, l) => { n++; if (!c) { fails++; console.log('FEHLER:', l); } };
const call = async (method, path, body, token, extra) => { const q = new URLSearchParams(Object.assign({ r: path }, extra && extra.rev !== undefined ? { rev: extra.rev, role: extra.role || '' } : {}));
  const r = await fetch(base + 'api.php?' + q, { method, headers: Object.assign({ 'content-type': 'application/json' }, token ? { 'x-sz-token': token } : {}), body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, body: j }; };
const data = name => { const t = readFileSync(join(site, 'daten', name), 'utf8'); return JSON.parse(t.slice(t.indexOf('\n') + 1)); };
try {
  const st = await call('GET', 'status'); ok(st.status === 200 && st.body.ok === true && st.body.start === true, 'Status meldet: Speicher bereit');
  await scenario({ call, raw: () => data('db.php'), backups: () => readdirSync(join(site, 'daten')).filter(f => f.startsWith('sicherung-')).length, S0: seed(), ok });
  // Der Datenordner ist von aussen nicht lesbar, auch wenn .htaccess nicht greift (der Testserver kennt kein .htaccess)
  for (const f of ['daten/db.php', 'daten/geheim.php', 'start.php']) { const r = await fetch(base + f), t = await r.text(); ok(r.status === 404 && t === '', f + ' gibt von aussen nichts preis'); }
  ok(existsSync(join(site, 'daten', '.htaccess')), 'Sperrdatei im Datenordner vorhanden');
  ok(JSON.stringify(data('db.php').years['2026'].shifts[0].cells).startsWith('{') && Array.isArray(data('db.php').helpers) && Array.isArray(data('db.php').sos), 'Listen bleiben Listen, Felder bleiben Felder');
  // Bestehender Stand ohne SOS-Empfänger und mit altem Orga-Team wird einmalig angepasst, Einträge bleiben
  const fs = await import('node:fs'), f = join(site, 'daten', 'db.php'), old = data('db.php'), guard = readFileSync(f, 'utf8').split('\n')[0] + '\n';
  delete old.mig; delete old.years['2026'].info.sosNames; old.years['2026'].info.notes = old.years['2026'].info.notes.map(n => n.startsWith('Orga-Team:') ? 'Orga-Team: Juri, Assi, Nina, Magnus und Susan.' : n);
  const helpersBefore = old.helpers.length, revBefore = old.rev; fs.writeFileSync(f, guard + JSON.stringify(old));
  // auch wenn auf dem Server noch die alte start.php liegt
  const sf = join(site, 'start.php'), st0 = readFileSync(sf, 'utf8'), sj = JSON.parse(st0.slice(st0.indexOf('\n') + 1)); delete sj.mig; delete sj.years['2026'].info.sosNames; fs.writeFileSync(sf, st0.split('\n')[0] + '\n' + JSON.stringify(sj));
  await call('POST', 'login', { code: S0.codes.helper }); const neu = data('db.php');
  ok(neu.mig === 1 && neu.years['2026'].info.sosNames.includes('Saskia Melis') && neu.years['2026'].info.sosNames.length === 7, 'bestehender Stand bekommt die SOS-Empfänger');
  ok(neu.years['2026'].info.notes.includes('Orga-Team: Nina B., Julian R., Astrid und Susan.') && !neu.years['2026'].info.notes.some(n => n.includes('Juri')), 'Orga-Team in den Hinweisen aktualisiert');
  ok(neu.helpers.length === helpersBefore && neu.rev === revBefore + 1, 'Helferliste und Einträge bleiben dabei erhalten');
  await call('POST', 'login', { code: S0.codes.helper }); ok(data('db.php').rev === revBefore + 1, 'die Anpassung läuft nur einmal');
  ok((await call('PUT', 'db')).status === 405, 'andere Methoden werden abgelehnt');
  ok((await call('POST', 'patch', null, 'kein.ausweis')).status === 401, 'ungültiger Ausweis');
} finally { php.kill(); }
console.log(fails ? fails + ' von ' + n + ' Prüfungen fehlgeschlagen' : 'Alle ' + n + ' Prüfungen bestanden');
process.exit(fails ? 1 : 0);
