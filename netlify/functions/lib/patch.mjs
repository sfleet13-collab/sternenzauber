/* Unterschiede zwischen zwei Datenständen als kleine Schritte beschreiben und wieder anwenden.
   Läuft unverändert in der App (Browser) und in der Server-Funktion.

   Ein Schritt: { t, p, v }
     t = 'set'  Wert an Pfad p setzen
         'del'  Wert an Pfad p löschen (Schlüssel oder Listeneintrag mit id)
         'ins'  Objekt v in die Liste an Pfad p einfügen (Listen aus Objekten mit id)
         'add'  Texte v in die Liste an Pfad p aufnehmen (Listen aus Texten, z. B. Namen)
         'rem'  Texte v aus der Liste an Pfad p entfernen
   Pfadteile: Schlüsselname oder '#id' für den Listeneintrag mit dieser id. */

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const hasId = x => isObj(x) && typeof x.id === 'string' && x.id !== '';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const clone = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

export function diff(a, b, path = [], ops = []) {
  if (isObj(a) && isObj(b)) {
    for (const k of Object.keys(a)) if (!(k in b) || b[k] === undefined) ops.push({ t: 'del', p: path.concat(k) });
    for (const k of Object.keys(b)) { if (b[k] === undefined) continue;
      if (!(k in a) || a[k] === undefined) ops.push({ t: 'set', p: path.concat(k), v: clone(b[k]) });
      else diff(a[k], b[k], path.concat(k), ops); }
    return ops;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const all = a.concat(b);
    if (!all.length) return ops;
    if (all.every(hasId)) {
      const ia = new Map(a.map(x => [x.id, x])), ib = new Map(b.map(x => [x.id, x]));
      for (const x of a) if (!ib.has(x.id)) ops.push({ t: 'del', p: path.concat('#' + x.id) });
      for (const x of b) { if (!ia.has(x.id)) ops.push({ t: 'ins', p: path, v: clone(x) }); else diff(ia.get(x.id), x, path.concat('#' + x.id), ops); }
      return ops;
    }
    if (all.every(x => typeof x === 'string')) {
      const rem = a.filter(x => !b.includes(x)), add = b.filter(x => !a.includes(x));
      if (rem.length) ops.push({ t: 'rem', p: path, v: rem });
      if (add.length) ops.push({ t: 'add', p: path, v: add });
      return ops;
    }
  }
  if (!same(a, b)) ops.push({ t: 'set', p: path, v: clone(b) });
  return ops;
}

const BAD = new Set(['__proto__', 'constructor', 'prototype']);
export function validOp(op) {
  if (!isObj(op) || !['set', 'del', 'ins', 'add', 'rem'].includes(op.t)) return false;
  if (!Array.isArray(op.p) || op.p.length > 10 || (op.t !== 'ins' && op.t !== 'add' && op.t !== 'rem' && !op.p.length)) return false;
  if (!op.p.every(s => typeof s === 'string' && s !== '' && s.length <= 80 && !BAD.has(s))) return false;
  if ((op.t === 'add' || op.t === 'rem') && !(Array.isArray(op.v) && op.v.every(x => typeof x === 'string' && x.length <= 120))) return false;
  if (op.t === 'ins' && !hasId(op.v)) return false;
  if (op.t === 'set' && op.v === undefined) return false;
  return true;
}

/* Einen Pfadteil auflösen. Gibt den Wert zurück oder undefined. */
function step(node, seg) {
  if (Array.isArray(node)) return seg.charAt(0) === '#' ? node.find(x => hasId(x) && x.id === seg.slice(1)) : undefined;
  if (isObj(node)) return Object.prototype.hasOwnProperty.call(node, seg) ? node[seg] : undefined;
  return undefined;
}
export function at(root, path) { let n = root; for (const s of path) { n = step(n, s); if (n === undefined) return undefined; } return n; }

/* Felder im Plan: zwei gleichzeitige Einträge in ein noch leeres Feld dürfen sich nicht überschreiben. */
function mergeCell(old, neu) { const people = (Array.isArray(old.people) ? old.people : []).slice();
  (Array.isArray(neu.people) ? neu.people : []).forEach(n => { if (!people.includes(n)) people.push(n); });
  return Object.assign({}, neu, { people }); }

/* Schritt anwenden. Gibt false zurück, wenn das Ziel nicht (mehr) existiert. */
export function applyOp(root, op) {
  const p = op.p;
  if (op.t === 'ins' || op.t === 'add' || op.t === 'rem') {
    let list = at(root, p);
    if (list === undefined && p.length) { const parent = at(root, p.slice(0, -1)); if (!isObj(parent)) return false; list = parent[p[p.length - 1]] = []; }
    if (!Array.isArray(list)) return false;
    if (op.t === 'ins') { if (list.some(x => hasId(x) && x.id === op.v.id)) return false; list.push(clone(op.v)); return true; }
    if (op.t === 'add') { op.v.forEach(n => { if (!list.includes(n)) list.push(n); }); return true; }
    op.v.forEach(n => { const i = list.indexOf(n); if (i >= 0) list.splice(i, 1); }); return true;
  }
  const parent = at(root, p.slice(0, -1)), last = p[p.length - 1];
  if (parent === undefined) return false;
  if (Array.isArray(parent)) { if (last.charAt(0) !== '#') return false;
    const i = parent.findIndex(x => hasId(x) && x.id === last.slice(1)); if (i < 0) return false;
    if (op.t === 'del') parent.splice(i, 1); else parent[i] = clone(op.v);
    return true; }
  if (!isObj(parent)) return false;
  if (op.t === 'del') { delete parent[last]; return true; }
  const inCells = p.length >= 2 && p[p.length - 2] === 'cells';
  parent[last] = inCells && isObj(parent[last]) && isObj(op.v) ? mergeCell(parent[last], op.v) : clone(op.v);
  return true;
}
export function applyOps(root, ops) { ops.forEach(op => { if (validOp(op)) applyOp(root, op); }); return root; }
