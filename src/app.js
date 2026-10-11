(() => {
'use strict';
const SEED = __SNAP__;
const REMOTE = __REMOTE__;
const API = '__API__'; /* 'netlify': /api/…   'php': api.php?r=… (normales Webhosting) */
__SHARED__
const { diff, applyOps, clone } = PATCH;
const $ = s => document.querySelector(s);
const view = $('#view'), dlg = $('#dlg'), toastEl = $('#toast');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const WD = ['So','Mo','Di','Mi','Do','Fr','Sa'];
const WDL = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const MON = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const NARROW = window.matchMedia('(max-width: 760px)');
const OTHER = 'Weitere', LS = REMOTE ? 'sz.live.v1' : 'sz.vorschau.v3', SS = REMOTE ? 'sz.live.me' : 'sz.vorschau.me3';
const NEEDS = ['Becher', 'Wechselgeld', 'Wertmarken', 'Getränke-Nachschub', 'Essen-Nachschub', 'Person fehlt', 'Strom / Technik', 'Sonstiges'];
const STANDALONE = __STANDALONE__;
const LOGO = '__LOGO__';
const MAILRE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE = { helper: 'Helfer', orga: 'Orga' };
const VERSION = '__VERSION__';
const MADE_URL = 'https://susanfleet.de'; /* Link hinter «Made with ♥ by Susan Fleet» */
const NET = 'Keine Verbindung. Bitte später noch einmal versuchen.';
const rid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- Speicher: der gemeinsame Stand liegt auf dem Server, das Gerät merkt sich eine Kopie ---------- */
const empty = () => ({ rev: 0, active: '2026', years: { '2026': { stations: [], shifts: [], info: { title: 'Sternenzauber 2026', groups: [], notes: [] } } }, helpers: [], sos: [], codes: {} });
const okDb = d => !!d && !!d.years && !!d.years[d.active] && Array.isArray(d.helpers) && Array.isArray(d.sos);
/* Anmeldung bleibt auf dem Gerät, bis man «Abmelden» tippt */
function loadMe() { try { const m = JSON.parse(localStorage.getItem(SS)); if (m && m.role && m.token) return m; } catch (e) {} return null; }
function setMe(m) { ME = m; try { if (m) localStorage.setItem(SS, JSON.stringify(m)); else localStorage.removeItem(SS); } catch (e) {} }
function loadCache() { try { const d = JSON.parse(localStorage.getItem(LS)); if (okDb(d)) { if (!d.codes) d.codes = {}; return d; } } catch (e) {} return null; }
function cache() { try { if (ME) localStorage.setItem(LS, JSON.stringify(BASE)); else localStorage.removeItem(LS); } catch (e) {} }
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
let ME = loadMe();
let DB = (ME && loadCache()) || empty(), BASE = clone(DB);
const S = { tab: 'plan', day: null, shift: null, group: 'all', q: '', openPerson: null, gate: 'start', prog: null, pendingRole: null, tok: null, year: null };
let D = null, toastTimer = 0, busy = false, again = false;
const YR = () => (S.year && DB.years[S.year] ? S.year : DB.active);
const Y = () => DB.years[YR()];
const isOrga = () => !!ME && ME.role === 'orga';
const meHelper = () => (ME && ME.id ? DB.helpers.find(h => h.id === ME.id) : null) || null;
const myName = () => { const h = meHelper(); return h ? h.name : ME ? ROLE[ME.role] : ''; };
/* ich selbst und alle, die ich mit eingetragen habe */
const myPeople = () => { const me = meHelper(); return me ? [me].concat(DB.helpers.filter(h => h.by === me.id)) : []; };

/* Vorschau ohne Server: dieselben Regeln laufen im Browser, gespeichert wird nur auf diesem Gerät */
const localStore = REMOTE ? null : { delay: 0,
  async get() { const t = localStorage.getItem('sz.vorschau.server'); return t ? { data: JSON.parse(t), etag: '' } : null; },
  async set(data) { localStorage.setItem('sz.vorschau.server', JSON.stringify(data)); return true; },
  async secret() { let x = localStorage.getItem('sz.vorschau.secret'); if (!x) { x = rid('k') + rid('k'); localStorage.setItem('sz.vorschau.secret', x); } return x; } };
async function api(path, body) {
  const auth = 'Bearer ' + ((ME && ME.token) || S.tok || '');
  if (!REMOTE) { const q = new URLSearchParams(path.split('?')[1] || '');
    const r = await CORE.handle({ method: body ? 'POST' : 'GET', path: path.split('?')[0], rev: q.get('rev'), role: q.get('role'), body: body ? clone(body) : null, auth }, localStore, () => clone(SEED));
    if (r.status >= 400) throw Object.assign(new Error(r.body.error), { status: r.status, code: r.body.error });
    return clone(r.body); }
  const cut = path.indexOf('?'), name = cut < 0 ? path : path.slice(0, cut), query = cut < 0 ? '' : path.slice(cut + 1);
  const url = API === 'php' ? 'api.php?r=' + name + (query ? '&' + query : '') : '/api/' + path;
  const headers = API === 'php' ? { 'x-sz-token': auth.slice(7) } : { authorization: auth }; if (body) headers['content-type'] = 'application/json';
  const r = await fetch(url, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok || !j) throw Object.assign(new Error('http'), { status: r.status, code: (j && j.error) || 'http' });
  return j;
}
function take(r) { if (r && okDb(r.db)) { BASE = r.db; if (!BASE.codes) BASE.codes = {}; DB = clone(BASE); } }
/* Der Server sagt bei jeder Antwort, wer ich bin. Fehlt mein Eintrag, geht es zurück zur Anmeldung. */
function applyMe(me) { if (!me || !ME) return;
  if (!me.reg) { S.tok = ME.token; S.pendingRole = me.role === 'orga' ? 'orga' : null; S.gate = 'reg'; setMe(null); if (dlg.open) dlg.close(); return; }
  if (me.role !== ME.role || me.id !== ME.id) { setMe({ role: me.role, id: me.id, token: ME.token }); S.prog = null; S.year = null; BASE.rev = -1; setTimeout(pull, 60); } }
function refreshDlg() { if (!D || !dlg.open) return; const y = Y();
  if (D.sh && D.sh.id) D.sh = y.shifts.find(x => x.id === D.sh.id) || D.sh;
  if (D.st && D.st.id) D.st = y.stations.find(x => x.id === D.st.id) || D.st;
  if (D.type === 'hcell' && ![...dlg.querySelectorAll('input')].some(i => i.value)) drawDlg(); }
const REJ = { full: 'Diese Schicht wurde gerade von jemand anderem besetzt.', off: 'Diese Schicht ist inzwischen gesperrt.', name: 'Diese Person ist schon selbst angemeldet.', gone: 'Das gibt es inzwischen nicht mehr. Der Plan wurde aktualisiert.' };
function netFail(e) { if (e && e.status === 401) { signOut(); toast('Bitte melde dich neu an.'); return true; } return false; }
/* Änderungen an den Server schicken. Er führt sie mit den Änderungen aller anderen zusammen. */
async function push() {
  if (!ME) return; if (busy) { again = true; return; }
  const ops = diff(BASE, DB); if (!ops.length) return;
  busy = true; const sent = clone(DB);
  try { const r = await api('patch', { ops }), later = diff(sent, DB);
    if (r.token) setMe(Object.assign({}, ME, { token: r.token }));
    BASE = r.db; if (!BASE.codes) BASE.codes = {}; DB = applyOps(clone(BASE), later); applyMe(r.me);
    refreshDlg(); cache(); render();
    if (r.rejected && r.rejected.length) toast(REJ[r.rejected[0]] || 'Das konnte nicht gespeichert werden.');
  } catch (e) { DB = clone(BASE); refreshDlg(); render(); if (!netFail(e)) toast('Keine Verbindung. Das wurde nicht gespeichert.'); }
  finally { busy = false; if (ME && (again || diff(BASE, DB).length)) { again = false; push(); } }
}
/* Neuesten Stand holen: beim Öffnen, alle 30 Sekunden (solange die App offen ist) und über «Aktualisieren» */
async function pull(manual) {
  if (!ME) return; if (busy) { again = true; return; }
  busy = true; const sent = clone(DB);
  try { const r = await api('db?rev=' + (BASE.rev || 0) + '&role=' + ME.role);
    if (!r.same) { const later = diff(sent, DB); BASE = r.db; if (!BASE.codes) BASE.codes = {}; DB = applyOps(clone(BASE), later); }
    applyMe(r.me); refreshDlg(); cache(); if (!r.same || manual === true || !ME) render();
    if (manual === true && ME) toast('Stand aktualisiert');
  } catch (e) { if (!netFail(e) && manual === true) toast(NET); }
  finally { busy = false; if (ME && (again || diff(BASE, DB).length)) { again = false; push(); } }
}
function persist() { push(); }
function signOut() { setMe(null); DB = empty(); BASE = clone(DB); cache(); S.gate = 'start'; S.pendingRole = null; S.tok = null; S.pending = null; S.tab = 'plan'; S.prog = null; S.year = null; if (dlg.open) dlg.close(); render(); }
function lock(form, on) { form.querySelectorAll('button, input, select').forEach(el => { el.disabled = on; }); }

/* ---------- Datenmodell ---------- */
const dayInfo = d => { const [y, m, dd] = d.split('-').map(Number); const dt = new Date(y, m - 1, dd);
  return { wd: WD[dt.getDay()], wdl: WDL[dt.getDay()], dm: dd + '.' + m + '.', d: dd, m, y }; };
const mins = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const dur = sh => { let e = mins(sh.end) - mins(sh.start); if (e <= 0) e += 1440; return e; };
const span = sh => sh.start + '–' + sh.end;
const hours = m => (Math.round(m / 6) / 10).toLocaleString('de-DE') + ' Std.';
const key = n => String(n).trim().toLowerCase();
const grp = st => st.group || OTHER;
const clock = ts => { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

function cellOf(sh, st) { const c = (sh.cells || {})[st.id] || {};
  return { people: Array.isArray(c.people) ? c.people : [], note: c.note || '', off: !!c.off, tentative: !!c.tentative, bulk: !!c.bulk, by: c.by && typeof c.by === 'object' ? c.by : {} }; }
function statusOf(sh, st) { const c = cellOf(sh, st), min = Math.max(1, Number(st.min) || 2), n = c.people.length;
  c.k = c.off ? 'off' : n === 0 ? 'open' : n < min ? 'part' : c.tentative ? 'tent' : 'ok';
  c.min = min; c.max = Math.max(min, Number(st.max) || min); c.missing = c.off ? 0 : Math.max(0, min - n); c.att = c.k === 'open' || c.k === 'part' || c.k === 'tent';
  return c; }
function needText(st) { const a = Math.max(1, Number(st.min) || 2), b = Number(st.max) || a;
  return (b > a ? a + '–' + b : a) + (b === 1 ? ' Person' : ' Pers.'); }
function missText(c) { if (c.k === 'tent') return 'unbestätigt'; if (c.k === 'open') return c.min === 1 ? '1 Person gesucht' : c.min + ' gesucht';
  return c.missing === 1 ? '1 fehlt' : c.missing + ' fehlen'; }

function model() {
  const y = Y(), info = y.info || {}, groups = Array.isArray(info.groups) ? info.groups.slice() : [];
  y.stations.forEach(s => { if (!groups.includes(grp(s))) groups.push(grp(s)); });
  const stations = y.stations.slice().sort((a, b) => groups.indexOf(grp(a)) - groups.indexOf(grp(b)) || (a.order || 999) - (b.order || 999) || String(a.name).localeCompare(String(b.name), 'de'));
  const shifts = y.shifts.filter(s => s.date && s.start && s.end).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const days = [...new Set(shifts.map(s => s.date))];
  const conf = {}, people = new Map();
  shifts.forEach(sh => { const seen = conf[sh.id] = {};
    stations.forEach(st => { const c = cellOf(sh, st); if (c.off) return;
      c.people.forEach(p => { const k = key(p); if (!k) return; (seen[k] = seen[k] || []).push(st);
        if (!people.has(k)) people.set(k, { name: p.trim(), slots: [], mins: 0 });
        const P = people.get(k); P.slots.push({ sh, st, c }); P.mins += dur(sh); }); }); });
  return { info, groups, stations, shifts, days, conf, people, mine: new Set(myPeople().map(h => key(h.name))) };
}
const isDouble = (m, sh, p) => ((m.conf[sh.id] || {})[key(p)] || []).length > 1;
const inGroup = st => S.group === 'all' || grp(st) === S.group;
const openSos = () => DB.sos.filter(x => x.status !== 'done').length;
const isSosStation = st => st.sos === undefined ? /springer/i.test(st.name || '') : !!st.sos;
function sosTeam(m) { const out = new Set(); m.people.forEach((p, k) => { if (p.slots.some(x => isSosStation(x.st))) out.add(k); }); return out; }
function canHandle(m) { const me = meHelper(); return isOrga() || (!!me && (me.sos || sosTeam(m).has(key(me.name)))); }
function setCell(sh, st, data) { const real = Y().shifts.find(s => s.id === sh.id); if (!real) return; real.cells = real.cells || {}; real.cells[st.id] = data; }
/* Nur die Namen eines Felds ändern. by merkt sich, wer jemand anderen eingetragen hat: diese Person darf den Eintrag auch wieder entfernen. */
function setPeople(sh, st, people, by) { const real = Y().shifts.find(x => x.id === sh.id); if (!real) return; real.cells = real.cells || {};
  const next = Object.assign({ note: '', off: false, tentative: false }, real.cells[st.id] || {}, { people }); if (Object.keys(by).length) next.by = by; else delete next.by; real.cells[st.id] = next; }

/* ---------- Rahmen ---------- */
function tabsFor() { const h = meHelper();
  if (isOrga()) return [['plan', 'Plan'], ['offen', 'Offen'], ['meine', 'Meine'], ['helfer', 'Helfer'], ['sos', 'SOS'], ['einrichten', 'Einrichten']];
  return [['plan', 'Plan'], ['meine', 'Meine Schichten'], ['sos', 'SOS']]; }
function attCount(m, shifts) { let n = 0; shifts.forEach(sh => m.stations.forEach(st => { if (inGroup(st) && statusOf(sh, st).att) n++; })); return n; }
function drawFrame(m) {
  $('#title').textContent = m.info.title || 'Sternenzauber';
  $('.brand .logo').hidden = !ME;
  const cover = $('#cover'), bar = $('#userbar'), tabs = $('#tabs');
  if (!ME) { cover.hidden = bar.hidden = tabs.hidden = true; $('#sub').textContent = 'Standbesetzung · Helferplan'; return; }
  if (m.days.length) { const a = dayInfo(m.days[0]), b = dayInfo(m.days[m.days.length - 1]);
    const range = m.days.length === 1 ? a.d + '. ' + MON[a.m - 1] + ' ' + a.y : (a.m === b.m ? a.d + '.–' + b.d + '. ' + MON[b.m - 1] : a.d + '. ' + MON[a.m - 1] + ' – ' + b.d + '. ' + MON[b.m - 1]) + ' ' + b.y;
    $('#sub').textContent = 'Standbesetzung · ' + range + ' · ' + m.shifts.length + ' Schichten · ' + m.stations.length + ' Stände';
  } else $('#sub').textContent = 'Standbesetzung · noch kein Plan angelegt';
  const t = { ok: 0, part: 0, open: 0 };
  m.shifts.forEach(sh => m.stations.forEach(st => { const k = statusOf(sh, st).k; if (k === 'off') return; t[k === 'tent' ? 'part' : k]++; }));
  const tot = t.ok + t.part + t.open, pc = n => (n / (tot || 1) * 100).toFixed(2) + '%';
  cover.hidden = !tot;
  cover.innerHTML = '<div class="bar" role="img" aria-label="' + t.ok + ' von ' + tot + ' Einsätzen besetzt"><i class="b-ok" style="width:' + pc(t.ok) + '"></i><i class="b-part" style="width:' + pc(t.part) + '"></i><i class="b-open" style="width:' + pc(t.open) + '"></i></div>'
    + '<div class="nums"><span><i class="dot ok"></i><b>' + t.ok + '</b> besetzt</span><span><i class="dot part"></i><b>' + t.part + '</b> unvollständig</span><span><i class="dot open"></i><b>' + t.open + '</b> offen</span></div>';
  const years = Object.keys(DB.years).sort();
  bar.hidden = false;
  bar.innerHTML = '<span>Angemeldet als <b>' + esc(myName()) + '</b><span class="role' + (isOrga() ? ' strong' : '') + '">' + ROLE[ME.role] + '</span></span><span class="row">'
    + (isOrga() && years.length > 1 ? '<select id="yearsel" aria-label="Jahr">' + years.map(y => '<option value="' + esc(y) + '"' + (y === YR() ? ' selected' : '') + '>' + esc(y) + '</option>').join('') + '</select>' : '')
    + '<button class="btn" data-h="refresh">Aktualisieren</button>' + (isOrga() ? '' : '<button class="btn quiet" data-h="elevate">Orga-Login</button>') + '<button class="btn quiet" data-h="logout">Abmelden</button></span>';
  const list = tabsFor(); if (!list.some(x => x[0] === S.tab)) S.tab = 'plan';
  const cnt = { offen: isOrga() ? t.part + t.open : 0, sos: canHandle(m) ? openSos() : 0 };
  tabs.hidden = false;
  tabs.innerHTML = list.map(([id, label]) => '<button role="tab" data-tab="' + id + '"' + (id === 'sos' ? ' class="t-sos"' : '') + ' aria-selected="' + (id === S.tab) + '">' + label + (cnt[id] ? '<span class="n">' + cnt[id] + '</span>' : '') + '</button>').join('');
}

/* ---------- Anmeldung ---------- */
function vGate() {
  const P = S.pending || {};
  const hint = REMOTE ? '' : '<p class="banner info">Vorschau zum Ausprobieren. Alles bleibt nur in diesem Browser gespeichert. Codes zum Testen: Helfer <b>' + esc(SEED.codes.helper) + '</b>, Orga <b>' + esc(SEED.codes.orga) + '</b>.</p>';
  let h;
  if (S.gate === 'reg') h = '<h2>Wer bist du?</h2><p class="muted">' + (S.pendingRole ? 'Auch im Orga-Team bist du Helfer. Trag dich einmal ein, dann kannst du selbst Schichten übernehmen und stehst in der Helferliste. Deine Orga-Rechte bleiben.' : 'Einmal ausfüllen, danach merkt sich dein Handy die Anmeldung. Deine Handynummer und E-Mail sieht nur die Orga.') + '</p><form id="f-reg" novalidate>'
    + '<div class="two"><div class="field"><label for="g-first">Vorname</label><input id="g-first" autocomplete="given-name" value="' + esc(P.first || '') + '"></div><div class="field"><label for="g-last">Nachname</label><input id="g-last" autocomplete="family-name" value="' + esc(P.last || '') + '"></div></div>'
    + '<div class="field"><label for="g-phone">Handynummer</label><input id="g-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="z. B. 0171 2345678" value="' + esc(P.phone || '') + '"></div>'
    + '<div class="field"><label for="g-mail">E-Mail</label><input id="g-mail" type="email" inputmode="email" autocomplete="email" placeholder="name@beispiel.de" value="' + esc(P.email || '') + '"></div>'
    + '<label class="check"><input type="checkbox" id="g-ok"><span>Ich bin einverstanden, dass mein Name im Helferplan steht und die Orga meine Handynummer und E-Mail für den Sternenzauber nutzt.</span></label>'
    + '<label class="check"><input type="checkbox" id="g-again"><span>Ihr dürft mich nächstes Jahr wieder anschreiben, wenn der Helferplan öffnet. (freiwillig)</span></label>'
    + '<p class="hint warn" id="g-err" hidden></p><div class="row"><button type="button" class="btn" data-act="gate" data-v="start">Zurück</button><button type="submit" class="btn primary">Zum Plan</button></div></form>';
  else if (S.gate === 'orga') h = '<h2>Orga-Login</h2><p class="muted">Für das Orga-Team.</p><form id="f-orga" novalidate>'
    + '<div class="field"><label for="g-pw">Passwort</label><input id="g-pw" type="password" autocomplete="current-password"></div>'
    + '<p class="hint warn" id="g-err" hidden></p><div class="row"><button type="button" class="btn" data-act="gate" data-v="start">Zurück</button><button type="submit" class="btn primary">Anmelden</button></div></form>';
  else h = '<h2>Schön, dass du mithilfst</h2><p class="muted">Gib den Helfer-Code aus der WhatsApp-Gruppe ein. Danach trägst du dich selbst in freie Schichten ein.</p><form id="f-code" novalidate>'
    + '<div class="field"><label for="g-code">Helfer-Code</label><input id="g-code" autocomplete="off" autocapitalize="characters"></div>'
    + '<p class="hint warn" id="g-err" hidden></p><button type="submit" class="btn primary">Weiter</button></form>';
  if (S.gate === 'claim') { const m = model();
    h = '<h2>Stehst du schon im Plan?</h2><p class="muted">Wir haben Einträge gefunden, die zu dir passen könnten. Wählst du einen aus, gehören diese Schichten ab jetzt zu deiner Anmeldung.</p><div class="claims">'
      + P.cands.map(n => { const c = m.people.get(key(n)), k = c ? c.slots.length : 0; return '<button class="btn" data-act="claim" data-v="' + esc(n) + '">Ja, ich bin «' + esc(n) + '» <span class="muted">· ' + k + (k === 1 ? ' Schicht' : ' Schichten') + '</span></button>'; }).join('')
      + '<button class="btn quiet" data-act="claim" data-v="">Nein, ich bin neu</button></div>'; }
  const alt = S.gate === 'start' ? '<div class="gatealt"><span>Du gehörst zum Orga-Team?</span><button class="btn" data-act="gate" data-v="orga">Orga-Login</button></div>' : '';
  return '<section class="gate"><div class="gatecard">' + (S.gate === 'start' ? '<img class="gatelogo" src="' + LOGO + '" alt="Sternenzauber Witzhelden" width="220" height="220">' : '') + h + '</div>' + alt + hint + '</section>';
}
const gval = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
function gerr(msg) { const e = $('#g-err'); if (e) { e.textContent = msg; e.hidden = false; } }
function enter(msg) { S.tab = 'plan'; S.gate = 'start'; S.prog = null; render(); toast(msg); window.scrollTo(0, 0); }
function signIn(r, msg) { take(r); setMe({ role: r.me.role, id: r.me.id, token: r.token }); S.tok = null; S.pendingRole = null; S.pending = null; cache(); enter(r.me.role === 'orga' ? msg + '. Du bist als Orga angemeldet.' : msg); }
const regErr = e => e.code === 'phone' ? 'Diese Handynummer ist schon für eine andere Person hinterlegt. Bitte melde dich bei der Orga.' : e.status ? 'Das hat nicht geklappt. Bitte prüfe deine Angaben.' : NET;
function dnFor(first, last) { const short = first + ' ' + last.charAt(0).toUpperCase() + '.', taken = new Set(DB.helpers.map(h => key(h.name)));
  model().people.forEach((v, k) => taken.add(k)); return taken.has(key(short)) ? first + ' ' + last : short; }
function candidates(first, last) { const m = model(), reg = new Set(DB.helpers.filter(h => !h.by).map(h => key(h.name))), f = key(first), li = key(last).charAt(0), out = [];
  const fits = k => { const parts = k.split(/\s+/); return parts[0] === f && (parts.length === 1 || parts[1].charAt(0) === li); };
  m.people.forEach((p, k) => { if (!reg.has(k) && fits(k)) out.push(p.name); });
  DB.helpers.forEach(h => { if (h.by && fits(key(h.name)) && !out.some(n => key(n) === key(h.name))) out.push(h.name); });
  return out; }
function finishReg(claim) { const P = S.pending; if (!P) return;
  api('register', { first: P.first, last: P.last, phone: P.phone, email: P.email, again: P.again, claim: claim || '' })
    .then(r => signIn(r, 'Willkommen, ' + P.first), e => { if (netFail(e)) return; S.gate = 'reg'; render(); gerr(regErr(e)); }); }
view.addEventListener('submit', e => {
  e.preventDefault(); const f = e.target, id = f.id;
  if (id === 'f-code') { const code = gval('g-code'); if (!code) return gerr('Bitte gib den Helfer-Code ein.'); lock(f, true);
    api('login', { code }).then(r => { S.tok = r.token; S.pendingRole = null; S.pending = null; take(r); S.gate = 'reg'; render(); nikolaus(1); const x = $('#g-first'); if (x) x.focus(); },
      err => { lock(f, false); gerr(err.code === 'code' ? 'Dieser Code stimmt nicht. Er steht in der WhatsApp-Gruppe.' : NET); }); }
  else if (id === 'f-orga') { const pw = gval('g-pw'); if (!pw) return gerr('Bitte gib das Passwort ein.'); lock(f, true);
    api('login', { pw }).then(r => { S.tok = r.token; S.pending = null; take(r); if (r.me.reg) return signIn(r, 'Willkommen zurück'); S.pendingRole = 'orga'; S.gate = 'reg'; render(); const x = $('#g-first'); if (x) x.focus(); },
      err => { lock(f, false); gerr(err.code === 'pw' ? 'Das Passwort stimmt nicht.' : NET); }); }
  else if (id === 'f-reg') { const first = gval('g-first'), last = gval('g-last'), phone = gval('g-phone').replace(/[^\d+]/g, '');
    if (!first || !last) return gerr('Bitte Vorname und Nachname eintragen.');
    const email = gval('g-mail'), again = $('#g-again').checked;
    if (phone.replace(/\D/g, '').length < 6) return gerr('Bitte eine gültige Handynummer eintragen.');
    if (!MAILRE.test(email)) return gerr('Bitte eine gültige E-Mail-Adresse eintragen.');
    if (!$('#g-ok').checked) return gerr('Bitte bestätige das Einverständnis.');
    S.pending = { first, last, phone, email, again }; lock(f, true);
    api('register', Object.assign({ check: true }, S.pending)).then(r => {
      if (r.need) { const cands = candidates(first, last); if (cands.length) { S.pending.cands = cands; S.gate = 'claim'; return render(); } return finishReg(''); }
      signIn(r, r.back ? 'Willkommen zurück, ' + first : 'Willkommen, ' + first); },
      err => { if (netFail(err)) return; lock(f, false); gerr(regErr(err)); }); }
});

/* ---------- Ansichten ---------- */
function groupChips(m) {
  if (NARROW.matches) return '<label class="selrow"><span>Bereich</span><select id="grpsel">' + ['all'].concat(m.groups).map(g => '<option value="' + esc(g) + '"' + (S.group === g ? ' selected' : '') + '>' + (g === 'all' ? 'Alle Bereiche' : esc(g)) + '</option>').join('') + '</select></label>';
  return '<div class="row groups" role="group" aria-label="Bereich">' + ['all'].concat(m.groups).map(g =>
    '<button class="chip" data-act="group" data-v="' + esc(g) + '" aria-pressed="' + (S.group === g) + '">' + (g === 'all' ? 'Alle Bereiche' : esc(g)) + '</button>').join('') + '</div>';
}
function shiftHead(m, sh) { const n = attCount(m, [sh]);
  return '<span class="shead"><span class="t">' + esc(span(sh)) + '</span><span class="c' + (n ? ' att' : '') + '">' + (n ? n + ' offen' : '<span class="star">★</span> komplett') + '</span></span>'; }

function cellHTML(m, sh, st) {
  const c = statusOf(sh, st), mine = c.k !== 'off' && c.people.some(p => m.mine.has(key(p)));
  const act = isOrga() ? 'cell' : c.k === 'off' ? '' : 'hcell', tagName = act ? 'button' : 'div';
  let inner;
  if (c.k === 'off') inner = esc(c.note || 'geschlossen');
  else {
    inner = c.people.map(p => '<span class="p' + (m.mine.has(key(p)) ? ' me' : '') + '">' + esc(p) + (isDouble(m, sh, p) ? ' <span class="dbl" title="In dieser Schicht doppelt eingeteilt">2×</span>' : '') + '</span>').join('');
    if (c.k === 'open') inner += '<span class="tag">offen</span>';
    else if (c.k === 'part') inner += '<span class="tag">' + missText(c) + (c.tentative ? ' · unbestätigt' : '') + '</span>';
    else if (c.k === 'tent') inner += '<span class="tag">unbestätigt</span>';
    if (c.note) inner += '<span class="note">' + esc(c.note) + '</span>';
  }
  const label = st.name + ', ' + span(sh) + ': ' + (c.k === 'off' ? 'geschlossen' : (c.people.join(', ') || 'offen'));
  return '<' + tagName + ' class="cell is-' + c.k + (mine ? ' mine' : '') + '"' + (act ? ' type="button" data-act="' + act + '" data-s="' + esc(sh.id) + '" data-t="' + esc(st.id) + '" aria-label="' + esc(label) + '"' : '') + '>' + inner + '</' + tagName + '>';
}

function vPlan(m) {
  if (!m.days.includes(S.day)) { const d = new Date(), t = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    S.day = m.days.includes(t) ? t : m.days[0]; }
  const dayShifts = m.shifts.filter(s => s.date === S.day), narrow = NARROW.matches;
  if (!dayShifts.some(s => s.id === S.shift)) S.shift = dayShifts[0].id;
  const cols = narrow ? dayShifts.filter(s => s.id === S.shift) : dayShifts;
  const sts = m.stations.filter(inGroup);
  let h = '<div class="controls">' + '<p class="muted">' + (isOrga() ? 'Tippe auf ein Feld, um es zu bearbeiten oder einzeln zu sperren. Tippe auf eine Uhrzeit oder einen Stand, um mehrere Felder auf einmal zu sperren.' : 'Tippe auf ein Feld, um dich oder jemanden aus der Helferliste einzutragen. Deine Schichten sind farbig markiert.') + '</p>'
    + '<div class="days" role="group" aria-label="Tag">' + m.days.map(d => { const i = dayInfo(d), n = attCount(m, m.shifts.filter(s => s.date === d));
    return '<button class="day" data-act="day" data-v="' + d + '" aria-pressed="' + (d === S.day) + '"><b>' + i.wd + ' ' + i.dm + '</b><small>' + (n ? n + ' offen' : '<span class="star">★</span> komplett besetzt') + '</small></button>'; }).join('') + '</div>' + groupChips(m);
  h += '<div class="row" style="justify-content:flex-end"><button class="btn" data-act="pdf">Plan als PDF</button></div>';
  if (narrow) h += '<div class="shiftpick" role="group" aria-label="Schicht">' + dayShifts.map(sh => '<button data-act="shift" data-v="' + esc(sh.id) + '" aria-pressed="' + (sh.id === S.shift) + '">' + shiftHead(m, sh) + '</button>').join('') + '</div>';
  h += '</div>';
  h += '<div class="tablewrap"><table class="plan' + (narrow ? '' : ' wide') + '" style="--cols:' + cols.length + '"><thead><tr><th class="st" scope="col">Stand</th>'
    + cols.map(sh => '<th scope="col">' + (isOrga() ? '<button class="hbtn" type="button" data-act="blk" data-k="shift" data-v="' + esc(sh.id) + '" aria-label="Schicht ' + esc(span(sh)) + ' sperren oder freigeben">' + shiftHead(m, sh) + '</button>' : shiftHead(m, sh)) + '</th>').join('') + '</tr></thead><tbody>';
  let last = null;
  sts.forEach(st => {
    if (grp(st) !== last) { last = grp(st); h += '<tr class="grp"><th colspan="' + (cols.length + 1) + '" scope="colgroup"><span>' + esc(last) + '</span></th></tr>'; }
    const meta = [st.place, needText(st)].filter(Boolean).join(' · ');
    const head = '<b>' + esc(st.name) + '</b>' + (st.sub ? '<small>' + esc(st.sub) + '</small>' : '') + '<small>' + esc(meta) + '</small>';
    h += '<tr><th class="st" scope="row">' + (isOrga() ? '<button class="hbtn" type="button" data-act="blk" data-k="station" data-v="' + esc(st.id) + '" aria-label="' + esc(st.name) + ' sperren oder freigeben">' + head + '</button>' : head) + '</th>'
      + cols.map(sh => '<td>' + cellHTML(m, sh, st) + '</td>').join('') + '</tr>';
  });
  h += '</tbody></table></div>';
  h += '<div class="legend"><span><i class="sw open"></i>offen</span><span><i class="sw part"></i>unvollständig</span><span><i class="sw off"></i>geschlossen oder gesperrt</span>' + (isOrga() ? '<span><b class="dbl">2×</b> in derselben Schicht doppelt eingeteilt</span>' : '<span><i class="sw mine"></i>von dir eingetragen</span>') + '</div>';
  const notes = Array.isArray(m.info.notes) ? m.info.notes : [];
  if (notes.length) h += '<section class="notes"><h3>Hinweise</h3><ul>' + notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul></section>';
  return h;
}

function openItems(m) { const out = [];
  m.shifts.forEach(sh => { const rows = []; m.stations.forEach(st => { if (!inGroup(st)) return; const c = statusOf(sh, st); if (c.att) rows.push({ st, c }); }); if (rows.length) out.push({ sh, rows }); });
  return out; }
function vOffen(m) {
  const items = openItems(m), total = items.reduce((n, i) => n + i.rows.length, 0);
  let h = '<div class="controls">' + groupChips(m) + '<div class="row"><p class="muted" style="flex:1 1 200px">' + (total ? total + ' Einsätze brauchen noch jemanden.' : '') + '</p>'
    + (total ? '<button class="btn" data-act="copy-open">Liste als Text kopieren</button>' : '') + '</div></div>';
  if (!total) return h + '<div class="empty"><h2>Alles besetzt</h2><p class="muted">In diesem Bereich ist keine Schicht mehr offen.</p></div>';
  let lastDay = null;
  items.forEach(({ sh, rows }) => {
    if (sh.date !== lastDay) { if (lastDay) h += '</section>'; lastDay = sh.date; const i = dayInfo(sh.date); h += '<section class="sect"><h2>' + i.wdl + ', ' + i.dm + '</h2>'; }
    h += '<ul class="list"><li class="shifthead"><span class="mono">' + esc(span(sh)) + '</span><span class="muted">' + rows.length + ' offen</span></li>'
      + rows.map(({ st, c }) => { const sub = [c.people.length ? 'bisher: ' + c.people.join(', ') : '', c.note, st.place].filter(Boolean).join(' · ');
        return '<li><button class="item" type="button" data-act="cell" data-s="' + esc(sh.id) + '" data-t="' + esc(st.id) + '"><span class="main"><b>' + esc(st.name) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><span class="pill ' + (c.k === 'open' ? 'open' : 'part') + '">' + missText(c) + '</span></button></li>'; }).join('') + '</ul>';
  });
  return h + '</section>';
}

/* Kalender: Google-Link und Kalenderdatei */
function evt(sh, st) { const pad = n => String(n).padStart(2, '0'), [y, mo, d] = sh.date.split('-').map(Number), s = mins(sh.start), e = s + dur(sh);
  const f = min => { const dt = new Date(Date.UTC(y, mo - 1, d, 0, min)); return dt.getUTCFullYear() + pad(dt.getUTCMonth() + 1) + pad(dt.getUTCDate()) + 'T' + pad(dt.getUTCHours()) + pad(dt.getUTCMinutes()) + '00'; };
  return { uid: sh.id + '-' + st.id + '@sternenzauber', title: 'Sternenzauber: ' + st.name, start: f(s), end: f(e), place: st.place || '', note: 'Schicht ' + span(sh) + ' Uhr' }; }
function gcal(sh, st) { const e = evt(sh, st);
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(e.title) + '&dates=' + e.start + '/' + e.end + '&ctz=Europe/Berlin&location=' + encodeURIComponent(e.place) + '&details=' + encodeURIComponent(e.note); }
function ics(slots) { const x = s => String(s).replace(/([,;\\])/g, '\\$1');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sternenzauber//Helferplan//DE'].concat(...slots.map(({ sh, st }) => { const e = evt(sh, st);
    return ['BEGIN:VEVENT', 'UID:' + e.uid, 'DTSTART:' + e.start, 'DTEND:' + e.end, 'SUMMARY:' + x(e.title)].concat(e.place ? ['LOCATION:' + x(e.place)] : [], ['DESCRIPTION:' + x(e.note), 'END:VEVENT']); }), ['END:VCALENDAR']).join('\r\n'); }
const calRow = (sh, st) => '<span class="row"><a class="btn" href="' + esc(gcal(sh, st)) + '" target="_blank" rel="noopener">Google Kalender</a><button type="button" class="btn" data-cal="' + esc(sh.id) + '|' + esc(st.id) + '">Kalenderdatei</button></span>';
function saveFile(name, text, type, title, hint) {
  if (STANDALONE) { try { const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); toast('Datei wird gespeichert'); return; } catch (e) {} }
  openDlg({ type: 'text', title, hint, text }); }
function showIcs(slots) {
  if (STANDALONE) return saveFile('sternenzauber-schichten.ics', ics(slots), 'text/calendar;charset=utf-8');
  openDlg({ type: 'text', title: 'Kalenderdatei', hint: 'In der fertigen App öffnet dieser Knopf direkt den Kalender auf dem Handy. In der Vorschau siehst du den Inhalt der Datei.', text: ics(slots) });
}

function vMeine(m) {
  const me = meHelper(), mine = myPeople(), rows = [];
  mine.forEach(h => { const P = m.people.get(key(h.name)); if (P) P.slots.forEach(s => rows.push({ s, h })); });
  /* auch Einträge, die ich für andere aus der Helferliste gemacht habe */
  if (me) m.shifts.forEach(sh => m.stations.forEach(st => { const c = cellOf(sh, st); if (c.off) return; c.people.forEach(p => { if (c.by[p] === me.id && !m.mine.has(key(p))) rows.push({ s: { sh, st, c }, h: { id: '', name: p } }); }); }));
  rows.sort((a, b) => (a.s.sh.date + a.s.sh.start).localeCompare(b.s.sh.date + b.s.sh.start));
  const own = me ? m.people.get(key(me.name)) : null, guests = mine.length > 1 ? '<p class="muted">Von dir mit eingetragen: ' + esc(mine.slice(1).map(h => h.name).join(', ')) + '</p>' : '';
  if (!rows.length) return '<div class="empty"><h2>Du hast noch keine Schicht</h2><p class="muted">Tippe im Plan auf ein offenes Feld und trag dich ein. Dort kannst du auch andere aus der Helferliste eintragen.</p>' + guests + '<p class="row" style="margin-top:14px"><button class="btn primary" data-act="goto" data-v="plan">Zum Plan</button><button class="btn" data-act="profile">Meine Daten</button></p></div>';
  return '<div class="controls"><div class="row"><p class="muted" style="flex:1 1 200px">' + rows.length + (rows.length === 1 ? ' Schicht' : ' Schichten') + (own ? ' · du selbst ' + hours(own.mins) : '') + '</p>' + (own ? '<button class="btn" data-act="cal-all">Alle in den Kalender</button><button class="btn" data-act="copy-mine">Als Text kopieren</button>' : '') + '<button class="btn" data-act="profile">Meine Daten</button></div>' + guests + '</div>'
    + '<ul class="list">' + rows.map(({ s, h }) => { const i = dayInfo(s.sh.date), mates = s.c.people.filter(x => key(x) !== key(h.name)), self = h.id === me.id;
      return '<li><div class="item"><span class="main"><b>' + esc(s.st.name) + '</b>' + (self ? '' : ' <span class="pill plain">für ' + esc(h.name) + '</span>') + '<small><span class="mono">' + i.wd + ' ' + i.dm + ' ' + esc(span(s.sh)) + '</span>' + (s.st.place ? ' · ' + esc(s.st.place) : '') + (mates.length ? ' · mit ' + esc(mates.join(', ')) : '') + '</small></span>' + (self ? calRow(s.sh, s.st) : '') + '</div></li>'; }).join('') + '</ul>';
}

function mailLink(list, subject, body, label, cls) { const href = 'mailto:?bcc=' + encodeURIComponent(list.join(',')) + '&subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  if (!list.length) return ''; return href.length <= 1900 ? '<a class="btn ' + cls + '" href="' + esc(href) + '">' + label + '</a>' : '<button class="btn ' + cls + '" data-act="mail-many" data-v="' + esc(label) + '">' + label + '</button>'; }
function inviteText(m) { const next = String(Number(DB.active) + 1), link = STANDALONE ? location.origin + location.pathname : '(Link zur App)';
  return { subject: 'Sternenzauber ' + next + ': Der Helferplan ist offen', body: 'Hallo zusammen,\n\nder Helferplan für den Sternenzauber ' + next + ' ist offen. Tragt euch gern wieder für eure Schichten ein:\n' + link + '\nHelfer-Code: ' + DB.codes.helper + '\n\nWer schon einmal dabei war, meldet sich mit derselben Handynummer an und ist sofort wieder drin.\n\nDanke, dass ihr mithelft!\nEuer Orga-Team' }; }
function reachBox(m) { const withMail = DB.helpers.filter(h => h.email), again = withMail.filter(h => h.again), inv = inviteText(m);
  return '<section class="reach"><h2>Alle Helfer erreichen</h2><p class="muted">' + withMail.length + ' mit E-Mail, davon ' + again.length + ' möchten nächstes Jahr wieder angeschrieben werden. Die Sammelmail öffnet dein E-Mail-Programm, alle Adressen stehen unsichtbar im BCC.</p><div class="row">'
    + mailLink(withMail.map(h => h.email), m.info.title || 'Sternenzauber', 'Hallo zusammen,\n\n', 'Sammelmail an alle', 'primary')
    + mailLink(again.map(h => h.email), inv.subject, inv.body, 'Einladung fürs nächste Jahr', '')
    + '<button class="btn" data-act="copy-mails">E-Mail-Adressen kopieren</button><button class="btn" data-act="copy-phones">Handynummern kopieren</button><button class="btn" data-act="csv">Helferliste als Tabelle</button><button class="btn" data-act="pdf-helfer">Helferliste als PDF</button></div></section>'; }
function vHelfer(m) {
  const rows = new Map();
  DB.helpers.forEach(h => rows.set(key(h.name), { name: h.name, h, p: null }));
  m.people.forEach((p, k) => { if (rows.has(k)) rows.get(k).p = p; else rows.set(k, { name: p.name, h: null, p }); });
  const all = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')), q = key(S.q);
  const list = q ? all.filter(r => key(r.name).includes(q) || (r.h && (key(r.h.first + ' ' + r.h.last).includes(q) || (r.h.phone || '').includes(q)))) : all;
  const reg = DB.helpers.filter(x => x.phone).length, byName = x => { const o = x.by ? DB.helpers.find(y => y.id === x.by) : null; return o ? 'eingetragen von ' + o.name : ''; };
  let h = '<div class="controls"><div class="row"><input class="search" id="q" type="search" placeholder="Name oder Nummer suchen" value="' + esc(S.q) + '" aria-label="Helfer suchen"><p class="muted" style="flex:1 1 200px">' + reg + ' mit Kontaktdaten · ' + (all.length - reg) + ' noch ohne</p></div></div>' + reachBox(m);
  if (!list.length) return h + '<div class="empty"><h2>Niemand gefunden</h2><p class="muted">Unter diesem Namen oder dieser Nummer ist niemand eingetragen.</p></div>';
  return h + '<ul class="list">' + list.map(r => { const k = key(r.name), open = S.openPerson === k, n = r.p ? r.p.slots.length : 0, dbl = !!r.p && r.p.slots.some(s => isDouble(m, s.sh, r.name));
    let o = '<li><button class="item" type="button" data-act="person" data-v="' + esc(k) + '" aria-expanded="' + open + '"><span class="caret" aria-hidden="true">›</span><span class="main"><b>' + esc(r.name) + '</b><small>' + (r.h ? esc([r.h.first + ' ' + r.h.last, r.h.phone || 'keine Handynummer', r.h.email, byName(r.h)].filter(Boolean).join(' · ')) : 'noch keine Handynummer und E-Mail') + '</small></span>'
      + (r.h && r.h.role ? '<span class="pill role-pill">' + ROLE[r.h.role] + '</span>' : '') + (r.h && r.h.sos ? '<span class="pill open">SOS-Empfänger</span>' : '') + (dbl ? '<span class="pill open">doppelt eingeteilt</span>' : '') + '<span class="pill plain">' + n + (n === 1 ? ' Einsatz' : ' Einsätze') + (r.p ? ' · ' + hours(r.p.mins) : '') + '</span></button>';
    if (open) o += '<div class="person-body">' + (n ? '<ul>' + r.p.slots.map(s => { const i = dayInfo(s.sh.date);
        return '<li><span class="when mono">' + i.wd + ' ' + i.dm + ' ' + esc(span(s.sh)) + '</span><span><b>' + esc(s.st.name) + '</b>' + (s.st.place ? ', ' + esc(s.st.place) : '') + (isDouble(m, s.sh, r.name) ? ' <span class="dbl">2× in dieser Schicht</span>' : '') + '</span></li>'; }).join('') + '</ul>' : '<p class="muted">Noch keine Schicht.</p>')
      + '<div class="row">' + (n ? '<button class="btn" data-act="copy-person" data-v="' + esc(k) + '">Einsätze als Text kopieren</button>' : '')
      + '<button class="btn" data-act="hreg" data-v="' + esc(k) + '">' + (r.h ? 'Daten bearbeiten' : 'Kontaktdaten nachtragen') + '</button>'
      + (r.h ? '<button class="btn" data-act="sos-toggle" data-v="' + esc(r.h.id) + '">' + (r.h.sos ? 'Nicht mehr SOS-Empfänger' : 'Als SOS-Empfänger benennen') + '</button>' : '') + '</div></div>';
    return o + '</li>'; }).join('') + '</ul>';
}

function vSos(m) {
  const handle = canHandle(m), rec = DB.helpers.filter(h => h.sos).length, team = sosTeam(m).size;
  let h = '<section class="sosbox"><div class="beacon" aria-hidden="true"><i></i></div><div class="beacon-base" aria-hidden="true"></div>'
    + '<button class="sosbig" type="button" data-act="sos-new"><b>SOS</b><span>Hier drücken, wenn ein Stand etwas braucht</span></button>'
    + '<p class="muted">Zwei Fingertipps genügen: Stand wählen, Bedarf wählen, senden.</p></section>';
  const items = DB.sos.filter(x => handle || x.by === myName()).sort((a, b) => (a.status === 'done') - (b.status === 'done') || b.at - a.at);
  h += '<section class="sect"><h2>' + (handle ? 'SOS-Meldungen' : 'Deine Meldungen') + '</h2><p class="muted">'
    + (isOrga() ? 'Meldungen sehen und übernehmen: die Orga, alle ' + team + ' Personen aus den Springer-Teams und ' + (rec ? rec + ' zusätzlich benannte' : 'zusätzlich benannte') + ' SOS-Empfänger. Welche Teams dazugehören, stellst du unter «Einrichten» beim Stand ein, einzelne Personen im Reiter «Helfer».'
      : handle ? 'Du gehörst zum SOS-Team. Übernimm eine Meldung, damit alle sehen, dass du unterwegs bist.' : 'Hier siehst du, ob schon jemand für dich unterwegs ist.') + '</p>';
  if (!items.length) return h + '<div class="empty"><p class="muted">' + (handle ? 'Im Moment gibt es keine SOS-Meldung.' : 'Du hast noch nichts gemeldet.') + '</p></div></section>';
  return h + '<ul class="list">' + items.map(x => { const st = x.status;
    const sub = [clock(x.at) + ' Uhr', 'von ' + x.by, x.note, st !== 'open' && x.taker ? (st === 'go' ? 'unterwegs: ' : 'erledigt von ') + x.taker : ''].filter(Boolean).join(' · ');
    return '<li><div class="item' + (st === 'done' ? ' faded' : '') + '"><span class="main"><b>' + esc(x.need) + '</b> für ' + esc(x.stName) + '<small>' + esc(sub) + '</small></span><span class="pill ' + (st === 'open' ? 'open' : st === 'go' ? 'part' : 'plain') + '">' + (st === 'open' ? 'offen' : st === 'go' ? 'unterwegs' : 'erledigt') + '</span>'
      + (!handle ? '' : st === 'open' ? '<button class="btn primary" data-act="sos-go" data-v="' + x.id + '">Ich übernehme</button>' : st === 'go' ? '<button class="btn primary" data-act="sos-done" data-v="' + x.id + '">Erledigt</button>' : isOrga() ? '<button class="btn quiet" data-act="sos-del" data-v="' + x.id + '">Entfernen</button>' : '') + '</div></li>'; }).join('') + '</ul></section>';
}

function vEinrichten(m) {
  let h = '<div class="grid2"><section class="sect"><div class="row"><h2 style="flex:1">Stände und Aufgaben</h2><button class="btn primary" data-act="st-new">Stand hinzufügen</button></div>';
  h += m.stations.length ? '<ul class="list">' + m.stations.map(st => '<li><button class="item" type="button" data-act="st-edit" data-v="' + esc(st.id) + '"><span class="main"><b>' + esc(st.name) + '</b><small>' + esc([grp(st), st.place, st.sub].filter(Boolean).join(' · ')) + '</small></span>' + (isSosStation(st) ? '<span class="pill open">SOS-Team</span>' : '') + '<span class="pill plain">' + needText(st) + '</span></button></li>').join('') + '</ul>'
    : '<div class="empty"><p class="muted">Noch kein Stand angelegt.</p></div>';
  h += '</section><section class="sect"><div class="row"><h2 style="flex:1">Tage und Schichten</h2><button class="btn primary" data-act="sh-new">Schicht hinzufügen</button></div>';
  h += m.shifts.length ? '<ul class="list">' + m.shifts.map(sh => { const i = dayInfo(sh.date);
    return '<li><button class="item" type="button" data-act="sh-edit" data-v="' + esc(sh.id) + '"><span class="main"><b>' + i.wdl + ', ' + i.dm + '</b></span><span class="mono">' + esc(span(sh)) + '</span></button></li>'; }).join('') + '</ul>'
    : '<div class="empty"><p class="muted">Noch keine Schicht angelegt.</p></div>';
  const notes = Array.isArray(m.info.notes) ? m.info.notes : [];
  h += '<div class="row" style="margin-top:16px"><h2 style="flex:1">Hinweise</h2><button class="btn" data-act="note-new">Hinweis hinzufügen</button></div>';
  h += notes.length ? '<ul class="list">' + notes.map((n, i) => '<li><div class="item"><span class="main">' + esc(n) + '</span><button class="btn quiet" data-act="note-del" data-v="' + i + '">Entfernen</button></div></li>').join('') + '</ul>' : '<p class="muted">Keine Hinweise hinterlegt.</p>';
  const codeRow = (which, label, sub) => '<li><div class="item"><span class="main"><b>' + label + '</b><small>' + sub + '</small></span><span class="mono">' + esc(DB.codes[which]) + '</span><button class="btn quiet" data-act="code" data-v="' + which + '">Ändern</button></div></li>';
  h += '<div class="row" style="margin-top:16px"><h2 style="flex:1">Zugänge</h2></div><ul class="list">' + codeRow('helper', 'Helfer-Code', 'für alle aus der WhatsApp-Gruppe') + codeRow('orga', 'Orga-Passwort', 'gemeinsam für das Orga-Team')
    + '</ul>';
  const years = Object.keys(DB.years).sort();
  h += '<div class="row" style="margin-top:16px"><h2 style="flex:1">Jahre</h2><button class="btn" data-act="year-new">Neues Jahr anlegen</button></div><ul class="list">'
    + years.map(y => '<li><div class="item"><span class="main"><b>' + esc(DB.years[y].info.title || y) + '</b><small>' + (y === DB.active ? 'Das sehen alle Helfer.' : 'Im Moment nur für die Orga sichtbar.') + '</small></span>'
      + (y === YR() ? '<span class="pill plain">wird angezeigt</span>' : '<button class="btn quiet" data-act="year-show" data-v="' + esc(y) + '">Ansehen</button>')
      + (y === DB.active ? '' : '<button class="btn quiet" data-act="year-live" data-v="' + esc(y) + '">' + (S.sure === 'live' + y ? 'Wirklich für alle umschalten?' : 'Für alle freischalten') + '</button>') + '</div></li>').join('') + '</ul>';
  h += '<div class="row" style="margin-top:16px"><h2 style="flex:1">Sternenzauber und Nikoläuse</h2><button class="btn" data-act="niks">Nikoläuse ansehen</button><button class="btn" data-act="stars">Sterne ansehen</button></div><p class="muted">Trägt sich jemand ein, läuft ein kleiner Nikolaus unten durchs Bild. Ist eine Schicht komplett, fliegt eine Sternschnuppe. Bei einem kompletten Tag gibt es einen Schauer mit drei Nikoläusen, beim kompletten Plan das grosse Finale.</p>';
  if (!REMOTE) h += '<div class="row" style="margin-top:16px"><h2 style="flex:1">Vorschau</h2><button class="btn danger" data-act="reset">' + (S.sure === 'reset' ? 'Wirklich alles zurücksetzen?' : 'Vorschau zurücksetzen') + '</button></div><p class="muted">Setzt Plan, Helferliste und SOS-Meldungen auf den Ausgangsstand zurück. Danach meldest du dich neu an.</p>';
  return h + '</section></div>';
}

__STARS__
/* ---------- Nikoläuse laufen unten durchs Bild ---------- */
const NIK = '<svg viewBox="0 0 30 34" width="38" height="43"><ellipse cx="8" cy="17" rx="6" ry="7" fill="#8A5A2B"/><path d="M6 11 Q8 8 11 11" fill="none" stroke="#5E3B1A" stroke-width="1.2"/>'
  + '<rect class="l1" x="13" y="25" width="3.2" height="8" rx="1.2" fill="#2A2A2A"/><rect class="l2" x="17.2" y="25" width="3.2" height="8" rx="1.2" fill="#2A2A2A"/>'
  + '<rect x="10" y="13" width="13" height="14" rx="5" fill="#C0272D"/><rect x="10" y="24" width="13" height="3" rx="1.2" fill="#FFFFFF" stroke="#D9D2C5" stroke-width=".5"/><rect x="10" y="19.6" width="13" height="2.4" fill="#222222"/><rect x="18.6" y="19.2" width="3" height="3.2" rx=".6" fill="#E3B341"/>'
  + '<circle cx="18" cy="9" r="5" fill="#F2C9A5"/><ellipse cx="19.4" cy="13.2" rx="4.2" ry="2.9" fill="#FFFFFF" stroke="#D9D2C5" stroke-width=".5"/><circle cx="20.4" cy="8.4" r=".75" fill="#222222"/>'
  + '<path d="M12.8 8 Q16.5 -1.5 24 4.6 L23 8 Z" fill="#C0272D"/><rect x="12.2" y="6.8" width="11.6" height="2.4" rx="1.2" fill="#FFFFFF" stroke="#D9D2C5" stroke-width=".5"/><circle cx="24.6" cy="4.8" r="1.9" fill="#FFFFFF" stroke="#D9D2C5" stroke-width=".5"/></svg>';
function nikolaus(n) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const w = $('#walk');
  for (let i = 0; i < n; i++) { const d = document.createElement('div'); d.className = 'nik'; d.style.animationDelay = (i * 1.1) + 's'; d.style.setProperty('--s', (0.9 + Math.random() * 0.35).toFixed(2)); d.innerHTML = NIK;
    d.addEventListener('animationend', e => { if (e.animationName === 'nikwalk') d.remove(); }); w.appendChild(d); }
}
function progress(m) { const sh = new Set(), days = new Set();
  m.shifts.forEach(s => { let any = false, ok = true; m.stations.forEach(st => { const k = statusOf(s, st).k; if (k === 'off') return; any = true; if (k !== 'ok') ok = false; }); if (any && ok) sh.add(s.id); });
  m.days.forEach(d => { const l = m.shifts.filter(s => s.date === d); if (l.length && l.every(s => sh.has(s.id))) days.add(d); });
  return { sh, days, all: m.days.length > 0 && days.size === m.days.length }; }
function checkProgress(m) { const p = progress(m), q = S.prog; S.prog = p; if (!q) return;
  const say = (lvl, msg) => { starShow(lvl); if (lvl > 1) nikolaus(lvl === 3 ? 6 : 3); setTimeout(() => toast(msg), 700); };
  if (p.all && !q.all) return say(3, 'Alle Schichten sind besetzt. Sternenzauber!');
  const d = [...p.days].find(x => !q.days.has(x)); if (d) return say(2, dayInfo(d).wdl + ' ist komplett besetzt.');
  const s = m.shifts.find(x => p.sh.has(x.id) && !q.sh.has(x.id)); if (s) say(1, dayInfo(s.date).wd + ' ' + span(s) + ' ist komplett besetzt.'); }

/* ---------- Anleitung: App auf den Home-Bildschirm legen ---------- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (!dlg.open) render(); });
function homeHelp() {
  if (!STANDALONE) return '';
  const installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; if (installed) return '';
  const ios = '<div><b>iPhone (Safari)</b><ol><li>Unten auf das Teilen-Symbol tippen, das Quadrat mit dem Pfeil nach oben.</li><li>«Zum Home-Bildschirm» wählen.</li><li>Oben rechts auf «Hinzufügen» tippen.</li></ol></div>';
  const and = '<div><b>Android (Chrome)</b><ol><li>Oben rechts auf die drei Punkte tippen.</li><li>«Zum Startbildschirm hinzufügen» oder «App installieren» wählen.</li><li>Mit «Hinzufügen» bestätigen.</li></ol></div>';
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return '<section class="homehelp"><h3>Sternenzauber als App aufs Handy legen</h3><p class="muted">Dann öffnest du den Plan mit einem Tipp vom Home-Bildschirm, wie jede andere App.</p>'
    + (installEvt ? '<p><button class="btn primary" data-act="install">Jetzt installieren</button></p>' : '') + '<div class="cols">' + (isIos ? ios + and : and + ios) + '</div></section>';
}

function render() {
  const m = model(); drawFrame(m);
  const act = document.activeElement, fid = act && view.contains(act) ? act.id : '', pos = fid && 'selectionStart' in act ? act.selectionStart : null;
  let h;
  if (!ME) h = vGate();
  else { checkProgress(m);
    if (S.tab === 'einrichten') h = vEinrichten(m);
    else if (S.tab === 'sos') h = vSos(m);
    else if (S.tab === 'helfer') h = vHelfer(m);
    else if (!m.shifts.length || !m.stations.length) h = '<div class="empty"><h2>Noch kein Plan angelegt</h2><p class="muted">' + (isOrga() ? 'Lege unter «Einrichten» den ersten Stand und die erste Schicht an.' : 'Die Orga richtet den Plan gerade ein. Schau später noch einmal vorbei.') + '</p></div>';
    else h = S.tab === 'offen' ? vOffen(m) : S.tab === 'meine' ? vMeine(m) : vPlan(m); }
  view.innerHTML = '<div style="display:flex;flex-direction:column;gap:18px">' + h + homeHelp() + '<p class="made">Made with <span class="heart" role="img" aria-label="Liebe">♥</span> by <a href="' + MADE_URL + '" target="_blank" rel="noopener">Susan Fleet</a><small>Version ' + VERSION + '</small></p></div>';
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); if (pos != null) try { el.setSelectionRange(pos, pos); } catch (e) {} } }
}
function commit(msg) { persist(); render(); if (msg) toast(msg); }

/* ---------- Rückmeldungen ---------- */
function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200); }
function copyText(text, okMsg) {
  const fallback = () => openDlg({ type: 'text', title: 'Text zum Kopieren', hint: 'Markiere den Text und kopiere ihn von Hand.', text });
  try { navigator.clipboard.writeText(text).then(() => toast(okMsg), fallback); } catch (e) { fallback(); }
}

/* ---------- Dialoge ---------- */
const field = (id, label, attrs, val) => '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" ' + attrs + ' value="' + esc(val) + '"></div>';
const foot = (del) => '<p class="hint warn" id="f-err" hidden></p><footer>' + (del || '') + '<button type="button" class="btn" data-d="cancel">Abbrechen</button><button type="submit" class="btn primary">Speichern</button></footer>';
function cellWarn(m, name, self) { if (D.off) return ''; const seen = m.conf[D.sh.id] || {}, out = [];
  (name ? [name] : D.people).forEach(p => { const other = (seen[key(p)] || []).filter(st => st.id !== D.st.id); if (other.length) out.push((name && self ? 'Du bist' : esc(p) + ' ist') + ' in dieser Schicht schon bei ' + esc(other.map(s => s.name).join(', ')) + ' eingeteilt.'); });
  return out.map(t => '<p class="hint warn">' + t + '</p>').join(''); }
function drawDlg() {
  const m = model(); let h = '<form id="dform" novalidate>';
  if (D.type === 'cell') { const i = dayInfo(D.sh.date), min = Math.max(1, Number(D.st.min) || 2), miss = Math.max(0, min - D.people.length);
    const names = new Set([...m.people.values()].map(p => p.name).concat(DB.helpers.map(x => x.name)));
    h += '<header><p class="eyebrow">' + i.wdl + ', ' + i.dm + ' · ' + esc(span(D.sh)) + '</p><h2 id="dlg-title">' + esc(D.st.name) + '</h2><p class="muted">' + esc([D.st.place, 'Bedarf ' + needText(D.st)].filter(Boolean).join(' · ')) + '</p></header>'
      + '<div class="field"><label for="f-name">Wer übernimmt die Schicht?</label>'
      + (D.people.length ? '<ul class="chips">' + D.people.map((p, x) => '<li><span>' + esc(p) + '</span><button type="button" data-d="rm" data-i="' + x + '" aria-label="' + esc(p) + ' entfernen">×</button></li>').join('') + '</ul>' : '')
      + '<div class="addrow"><input id="f-name" list="names" placeholder="Name eintragen" autocomplete="off"><button type="button" class="btn" data-d="add">Hinzufügen</button></div>'
      + (meHelper() && !D.people.some(p => key(p) === key(myName())) ? '<p><button type="button" class="btn primary" data-d="addme">Mich eintragen (' + esc(myName()) + ')</button></p>' : '')
      + '<datalist id="names">' + [...names].sort((a, b) => a.localeCompare(b, 'de')).map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>'
      + '<p class="hint">' + (D.off ? 'Diese Schicht ist gesperrt.' : miss ? (miss === 1 ? 'Es fehlt noch 1 Person.' : 'Es fehlen noch ' + miss + ' Personen.') : 'Die Schicht ist besetzt.') + '</p>' + cellWarn(m) + '</div>'
      + '<label class="check"><input type="checkbox" id="f-tent"' + (D.tentative ? ' checked' : '') + '><span>Zusage ist noch nicht bestätigt</span></label>'
      + '<label class="check"><input type="checkbox" id="f-off"' + (D.off ? ' checked' : '') + '><span>Gesperrt: hier kann sich niemand eintragen</span></label>'
      + field('f-note', 'Notiz', 'placeholder="z. B. Tagesbeginn oder Vorstellung 18:00–20:00"', D.note) + foot();
  } else if (D.type === 'hcell') { const i = dayInfo(D.sh.date), c = statusOf(D.sh, D.st), me = meHelper(), mine = myPeople(), inKeys = new Set(c.people.map(key));
    const free = mine.filter(x => !inKeys.has(key(x.name))), full = c.people.length >= c.max, seen = new Set(mine.map(x => key(x.name)));
    const others = []; [...m.people.values()].map(p => p.name).concat(DB.helpers.map(x => x.name)).forEach(n => { const k = key(n); if (!k || seen.has(k)) return; seen.add(k); if (!inKeys.has(k)) others.push(n); });
    others.sort((a, b) => a.localeCompare(b, 'de'));
    const okWho = w => w === '+' || (w.slice(0, 2) === 'i:' && free.some(x => x.id === w.slice(2))) || (w.slice(0, 2) === 'n:' && others.includes(w.slice(2)));
    if (!D.who || !okWho(D.who)) D.who = free.length ? 'i:' + free[0].id : '';
    const removable = p => m.mine.has(key(p)) || c.by[p] === me.id, anyRem = c.people.some(removable);
    h += '<header><p class="eyebrow">' + i.wdl + ', ' + i.dm + ' · ' + esc(span(D.sh)) + '</p><h2 id="dlg-title">' + esc(D.st.name) + '</h2><p class="muted">' + esc([D.st.place, D.st.sub, 'Bedarf ' + needText(D.st)].filter(Boolean).join(' · ')) + '</p></header>'
      + '<div class="field"><span class="lab">Eingetragen</span>' + (c.people.length ? '<ul class="chips">' + c.people.map(p => removable(p)
          ? '<li><span>' + esc(p) + '</span><button type="button" data-d="leave" data-v="' + esc(p) + '" aria-label="' + esc(p) + ' austragen">×</button></li>' : '<li class="ro"><span>' + esc(p) + '</span></li>').join('') + '</ul>' : '<p class="muted">Noch niemand.</p>')
      + (D.sure && c.people.includes(D.sure) ? '<p class="hint warn">Tippe noch einmal auf ×, um ' + (key(D.sure) === key(me.name) ? 'dich' : esc(D.sure)) + ' auszutragen.</p>' : anyRem ? '<p class="hint">Mit × trägst du dich oder jemanden, den du eingetragen hast, wieder aus.</p>' : '')
      + (c.note ? '<p class="hint">' + esc(c.note) + '</p>' : '') + '</div>';
    if (inKeys.has(key(me.name))) h += '<div class="field"><span class="lab">Deine Schicht in den Kalender übernehmen</span>' + calRow(D.sh, D.st) + '</div>';
    if (c.off) h += '<p class="hint">Diese Schicht ist gesperrt.</p><footer><button type="button" class="btn primary" data-d="cancel">Zurück</button></footer>';
    else if (full) h += '<p class="hint">Diese Schicht ist voll besetzt. Schau bei einer anderen Schicht oder einem anderen Stand.</p><footer><button type="button" class="btn primary" data-d="cancel">' + (anyRem ? 'Fertig' : 'Zurück') + '</button></footer>';
    else { const opt = (v, label) => '<option value="' + esc(v) + '"' + (D.who === v ? ' selected' : '') + '>' + label + '</option>';
      h += '<div class="field"><label for="f-who">Wen möchtest du eintragen?</label><select id="f-who">' + (D.who === '' ? '<option value="" selected disabled>Bitte wählen …</option>' : '')
        + free.map(x => opt('i:' + x.id, x.id === me.id ? 'Mich (' + esc(x.name) + ')' : esc(x.name))).join('')
        + (others.length ? '<optgroup label="Aus der Helferliste">' + others.map(n => opt('n:' + n, esc(n))).join('') + '</optgroup>' : '')
        + opt('+', 'Neue Person anlegen …') + '</select></div>';
      if (D.who === '+') h += '<div class="two">' + field('f-cfirst', 'Vorname', 'required autocomplete="off"', D.cf || '') + field('f-clast', 'Nachname', 'required autocomplete="off"', D.cl || '') + '</div>'
        + field('f-cphone', 'Handynummer (freiwillig)', 'type="tel" inputmode="tel" autocomplete="off" placeholder="z. B. 0171 2345678"', D.cp || '')
        + (D.cands ? '<div class="field"><label for="f-ccand">Steht die Person schon im Plan?</label><select id="f-ccand"><option value="">Nein, neu eintragen</option>' + D.cands.map(n => '<option value="' + esc(n) + '">Ja, als «' + esc(n) + '»</option>').join('') + '</select></div>' : '')
        + '<p class="hint">Nur für Personen, die noch nicht in der Liste stehen. Danach findest du sie in der Auswahl.</p>';
      else if (D.who.slice(0, 2) === 'i:') { const t = free.find(x => x.id === D.who.slice(2)); h += cellWarn(m, t.name, t.id === me.id); }
      else if (D.who.slice(0, 2) === 'n:') h += cellWarn(m, D.who.slice(2), false);
      h += '<p class="hint warn" id="f-err" hidden></p><footer><button type="button" class="btn" data-d="cancel">' + (anyRem ? 'Fertig' : 'Abbrechen') + '</button><button type="button" class="btn primary" data-d="join">Eintragen</button></footer>'; }
  } else if (D.type === 'station') { const st = D.st || {};
    h += '<header><h2 id="dlg-title">' + (D.st ? 'Stand bearbeiten' : 'Stand hinzufügen') + '</h2></header>'
      + field('f-sname', 'Name', 'required placeholder="z. B. Waffelhütte"', st.name) + field('f-ssub', 'Angebot oder Aufgabe', 'placeholder="z. B. Waffeln, Kakao"', st.sub)
      + '<div class="two">' + field('f-splace', 'Ort', 'placeholder="z. B. Marktplatz"', st.place) + field('f-sgroup', 'Bereich', 'list="groups" placeholder="z. B. Essen"', st.group) + '</div>'
      + '<datalist id="groups">' + m.groups.map(g => '<option value="' + esc(g) + '">').join('') + '</datalist>'
      + '<div class="two">' + field('f-smin', 'Personen mindestens', 'type="number" min="1" max="20" inputmode="numeric"', st.min || 2) + field('f-smax', 'Personen höchstens', 'type="number" min="1" max="20" inputmode="numeric"', st.max || st.min || 2) + '</div>'
      + '<label class="check"><input type="checkbox" id="f-ssos"' + (D.st && isSosStation(D.st) ? ' checked' : '') + '><span>Dieses Team sieht und übernimmt SOS-Meldungen (z. B. Springer)</span></label>'
      + foot(D.st ? '<button type="button" class="btn danger left" data-d="del">' + (D.sure ? 'Wirklich löschen?' : 'Stand löschen') + '</button>' : '');
  } else if (D.type === 'shift') { const sh = D.sh || {};
    h += '<header><h2 id="dlg-title">' + (D.sh ? 'Schicht bearbeiten' : 'Schicht hinzufügen') + '</h2></header>'
      + field('f-hdate', 'Datum', 'type="date" required', sh.date || S.day || '')
      + '<div class="two">' + field('f-hstart', 'Beginn', 'type="time" required', sh.start) + field('f-hend', 'Ende', 'type="time" required', sh.end) + '</div>'
      + '<p class="hint">Ein neues Datum legt automatisch einen neuen Tag an.</p>'
      + foot(D.sh ? '<button type="button" class="btn danger left" data-d="del">' + (D.sure ? 'Samt Besetzung löschen?' : 'Schicht löschen') + '</button>' : '');
  } else if (D.type === 'note') {
    h += '<header><h2 id="dlg-title">Hinweis hinzufügen</h2></header>' + field('f-ntext', 'Text', 'required placeholder="z. B. Schlüssel gibt es im Gemeindehaus"', '') + foot();
  } else if (D.type === 'block') { const t = blockTargets(m), i = dayInfo(D.day), free = t.filter(x => !x.c.off && !x.c.people.length).length, blocked = t.filter(x => x.c.off && x.c.bulk).length;
    h += '<header><p class="eyebrow">' + i.wdl + ', ' + i.dm + (D.kind === 'shift' ? ' · ' + esc(span(D.sh)) : '') + '</p><h2 id="dlg-title">' + (D.kind === 'shift' ? 'Ganze Schicht sperren' : esc(D.st.name) + ' für den Tag sperren') + '</h2>'
      + '<p class="muted">' + (D.kind === 'shift' ? 'Betrifft alle Stände in dieser Schicht.' : 'Betrifft alle Schichten dieses Stands an diesem Tag.') + ' In gesperrte Felder kann sich niemand eintragen, und sie zählen nicht als offen. Felder mit Einträgen bleiben unverändert.</p></header>'
      + '<footer><button type="button" class="btn left" data-d="cancel">Abbrechen</button>' + (blocked ? '<button type="button" class="btn" data-d="unblock">' + blocked + (blocked === 1 ? ' Feld' : ' Felder') + ' freigeben</button>' : '')
      + (free ? '<button type="button" class="btn primary" data-d="block">' + free + (free === 1 ? ' freies Feld' : ' freie Felder') + ' sperren</button>' : '') + '</footer>'
      + (!free && !blocked ? '<p class="hint">Hier gibt es kein freies Feld zum Sperren.</p>' : '');
  } else if (D.type === 'hreg') { const x = D.h || {}, parts = D.name.split(/\s+/);
    h += '<header><p class="eyebrow">' + esc(D.name) + '</p><h2 id="dlg-title">' + (D.self ? 'Meine Daten' : D.h ? 'Daten bearbeiten' : 'Kontaktdaten nachtragen') + '</h2><p class="muted">Der Name im Plan bleibt «' + esc(D.name) + '». Handynummer und E-Mail sieht nur die Orga.</p></header>'
      + '<div class="two">' + field('f-rfirst', 'Vorname', 'required', x.first || parts[0] || '') + field('f-rlast', 'Nachname', 'required', x.last || '') + '</div>'
      + field('f-rphone', 'Handynummer', 'type="tel" inputmode="tel" required placeholder="z. B. 0171 2345678"', x.phone || '')
      + field('f-rmail', D.self ? 'E-Mail' : 'E-Mail (falls bekannt)', 'type="email" inputmode="email" placeholder="name@beispiel.de"', x.email || '')
      + (D.self ? '<label class="check"><input type="checkbox" id="f-ragain"' + (x.again ? ' checked' : '') + '><span>Ihr dürft mich nächstes Jahr wieder anschreiben, wenn der Helferplan öffnet.</span></label>' : '') + foot();
  } else if (D.type === 'elevate') {
    h += '<header><h2 id="dlg-title">Orga-Login</h2><p class="muted">Mit dem Orga-Passwort bekommst du die Orga-Rechte dazu. Deine Schichten und deine Anmeldung bleiben.</p></header>'
      + field('f-epw', 'Passwort', 'type="password" autocomplete="current-password" required', '') + '<p class="hint warn" id="f-err" hidden></p><footer><button type="button" class="btn" data-d="cancel">Abbrechen</button><button type="submit" class="btn primary">Anmelden</button></footer>';
  } else if (D.type === 'code') { const lab = { helper: 'Helfer-Code', orga: 'Orga-Passwort' }[D.which];
    h += '<header><h2 id="dlg-title">' + lab + ' ändern</h2><p class="muted">' + (D.which === 'helper' ? 'Den neuen Code musst du danach in der WhatsApp-Gruppe mitteilen. Wer schon angemeldet ist, bleibt angemeldet.' : 'Mindestens 8 Zeichen. Teile das neue Passwort nur dem Orga-Team mit. Wer mit dem alten Passwort angemeldet ist, verliert die Orga-Rechte und meldet sich neu an.') + '</p></header>'
      + field('f-code', 'Neu', 'required autocomplete="off"', DB.codes[D.which]) + foot();
  } else if (D.type === 'year') { const first = m.days[0] || '', next = String(Number(YR()) + 1);
    const sug = first ? new Date(Date.UTC(...first.split('-').map((n, i) => i === 1 ? Number(n) - 1 : Number(n))) + 364 * 864e5).toISOString().slice(0, 10) : '';
    h += '<header><h2 id="dlg-title">Neues Jahr anlegen</h2><p class="muted">Stände, Schichten und Sperren werden aus ' + esc(YR()) + ' kopiert. Die Besetzung startet leer, das alte Jahr bleibt erhalten. Die Helfer sehen das neue Jahr erst, wenn du es freischaltest.</p></header>'
      + '<div class="two">' + field('f-year', 'Jahr', 'type="number" min="2026" max="2100" inputmode="numeric" required', next) + field('f-ystart', 'Erster Tag', 'type="date" required', sug) + '</div>' + foot();
  } else if (D.type === 'sos') {
    h += '<header><p class="eyebrow">SOS</p><h2 id="dlg-title">Was fehlt wo?</h2></header>'
      + '<div class="field"><span class="lab">Stand</span><div class="pick">' + m.stations.map(st => '<button type="button" class="chip" data-d="sos-st" data-v="' + esc(st.id) + '" aria-pressed="' + (D.st === st.id) + '">' + esc(st.name) + '</button>').join('') + '</div></div>'
      + '<div class="field"><span class="lab">Was wird gebraucht?</span><div class="pick">' + NEEDS.map(n => '<button type="button" class="chip" data-d="sos-need" data-v="' + esc(n) + '" aria-pressed="' + (D.need === n) + '">' + esc(n) + '</button>').join('') + '</div></div>'
      + field('f-snote', 'Zusatz (freiwillig)', 'placeholder="z. B. 200 Stück, dringend"', D.note)
      + '<p class="hint warn" id="f-err" hidden></p><footer><button type="button" class="btn" data-d="cancel">Abbrechen</button><button type="submit" class="btn sosgo">SOS senden</button></footer>';
  } else if (D.type === 'sosdone') { const x = D.item, txt = 'SOS ' + x.stName + ': ' + x.need + (x.note ? ' – ' + x.note : '') + ' (' + x.by + ', ' + clock(x.at) + ' Uhr)';
    h += '<header><p class="eyebrow">SOS gesendet</p><h2 id="dlg-title">' + esc(x.need) + ' für ' + esc(x.stName) + '</h2><p class="muted">Die Meldung steht jetzt bei der Orga und den SOS-Empfängern. Zusätzlich kannst du sie mit einem Tipp in die WhatsApp-Gruppe stellen.</p></header>'
      + '<footer><a class="btn" href="https://wa.me/?text=' + encodeURIComponent(txt) + '" target="_blank" rel="noopener">In WhatsApp teilen</a><button type="button" class="btn primary" data-d="cancel">Fertig</button></footer>';
  } else if (D.type === 'pdf') {
    h += '<header><h2 id="dlg-title">Plan als PDF</h2><p class="muted">Eine Übersicht zum Ausdrucken oder Weiterschicken: pro Tag eine Tabelle mit allen Ständen und Namen.</p></header>'
      + '<div class="two"><div class="field"><label for="f-pgroup">Bereich</label><select id="f-pgroup">' + ['all'].concat(m.groups).map(g => '<option value="' + esc(g) + '"' + (D.group === g ? ' selected' : '') + '>' + (g === 'all' ? 'Alle Bereiche' : esc(g)) + '</option>').join('') + '</select></div>'
      + '<div class="field"><label for="f-pday">Tag</label><select id="f-pday"><option value="all">Alle Tage</option>' + m.days.map(d => { const i = dayInfo(d); return '<option value="' + d + '"' + (D.day === d ? ' selected' : '') + '>' + i.wdl + ', ' + i.dm + '</option>'; }).join('') + '</select></div></div>'
      + (STANDALONE ? '<p class="hint warn" id="f-err" hidden></p><footer><button type="button" class="btn" data-d="cancel">Abbrechen</button><button type="submit" class="btn primary">PDF erstellen</button></footer>'
        : '<p class="hint">In dieser Vorschau lässt sich keine Datei speichern. In der App erstellt der Knopf hier das PDF.</p><footer><button type="button" class="btn primary" data-d="cancel">Fertig</button></footer>');
  } else if (D.type === 'pdfdone') {
    h += '<header><p class="eyebrow">PDF ist fertig</p><h2 id="dlg-title">' + esc(D.label) + '</h2><p class="muted">' + D.pages + (D.pages === 1 ? ' Seite' : ' Seiten') + ' im Querformat A4.</p></header>'
      + '<footer><button type="button" class="btn left" data-d="cancel">Fertig</button>' + (D.share ? '<button type="button" class="btn" data-d="pdf-share">Teilen</button>' : '') + '<a class="btn primary" href="' + esc(D.url) + '" download="' + esc(D.name) + '">PDF speichern</a></footer>';
  } else {
    h += '<header><h2 id="dlg-title">' + esc(D.title) + '</h2><p class="muted">' + esc(D.hint) + '</p></header><div class="field"><textarea id="f-text" rows="11" readonly>' + esc(D.text) + '</textarea></div><footer><button type="button" class="btn primary" data-d="cancel">Fertig</button></footer>';
  }
  dlg.innerHTML = h + '</form>';
}
function blockTargets(m) { const pairs = D.kind === 'shift' ? m.stations.map(st => [D.sh, st]) : m.shifts.filter(s => s.date === D.day).map(sh => [sh, D.st]);
  return pairs.map(([sh, st]) => ({ sh, st, c: cellOf(sh, st) })); }
const val = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
function syncCell() { D.note = val('f-note'); D.tentative = $('#f-tent').checked; D.off = $('#f-off').checked; }
function addNames() { val('f-name').split(/[+,;&]/).map(s => s.trim()).filter(Boolean).forEach(n => { if (!D.people.some(p => key(p) === key(n))) D.people.push(n); }); }
function openDlg(d) { D = d; drawDlg(); if (!dlg.open) dlg.showModal(); if (d.type === 'text') { const t = $('#f-text'); if (t) { t.focus(); t.select(); } } }
function fail(msg) { const e = $('#f-err'); if (e) { e.textContent = msg; e.hidden = false; } }
function done(msg) { dlg.close(); commit(msg); }
const slug = s => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'stand';

dlg.addEventListener('click', e => {
  const cal = e.target.closest('[data-cal]'); if (cal) { const [s, t] = cal.dataset.cal.split('|'), m = model(), sh = m.shifts.find(x => x.id === s), st = m.stations.find(x => x.id === t); if (sh && st) showIcs([{ sh, st }]); return; }
  const b = e.target.closest('[data-d]'); if (!b) return; const a = b.dataset.d;
  if (a === 'cancel') return dlg.close();
  if (a === 'add') { syncCell(); addNames(); drawDlg(); $('#f-name').focus(); return; }
  if (a === 'addme') { syncCell(); addNames(); if (!D.people.some(p => key(p) === key(myName()))) D.people.push(myName()); drawDlg(); return; }
  if (a === 'rm') { syncCell(); D.people.splice(Number(b.dataset.i), 1); drawDlg(); $('#f-name').focus(); return; }
  if (a === 'sos-st' || a === 'sos-need') { D.note = val('f-snote'); if (a === 'sos-st') D.st = b.dataset.v; else D.need = b.dataset.v; drawDlg(); return; }
  if (a === 'block' || a === 'unblock') { const t = blockTargets(model()); let n = 0;
    t.forEach(({ sh, st, c }) => { if (a === 'block' && !c.off && !c.people.length) { setCell(sh, st, { people: [], note: c.note || 'gesperrt', off: true, tentative: false, bulk: true, was: c.note }); n++; }
      else if (a === 'unblock' && c.off && c.bulk) { const raw = (sh.cells || {})[st.id] || {}; setCell(sh, st, { people: [], note: raw.was || '', off: false, tentative: false }); n++; } });
    return done(n + (n === 1 ? ' Feld ' : ' Felder ') + (a === 'block' ? 'gesperrt' : 'freigegeben')); }
  if (a === 'pdf-share') { try { navigator.share({ files: [D.file], title: D.label }).catch(() => {}); } catch (x) {} return; }
  if (a === 'join') { const me = meHelper(), m = model(), c = statusOf(D.sh, D.st); if (!me || c.off || c.people.length >= c.max) { drawDlg(); return; }
    let name = '', self = false; const w = D.who || '';
    if (w === '+') { const first = val('f-cfirst'), last = val('f-clast'), phone = val('f-cphone').replace(/[^\d+]/g, '');
      if (!first || !last) return fail('Bitte Vorname und Nachname eintragen.');
      if (phone && phone.replace(/\D/g, '').length < 6) return fail('Bitte eine gültige Handynummer eintragen oder das Feld leer lassen.');
      if (D.cands && (first !== D.cf || last !== D.cl)) D.cands = null;
      if (!D.cands) { const cands = candidates(first, last); D.cf = first; D.cl = last; D.cp = phone;
        if (cands.length) { D.cands = cands; drawDlg(); fail('Bitte wähle, ob die Person schon im Plan steht, und tippe dann noch einmal auf «Eintragen».'); return; } }
      name = (D.cands && val('f-ccand')) || dnFor(first, last);
      if (DB.helpers.some(x => key(x.name) === key(name))) return fail('«' + name + '» steht schon in der Helferliste. Wähle die Person oben in der Auswahl aus.');
      if (c.people.some(p => key(p) === key(name))) return fail('«' + name + '» ist in dieser Schicht schon eingetragen.');
      DB.helpers.push({ id: rid('h'), first, last, phone, email: '', again: false, name, sos: false, by: me.id, at: Date.now() });
    } else if (w.slice(0, 2) === 'i:') { const t = myPeople().find(x => x.id === w.slice(2)); if (t) { name = t.name; self = t.id === me.id; } }
    else if (w.slice(0, 2) === 'n:') name = w.slice(2);
    if (!name) return fail('Bitte wähle, wen du eintragen möchtest.');
    if (c.people.some(p => key(p) === key(name))) { drawDlg(); return; }
    const by = Object.assign({}, c.by); if (w.slice(0, 2) === 'n:') by[name] = me.id;
    setPeople(D.sh, D.st, c.people.concat(name), by);
    S.thanks = true; D = { type: 'hcell', sh: D.sh, st: D.st }; persist(); render(); toast(self ? 'Du bist eingetragen' : name + ' ist eingetragen'); refreshDlg(); drawDlg(); return; }
  if (a === 'leave') { const me = meHelper(), m = model(), c = statusOf(D.sh, D.st), name = b.dataset.v; if (!me || !c.people.includes(name) || !(m.mine.has(key(name)) || c.by[name] === me.id)) return;
    if (D.sure !== name) { D.sure = name; drawDlg(); return; }
    const by = Object.assign({}, c.by); delete by[name];
    setPeople(D.sh, D.st, c.people.filter(p => p !== name), by);
    D = { type: 'hcell', sh: D.sh, st: D.st }; persist(); render(); toast(key(name) === key(me.name) ? 'Du bist ausgetragen' : name + ' ist ausgetragen'); refreshDlg(); drawDlg(); return; }
  if (a === 'del') { if (!D.sure) { D.sure = true; b.textContent = D.type === 'shift' ? 'Samt Besetzung löschen?' : 'Wirklich löschen?'; return; }
    const y = Y(); if (D.type === 'shift') y.shifts = y.shifts.filter(s => s.id !== D.sh.id); else y.stations = y.stations.filter(s => s.id !== D.st.id);
    done(D.type === 'shift' ? 'Schicht gelöscht' : 'Stand gelöscht'); }
});
dlg.addEventListener('close', () => { if (S.thanks) { S.thanks = false; nikolaus(1); } if (D && D.type === 'pdfdone' && D.url) { const u = D.url; setTimeout(() => URL.revokeObjectURL(u), 60000); } });
dlg.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'f-name' && e.target.value.trim()) { e.preventDefault(); syncCell(); addNames(); drawDlg(); $('#f-name').focus(); } });
dlg.addEventListener('change', e => { if (D && D.type === 'hcell' && e.target.id === 'f-who') { D.who = e.target.value; D.cands = null; D.sure = null; drawDlg(); const x = $('#f-cfirst') || $('#f-who'); if (x) x.focus(); return; }
  if (D && D.type === 'cell' && (e.target.id === 'f-off' || e.target.id === 'f-tent')) { const id = e.target.id, pend = $('#f-name').value; syncCell(); drawDlg(); $('#f-name').value = pend; $('#' + id).focus(); } });
dlg.addEventListener('submit', e => {
  e.preventDefault(); const y = Y();
  if (D.type === 'cell') { syncCell(); addNames();
    /* Hat sich inzwischen jemand eingetragen, bleibt der Name erhalten: nur die eigenen Änderungen zählen */
    const now = cellOf(D.sh, D.st).people, orig = D.orig || now, gone = orig.filter(p => !D.people.includes(p)), people = now.filter(p => !gone.includes(p));
    D.people.forEach(p => { if (!orig.includes(p) && !people.some(x => key(x) === key(p))) people.push(p); });
    const data = { people, note: D.note, off: D.off, tentative: D.tentative && people.length > 0 }, was = cellOf(D.sh, D.st).by, by = {};
    Object.keys(was).forEach(n => { if (people.includes(n)) by[n] = was[n]; }); if (Object.keys(by).length) data.by = by;
    setCell(D.sh, D.st, data); return done('Gespeichert'); }
  if (D.type === 'pdf') { const group = $('#f-pgroup').value, day = $('#f-pday').value, f = e.target; lock(f, true);
    makePdf(group, day).then(r => showPdf(r, 'sternenzauber-plan' + (group === 'all' ? '' : '-' + slug(group)) + (day === 'all' ? '' : '-' + day) + '.pdf', (group === 'all' ? 'Alle Bereiche' : group) + ' · ' + (day === 'all' ? 'alle Tage' : dayInfo(day).wdl)),
      () => { lock(f, false); fail('Das PDF konnte nicht erstellt werden. Bitte prüfe die Verbindung und versuch es noch einmal.'); }); return; }
  if (D.type === 'station') { const name = val('f-sname'); if (!name) return fail('Bitte gib dem Stand einen Namen.');
    const min = Math.min(20, Math.max(1, parseInt(val('f-smin'), 10) || 1)), max = Math.min(20, Math.max(min, parseInt(val('f-smax'), 10) || min));
    const data = { name, sub: val('f-ssub'), place: val('f-splace'), group: val('f-sgroup') || OTHER, min, max, sos: $('#f-ssos').checked };
    if (D.st) { Object.assign(y.stations.find(s => s.id === D.st.id), data); return done('Stand gespeichert'); }
    let id = slug(name), n = 2; const ids = y.stations.map(s => s.id); while (ids.includes(id)) id = slug(name) + '-' + n++;
    data.id = id; data.order = y.stations.reduce((x, s) => Math.max(x, Number(s.order) || 0), 0) + 1; y.stations.push(data); return done('Stand angelegt'); }
  if (D.type === 'shift') { const date = val('f-hdate'), start = val('f-hstart'), end = val('f-hend');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}/.test(start) || !/^\d{2}:\d{2}/.test(end)) return fail('Bitte Datum, Beginn und Ende ausfüllen.');
    if (start.slice(0, 5) === end.slice(0, 5)) return fail('Beginn und Ende sind gleich.');
    const data = { date, start: start.slice(0, 5), end: end.slice(0, 5) };
    if (y.shifts.some(s => s.date === data.date && s.start === data.start && (!D.sh || s.id !== D.sh.id))) return fail('An diesem Tag beginnt schon eine Schicht um ' + data.start + ' Uhr.');
    if (D.sh) { Object.assign(y.shifts.find(s => s.id === D.sh.id), data); return done('Schicht gespeichert'); }
    let id = date + '_' + data.start.replace(':', ''), n = 2; const ids = y.shifts.map(s => s.id), base = id; while (ids.includes(id)) id = base + '-' + n++;
    data.id = id; data.cells = {}; y.shifts.push(data); S.day = date; return done('Schicht angelegt'); }
  if (D.type === 'note') { const t = val('f-ntext'); if (!t) return fail('Bitte gib einen Text ein.'); y.info.notes = (Array.isArray(y.info.notes) ? y.info.notes : []).concat(t); return done('Hinweis gespeichert'); }
  if (D.type === 'hreg') { const first = val('f-rfirst'), last = val('f-rlast'), phone = val('f-rphone').replace(/[^\d+]/g, '');
    if (!first || !last) return fail('Bitte Vorname und Nachname eintragen.');
    const email = val('f-rmail');
    if (phone.replace(/\D/g, '').length < 6) return fail('Bitte eine gültige Handynummer eintragen.');
    if ((D.self || email) && !MAILRE.test(email)) return fail('Bitte eine gültige E-Mail-Adresse eintragen.');
    if (DB.helpers.some(h => h.phone && h.phone === phone && (!D.h || h.id !== D.h.id))) return fail('Diese Handynummer gehört schon zu einer anderen Person.');
    if (D.h) Object.assign(DB.helpers.find(h => h.id === D.h.id), { first, last, phone, email }, D.self ? { again: $('#f-ragain').checked } : {});
    else DB.helpers.push({ id: rid('h'), first, last, phone, email, again: false, name: D.name, sos: false, at: Date.now() });
    return done('Gespeichert'); }
  if (D.type === 'elevate') { const pw = val('f-epw'), f = e.target; if (!pw) return fail('Bitte gib das Passwort ein.'); lock(f, true);
    api('login', { pw }).then(r => { take(r); setMe({ role: r.me.role, id: r.me.id, token: r.token }); cache(); S.prog = null; dlg.close(); render(); toast('Du bist jetzt als Orga angemeldet'); },
      err => { lock(f, false); fail(err.code === 'pw' ? 'Das Passwort stimmt nicht.' : NET); }); return; }
  if (D.type === 'code') { const v = val('f-code'), min = D.which === 'orga' ? 8 : 4; if (v.length < min) return fail('Bitte mindestens ' + min + ' Zeichen.');
    if (Object.keys(DB.codes).some(k => k !== D.which && key(DB.codes[k]) === key(v))) return fail('Dieser Wert wird schon für einen anderen Zugang verwendet.');
    DB.codes[D.which] = v; return done('Zugang geändert'); }
  if (D.type === 'year') { const yr = val('f-year'), start = val('f-ystart'), m = model();
    if (!/^\d{4}$/.test(yr) || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return fail('Bitte Jahr und ersten Tag ausfüllen.');
    if (DB.years[yr]) return fail('Das Jahr ' + yr + ' gibt es schon.');
    const utc = d => Date.UTC(...d.split('-').map((n, i) => i === 1 ? Number(n) - 1 : Number(n))), off = m.days.length ? Math.round((utc(start) - utc(m.days[0])) / 864e5) : 0;
    const copy = JSON.parse(JSON.stringify(y));
    copy.shifts.forEach(s => { s.date = new Date(utc(s.date) + off * 864e5).toISOString().slice(0, 10); s.id = s.date + '_' + s.start.replace(':', '');
      const cells = {}; Object.keys(s.cells || {}).forEach(k => { const c = s.cells[k]; if (c.off || c.note) cells[k] = { people: [], note: c.note || '', off: !!c.off, tentative: false, bulk: !!c.bulk, was: c.was || '' }; }); s.cells = cells; });
    copy.info.title = String(copy.info.title || 'Sternenzauber').replace(/\d{4}/, yr); if (!copy.info.title.includes(yr)) copy.info.title += ' ' + yr;
    DB.years[yr] = copy; S.year = yr; S.day = null; S.prog = null; return done('Jahr ' + yr + ' angelegt. Die Helfer sehen weiter ' + DB.active + '.'); }
  if (D.type === 'sos') { D.note = val('f-snote'); if (!D.st || !D.need) return fail('Bitte Stand und Bedarf antippen.');
    const st = y.stations.find(s => s.id === D.st), item = { id: rid('s'), st: D.st, stName: st ? st.name : D.st, need: D.need, note: D.note, by: myName(), at: Date.now(), status: 'open', taker: '' };
    DB.sos.push(item); persist(); render(); toast('SOS gesendet'); D = { type: 'sosdone', item }; drawDlg(); }
});

/* ---------- Plan als PDF ---------- */
function loadScript(src) { return new Promise((ok, no) => { const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = no; document.head.appendChild(el); }); }
async function pdfLib() { if (!window.jspdf) await loadScript('vendor/jspdf.umd.min.js'); if (!window.jspdf.jsPDF.API.autoTable) await loadScript('vendor/jspdf.plugin.autotable.min.js'); }
function pdfStamp() { const now = new Date(), pad = n => String(n).padStart(2, '0'); return 'Stand ' + now.getDate() + '.' + (now.getMonth() + 1) + '.' + now.getFullYear() + ', ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ' Uhr'; }
function pdfFoot(doc, left) { const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) { doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(130, 134, 155); doc.text('Seite ' + p + ' von ' + pages, 285, 204, { align: 'right' }); doc.text(left, 12, 204); }
  return pages; }
function showPdf(r, name, label) { let file = null, share = false; try { file = new File([r.blob], name, { type: 'application/pdf' }); share = !!navigator.canShare && navigator.canShare({ files: [file] }); } catch (x) {}
  openDlg({ type: 'pdfdone', url: URL.createObjectURL(r.blob), name, file, share, pages: r.pages, label }); }
/* Helferliste für die Orga: alle Personen aus Plan und Helferliste mit Kontaktdaten und Einsätzen */
async function makeHelperPdf() { await pdfLib();
  const m = model(), doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }), rows = new Map();
  DB.helpers.forEach(h => rows.set(key(h.name), { name: h.name, h, p: null }));
  m.people.forEach((p, k) => { if (rows.has(k)) rows.get(k).p = p; else rows.set(k, { name: p.name, h: null, p }); });
  const all = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')), withPhone = all.filter(r => r.h && r.h.phone).length;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(43, 47, 74); doc.text((m.info.title || 'Sternenzauber') + ' · Helferliste', 12, 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(87, 92, 120);
  doc.text(all.length + ' Personen   ·   ' + withPhone + ' mit Handynummer   ·   ' + pdfStamp() + '   ·   Vertraulich, nur für das Orga-Team', 12, 20.5);
  const body = all.map(r => { const h = r.h, note = []; if (h && h.role) note.push(ROLE[h.role]); if (h && h.sos) note.push('SOS-Empfänger');
    if (h && h.by) { const o = DB.helpers.find(x => x.id === h.by); if (o) note.push('eingetragen von ' + o.name); }
    if (!h) note.push('noch nicht angemeldet');
    return [{ content: r.name, styles: { fontStyle: 'bold' } }, h ? h.first || '' : '', h ? h.last || '' : '', h ? h.phone || '' : '', h ? h.email || '' : '', r.p ? String(r.p.slots.length) : '0', r.p ? hours(r.p.mins) : '', h ? (h.again ? 'ja' : 'nein') : '', note.join(', ')]; });
  doc.autoTable({ head: [['Name im Plan', 'Vorname', 'Nachname', 'Handynummer', 'E-Mail', 'Einsätze', 'Stunden', 'Nächstes Jahr', 'Hinweis']], body, startY: 25, margin: { top: 12, left: 12, right: 12, bottom: 12 }, theme: 'grid', rowPageBreak: 'avoid',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, lineColor: [203, 208, 224], lineWidth: 0.2, textColor: [27, 30, 51], valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [43, 47, 74], textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [245, 246, 250] },
    columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 26 }, 2: { cellWidth: 30 }, 3: { cellWidth: 32 }, 4: { cellWidth: 58 }, 5: { cellWidth: 17, halign: 'right' }, 6: { cellWidth: 19, halign: 'right' }, 7: { cellWidth: 21 } } });
  return { blob: doc.output('blob'), pages: pdfFoot(doc, (m.info.title || 'Sternenzauber') + ' · Helferliste · vertraulich') };
}
async function makePdf(group, day) {
  await pdfLib();
  const m = model(), doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }), pad = n => String(n).padStart(2, '0'), now = new Date();
  const days = day === 'all' ? m.days : m.days.filter(d => d === day), sts = m.stations.filter(st => group === 'all' || grp(st) === group);
  const title = (m.info.title || 'Sternenzauber') + ' · Standbesetzung', stamp = 'Stand ' + now.getDate() + '.' + (now.getMonth() + 1) + '.' + now.getFullYear() + ', ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ' Uhr';
  days.forEach((d, idx) => { if (idx) doc.addPage(); const i = dayInfo(d), shifts = m.shifts.filter(x => x.date === d);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(43, 47, 74); doc.text(title, 12, 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(87, 92, 120);
    doc.text(i.wdl + ', ' + i.d + '. ' + MON[i.m - 1] + ' ' + i.y + '   ·   ' + (group === 'all' ? 'Alle Bereiche' : group) + '   ·   ' + stamp, 12, 20.5);
    const body = []; let last = null;
    sts.forEach(st => {
      if (grp(st) !== last) { last = grp(st); body.push([{ content: last.toUpperCase(), colSpan: shifts.length + 1, styles: { fillColor: [225, 228, 239], textColor: [87, 92, 120], fontStyle: 'bold', fontSize: 8, cellPadding: { top: 1.2, bottom: 1.2, left: 2, right: 2 } } }]); }
      body.push([{ content: st.name + '\n' + [st.place, needText(st)].filter(Boolean).join(' · '), styles: { fontStyle: 'bold' } }].concat(shifts.map(sh => { const c = statusOf(sh, st);
        if (c.k === 'off') return { content: c.note || 'geschlossen', styles: { textColor: [130, 134, 155], fillColor: [240, 241, 246], fontStyle: 'italic' } };
        const lines = c.people.slice(); if (c.k === 'open') lines.push('offen · ' + missText(c)); else if (c.k === 'part') lines.push('(' + missText(c) + (c.tentative ? ', unbestätigt' : '') + ')'); else if (c.k === 'tent') lines.push('(unbestätigt)');
        if (c.note) lines.push(c.note);
        return { content: lines.join('\n'), styles: c.k === 'open' ? { fillColor: [251, 232, 236], textColor: [179, 34, 60], fontStyle: 'bold' } : c.k === 'part' || c.k === 'tent' ? { fillColor: [251, 237, 203] } : {} }; }))); });
    doc.autoTable({ head: [['Stand'].concat(shifts.map(x => span(x) + ' Uhr'))], body, startY: 25, margin: { top: 12, left: 12, right: 12, bottom: 12 }, theme: 'grid', rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.8, lineColor: [203, 208, 224], lineWidth: 0.2, textColor: [27, 30, 51], valign: 'top', overflow: 'linebreak' },
      headStyles: { fillColor: [43, 47, 74], textColor: 255, fontStyle: 'bold' }, columnStyles: { 0: { cellWidth: 50 } } }); });
  return { blob: doc.output('blob'), pages: pdfFoot(doc, m.info.title || 'Sternenzauber') };
}

/* ---------- Texte zum Kopieren ---------- */
function textOpen(m) { let t = 'Offene Schichten – ' + (m.info.title || 'Sternenzauber') + (S.group === 'all' ? '' : ' (' + S.group + ')'), last = null;
  openItems(m).forEach(({ sh, rows }) => { if (sh.date !== last) { last = sh.date; const i = dayInfo(sh.date); t += '\n\n' + i.wdl + ', ' + i.dm; }
    t += '\n' + span(sh) + ' Uhr\n' + rows.map(({ st, c }) => '– ' + st.name + ': ' + missText(c) + (c.note ? ' (' + c.note + ')' : '')).join('\n'); });
  return t; }
function textPerson(m, k) { const p = m.people.get(k); if (!p) return '';
  return p.name + ' – Einsätze ' + (m.info.title || '') + '\n\n' + p.slots.map(s => { const i = dayInfo(s.sh.date), mates = s.c.people.filter(x => key(x) !== k);
    return i.wd + ' ' + i.dm + ' ' + span(s.sh) + ' Uhr: ' + s.st.name + (s.st.place ? ', ' + s.st.place : '') + (mates.length ? ' (mit ' + mates.join(', ') + ')' : ''); }).join('\n'); }
function textHelpers(m) { return 'Helferliste – ' + (m.info.title || 'Sternenzauber') + '\n\n' + DB.helpers.slice().sort((a, b) => a.last.localeCompare(b.last, 'de')).map(h => { const p = m.people.get(key(h.name));
  return h.first + ' ' + h.last + (h.phone ? ', ' + h.phone : '') + (h.email ? ', ' + h.email : '') + ', ' + (p ? p.slots.length : 0) + ' Einsätze' + (h.role ? ', ' + ROLE[h.role] : '') + (h.sos ? ', SOS-Empfänger' : ''); }).join('\n'); }

/* ---------- Bedienung ---------- */
$('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { S.tab = b.dataset.tab; S.sure = false; render(); window.scrollTo(0, 0); } });
$('#userbar').addEventListener('click', e => { const b = e.target.closest('[data-h]'); if (!b) return;
  if (b.dataset.h === 'elevate') openDlg({ type: 'elevate' });
  else if (b.dataset.h === 'refresh') pull(true);
  else if (b.dataset.h === 'logout') { signOut(); toast('Abgemeldet'); } });
$('#userbar').addEventListener('change', e => { if (e.target.id === 'yearsel') { S.year = e.target.value; S.day = null; S.prog = null; render(); toast('Jahr ' + YR() + ' wird angezeigt'); } });
view.addEventListener('click', e => {
  const cal = e.target.closest('[data-cal]'); if (cal) { const [s, t] = cal.dataset.cal.split('|'), mm = model(), sh = mm.shifts.find(x => x.id === s), st = mm.stations.find(x => x.id === t); if (sh && st) showIcs([{ sh, st }]); return; }
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act, v = b.dataset.v, m = model();
  if (a === 'claim') finishReg(v);
  else if (a === 'gate') { S.gate = v; if (v === 'start') S.pendingRole = null; render(); const f = view.querySelector('input'); if (f) f.focus(); }
  else if (a === 'day') { S.day = v; S.shift = null; render(); }
  else if (a === 'shift') { S.shift = v; render(); }
  else if (a === 'group') { S.group = v; render(); }
  else if (a === 'goto') { S.tab = v; render(); }
  else if (a === 'person') { S.openPerson = S.openPerson === v ? null : v; render(); }
  else if (a === 'cell' || a === 'hcell') { const sh = m.shifts.find(s => s.id === b.dataset.s), st = m.stations.find(s => s.id === b.dataset.t); if (!sh || !st) return; const c = cellOf(sh, st);
    openDlg(a === 'cell' ? { type: 'cell', sh, st, people: c.people.slice(), orig: c.people.slice(), note: c.note, off: c.off, tentative: c.tentative } : { type: 'hcell', sh, st }); }
  else if (a === 'blk') { const k = b.dataset.k, sh = k === 'shift' ? m.shifts.find(x => x.id === v) : null, st = k === 'station' ? m.stations.find(x => x.id === v) : null; if (!sh && !st) return;
    openDlg({ type: 'block', kind: k, sh, st, day: sh ? sh.date : S.day }); }
  else if (a === 'hreg') { const h = DB.helpers.find(x => key(x.name) === v), p = m.people.get(v); openDlg({ type: 'hreg', name: h ? h.name : p ? p.name : v, h: h || null }); }
  else if (a === 'st-new') openDlg({ type: 'station', st: null });
  else if (a === 'st-edit') { const st = m.stations.find(s => s.id === v); if (st) openDlg({ type: 'station', st }); }
  else if (a === 'sh-new') openDlg({ type: 'shift', sh: null });
  else if (a === 'sh-edit') { const sh = m.shifts.find(s => s.id === v); if (sh) openDlg({ type: 'shift', sh }); }
  else if (a === 'note-new') openDlg({ type: 'note' });
  else if (a === 'note-del') { Y().info.notes.splice(Number(v), 1); commit('Hinweis entfernt'); }
  else if (a === 'code') openDlg({ type: 'code', which: v });
  else if (a === 'year-new') openDlg({ type: 'year' });
  else if (a === 'year-show') { S.year = v; S.day = null; S.prog = null; S.sure = false; render(); toast('Jahr ' + v + ' wird angezeigt'); }
  else if (a === 'year-live') { if (S.sure !== 'live' + v) { S.sure = 'live' + v; return render(); } S.sure = false; DB.active = v; S.year = null; S.day = null; S.prog = null; commit('Alle Helfer sehen jetzt ' + v); }
  else if (a === 'pdf') openDlg({ type: 'pdf', group: S.group, day: 'all' });
  else if (a === 'pdf-helfer') { if (!isOrga()) return;
    if (!STANDALONE) return openDlg({ type: 'text', title: 'Helferliste als PDF', hint: 'In dieser Vorschau lässt sich keine Datei speichern. In der App erstellt der Knopf hier das PDF.', text: textHelpers(m) });
    b.disabled = true; toast('PDF wird erstellt …');
    makeHelperPdf().then(r => showPdf(r, 'sternenzauber-helferliste.pdf', 'Helferliste'), () => { b.disabled = false; toast('Das PDF konnte nicht erstellt werden.'); }); }
  else if (a === 'reset') { if (S.sure !== 'reset') { S.sure = 'reset'; return render(); } S.sure = false; if (!REMOTE) { try { localStorage.removeItem('sz.vorschau.server'); } catch (x) {} signOut(); toast('Vorschau zurückgesetzt'); } }
  else if (a === 'stars') starShow(3);
  else if (a === 'niks') nikolaus(3);
  else if (a === 'install') { if (installEvt) { const ev = installEvt; installEvt = null; ev.prompt(); render(); } }
  else if (a === 'sos-new') openDlg({ type: 'sos', st: null, need: null, note: '' });
  else if (a === 'sos-toggle') { const h = DB.helpers.find(x => x.id === v); if (h) { h.sos = !h.sos; commit(h.sos ? h.name + ' ist jetzt SOS-Empfänger' : h.name + ' ist kein SOS-Empfänger mehr'); } }
  else if (a === 'sos-go' || a === 'sos-done') { const x = DB.sos.find(s => s.id === v); if (x) { x.status = a === 'sos-go' ? 'go' : 'done'; x.taker = myName(); commit(a === 'sos-go' ? 'Du hast übernommen' : 'Als erledigt markiert'); } }
  else if (a === 'sos-del') { DB.sos = DB.sos.filter(s => s.id !== v); commit('Meldung entfernt'); }
  else if (a === 'copy-open') copyText(textOpen(m), 'Liste kopiert');
  else if (a === 'copy-person') copyText(textPerson(m, v), 'Einsätze kopiert');
  else if (a === 'copy-mine') copyText(textPerson(m, key(myName())), 'Schichten kopiert');
  else if (a === 'copy-mails') copyText(DB.helpers.filter(h => h.email).map(h => h.email).join(', '), 'E-Mail-Adressen kopiert');
  else if (a === 'copy-phones') copyText(DB.helpers.filter(h => h.phone).map(h => h.first + ' ' + h.last + ': ' + h.phone).join('\n'), 'Handynummern kopiert');
  else if (a === 'mail-many') openDlg({ type: 'text', title: v, hint: 'Es sind zu viele Adressen für einen direkten Link. Kopiere sie und füge sie in deinem E-Mail-Programm ins Feld BCC ein.', text: DB.helpers.filter(h => h.email).map(h => h.email).join(', ') });
  else if (a === 'csv') { const q = x => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"', rows = [['Vorname', 'Nachname', 'Name im Plan', 'Handynummer', 'E-Mail', 'Einsätze', 'Rolle', 'SOS-Empfänger', 'Nächstes Jahr anschreiben', 'Eingetragen von']].concat(DB.helpers.slice().sort((x, y) => x.last.localeCompare(y.last, 'de')).map(h => { const p = m.people.get(key(h.name));
      return [h.first, h.last, h.name, h.phone, h.email || '', p ? p.slots.length : 0, h.role ? ROLE[h.role] : 'Helfer', h.sos ? 'ja' : 'nein', h.again ? 'ja' : 'nein', (DB.helpers.find(o => o.id === h.by) || {}).name || '']; })), csv = rows.map(r => r.map(q).join(';')).join('\r\n');
    saveFile('sternenzauber-helferliste.csv', '\ufeff' + csv, 'text/csv;charset=utf-8', 'Helferliste', 'Kopiere den Inhalt in eine Tabelle. In der fertigen App wird hier eine Datei heruntergeladen.'); }
  else if (a === 'profile') { const h = meHelper(); if (h) openDlg({ type: 'hreg', name: h.name, h, self: true }); }
  else if (a === 'cal-all') { const P = m.people.get(key(myName())); if (P) showIcs(P.slots); }
});
view.addEventListener('input', e => { if (e.target.id === 'q') { S.q = e.target.value; render(); } });
view.addEventListener('change', e => { if (e.target.id === 'grpsel') { S.group = e.target.value; render(); } });
(NARROW.addEventListener ? NARROW.addEventListener.bind(NARROW, 'change') : NARROW.addListener.bind(NARROW))(() => render());
window.addEventListener('storage', e => {
  if (e.key === SS) { const m = loadMe(); if (!m && ME) signOut(); else if (m && (!ME || m.token !== ME.token)) { ME = m; take({ db: loadCache() }); render(); pull(); } }
  else if (!REMOTE && e.key === 'sz.vorschau.server') pull(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
window.addEventListener('online', () => pull());
setInterval(() => { if (document.visibilityState === 'visible') pull(); }, 30000);
render();
pull();
})();
