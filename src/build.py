"""Baut die App aus den Quellen in src/ zusammen.
   Ergebnis: public/index.html (die App für Netlify) und netlify/functions/lib/seed.mjs (Startdaten für den Server).
   Aufruf: python3 src/build.py"""
import os, re, json, base64

VERSION = '14.10.2026 p'
# Startwerte beim allerersten Aufruf. Danach gelten die Zugänge, die die Orga in der App unter «Einrichten» festlegt.
START_CODES = {'helper': 'STERN2026', 'orga': 'Zimtstern-Bratapfel-58'}
ORGA_NOTE = 'Orga-Team: Nina B., Julian R., Astrid und Susan.'
# Diese Personen sehen und übernehmen SOS-Meldungen, zusätzlich zur Orga und zu den Springer-Teams. Später in der App unter «Einrichten» änderbar.
SOS_NAMES = ['Nina Blasberg', 'Julian Richter', 'Magnus', 'Melli Schitteck', 'Frank Blasberg', 'Betsy Arens', 'Saskia Melis']

here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
rd = lambda *p: open(os.path.join(root, *p), encoding='utf-8').read()
def wr(text, *p):
    f = os.path.join(root, *p); os.makedirs(os.path.dirname(f), exist_ok=True); open(f, 'w', encoding='utf-8').write(text)

css = rd('src', 'styles.css'); stars = rd('src', 'stars.js'); app = rd('src', 'app.js')
snap = json.loads(rd('src', 'seed.json'))

def start_db(codes):
    year = json.loads(json.dumps(snap)); year['info']['title'] = 'Sternenzauber 2026'
    if ORGA_NOTE not in year['info']['notes']: year['info']['notes'].append(ORGA_NOTE)
    year['info']['sosNames'] = list(SOS_NAMES)
    year['info']['noContact'] = ['Dani', 'Steffi']
    return {'mig': 3, 'rev': 0, 'active': '2026', 'years': {'2026': year}, 'helpers': [], 'sos': [], 'codes': codes}

def module(code, name, exports, pre=''):
    code = re.sub(r'^import .*$', '', code, flags=re.M); code = re.sub(r'^export ', '', code, flags=re.M)
    return 'const %s = (() => {\n%s%s\nreturn { %s };\n})();' % (name, pre, code, ', '.join(exports))
PATCH = module(rd('netlify', 'functions', 'lib', 'patch.mjs'), 'PATCH', ['diff', 'applyOps', 'applyOp', 'validOp', 'at', 'clone'])
CORE = module(rd('netlify', 'functions', 'lib', 'core.mjs'), 'CORE', ['handle'], 'const { applyOp, validOp, at } = PATCH;\n')

def script(remote, standalone, logo, api='netlify'):
    js = app.replace('__STARS__', stars).replace('__VERSION__', VERSION)
    js = js.replace('__API__', api).replace('__REMOTE__', 'true' if remote else 'false').replace('__STANDALONE__', 'true' if standalone else 'false').replace('__LOGO__', logo)
    js = js.replace('__SNAP__', 'null' if remote else json.dumps(start_db({'helper': 'STERN2026', 'orga': 'ORGA2026'}), ensure_ascii=False))
    js = js.replace('__SHARED__', PATCH if remote else PATCH + '\n' + CORE)
    assert '__' not in re.sub(r'__proto__', '', js), re.findall(r'__[A-Z]+__', js)
    return js

BODY = '''<div class="shell">
  <header class="top">
    <div class="brand">
      <img class="logo" src="LOGO_SRC" alt="" width="64" height="64">
      <div>
        <h1 id="title">Sternenzauber 2026</h1>
        <p class="sub" id="sub">Standbesetzung · Helferplan</p>
      </div>
    </div>
    <div class="cover" id="cover" hidden></div>
  </header>
  <div class="userbar" id="userbar" hidden></div>
  <nav class="tabs" id="tabs" role="tablist" aria-label="Ansichten" hidden></nav>
  <main id="view"></main>
</div>
<dialog id="dlg" aria-labelledby="dlg-title"></dialog>
<div id="toast" role="status" hidden></div>
<div id="walk" aria-hidden="true"></div>
<canvas id="sky" hidden aria-hidden="true"></canvas>
'''
GFONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Figtree:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap">'
RANGE = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
FONTS = '''@font-face { font-family: "Figtree"; font-style: normal; font-display: swap; font-weight: 300 900; src: url(fonts/figtree-latin-wght-normal.woff2) format("woff2"); unicode-range: %s }
@font-face { font-family: "Bricolage Grotesque"; font-style: normal; font-display: swap; font-weight: 200 800; src: url(fonts/bricolage-grotesque-latin-opsz-normal.woff2) format("woff2"); unicode-range: %s }
@font-face { font-family: "IBM Plex Mono"; font-style: normal; font-display: swap; font-weight: 500; src: url(fonts/ibm-plex-mono-latin-500-normal.woff2) format("woff2"); unicode-range: %s }
''' % (RANGE, RANGE, RANGE)
BASE = ':root { padding: env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px); -webkit-text-size-adjust: 100% }\nhtml, body { margin: 0 }\nimg { max-width: 100% }\n[hidden] { display: none !important }\n'

def page(js, logo_src, fonts_css, head_extra=''):
    return '''<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Sternenzauber Helferplan</title>
<meta name="description" content="Helferplan für die Standbesetzung beim Sternenzauber.">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#2B2F4A">
<meta name="color-scheme" content="light">
<link rel="manifest" href="site.webmanifest">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Sternenzauber">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="icon" href="favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="apple-touch-icon.png" sizes="180x180">
''' + head_extra + '''<style>
''' + fonts_css + BASE + css + '''</style>
</head>
<body>
''' + BODY.replace('LOGO_SRC', logo_src) + '''
<script>
''' + js + '''</script>
</body>
</html>
'''

# 1) Die App für Netlify: Daten liegen auf dem Server, Schriften im Projekt
live = page(script(True, True, 'logo-rund.png'), 'logo-white.png', FONTS)
assert 'const REMOTE = true;' in live and 'STERN2026' not in live and 'Assi' not in live and 'Blasberg' not in live, 'Im öffentlichen Teil dürfen keine Codes und Namen stehen'
wr(live, 'public', 'index.html'); print('public/index.html', len(live) // 1024, 'KB')

# 2) Startdaten für den Server
wr('/* Automatisch erzeugt von src/build.py. Startstand beim allerersten Aufruf der App. */\nexport const seed = () => (' + json.dumps(start_db(START_CODES), ensure_ascii=False) + ');\n', 'netlify', 'functions', 'lib', 'seed.mjs')
print('seed.mjs geschrieben')

# 2b) Dieselbe App für normales Webhosting mit PHP (z. B. Hostinger): Ordner hostinger/ komplett hochladen
import shutil
H = os.path.join(root, 'hostinger')
if os.path.isdir(H): shutil.rmtree(H)
shutil.copytree(os.path.join(root, 'public'), H)
php = page(script(True, True, 'logo-rund.png', 'php'), 'logo-white.png', FONTS)
assert "const API = 'php';" in php and 'STERN2026' not in php and 'Assi' not in php and 'Blasberg' not in php
wr(php, 'hostinger', 'index.html')
shutil.copy(os.path.join(root, 'server-php', 'api.php'), os.path.join(H, 'api.php'))
GUARD = '<?php http_response_code(404); exit; ?>\n'
wr(GUARD + json.dumps(start_db(START_CODES), ensure_ascii=False), 'hostinger', 'start.php')
# Kontaktliste der Orga (nur lokal in private/, nie im Git): wird zu hostinger/kontakte.php, gesperrt wie start.php
KMAP = {'Manuela O.': 'Manuela', 'Phillipp L.': 'Philip'}   # Name in der Liste -> Name im Plan
kcsv = os.path.join(root, 'private', 'kontakte.csv'); kout = os.path.join(root, 'hostinger', 'kontakte.php')
if os.path.exists(kcsv):
    import csv
    rows, seen = [], set()
    for r in list(csv.reader(open(kcsv, encoding='utf-8')))[3:]:
        r = [x.strip() for x in r] + [''] * 6
        if not r[0] or r[0].startswith('Neue') or not r[1]: continue
        name = KMAP.get(r[0], r[0]); phone = re.sub(r'[^\d+]', '', r[3]); email = r[4] if '@' in r[4] else ''
        if len(re.sub(r'\D', '', phone)) < 6: phone = ''
        if phone and phone in seen: continue
        seen.add(phone)
        if name == 'Philip': r[1] = 'Philip'
        rows.append({'name': name, 'first': re.sub(r'\s+', ' ', r[1]), 'last': re.sub(r'\s+', ' ', r[2]), 'phone': phone, 'email': email, 'again': r[5].lower().startswith('ja')})
    wr(GUARD + json.dumps(rows, ensure_ascii=False), 'hostinger', 'kontakte.php')
    print('kontakte.php:', len(rows), 'Personen')
wr('<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n', 'hostinger', 'daten', '.htaccess')
print('hostinger/ geschrieben')

# 3) Testseite ohne Server (gleiche Regeln im Browser)
wr(page(script(False, True, 'logo-rund.png'), 'logo-white.png', FONTS), 'test', 'tmp', 'lokal', 'index.html')

# 4) Vorschau für Claude (nur wenn der Vorschau-Ordner vorhanden ist)
PV = '/home/claude/standplan'
if os.path.isdir(os.path.join(PV, 'vorschau')):
    b64 = lambda f: 'data:image/png;base64,' + base64.b64encode(open(f, 'rb').read()).decode()
    js = script(False, False, b64(PV + '/vorschlag/logo-rund-520.png'))
    art = '<title>Sternenzauber Helferplan</title>\n' + GFONTS + '\n<style>' + css + '</style>\n\n' + BODY.replace('LOGO_SRC', b64(PV + '/vorschlag/logo-white-300.png')) + '\n<script>\n' + js + '</script>\n'
    open(PV + '/vorschau/sternenzauber-helferplan.html', 'w', encoding='utf-8').write(art); print('Vorschau', len(art) // 1024, 'KB')
