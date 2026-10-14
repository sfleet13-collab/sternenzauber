/* Prüft die Mitteilungen der PHP-Fassung: Wer bekommt bei SOS eine Mitteilung, ist sie richtig
   verschlüsselt und unterschrieben, werden abgelaufene Handys entfernt?
   Ein kleiner Test-Empfänger spielt den Push-Dienst (Google/Apple) und entschlüsselt alles selbst.
   Start: node test/push.test.mjs */
import { spawn } from 'node:child_process';
import { cpSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import crypto from 'node:crypto';
import { seed } from '../netlify/functions/lib/seed.mjs';
const S0 = seed();

const here = dirname(fileURLToPath(import.meta.url)), site = join(here, 'tmp', 'push-site'), port = 8783, rport = 8784, base = 'http://127.0.0.1:' + port + '/';
rmSync(site, { recursive: true, force: true }); cpSync(join(here, '..', 'hostinger'), site, { recursive: true });
rmSync(join(site, 'kontakte.php'), { force: true }); for (const f of readdirSync(join(site, 'daten'))) if (f !== '.htaccess') rmSync(join(site, 'daten', f), { force: true });
const php = spawn('php', ['-S', '127.0.0.1:' + port, '-t', site], { env: Object.assign({}, process.env, { PHP_CLI_SERVER_WORKERS: '4', SZ_TEST: '1' }), stdio: 'ignore' });

// Test-Empfänger
const got = {};
const recv = http.createServer((req, res) => { const parts = []; req.on('data', c => parts.push(c)); req.on('end', () => {
  const id = req.url.split('/').pop(); (got[id] = got[id] || []).push({ headers: req.headers, body: Buffer.concat(parts) });
  res.statusCode = id === 'weg' ? 410 : 201; res.end(); }); });
await new Promise(r => recv.listen(rport, '127.0.0.1', r));
await new Promise(r => setTimeout(r, 900));

let fails = 0, n = 0; const ok = (c, l) => { n++; if (!c) { fails++; console.log('FEHLER:', l); } };
const call = async (method, path, body, token) => { const r = await fetch(base + 'api.php?r=' + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, token ? { 'x-sz-token': token } : {}), body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, body: j }; };
const b64u = b => Buffer.from(b).toString('base64url');
function device(id) { const e = crypto.createECDH('prime256v1'); e.generateKeys(); const auth = crypto.randomBytes(16);
  return { id, e, auth, sub: { endpoint: 'http://127.0.0.1:' + rport + '/push/' + id, keys: { p256dh: b64u(e.getPublicKey()), auth: b64u(auth) } } }; }
function decrypt(d, body) { const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const secret = d.e.computeSecret(asPub), uaPub = d.e.getPublicKey();
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, d.auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)), nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const dc = crypto.createDecipheriv('aes-128-gcm', cek, nonce); dc.setAuthTag(ct.subarray(ct.length - 16)); const p = Buffer.concat([dc.update(ct.subarray(0, ct.length - 16)), dc.final()]);
  return JSON.parse(p.subarray(0, p.lastIndexOf(2)).toString('utf8')); }
function vapidOk(h, key) { const m = /^vapid t=([^,]+), k=(.+)$/.exec(h.authorization || ''); if (!m || m[2] !== key) return false;
  const [hd, cl, sg] = m[1].split('.'), claims = JSON.parse(Buffer.from(cl, 'base64url'));
  const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(Buffer.from(key, 'base64url').subarray(1, 33)), y: b64u(Buffer.from(key, 'base64url').subarray(33)) }, format: 'jwk' });
  return claims.aud === 'http://127.0.0.1:' + rport && claims.exp > Date.now() / 1000 && crypto.verify('sha256', Buffer.from(hd + '.' + cl), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(sg, 'base64url')); }
const helper = async pick => { const l = await call('POST', 'login', { code: S0.codes.helper }); return (await call('POST', 'register', { pick }, l.body.token)).body.token; };
const wait = ms => new Promise(r => setTimeout(r, ms));

try {
  const key = (await call('GET', 'push-key')).body.key; ok(Buffer.from(key, 'base64url').length === 65, 'Server hat einen öffentlichen Schlüssel');
  ok((await call('GET', 'push-key')).body.key === key, 'der Schlüssel bleibt gleich');
  // Orga
  const lo = await call('POST', 'login', { pw: S0.codes.orga }), to = (await call('POST', 'register', { first: 'Susan', last: 'Fleet', phone: '0151 1112223', email: 's@x.de' }, lo.body.token)).body.token;
  const tB = await helper('Assi'), tD = await helper('Werner'), tC = await helper('Dani'), tE = await helper('Ulli');
  // Magnus steht als benannter SOS-Empfänger auf der Liste und ist zugleich Springer: Assi als benannte Empfängerin hinzufügen
  const dA = device('orga'), dB = device('assi'), dC = device('dani'), dD = device('werner'), dE = device('weg');
  ok((await call('POST', 'push-sub', dA.sub, to)).status === 200, 'Orga meldet ihr Handy an');
  for (const [d, t] of [[dB, tB], [dC, tC], [dD, tD], [dE, tE]]) await call('POST', 'push-sub', d.sub, t);
  ok((await call('POST', 'push-sub', Object.assign({}, dB.sub, { endpoint: 'https://boese.example.com/x' }), tB)).status === 400, 'fremde Adressen werden abgelehnt');
  ok((await call('POST', 'push-sub', dB.sub)).status === 401 || (await call('POST', 'push-sub', dB.sub)).status === 403, 'ohne Anmeldung geht es nicht');
  // Orga macht Assi zum SOS-Empfänger und Ulli (wird gleich ungültig) ebenfalls
  const dbo = (await call('GET', 'db', null, to)).body.db, idAssi = dbo.helpers.find(h => h.name === 'Assi').id, idUlli = dbo.helpers.find(h => h.name === 'Ulli').id;
  ok(Array.isArray(dbo.push) && dbo.push.length === 5, 'Orga sieht, wer Mitteilungen eingeschaltet hat');
  await call('POST', 'patch', { ops: [{ t: 'set', p: ['helpers', '#' + idAssi, 'sos'], v: true }, { t: 'set', p: ['helpers', '#' + idUlli, 'sos'], v: true }] }, to);
  // Dani (normale Helferin) meldet SOS
  const r = await call('POST', 'patch', { ops: [{ t: 'ins', p: ['sos'], v: { id: 'stest1', st: 'sternenschenke', need: '2 Personen', note: 'dringend' } }] }, tC);
  ok(r.status === 200 && r.body.db.sos.some(x => x.id === 'stest1'), 'SOS wird gespeichert und die Antwort kommt sofort');
  await wait(2500);
  ok(got.orga && got.assi && got.werner, 'Orga, SOS-Empfängerin und Springer bekommen eine Mitteilung');
  ok(!got.dani, 'die Melderin selbst und normale Helfer bekommen keine');
  const m = got.orga && decrypt(dA, got.orga[0].body);
  ok(m && m.title === 'SOS: 2 Personen' && m.body.includes('Sternenschenke') && m.body.includes('Dani') && m.body.includes('dringend') && m.url.includes('tab=sos'), 'Mitteilung lässt sich entschlüsseln: ' + (m ? m.title + ' – ' + m.body : ''));
  ok(got.assi && decrypt(dB, got.assi[0].body).tag === 'sos-stest1', 'jede Mitteilung ist für ihr Handy verschlüsselt');
  ok(got.orga && vapidOk(got.orga[0].headers, key) && got.orga[0].headers['content-encoding'] === 'aes128gcm' && got.orga[0].headers.urgency === 'high', 'Absender-Unterschrift (VAPID) ist gültig');
  // abgelaufenes Handy wird entfernt
  ok(got.weg && !(await call('GET', 'db', null, to)).body.db.push.includes(idUlli), 'abgelaufenes Handy wird aus der Liste entfernt');
  // Probe an sich selbst
  const pt = await call('POST', 'push-test', {}, tB); await wait(800);
  ok(pt.status === 200 && pt.body.sent === 1 && got.assi.length === 2 && decrypt(dB, got.assi[1].body).title.includes('Probe'), 'Probe-Mitteilung kommt nur beim eigenen Handy an');
  ok((await call('POST', 'push-unsub', { endpoint: dB.sub.endpoint }, tB)).status === 200 && (await call('POST', 'push-test', {}, tB)).status === 404, 'Handy wieder abmelden');
  ok(!JSON.stringify((await call('GET', 'db', null, tC)).body.db).includes('127.0.0.1'), 'Helfer sehen keine Handy-Adressen');
  for (const f of ['daten/push.php', 'daten/vapid.php']) { const x = await fetch(base + f); ok(x.status === 404 && (await x.text()) === '', f + ' gibt von aussen nichts preis'); }
} finally { php.kill(); recv.close(); }
console.log(fails ? fails + ' von ' + n + ' Prüfungen fehlgeschlagen' : 'Alle ' + n + ' Prüfungen bestanden');
process.exit(fails ? 1 : 0);
