/* Die Regeln des Helferplans: Anmeldung, wer was sehen und ändern darf, Speichern ohne Überschreiben.
   Kennt keinen bestimmten Speicher. Die Server-Funktion gibt Netlify Blobs hinein, die Vorschau den Browser-Speicher.

   store: { get() -> {data, etag} | null, set(data, {isNew} | {etag}) -> true/false, secret() -> Text,
            lock() -> Funktion zum Freigeben (optional), backup(tag, data) (optional), delay (optional) } */
import { applyOp, validOp, at } from './patch.mjs';

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const key = n => String(n == null ? '' : n).trim().toLowerCase();
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const digits = s => String(s || '').replace(/\D/g, '');
const phoneClean = s => str(s, 30).replace(/[^\d+]/g, '');
/* 0171…, +49171… und 0049171… gelten als dieselbe Nummer */
const phoneKey = s => { let d = digits(s); if (d.startsWith('0049')) d = d.slice(4); else if (d.startsWith('49') && d.length > 10) d = d.slice(2); return d.replace(/^0+/, ''); };
const MAILRE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IDRE = /^[a-z0-9]{4,24}$/;
const res = (status, body) => ({ status, body });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
function newId(prefix) { const a = new Uint8Array(8); crypto.getRandomValues(a); return prefix + Array.from(a, b => (b % 36).toString(36)).join(''); }

/* ---------- Anmelde-Ausweis: vom Server unterschrieben, nicht fälschbar ---------- */
const enc = new TextEncoder();
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function hmac(secret, text) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(text)))); }
async function sign(secret, payload) { const body = b64u(enc.encode(JSON.stringify(payload))); return body + '.' + await hmac(secret, body); }
async function verify(secret, token) {
  if (typeof token !== 'string' || !token || token.length > 800) return null;
  const i = token.indexOf('.'); if (i < 1) return null;
  const body = token.slice(0, i), mac = token.slice(i + 1);
  if (await hmac(secret, body) !== mac) return null;
  try { const p = JSON.parse(new TextDecoder().decode(unb64u(body))); return p && typeof p.h === 'string' && IDRE.test(p.h) ? p : null; } catch (e) { return null; } }
const bearer = h => (typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7).trim() : '');
/* Wird das Orga-Passwort geändert, verlieren alte Orga-Ausweise ihre Orga-Rechte */
const pwTag = async (secret, pw) => (await hmac(secret, 'orga:' + pw)).slice(0, 12);

/* ---------- Lesen und sicher schreiben ---------- */
async function load(store, seed) {
  let cur = await store.get();
  if (!cur) { await store.set(seed(), { isNew: true }); cur = await store.get(); }
  if (!cur || !isObj(cur.data) || !isObj(cur.data.years)) throw Object.assign(new Error('storage'), { status: 500, code: 'storage' });
  return cur; }
/* fn ändert den Stand. Zwei Sicherungen gegen gleichzeitiges Überschreiben:
   1. store.lock(): immer nur eine Änderung zur selben Zeit.
   2. etag: der Speicher nimmt die Änderung nur an, wenn der gelesene Stand noch der aktuelle ist. Sonst wird wiederholt. */
async function mutate(store, seed, fn) {
  const unlock = store.lock ? await store.lock() : null;
  try {
    for (let i = 0; i < 8; i++) {
      const cur = await load(store, seed), db = cur.data;
      const before = db.bak !== today() ? JSON.parse(JSON.stringify(db)) : null;
      const out = (await fn(db)) || {};
      if (out.write === false) return { db, out };
      if (before && store.backup) { try { await store.backup(today(), before); } catch (e) {} db.bak = today(); }
      db.rev = (Number(db.rev) || 0) + 1;
      if (await store.set(db, { etag: cur.etag })) return { db, out };
      await sleep(20 + Math.floor(Math.random() * 60));
    }
    throw Object.assign(new Error('busy'), { status: 503, code: 'busy' });
  } finally { if (unlock) { try { await unlock(); } catch (e) {} } } }

/* ---------- Hilfen rund um den Plan ---------- */
const yearOf = db => db.years[db.active] || { stations: [], shifts: [], info: {} };
function planNames(db) { const out = new Map();
  (yearOf(db).shifts || []).forEach(sh => Object.values(sh.cells || {}).forEach(c => (Array.isArray(c.people) ? c.people : []).forEach(p => { const k = key(p); if (k && !out.has(k)) out.set(k, String(p).trim()); })));
  return out; }
const ownNames = (db, id) => new Set(db.helpers.filter(h => h.id === id || h.by === id).map(h => key(h.name)));
function displayName(db, first, last) { const taken = new Set(db.helpers.map(h => key(h.name))); planNames(db).forEach((v, k) => taken.add(k));
  const short = first + ' ' + last.charAt(0).toUpperCase() + '.', full = first + ' ' + last;
  if (!taken.has(key(short))) return short; if (!taken.has(key(full))) return full;
  let n = 2; while (taken.has(key(full + ' ' + n))) n++; return full + ' ' + n; }

async function whoIs(db, secret, tok) {
  const orga = tok.r === 'o' && tok.k === await pwTag(secret, db.codes.orga);
  return { role: orga ? 'orga' : 'helper', id: tok.h, reg: db.helpers.some(h => h.id === tok.h) }; }

/* Was jemand zu sehen bekommt. Handynummern und E-Mails anderer sieht nur die Orga. */
function view(db, me) {
  if (me.role === 'orga') { const out = Object.assign({}, db); delete out.bak; return out; }
  return { rev: db.rev || 0, active: db.active, years: { [db.active]: yearOf(db) }, sos: db.sos, codes: {},
    helpers: db.helpers.map(h => (h.id === me.id || h.by === me.id) ? h : { id: h.id, name: h.name, sos: !!h.sos, role: h.role, by: h.by ? '*' : undefined }) }; }

/* ---------- Was Helfer ändern dürfen ---------- */
function helperOp(db, me, op) {
  const p = op.p, y = yearOf(db), self = db.helpers.find(h => h.id === me.id);
  // Felder im Plan: sich selbst und alle aus der Helferliste eintragen. Austragen nur sich selbst, eigene Begleitung und wen man selbst eingetragen hat.
  if (p[0] === 'years' && p[1] === db.active && p[2] === 'shifts' && String(p[3]).charAt(0) === '#' && p[4] === 'cells' && p.length >= 6) {
    const sh = (y.shifts || []).find(s => s.id === p[3].slice(1)), st = (y.stations || []).find(s => s.id === p[5]);
    if (!sh || !st) return 'gone';
    const cell = (sh.cells || {})[p[5]] || {}, people = Array.isArray(cell.people) ? cell.people : [];
    let add = [], rem = [];
    if (p.length === 7 && p[6] === 'people' && op.t === 'add') add = op.v.filter(n => !people.includes(n));
    else if (p.length === 7 && p[6] === 'people' && op.t === 'rem') rem = op.v;
    else if (p.length === 6 && op.t === 'set' && isObj(op.v) && Array.isArray(op.v.people)) add = op.v.people.filter(n => typeof n === 'string' && !people.includes(n));
    else if (p.length >= 7 && p[6] === 'by') return ''; // wer wen eingetragen hat, führt der Server selbst
    else return 'forbidden';
    const own = ownNames(db, me.id), by = isObj(cell.by) ? cell.by : {}, known = planNames(db); db.helpers.forEach(h => known.set(key(h.name), h.name));
    if (!add.every(n => typeof n === 'string' && n.length <= 80 && (own.has(key(n)) || known.has(key(n))))) return 'forbidden';
    if (!rem.every(n => typeof n === 'string' && (own.has(key(n)) || by[n] === me.id))) return 'forbidden';
    if (add.length) { if (cell.off) return 'off';
      const min = Math.max(1, Number(st.min) || 2), max = Math.max(min, Number(st.max) || min);
      if (people.length + add.length > max) return 'full'; }
    if (!add.length && !rem.length) return '';
    if (!isObj(sh.cells)) sh.cells = {};
    if (!isObj(sh.cells[p[5]])) sh.cells[p[5]] = { people: [], note: '', off: false, tentative: false };
    const c = sh.cells[p[5]]; if (!Array.isArray(c.people)) c.people = [];
    if (!isObj(c.by)) c.by = {};
    add.forEach(n => { c.people.push(n); if (!own.has(key(n))) c.by[n] = me.id; });
    rem.forEach(n => { const i = c.people.indexOf(n); if (i >= 0) c.people.splice(i, 1); delete c.by[n]; });
    if (!Object.keys(c.by).length) delete c.by;
    return '';
  }
  if (p[0] === 'helpers') {
    // weitere Person anlegen, für die man sich mit einträgt
    if (op.t === 'ins' && p.length === 1) { const v = op.v, first = str(v.first, 60), last = str(v.last, 60), name = str(v.name, 80);
      if (!first || !last || !name) return 'bad';
      if (db.helpers.filter(h => h.by === me.id).length >= 30) return 'limit';
      if (db.helpers.some(h => key(h.name) === key(name))) return 'name';
      db.helpers.push({ id: IDRE.test(v.id) && !db.helpers.some(h => h.id === v.id) ? v.id : newId('h'), first, last, phone: phoneClean(v.phone), email: '', again: false, name, sos: false, by: me.id, at: Date.now() });
      return ''; }
    const h = String(p[1] || '').charAt(0) === '#' ? db.helpers.find(x => x.id === p[1].slice(1)) : null;
    if (!h) return 'gone';
    if (!(h.id === me.id || h.by === me.id)) return 'forbidden';
    if (p.length === 3 && op.t === 'set') { const f = p[2];
      if (f === 'again') h.again = !!op.v;
      else if (f === 'phone' && typeof op.v === 'string') h.phone = phoneClean(op.v);
      else if ((f === 'first' || f === 'last') && typeof op.v === 'string' && str(op.v, 60)) h[f] = str(op.v, 60);
      else if (f === 'email' && typeof op.v === 'string' && (op.v === '' || MAILRE.test(op.v))) h.email = str(op.v, 120);
      else return 'forbidden';
      return ''; }
    if (p.length === 2 && op.t === 'del' && h.by === me.id) { db.helpers = db.helpers.filter(x => x !== h); return ''; }
    return 'forbidden';
  }
  if (p[0] === 'sos' && self) {
    if (op.t === 'ins' && p.length === 1) { const v = op.v, st = (y.stations || []).find(s => s.id === v.st);
      if (!str(v.need, 60)) return 'bad';
      if (db.sos.length >= 500) return 'limit';
      db.sos.push({ id: IDRE.test(v.id) && !db.sos.some(x => x.id === v.id) ? v.id : newId('s'), st: str(v.st, 80), stName: st ? st.name : str(v.stName, 80), need: str(v.need, 60), note: str(v.note, 200), by: self.name, at: Date.now(), status: 'open', taker: '' });
      return ''; }
    const x = String(p[1] || '').charAt(0) === '#' ? db.sos.find(s => s.id === p[1].slice(1)) : null;
    if (!x) return 'gone';
    if (p.length === 3 && op.t === 'set' && p[2] === 'status' && (op.v === 'go' || op.v === 'done')) { x.status = op.v; x.taker = self.name; return ''; }
    if (p.length === 3 && op.t === 'set' && p[2] === 'taker') return '';
    return 'forbidden';
  }
  return 'forbidden';
}
/* Die Orga darf alles am Plan ändern. Zugänge und das angezeigte Jahr werden geprüft. */
function orgaOp(db, op) {
  const p = op.p;
  if (!['years', 'helpers', 'sos', 'codes', 'active'].includes(p[0])) return 'forbidden';
  if (p[0] === 'codes') { if (!(p.length === 2 && op.t === 'set' && (p[1] === 'helper' || p[1] === 'orga') && typeof op.v === 'string')) return 'forbidden';
    const v = op.v.trim(), other = db.codes[p[1] === 'helper' ? 'orga' : 'helper'];
    if (v.length < 4 || v.length > 60 || key(v) === key(other)) return 'bad';
    db.codes[p[1]] = v; return p[1] === 'orga' ? 'pw' : ''; }
  if (p[0] === 'active') { if (!(p.length === 1 && op.t === 'set' && typeof op.v === 'string' && isObj(db.years[op.v]))) return 'bad'; db.active = op.v; return ''; }
  if (p[0] === 'years' && p.length === 2 && op.t === 'del') return 'forbidden';
  if (!applyOp(db, op)) return 'gone';
  /* Wird jemand ausgetragen, verschwindet auch der Vermerk, wer ihn eingetragen hat */
  if (p[0] === 'years' && p[2] === 'shifts' && p[4] === 'cells' && p.length >= 6) { const c = at(db, p.slice(0, 6));
    if (isObj(c) && isObj(c.by)) { const ppl = Array.isArray(c.people) ? c.people : []; Object.keys(c.by).forEach(n => { if (!ppl.includes(n)) delete c.by[n]; }); if (!Object.keys(c.by).length) delete c.by; } }
  return '';
}

/* ---------- Die vier Anfragen ---------- */
export async function handle(req, store, seed) {
  try {
    const secret = await store.secret(), route = req.method + ' ' + req.path, b = isObj(req.body) ? req.body : {};
    const wait = store.delay === undefined ? 600 : store.delay;

    if (route === 'POST login') {
      const cur = await load(store, seed); let db = cur.data;
      if (typeof b.code === 'string') {
        if (!b.code.trim() || key(b.code) !== key(db.codes.helper)) { await sleep(wait); return res(401, { error: 'code' }); }
        const tok = { r: 'h', h: newId('h'), t: Date.now() }, me = { role: 'helper', id: tok.h, reg: false };
        return res(200, { token: await sign(secret, tok), me, db: view(db, me), rev: db.rev || 0 }); }
      if (typeof b.pw === 'string') {
        if (!b.pw || b.pw !== db.codes.orga) { await sleep(wait); return res(401, { error: 'pw' }); }
        const prev = await verify(secret, bearer(req.auth)), hid = prev ? prev.h : newId('h');
        if (db.helpers.some(h => h.id === hid && h.role !== 'orga')) db = (await mutate(store, seed, d => { const h = d.helpers.find(x => x.id === hid); if (!h || h.role === 'orga') return { write: false }; h.role = 'orga'; })).db;
        const tok = { r: 'o', h: hid, k: await pwTag(secret, db.codes.orga), t: Date.now() }, me = await whoIs(db, secret, tok);
        return res(200, { token: await sign(secret, tok), me, db: view(db, me), rev: db.rev || 0 }); }
      return res(400, { error: 'bad' });
    }

    const tok = await verify(secret, bearer(req.auth));
    if (!tok) return res(401, { error: 'auth' });

    if (route === 'GET db') {
      const db = (await load(store, seed)).data, me = await whoIs(db, secret, tok);
      if (String(db.rev || 0) === String(req.rev) && req.role === me.role) return res(200, { same: true, me });
      return res(200, { db: view(db, me), rev: db.rev || 0, me });
    }

    if (route === 'POST register') {
      const first = str(b.first, 60), last = str(b.last, 60), phone = phoneClean(b.phone), email = str(b.email, 120), again = !!b.again, claim = str(b.claim, 80);
      if (!first || !last) return res(400, { error: 'name' });
      if (phone && digits(phone).length < 6) return res(400, { error: 'phone' });
      if (email && !MAILRE.test(email)) return res(400, { error: 'email' });
      const r = await mutate(store, seed, async db => {
        const role = (await whoIs(db, secret, tok)).role;
        if (!phone) { // ohne Handynummer: nur für Namen auf der Liste «Ohne Kontaktdaten»
          const y = db.years[db.active] || {}, nc = Array.isArray((y.info || {}).noContact) ? y.info.noContact : [];
          if (!claim || !nc.some(n => key(n) === key(claim))) return { write: false, err: res(400, { error: 'phone' }) };
          const ex = db.helpers.find(h => key(h.name) === key(claim));
          if (ex) { if (ex.phone && !ex.by) return { write: false, err: res(409, { error: 'taken' }) };
            delete ex.by; if (!ex.first) ex.first = first; if (!ex.last) ex.last = last; if (role === 'orga') ex.role = 'orga'; return { id: ex.id, back: true }; }
          const plan = planNames(db), h = { id: tok.h, first, last, phone: '', email: '', again: false, name: plan.get(key(claim)) || claim, sos: false, at: Date.now() };
          if (role === 'orga') h.role = 'orga'; db.helpers.push(h); return { id: h.id }; }
        const old = db.helpers.find(h => !h.by && h.phone && phoneKey(h.phone) === phoneKey(phone));
        if (old) { if (key(old.first) !== key(first)) return { write: false, err: res(409, { error: 'phone' }) };
          if (email) old.email = email; old.again = again || !!old.again; if (!old.last) old.last = last; if (role === 'orga') old.role = 'orga';
          return { id: old.id, back: true }; }
        const mine = db.helpers.find(h => h.id === tok.h);
        if (mine) { Object.assign(mine, { first, last, phone, again }, email ? { email } : {}); if (role === 'orga') mine.role = 'orga'; return { id: mine.id }; }
        if (b.check) return { write: false, need: true };
        if (!email) return { write: false, err: res(400, { error: 'email' }) };
        let name = '';
        if (claim) { const plan = planNames(db), comp = db.helpers.find(h => h.by && key(h.name) === key(claim));
          if (comp) { name = comp.name; db.helpers = db.helpers.filter(h => h !== comp); }
          else if (plan.has(key(claim)) && !db.helpers.some(h => key(h.name) === key(claim))) name = plan.get(key(claim)); }
        if (!name) name = displayName(db, first, last);
        const h = { id: tok.h, first, last, phone, email, again, name, sos: false, at: Date.now() };
        if (role === 'orga') h.role = 'orga';
        db.helpers.push(h); return { id: h.id };
      });
      if (r.out.err) return r.out.err;
      if (r.out.need) return res(200, { need: 'claim' });
      const nt = { r: tok.r, h: r.out.id, k: tok.k, t: Date.now() }, me = await whoIs(r.db, secret, nt);
      return res(200, { token: await sign(secret, nt), me, db: view(r.db, me), rev: r.db.rev || 0, back: !!r.out.back });
    }

    if (route === 'POST patch') {
      if (!Array.isArray(b.ops) || b.ops.length > 600) return res(400, { error: 'bad' });
      const r = await mutate(store, seed, async db => {
        const me = await whoIs(db, secret, tok), rejected = []; let n = 0, pw = false;
        if (me.role !== 'orga' && !me.reg) return { write: false, err: res(403, { error: 'reg' }) };
        /* Personen zuerst anlegen, dann eintragen: die Reihenfolge der Schritte aus der App ist nicht festgelegt */
        const ops = b.ops.filter(o => o && Array.isArray(o.p) && o.p[0] === 'helpers').concat(b.ops.filter(o => !(o && Array.isArray(o.p) && o.p[0] === 'helpers')));
        for (const op of ops) {
          if (!validOp(op)) { rejected.push('bad'); continue; }
          const why = me.role === 'orga' ? orgaOp(db, op) : helperOp(db, me, op);
          if (why === 'pw') { pw = true; n++; } else if (why) rejected.push(why); else n++;
        }
        return n ? { rejected, pw } : { write: false, rejected };
      });
      if (r.out.err) return r.out.err;
      let nt = tok, token;
      if (r.out.pw) { nt = { r: 'o', h: tok.h, k: await pwTag(secret, r.db.codes.orga), t: Date.now() }; token = await sign(secret, nt); }
      const me = await whoIs(r.db, secret, nt);
      return res(200, { db: view(r.db, me), rev: r.db.rev || 0, me, rejected: r.out.rejected || [], token });
    }
    return res(404, { error: 'route' });
  } catch (e) { return res(e.status || 500, { error: e.code || 'server' }); }
}
