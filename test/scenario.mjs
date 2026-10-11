/* Die gemeinsame Prüfliste für die Regeln des Helferplans. Läuft gegen die Netlify-Fassung (core.mjs)
   und gegen die PHP-Fassung (server-php/api.php): beide müssen sich gleich verhalten.
   call(method, path, body, token, {rev, role}) -> {status, body}    raw() -> gespeicherter Stand    backups() -> Anzahl Sicherungen */
import { diff, clone } from '../netlify/functions/lib/patch.mjs';

export async function scenario({ call, raw, backups, S0, ok }) {
const CODE = S0.codes.helper, PW = S0.codes.orga;
const SH = S0.years['2026'].shifts, ST = S0.years['2026'].stations;
const cellPath = (sh, st) => ['years', '2026', 'shifts', '#' + sh, 'cells', st];

// --- Anmeldung
ok((await call('GET', 'db', null, '')).status === 401, 'ohne Anmeldung kein Zugriff');
ok((await call('POST', 'login', { code: 'falsch' })).status === 401, 'falscher Helfer-Code wird abgelehnt');
ok((await call('POST', 'login', { pw: 'falsch' })).status === 401, 'falsches Orga-Passwort wird abgelehnt');
ok((await call('POST', 'login', { pw: CODE })).status === 401, 'Helfer-Code öffnet keinen Orga-Zugang');
const la = await call('POST', 'login', { code: CODE.toLowerCase() });
ok(la.status === 200 && la.body.me.role === 'helper' && !la.body.me.reg, 'Helfer-Code ohne Gross-/Kleinschreibung');
ok(la.body.db.codes && !la.body.db.codes.orga && !la.body.db.codes.helper, 'Helfer bekommen keine Zugangscodes');
ok((await call('POST', 'patch', { ops: [] }, la.body.token)).status === 403, 'ohne Registrierung keine Änderungen');
ok((await call('GET', 'db', null, la.body.token + 'x')).status === 401, 'veränderter Ausweis wird abgelehnt');

// --- Registrierung
const chk = await call('POST', 'register', { first: 'Astrid', last: 'König', phone: '0171 2345678', email: 'astrid@beispiel.de', check: true }, la.body.token);
ok(chk.status === 200 && chk.body.need === 'claim', 'neue Person: Rückfrage vor dem Anlegen');
const ra = await call('POST', 'register', { first: 'Astrid', last: 'König', phone: '0171 2345678', email: 'astrid@beispiel.de', again: true }, la.body.token);
ok(ra.status === 200 && ra.body.me.reg && ra.body.db.helpers.find(h => h.id === ra.body.me.id).name === 'Astrid K.', 'Astrid K. ist angelegt');
const A = ra.body.token, aId = ra.body.me.id;
ok((await call('POST', 'register', { first: 'X', last: 'Y', phone: '12', email: 'a@b.de' }, la.body.token)).status === 400, 'ungültige Handynummer');

const lo = await call('POST', 'login', { pw: PW });
ok(lo.status === 200 && lo.body.me.role === 'orga' && lo.body.db.codes.orga === PW, 'Orga-Login');
const ro = await call('POST', 'register', { first: 'Susan', last: 'Fleet', phone: '+49 151 1112223', email: 'susan@beispiel.de' }, lo.body.token);
const O = ro.body.token, oId = ro.body.me.id;
ok(ro.body.me.role === 'orga' && ro.body.db.helpers.find(h => h.id === oId).role === 'orga', 'Orga ist auch Helferin mit eigenem Eintrag');

// --- Wer sieht was
const va = (await call('GET', 'db', null, A, { rev: '-1', role: 'helper' })).body.db;
const seenO = va.helpers.find(h => h.id === oId);
ok(seenO && seenO.name === 'Susan F.' && !('phone' in seenO) && !('email' in seenO) && !('last' in seenO), 'Helfer sehen von anderen nur den Namen');
ok(va.helpers.find(h => h.id === aId).phone === '01712345678', 'die eigenen Daten sieht man');
const vo = (await call('GET', 'db', null, O, { rev: '-1', role: 'orga' })).body.db;
ok(vo.helpers.find(h => h.id === aId).email === 'astrid@beispiel.de', 'Orga sieht Kontaktdaten');
const same = await call('GET', 'db', null, O, { rev: String(vo.rev), role: 'orga' });
ok(same.body.same === true, 'unveränderter Stand wird nicht noch einmal geschickt');

// --- Eintragen: beide gleichzeitig in dasselbe leere Feld, niemand geht verloren
const openCell = (() => { for (const sh of SH) for (const st of ST) { const c = (sh.cells || {})[st.id]; if ((!c || (!c.off && !(c.people || []).length)) && Math.max(st.min || 2, st.max || 0) >= 2) return [sh.id, st.id, !c]; } })();
const [sh1, st1] = openCell;
const baseA = clone(va), baseO = clone(vo);
const put = (db, sh, st, people) => { const s = db.years['2026'].shifts.find(x => x.id === sh); s.cells = s.cells || {}; s.cells[st] = { people, note: '', off: false, tentative: false }; };
const nowA = clone(baseA); put(nowA, sh1, st1, ['Astrid K.']);
const nowO = clone(baseO); put(nowO, sh1, st1, ['Susan F.']);
const pa = await call('POST', 'patch', { ops: diff(baseA, nowA) }, A);
const po = await call('POST', 'patch', { ops: diff(baseO, nowO) }, O);
const both = po.body.db.years['2026'].shifts.find(x => x.id === sh1).cells[st1].people;
ok(pa.status === 200 && po.status === 200 && both.includes('Astrid K.') && both.includes('Susan F.'), 'gleichzeitige Einträge bleiben beide erhalten: ' + JSON.stringify(both));
const seenByA = (await call('GET', 'db', null, A, { rev: '0', role: 'helper' })).body.db.years['2026'].shifts.find(x => x.id === sh1).cells[st1].people;
ok(seenByA.includes('Susan F.'), 'Astrid sieht den Eintrag von Susan');

// --- Helfer dürfen nur sich selbst ein- und austragen
const other = (() => { for (const sh of SH) for (const [st, c] of Object.entries(sh.cells || {})) if ((c.people || []).length && !c.off) return [sh.id, st, c.people[0]]; })();
const r1 = await call('POST', 'patch', { ops: [{ t: 'rem', p: cellPath(other[0], other[1]).concat('people'), v: [other[2]] }] }, A);
ok(r1.body.rejected[0] === 'forbidden' && raw().years['2026'].shifts.find(x => x.id === other[0]).cells[other[1]].people.includes(other[2]), 'Helfer können niemand anderen austragen');
const r2 = await call('POST', 'patch', { ops: [{ t: 'add', p: cellPath(sh1, st1).concat('people'), v: ['Irgendwer'] }] }, A);
ok(r2.body.rejected[0] === 'forbidden', 'Helfer können keine fremden Namen eintragen');
for (const op of [{ t: 'set', p: ['codes', 'orga'], v: 'gehackt123' }, { t: 'set', p: ['helpers', '#' + aId, 'role'], v: 'orga' }, { t: 'set', p: ['helpers', '#' + oId, 'phone'], v: '0' }, { t: 'del', p: ['years', '2026', 'stations', '#' + ST[0].id] }, { t: 'set', p: ['active'], v: '2026' }, { t: 'set', p: cellPath(sh1, st1).concat('off'), v: true }, { t: 'set', p: ['__proto__', 'x'], v: 1 }]) {
  const r = await call('POST', 'patch', { ops: [op] }, A); ok(r.status === 200 && r.body.rejected.length === 1, 'Helfer-Änderung abgelehnt: ' + op.p.join('/')); }
ok(raw().codes.orga === PW && !raw().helpers.find(h => h.id === aId).role, 'Stand ist unverändert');

// --- Weitere Person mit eintragen
const comp = { id: 'hbegleit01', first: 'Lena', last: 'König', phone: '', name: 'Lena K.', by: 'egal', role: 'orga', sos: true };
await call('POST', 'patch', { ops: [{ t: 'set', p: ['years', '2026', 'stations', '#' + st1, 'max'], v: 9 }, { t: 'set', p: cellPath(SH[1].id, st1).concat('off'), v: false }] }, O);
const r3 = await call('POST', 'patch', { ops: [{ t: 'ins', p: ['helpers'], v: comp }, { t: 'add', p: cellPath(SH[1].id, st1).concat('people'), v: ['Lena K.'] }] }, A);
if (r3.body.rejected.length) console.log('  abgelehnt:', r3.body.rejected);
const lena = raw().helpers.find(h => h.name === 'Lena K.');
ok(r3.body.rejected.length === 0 && lena && lena.by === aId && !lena.role && !lena.sos, 'Begleitperson angelegt, Rechte nicht übernehmbar');
ok(raw().years['2026'].shifts.find(x => x.id === SH[1].id).cells[st1].people.includes('Lena K.'), 'Begleitperson ist eingetragen');
const r4 = await call('POST', 'patch', { ops: [{ t: 'rem', p: cellPath(SH[1].id, st1).concat('people'), v: ['Lena K.'] }] }, O);
ok(r4.body.rejected.length === 0, 'Orga darf jeden austragen');
const r5 = await call('POST', 'patch', { ops: [{ t: 'ins', p: ['helpers'], v: { id: 'hfremd0001', first: 'Susan', last: 'F', name: 'Susan F.' } }] }, A);
ok(r5.body.rejected[0] === 'name', 'angemeldete Personen kann man nicht als Begleitung übernehmen');

const r5b = await call('POST', 'patch', { ops: [{ t: 'add', p: cellPath(SH[1].id, st1).concat('people'), v: ['Tom K.'] }, { t: 'ins', p: ['helpers'], v: { id: 'hbegleit02', first: 'Tom', last: 'König', name: 'Tom K.' } }] }, A);
ok(r5b.body.rejected.length === 0 && raw().years['2026'].shifts.find(x => x.id === SH[1].id).cells[st1].people.includes('Tom K.'), 'neue Person und ihr Eintrag in einem Rutsch, egal in welcher Reihenfolge');

// --- Volle und gesperrte Schichten
const full = await call('POST', 'patch', { ops: [{ t: 'set', p: ['years', '2026', 'stations', '#' + st1, 'max'], v: 2 }, { t: 'set', p: ['years', '2026', 'stations', '#' + st1, 'min'], v: 2 }] }, O);
ok(full.body.rejected.length === 0, 'Orga ändert den Stand');
const r6 = await call('POST', 'patch', { ops: [{ t: 'add', p: cellPath(sh1, st1).concat('people'), v: ['Lena K.'] }] }, A);
ok(r6.body.rejected[0] === 'full', 'volle Schicht nimmt niemanden mehr an');
await call('POST', 'patch', { ops: [{ t: 'set', p: cellPath(SH[2].id, st1), v: { people: [], note: 'gesperrt', off: true, tentative: false } }] }, O);
const r7 = await call('POST', 'patch', { ops: [{ t: 'add', p: cellPath(SH[2].id, st1).concat('people'), v: ['Astrid K.'] }] }, A);
ok(r7.body.rejected[0] === 'off', 'gesperrte Schicht nimmt niemanden an');

// --- SOS
const s1 = await call('POST', 'patch', { ops: [{ t: 'ins', p: ['sos'], v: { id: 'sos0000001', st: ST[0].id, need: 'Becher', note: '200 Stück', by: 'Jemand anderes', status: 'done' } }] }, A);
const sos = raw().sos[0];
ok(s1.body.rejected.length === 0 && sos.by === 'Astrid K.' && sos.status === 'open' && sos.stName === ST[0].name, 'SOS mit richtigem Absender');

// --- Wiederkommen mit derselben Handynummer, auch von einem zweiten Gerät
const l2 = await call('POST', 'login', { code: CODE });
const back = await call('POST', 'register', { first: 'astrid', last: 'König', phone: '+49 171 2345678', email: 'neu@beispiel.de', check: true }, l2.body.token);
ok(back.status === 200 && back.body.back && back.body.me.id === aId, 'gleiche Nummer in anderer Schreibweise: gleiche Person');
ok((await call('POST', 'register', { first: 'Bernd', last: 'X', phone: '01712345678', email: 'b@beispiel.de', check: true }, l2.body.token)).status === 409, 'fremde Nummer mit anderem Vornamen wird abgelehnt');
ok(raw().helpers.filter(h => !h.by).length === 2, 'keine doppelten Einträge');

// --- Im Plan vorhandenen Namen übernehmen
const l3 = await call('POST', 'login', { code: CODE });
const r8 = await call('POST', 'register', { first: 'Assi', last: 'Muster', phone: '0160 9998887', email: 'assi@beispiel.de', claim: 'Assi' }, l3.body.token);
ok(r8.body.db.helpers.find(h => h.id === r8.body.me.id).name === 'Assi', 'bestehender Name aus dem Plan wird übernommen');
const r9 = await call('POST', 'register', { first: 'Susi', last: 'Frech', phone: '0160 1112223', email: 's@beispiel.de', claim: 'Susan F.' }, (await call('POST', 'login', { code: CODE })).body.token);
ok(r9.body.db.helpers.find(h => h.id === r9.body.me.id).name !== 'Susan F.', 'Name einer angemeldeten Person kann nicht übernommen werden');

// --- Orga: Zugänge ändern, alte Orga-Ausweise verlieren ihre Rechte
const o2 = await call('POST', 'login', { pw: PW }, A);
ok(o2.body.me.role === 'orga' && o2.body.me.id === aId, 'Helferin bekommt mit dem Passwort Orga-Rechte dazu');
const cp = await call('POST', 'patch', { ops: [{ t: 'set', p: ['codes', 'orga'], v: 'Neues-Passwort-2026' }] }, O);
ok(cp.body.token && cp.body.me.role === 'orga', 'wer das Passwort ändert, bleibt Orga');
const after = await call('GET', 'db', null, o2.body.token, { rev: '-1', role: 'orga' });
ok(after.body.me.role === 'helper' && !after.body.db.codes.orga && !('phone' in after.body.db.helpers.find(h => h.id === oId)), 'alter Orga-Ausweis ist nur noch Helfer');
ok((await call('POST', 'patch', { ops: [{ t: 'set', p: ['codes', 'helper'], v: 'abc' }] }, cp.body.token)).body.rejected[0] === 'bad', 'zu kurzer Code wird abgelehnt');

// --- Neues Jahr: Helfer sehen nur das freigeschaltete
const y27 = clone(raw().years['2026']); y27.info.title = 'Sternenzauber 2027';
await call('POST', 'patch', { ops: [{ t: 'set', p: ['years', '2027'], v: y27 }] }, cp.body.token);
ok(Object.keys((await call('GET', 'db', null, A, { rev: '-1', role: 'helper' })).body.db.years).join() === '2026', 'Helfer sehen das neue Jahr noch nicht');
ok((await call('POST', 'patch', { ops: [{ t: 'del', p: ['years', '2026'] }] }, cp.body.token)).body.rejected[0] === 'forbidden', 'ein Jahr kann nicht gelöscht werden');

// --- Sicherung und Zähler
ok(backups() === 1, 'eine Sicherungskopie pro Tag');
ok(raw().rev > 5, 'jede Änderung erhöht den Zähler');

// --- Viele gleichzeitige Änderungen
const tokens = [];
for (let i = 0; i < 12; i++) { const l = await call('POST', 'login', { code: CODE }); const r = await call('POST', 'register', { first: 'Gast' + i, last: 'Test', phone: '0170 55500' + String(i).padStart(2, '0'), email: 'g' + i + '@beispiel.de' }, l.body.token); tokens.push([r.body.token, r.body.db.helpers.find(h => h.id === r.body.me.id).name]); }
await call('POST', 'patch', { ops: [{ t: 'set', p: ['years', '2026', 'stations', '#' + ST[1].id, 'max'], v: 20 }, { t: 'set', p: cellPath(SH[3].id, ST[1].id), v: { people: [], note: '', off: false, tentative: false } }] }, cp.body.token);
const rs = await Promise.all(tokens.map(([t, name]) => call('POST', 'patch', { ops: [{ t: 'add', p: cellPath(SH[3].id, ST[1].id).concat('people'), v: [name] }] }, t)));
const crowd = raw().years['2026'].shifts.find(x => x.id === SH[3].id).cells[ST[1].id].people;
ok(rs.every(r => r.status === 200 && !r.body.rejected.length) && tokens.every(([, name]) => crowd.includes(name)), '12 gleichzeitige Einträge kommen alle an: ' + crowd.length);

}
