<?php
/* Sternenzauber Helferplan: Server-Teil für normales Webhosting (z. B. Hostinger), ohne Datenbank.
   Dieselben Regeln wie netlify/functions/lib/core.mjs: Anmeldung, wer was sehen und ändern darf,
   Speichern ohne Überschreiben. Die Daten liegen als Dateien im gesperrten Ordner daten/.

   Aufruf aus der App: api.php?r=login | register | db | patch      Prüfen: api.php?r=status */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');

const SZ_DIR = __DIR__ . '/daten';
const SZ_GUARD = "<?php http_response_code(404); exit; ?>\n";   // erste Zeile jeder Datendatei: ein direkter Aufruf zeigt nichts
const SZ_JSON = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
const SZ_IDRE = '/^[a-z0-9]{4,24}$/';
const SZ_MIG = 1;   // Stand der einmaligen Anpassungen an bestehenden Daten
const SZ_MIG1_SOS = ['Nina Blasberg', 'Julian Richter', 'Magnus', 'Melli Schittek', 'Frank Blasberg', 'Betsy Arens', 'Saskia Melis'];
const SZ_MIG1_NOTE = 'Orga-Team: Nina B., Julian R., Astrid und Susan.';
const SZ_MAILRE = '/^[^\s@]+@[^\s@]+\.[^\s@]+$/u';

class Halt extends Exception { public function __construct(public int $status, public string $err) { parent::__construct($err); } }

/* ---------- kleine Hilfen ---------- */
function out(int $status, $body): void { http_response_code($status); echo json_encode($body, SZ_JSON); exit; }
function lower(string $s): string { return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s); }
function cut(string $s, int $max): string { return function_exists('mb_substr') ? mb_substr($s, 0, $max, 'UTF-8') : substr($s, 0, $max); }
function nkey($n): string { return lower(trim(is_scalar($n) ? (string)$n : '')); }
function str($v, int $max): string { return cut(trim(is_scalar($v) ? (string)$v : ''), $max); }
function digits($s): string { return preg_replace('/\D/', '', is_scalar($s) ? (string)$s : ''); }
function phone_clean($s): string { return preg_replace('/[^\d+]/', '', str($s, 30)); }
/* 0171…, +49171… und 0049171… gelten als dieselbe Nummer */
function phone_key($s): string { $d = digits($s);
  if (str_starts_with($d, '0049')) $d = substr($d, 4); elseif (str_starts_with($d, '49') && strlen($d) > 10) $d = substr($d, 2);
  return ltrim($d, '0'); }
function deep($x) { return json_decode(json_encode($x, SZ_JSON)); }
function new_id(string $prefix): string { $a = '0123456789abcdefghijklmnopqrstuvwxyz'; $o = $prefix; for ($i = 0; $i < 8; $i++) $o .= $a[random_int(0, 35)]; return $o; }
function has_id($x): bool { return is_object($x) && isset($x->id) && is_string($x->id) && $x->id !== ''; }
function today(): string { return gmdate('Y-m-d'); }
function people_of($cell): array { return is_object($cell) && isset($cell->people) && is_array($cell->people) ? $cell->people : []; }

/* ---------- Dateien im gesperrten Ordner ---------- */
function prepare_dir(): void {
  if (!is_dir(SZ_DIR) && !@mkdir(SZ_DIR, 0750, true)) throw new Halt(500, 'storage');
  if (!is_file(SZ_DIR . '/.htaccess')) @file_put_contents(SZ_DIR . '/.htaccess', "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
  if (!is_writable(SZ_DIR)) throw new Halt(500, 'storage'); }
function read_data(string $name) { $f = SZ_DIR . '/' . $name . '.php'; if (!is_file($f)) return null;
  $t = @file_get_contents($f); if ($t === false) return null; $i = strpos($t, "\n"); if ($i === false) return null;
  return json_decode(substr($t, $i + 1)); }
function write_data(string $name, $data): void { $f = SZ_DIR . '/' . $name . '.php'; $tmp = $f . '.' . bin2hex(random_bytes(4)) . '.tmp';
  if (@file_put_contents($tmp, SZ_GUARD . json_encode($data, SZ_JSON)) === false || !@rename($tmp, $f)) { @unlink($tmp); throw new Halt(500, 'storage'); } }
/* Sperre: immer nur eine Änderung zur selben Zeit. Gibt eine Funktion zum Freigeben zurück. */
function lock(): callable { $h = @fopen(SZ_DIR . '/sperre.lock', 'c'); if (!$h || !flock($h, LOCK_EX)) throw new Halt(503, 'busy');
  return function () use ($h) { flock($h, LOCK_UN); fclose($h); }; }
function seed() { $f = __DIR__ . '/start.php'; $t = @file_get_contents($f); if ($t === false) throw new Halt(500, 'storage');
  $db = json_decode(substr($t, strpos($t, "\n") + 1)); if (!is_object($db) || !isset($db->years)) throw new Halt(500, 'storage'); return $db; }
/* Stand lesen. Beim allerersten Aufruf wird der Startplan angelegt. $locked: die Sperre ist schon gesetzt. */
function load(bool $locked = false) { $db = read_data('db');
  if ($db === null) { $free = $locked ? null : lock(); try { $db = read_data('db'); if ($db === null) { $db = seed(); write_data('db', $db); } } finally { if ($free) $free(); } }
  if (!is_object($db) || !isset($db->years) || !is_object($db->years)) throw new Halt(500, 'storage');
  if ((int)($db->mig ?? 0) < SZ_MIG) { $free = $locked ? null : lock();
    try { if (!$locked) { $again = read_data('db'); if (is_object($again) && isset($again->years)) $db = $again; }
      if (migrate($db)) { $db->rev = (int)($db->rev ?? 0) + 1; write_data('db', $db); } } finally { if ($free) $free(); } }
  return $db; }
/* Bestehende Daten an eine neue Fassung anpassen, ohne Einträge anzufassen. Läuft je Stufe genau einmal. */
function migrate($db): bool { $v = (int)($db->mig ?? 0); if ($v >= SZ_MIG) return false;
  if ($v < 1) { // benannte SOS-Empfänger und das aktuelle Orga-Team in den laufenden Plan übernehmen (Einträge bleiben unberührt)
    $a = (string)($db->active ?? ''); $y = ($a !== '' && isset($db->years->{$a}) && is_object($db->years->{$a})) ? $db->years->{$a} : null;
    if ($y) { if (!isset($y->info) || !is_object($y->info)) $y->info = new stdClass;
      if (!isset($y->info->sosNames)) $y->info->sosNames = SZ_MIG1_SOS;
      if (isset($y->info->notes) && is_array($y->info->notes)) foreach ($y->info->notes as $i => $n) if (is_string($n) && str_starts_with($n, 'Orga-Team:')) $y->info->notes[$i] = SZ_MIG1_NOTE; } }
  $db->mig = SZ_MIG; return true; }
function secret(): string { $s = read_data('geheim'); if (is_string($s) && $s !== '') return $s;
  $free = lock(); try { $s = read_data('geheim'); if (!is_string($s) || $s === '') { $s = bin2hex(random_bytes(32)); write_data('geheim', $s); } } finally { $free(); }
  return $s; }
/* fn ändert den Stand. Vor der ersten Änderung des Tages wird eine Sicherungskopie abgelegt. */
function mutate(callable $fn): array { $free = lock();
  try { $db = load(true); $before = (($db->bak ?? '') !== today()) ? deep($db) : null;
    $o = $fn($db) ?? []; if (($o['write'] ?? true) === false) return [$db, $o];
    if ($before !== null) { try { write_data('sicherung-' . today(), $before);
        $old = glob(SZ_DIR . '/sicherung-*.php') ?: []; sort($old); foreach (array_slice($old, 0, max(0, count($old) - 30)) as $x) @unlink($x); } catch (Throwable $e) {}
      $db->bak = today(); }
    $db->rev = (int)($db->rev ?? 0) + 1; write_data('db', $db); return [$db, $o];
  } finally { $free(); } }

/* ---------- Anmelde-Ausweis: vom Server unterschrieben, nicht fälschbar ---------- */
function b64u(string $b): string { return rtrim(strtr(base64_encode($b), '+/', '-_'), '='); }
function unb64u(string $s): string { $r = base64_decode(strtr($s, '-_', '+/'), true); return $r === false ? '' : $r; }
function mac(string $secret, string $text): string { return b64u(hash_hmac('sha256', $text, $secret, true)); }
function sign(string $secret, array $payload): string { $body = b64u(json_encode($payload, SZ_JSON)); return $body . '.' . mac($secret, $body); }
function verify(string $secret, string $token): ?array { if ($token === '' || strlen($token) > 800) return null;
  $i = strpos($token, '.'); if ($i === false || $i < 1) return null; $body = substr($token, 0, $i);
  if (!hash_equals(mac($secret, $body), substr($token, $i + 1))) return null;
  $p = json_decode(unb64u($body), true); return is_array($p) && isset($p['h']) && is_string($p['h']) && preg_match(SZ_IDRE, $p['h']) ? $p : null; }
/* Wird das Orga-Passwort geändert, verlieren alte Orga-Ausweise ihre Orga-Rechte */
function pw_tag(string $secret, string $pw): string { return substr(mac($secret, 'orga:' . $pw), 0, 12); }
function token_in(): string { $t = $_SERVER['HTTP_X_SZ_TOKEN'] ?? ''; if ($t !== '') return trim($t);
  $a = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? ''); return str_starts_with($a, 'Bearer ') ? trim(substr($a, 7)) : ''; }

/* ---------- Hilfen rund um den Plan ---------- */
function year_of($db) { $a = (string)($db->active ?? ''); if ($a !== '' && isset($db->years->{$a}) && is_object($db->years->{$a})) return $db->years->{$a};
  $y = new stdClass; $y->stations = []; $y->shifts = []; $y->info = new stdClass; return $y; }
function plan_names($db): array { $o = [];
  foreach ((year_of($db)->shifts ?? []) as $sh) { if (!isset($sh->cells) || !is_object($sh->cells)) continue;
    foreach (get_object_vars($sh->cells) as $c) foreach (people_of($c) as $p) { $k = nkey($p); if ($k !== '' && !isset($o[$k])) $o[$k] = trim((string)$p); } }
  return $o; }
function own_names($db, string $id): array { $o = []; foreach ($db->helpers as $h) if (($h->id ?? '') === $id || ($h->by ?? '') === $id) $o[nkey($h->name ?? '')] = true; return $o; }
function find_helper($db, string $id) { foreach ($db->helpers as $h) if (($h->id ?? '') === $id) return $h; return null; }
function name_taken($db, string $name): bool { foreach ($db->helpers as $h) if (nkey($h->name ?? '') === nkey($name)) return true; return false; }
function display_name($db, string $first, string $last): string { $t = plan_names($db); foreach ($db->helpers as $h) $t[nkey($h->name ?? '')] = true;
  $ini = function_exists('mb_strtoupper') ? mb_strtoupper(cut($last, 1), 'UTF-8') : strtoupper(cut($last, 1));
  $short = $first . ' ' . $ini . '.'; $full = $first . ' ' . $last;
  if (!isset($t[nkey($short)])) return $short; if (!isset($t[nkey($full)])) return $full;
  $n = 2; while (isset($t[nkey($full . ' ' . $n)])) $n++; return $full . ' ' . $n; }
function who_is($db, string $secret, array $tok): array { $orga = ($tok['r'] ?? '') === 'o' && is_string($tok['k'] ?? null) && hash_equals(pw_tag($secret, (string)$db->codes->orga), $tok['k']);
  return ['role' => $orga ? 'orga' : 'helper', 'id' => $tok['h'], 'reg' => find_helper($db, $tok['h']) !== null]; }
/* Was jemand zu sehen bekommt. Handynummern und E-Mails anderer sieht nur die Orga. */
function view($db, array $me) {
  if ($me['role'] === 'orga') { $o = clone $db; unset($o->bak); return $o; }
  $o = new stdClass; $o->rev = (int)($db->rev ?? 0); $o->active = $db->active; $o->years = new stdClass; $o->years->{(string)$db->active} = year_of($db);
  $o->sos = $db->sos; $o->codes = new stdClass; $o->helpers = [];
  foreach ($db->helpers as $h) { if (($h->id ?? '') === $me['id'] || ($h->by ?? '') === $me['id']) { $o->helpers[] = $h; continue; }
    $p = new stdClass; $p->id = $h->id; $p->name = $h->name; $p->sos = !empty($h->sos); if (isset($h->role)) $p->role = $h->role; if (!empty($h->by)) $p->by = '*'; $o->helpers[] = $p; }
  return $o; }

/* ---------- Änderungen als kleine Schritte (wie patch.mjs) ---------- */
function valid_op($op): bool {
  if (!is_object($op) || !isset($op->t, $op->p) || !in_array($op->t, ['set', 'del', 'ins', 'add', 'rem'], true)) return false;
  if (!is_array($op->p) || count($op->p) > 10 || (in_array($op->t, ['set', 'del'], true) && !count($op->p))) return false;
  foreach ($op->p as $s) if (!is_string($s) || $s === '' || strlen($s) > 240 || in_array($s, ['__proto__', 'constructor', 'prototype'], true)) return false;
  if ($op->t === 'add' || $op->t === 'rem') { if (!isset($op->v) || !is_array($op->v)) return false; foreach ($op->v as $x) if (!is_string($x) || strlen($x) > 400) return false; }
  if ($op->t === 'ins' && !has_id($op->v ?? null)) return false;
  if ($op->t === 'set' && !property_exists($op, 'v')) return false;
  return true; }
/* Verweis auf den Wert an einem Pfad. $ok sagt, ob es ihn gibt. */
function &ref_at(&$root, array $path, ?bool &$ok) { $ok = true; $none = null; $n = &$root;
  foreach ($path as $seg) {
    if (is_array($n)) { if ($seg[0] !== '#') { $ok = false; return $none; } $id = substr($seg, 1); $at = -1;
      foreach ($n as $i => $x) if (has_id($x) && $x->id === $id) { $at = $i; break; }
      if ($at < 0) { $ok = false; return $none; } $n = &$n[$at]; }
    elseif (is_object($n)) { if (!property_exists($n, $seg)) { $ok = false; return $none; } $n = &$n->{$seg}; }
    else { $ok = false; return $none; } }
  return $n; }
/* Zwei gleichzeitige Einträge in ein noch leeres Feld dürfen sich nicht überschreiben */
function merge_cell($old, $neu) { $people = people_of($old); foreach (people_of($neu) as $n) if (!in_array($n, $people, true)) $people[] = $n; $o = deep($neu); $o->people = $people;
  $by = []; foreach ([$old, $neu] as $x) if (isset($x->by) && is_object($x->by)) foreach (get_object_vars($x->by) as $k => $v) $by[$k] = $v;
  if ($by) { $o->by = new stdClass; foreach ($by as $k => $v) $o->by->{$k} = $v; } else unset($o->by);
  return $o; }
function apply_op($root, $op): bool { $p = $op->p; $ok = true;
  if (in_array($op->t, ['ins', 'add', 'rem'], true)) {
    $list = &ref_at($root, $p, $ok);
    if (!$ok) { if (!count($p)) return false; $par = &ref_at($root, array_slice($p, 0, -1), $ok); if (!$ok || !is_object($par)) return false; $par->{end($p)} = []; $list = &$par->{end($p)}; }
    if (!is_array($list)) return false;
    if ($op->t === 'ins') { foreach ($list as $x) if (has_id($x) && $x->id === $op->v->id) return false; $list[] = deep($op->v); return true; }
    if ($op->t === 'add') { foreach ($op->v as $n) if (!in_array($n, $list, true)) $list[] = $n; return true; }
    foreach ($op->v as $n) { $i = array_search($n, $list, true); if ($i !== false) array_splice($list, (int)$i, 1); } return true; }
  $par = &ref_at($root, array_slice($p, 0, -1), $ok); $last = (string)end($p);
  if (!$ok) return false;
  if (is_array($par)) { if ($last[0] !== '#') return false; $at = -1; foreach ($par as $i => $x) if (has_id($x) && $x->id === substr($last, 1)) { $at = $i; break; }
    if ($at < 0) return false; if ($op->t === 'del') array_splice($par, $at, 1); else $par[$at] = deep($op->v); return true; }
  if (!is_object($par)) return false;
  if ($op->t === 'del') { unset($par->{$last}); return true; }
  $in_cells = count($p) >= 2 && $p[count($p) - 2] === 'cells';
  $par->{$last} = ($in_cells && isset($par->{$last}) && is_object($par->{$last}) && is_object($op->v)) ? merge_cell($par->{$last}, $op->v) : deep($op->v);
  return true; }

/* ---------- Was Helfer ändern dürfen ---------- */
function helper_op($db, array $me, $op): string { $p = $op->p; $y = year_of($db); $self = find_helper($db, $me['id']);
  // Felder im Plan: sich selbst und alle aus der Helferliste eintragen. Austragen nur sich selbst, eigene Begleitung und wen man selbst eingetragen hat.
  if (($p[0] ?? '') === 'years' && ($p[1] ?? '') === (string)$db->active && ($p[2] ?? '') === 'shifts' && isset($p[3]) && $p[3][0] === '#' && ($p[4] ?? '') === 'cells' && count($p) >= 6) {
    $sh = null; foreach (($y->shifts ?? []) as $x) if (($x->id ?? '') === substr($p[3], 1)) { $sh = $x; break; }
    $st = null; foreach (($y->stations ?? []) as $x) if (($x->id ?? '') === $p[5]) { $st = $x; break; }
    if (!$sh || !$st) return 'gone';
    $cell = (isset($sh->cells) && is_object($sh->cells) && isset($sh->cells->{$p[5]})) ? $sh->cells->{$p[5]} : null; $people = people_of($cell); $add = []; $rem = [];
    if (count($p) === 7 && $p[6] === 'people' && $op->t === 'add') { foreach ($op->v as $n) if (!in_array($n, $people, true)) $add[] = $n; }
    elseif (count($p) === 7 && $p[6] === 'people' && $op->t === 'rem') $rem = $op->v;
    elseif (count($p) === 6 && $op->t === 'set' && is_object($op->v) && isset($op->v->people) && is_array($op->v->people)) { foreach ($op->v->people as $n) if (is_string($n) && !in_array($n, $people, true)) $add[] = $n; }
    elseif (count($p) >= 7 && $p[6] === 'by') return ''; // wer wen eingetragen hat, führt der Server selbst
    else return 'forbidden';
    $own = own_names($db, $me['id']); $by = (is_object($cell) && isset($cell->by) && is_object($cell->by)) ? get_object_vars($cell->by) : [];
    $known = plan_names($db); foreach ($db->helpers as $h) $known[nkey($h->name ?? '')] = true;
    foreach ($add as $n) if (!is_string($n) || $n === '' || strlen($n) > 240 || !(isset($own[nkey($n)]) || isset($known[nkey($n)]))) return 'forbidden';
    foreach ($rem as $n) if (!is_string($n) || !(isset($own[nkey($n)]) || (($by[$n] ?? null) === $me['id']))) return 'forbidden';
    if ($add) { if (is_object($cell) && !empty($cell->off)) return 'off';
      $min = max(1, (int)($st->min ?? 0) ?: 2); $max = max($min, (int)($st->max ?? 0) ?: $min);
      if (count($people) + count($add) > $max) return 'full'; }
    if (!$add && !$rem) return '';
    if (!isset($sh->cells) || !is_object($sh->cells)) $sh->cells = new stdClass;
    if (!isset($sh->cells->{$p[5]}) || !is_object($sh->cells->{$p[5]})) { $c = new stdClass; $c->people = []; $c->note = ''; $c->off = false; $c->tentative = false; $sh->cells->{$p[5]} = $c; }
    $c = $sh->cells->{$p[5]}; if (!isset($c->people) || !is_array($c->people)) $c->people = [];
    if (!isset($c->by) || !is_object($c->by)) $c->by = new stdClass;
    foreach ($add as $n) { $c->people[] = $n; if (!isset($own[nkey($n)])) $c->by->{$n} = $me['id']; }
    foreach ($rem as $n) { $i = array_search($n, $c->people, true); if ($i !== false) array_splice($c->people, (int)$i, 1); unset($c->by->{$n}); }
    if (!get_object_vars($c->by)) unset($c->by);
    return ''; }
  if (($p[0] ?? '') === 'helpers') {
    // weitere Person anlegen, für die man sich mit einträgt
    if ($op->t === 'ins' && count($p) === 1) { $v = $op->v; $first = str($v->first ?? '', 60); $last = str($v->last ?? '', 60); $name = str($v->name ?? '', 80);
      if ($first === '' || $last === '' || $name === '') return 'bad';
      $mine = 0; foreach ($db->helpers as $h) if (($h->by ?? '') === $me['id']) $mine++; if ($mine >= 30) return 'limit';
      if (name_taken($db, $name)) return 'name';
      $n = new stdClass; $n->id = (preg_match(SZ_IDRE, (string)$v->id) && !find_helper($db, (string)$v->id)) ? $v->id : new_id('h');
      $n->first = $first; $n->last = $last; $n->phone = phone_clean($v->phone ?? ''); $n->email = ''; $n->again = false; $n->name = $name; $n->sos = false; $n->by = $me['id']; $n->at = (int)round(microtime(true) * 1000);
      $db->helpers[] = $n; return ''; }
    $h = (isset($p[1]) && $p[1][0] === '#') ? find_helper($db, substr($p[1], 1)) : null;
    if (!$h) return 'gone';
    if (!(($h->id ?? '') === $me['id'] || ($h->by ?? '') === $me['id'])) return 'forbidden';
    if (count($p) === 3 && $op->t === 'set') { $f = $p[2]; $v = $op->v;
      if ($f === 'again') $h->again = (bool)$v;
      elseif ($f === 'phone' && is_string($v)) $h->phone = phone_clean($v);
      elseif (($f === 'first' || $f === 'last') && is_string($v) && str($v, 60) !== '') $h->{$f} = str($v, 60);
      elseif ($f === 'email' && is_string($v) && ($v === '' || preg_match(SZ_MAILRE, $v))) $h->email = str($v, 120);
      else return 'forbidden';
      return ''; }
    if (count($p) === 2 && $op->t === 'del' && ($h->by ?? '') === $me['id']) { $db->helpers = array_values(array_filter($db->helpers, fn($x) => $x !== $h)); return ''; }
    return 'forbidden'; }
  if (($p[0] ?? '') === 'sos' && $self) {
    if ($op->t === 'ins' && count($p) === 1) { $v = $op->v; if (str($v->need ?? '', 60) === '') return 'bad'; if (count($db->sos) >= 500) return 'limit';
      $st = null; foreach (($y->stations ?? []) as $x) if (($x->id ?? '') === ($v->st ?? null)) { $st = $x; break; }
      $dup = false; foreach ($db->sos as $x) if (($x->id ?? '') === $v->id) $dup = true;
      $n = new stdClass; $n->id = (preg_match(SZ_IDRE, (string)$v->id) && !$dup) ? $v->id : new_id('s'); $n->st = str($v->st ?? '', 80); $n->stName = $st ? $st->name : str($v->stName ?? '', 80);
      $n->need = str($v->need, 60); $n->note = str($v->note ?? '', 200); $n->by = $self->name; $n->at = (int)round(microtime(true) * 1000); $n->status = 'open'; $n->taker = '';
      $db->sos[] = $n; return ''; }
    $x = null; if (isset($p[1]) && $p[1][0] === '#') foreach ($db->sos as $s) if (($s->id ?? '') === substr($p[1], 1)) { $x = $s; break; }
    if (!$x) return 'gone';
    if (count($p) === 3 && $op->t === 'set' && $p[2] === 'status' && ($op->v === 'go' || $op->v === 'done')) { $x->status = $op->v; $x->taker = $self->name; return ''; }
    if (count($p) === 3 && $op->t === 'set' && $p[2] === 'taker') return '';
    return 'forbidden'; }
  return 'forbidden'; }
/* Die Orga darf alles am Plan ändern. Zugänge und das angezeigte Jahr werden geprüft. */
function orga_op($db, $op): string { $p = $op->p;
  if (!in_array($p[0] ?? '', ['years', 'helpers', 'sos', 'codes', 'active'], true)) return 'forbidden';
  if ($p[0] === 'codes') { if (!(count($p) === 2 && $op->t === 'set' && ($p[1] === 'helper' || $p[1] === 'orga') && is_string($op->v))) return 'forbidden';
    $v = trim($op->v); $other = (string)$db->codes->{$p[1] === 'helper' ? 'orga' : 'helper'}; $len = function_exists('mb_strlen') ? mb_strlen($v, 'UTF-8') : strlen($v);
    if ($len < 4 || $len > 60 || nkey($v) === nkey($other)) return 'bad';
    $db->codes->{$p[1]} = $v; return $p[1] === 'orga' ? 'pw' : ''; }
  if ($p[0] === 'active') { if (!(count($p) === 1 && $op->t === 'set' && is_string($op->v) && isset($db->years->{$op->v}) && is_object($db->years->{$op->v}))) return 'bad'; $db->active = $op->v; return ''; }
  if ($p[0] === 'years' && count($p) === 2 && $op->t === 'del') return 'forbidden';
  if (!apply_op($db, $op)) return 'gone';
  /* Wird jemand ausgetragen, verschwindet auch der Vermerk, wer ihn eingetragen hat */
  if ($p[0] === 'years' && ($p[2] ?? '') === 'shifts' && ($p[4] ?? '') === 'cells' && count($p) >= 6) { $ok = true; $c = &ref_at($db, array_slice($p, 0, 6), $ok);
    if ($ok && is_object($c) && isset($c->by) && is_object($c->by)) { $ppl = people_of($c); foreach (array_keys(get_object_vars($c->by)) as $n) if (!in_array((string)$n, $ppl, true)) unset($c->by->{$n}); if (!get_object_vars($c->by)) unset($c->by); } }
  return ''; }

/* ---------- Die Anfragen ---------- */
try {
  $route = $_SERVER['REQUEST_METHOD'] . ' ' . preg_replace('/[^a-z]/', '', (string)($_GET['r'] ?? ''));
  if ($route === 'GET status') { $ok = true; try { prepare_dir(); } catch (Throwable $e) { $ok = false; }
    out(200, ['ok' => $ok, 'php' => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION, 'speicher' => $ok ? 'bereit' : 'Ordner daten/ ist nicht beschreibbar', 'start' => is_file(__DIR__ . '/start.php')]); }
  if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) out(405, ['error' => 'method']);
  prepare_dir();
  $b = new stdClass;
  if ($_SERVER['REQUEST_METHOD'] === 'POST') { $raw = (string)file_get_contents('php://input'); if (strlen($raw) > 400000) out(413, ['error' => 'big']);
    if ($raw !== '') { $b = json_decode($raw); if (!is_object($b)) out(400, ['error' => 'bad']); } }
  $secret = secret(); $wait = getenv('SZ_TEST') ? 0 : 600000;

  if ($route === 'POST login') { $db = load();
    if (isset($b->code) && is_string($b->code)) {
      if (trim($b->code) === '' || nkey($b->code) !== nkey($db->codes->helper)) { usleep($wait); out(401, ['error' => 'code']); }
      $tok = ['r' => 'h', 'h' => new_id('h'), 't' => time()]; $me = ['role' => 'helper', 'id' => $tok['h'], 'reg' => false];
      out(200, ['token' => sign($secret, $tok), 'me' => $me, 'db' => view($db, $me), 'rev' => (int)($db->rev ?? 0)]); }
    if (isset($b->pw) && is_string($b->pw)) {
      if ($b->pw === '' || !hash_equals((string)$db->codes->orga, $b->pw)) { usleep($wait); out(401, ['error' => 'pw']); }
      $prev = verify($secret, token_in()); $hid = $prev ? $prev['h'] : new_id('h'); $h = find_helper($db, $hid);
      if ($h && ($h->role ?? '') !== 'orga') [$db] = mutate(function ($d) use ($hid) { $x = find_helper($d, $hid); if (!$x || ($x->role ?? '') === 'orga') return ['write' => false]; $x->role = 'orga'; return []; });
      $tok = ['r' => 'o', 'h' => $hid, 'k' => pw_tag($secret, (string)$db->codes->orga), 't' => time()]; $me = who_is($db, $secret, $tok);
      out(200, ['token' => sign($secret, $tok), 'me' => $me, 'db' => view($db, $me), 'rev' => (int)($db->rev ?? 0)]); }
    out(400, ['error' => 'bad']); }

  $tok = verify($secret, token_in());
  if (!$tok) out(401, ['error' => 'auth']);

  if ($route === 'GET db') { $db = load(); $me = who_is($db, $secret, $tok);
    if ((string)(int)($db->rev ?? 0) === (string)($_GET['rev'] ?? '') && ($_GET['role'] ?? '') === $me['role']) out(200, ['same' => true, 'me' => $me]);
    out(200, ['db' => view($db, $me), 'rev' => (int)($db->rev ?? 0), 'me' => $me]); }

  if ($route === 'POST register') {
    $first = str($b->first ?? '', 60); $last = str($b->last ?? '', 60); $phone = phone_clean($b->phone ?? ''); $email = str($b->email ?? '', 120); $again = !empty($b->again); $claim = str($b->claim ?? '', 80); $check = !empty($b->check);
    if ($first === '' || $last === '') out(400, ['error' => 'name']);
    if (strlen(digits($phone)) < 6) out(400, ['error' => 'phone']);
    if (!preg_match(SZ_MAILRE, $email)) out(400, ['error' => 'email']);
    [$db, $o] = mutate(function ($db) use ($secret, $tok, $first, $last, $phone, $email, $again, $claim, $check) {
      $role = who_is($db, $secret, $tok)['role']; $old = null;
      foreach ($db->helpers as $h) if (empty($h->by) && !empty($h->phone) && phone_key($h->phone) === phone_key($phone)) { $old = $h; break; }
      if ($old) { if (nkey($old->first ?? '') !== nkey($first)) return ['write' => false, 'err' => [409, 'phone']];
        $old->email = $email; $old->again = $again || !empty($old->again); if (empty($old->last)) $old->last = $last; if ($role === 'orga') $old->role = 'orga';
        return ['id' => $old->id, 'back' => true]; }
      $mine = find_helper($db, $tok['h']);
      if ($mine) { $mine->first = $first; $mine->last = $last; $mine->phone = $phone; $mine->email = $email; $mine->again = $again; if ($role === 'orga') $mine->role = 'orga'; return ['id' => $mine->id]; }
      if ($check) return ['write' => false, 'need' => true];
      $name = '';
      if ($claim !== '') { $plan = plan_names($db); $comp = null; foreach ($db->helpers as $h) if (!empty($h->by) && nkey($h->name ?? '') === nkey($claim)) { $comp = $h; break; }
        if ($comp) { $name = $comp->name; $db->helpers = array_values(array_filter($db->helpers, fn($x) => $x !== $comp)); }
        elseif (isset($plan[nkey($claim)]) && !name_taken($db, $claim)) $name = $plan[nkey($claim)]; }
      if ($name === '') $name = display_name($db, $first, $last);
      $h = new stdClass; $h->id = $tok['h']; $h->first = $first; $h->last = $last; $h->phone = $phone; $h->email = $email; $h->again = $again; $h->name = $name; $h->sos = false; $h->at = (int)round(microtime(true) * 1000);
      if ($role === 'orga') $h->role = 'orga';
      $db->helpers[] = $h; return ['id' => $h->id]; });
    if (isset($o['err'])) out($o['err'][0], ['error' => $o['err'][1]]);
    if (!empty($o['need'])) out(200, ['need' => 'claim']);
    $nt = ['r' => $tok['r'] ?? 'h', 'h' => $o['id'], 't' => time()]; if (isset($tok['k'])) $nt['k'] = $tok['k'];
    $me = who_is($db, $secret, $nt);
    out(200, ['token' => sign($secret, $nt), 'me' => $me, 'db' => view($db, $me), 'rev' => (int)($db->rev ?? 0), 'back' => !empty($o['back'])]); }

  if ($route === 'POST patch') {
    if (!isset($b->ops) || !is_array($b->ops) || count($b->ops) > 600) out(400, ['error' => 'bad']);
    /* Personen zuerst anlegen, dann eintragen: die Reihenfolge der Schritte aus der App ist nicht festgelegt */
    $is_h = fn($x) => is_object($x) && isset($x->p) && is_array($x->p) && ($x->p[0] ?? '') === 'helpers';
    $ops = array_merge(array_values(array_filter($b->ops, $is_h)), array_values(array_filter($b->ops, fn($x) => !$is_h($x))));
    [$db, $o] = mutate(function ($db) use ($secret, $tok, $ops) { $me = who_is($db, $secret, $tok); $rej = []; $n = 0; $pw = false;
      if ($me['role'] !== 'orga' && !$me['reg']) return ['write' => false, 'err' => [403, 'reg']];
      foreach ($ops as $op) { if (!valid_op($op)) { $rej[] = 'bad'; continue; }
        $why = $me['role'] === 'orga' ? orga_op($db, $op) : helper_op($db, $me, $op);
        if ($why === 'pw') { $pw = true; $n++; } elseif ($why !== '') $rej[] = $why; else $n++; }
      return $n ? ['rejected' => $rej, 'pw' => $pw] : ['write' => false, 'rejected' => $rej]; });
    if (isset($o['err'])) out($o['err'][0], ['error' => $o['err'][1]]);
    $nt = $tok; $res = [];
    if (!empty($o['pw'])) { $nt = ['r' => 'o', 'h' => $tok['h'], 'k' => pw_tag($secret, (string)$db->codes->orga), 't' => time()]; $res['token'] = sign($secret, $nt); }
    $me = who_is($db, $secret, $nt);
    out(200, ['db' => view($db, $me), 'rev' => (int)($db->rev ?? 0), 'me' => $me, 'rejected' => $o['rejected'] ?? []] + $res); }

  out(404, ['error' => 'route']);
} catch (Halt $e) { out($e->status, ['error' => $e->err]);
} catch (Throwable $e) { error_log('Sternenzauber: ' . $e->getMessage() . ' in ' . basename($e->getFile()) . ':' . $e->getLine()); out(500, ['error' => 'server']); }
