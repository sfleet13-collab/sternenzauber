# Sternenzauber Helferplan

Helferplan für die Standbesetzung beim Sternenzauber Witzhelden. Helfer tragen sich mit einem gemeinsamen Code selbst in Schichten ein, die Orga verwaltet Stände, Schichten, Hinweise und Zugänge. Alle sehen denselben Stand.


## So ist das Projekt aufgebaut

| Ordner | Inhalt |
|---|---|
| `public/` | Die fertige App. Das liefert Netlify aus. `index.html` wird erzeugt, nicht von Hand ändern. |
| `netlify/functions/api.mjs` | Die Server-Funktion. Sie beantwortet alles unter `/api/…` und speichert in Netlify Blobs. |
| `netlify/functions/lib/core.mjs` | Die Regeln: Anmeldung, wer was sehen und ändern darf, Speichern ohne Überschreiben. |
| `netlify/functions/lib/patch.mjs` | Beschreibt Änderungen als kleine Schritte. Läuft in der App und auf dem Server. |
| `netlify/functions/lib/seed.mjs` | Startplan für den allerersten Aufruf. Wird erzeugt. |
| `src/` | Quellen der App: `app.js`, `styles.css`, `stars.js`, `seed.json` und das Bauskript `build.py`. |
| `test/` | Prüfungen und ein lokaler Testserver. |

## Wo die Daten liegen

- Plan, Helferliste, SOS-Meldungen und Zugänge liegen in **Netlify Blobs** (Speicher `helferplan`, Eintrag `db`). Es gibt keine weitere Datenbank.
- Einmal am Tag legt der Server vor der ersten Änderung eine Sicherungskopie an (`sicherung/JJJJ-MM-TT`).
- Die Seite selbst enthält keine Namen, Nummern oder Codes. Die bekommt nur, wer sich angemeldet hat.
- Handynummern und E-Mail-Adressen sieht nur die Orga. Das prüft der Server, nicht die App.

## Zugänge

- **Helfer-Code** und **Orga-Passwort** ändert die Orga in der App unter «Einrichten».
- Die Startwerte für den allerersten Aufruf stehen in `src/build.py` (`START_CODES`). Danach gelten nur noch die Werte aus der App.
- Wird das Orga-Passwort geändert, verlieren alle anderen Orga-Anmeldungen ihre Orga-Rechte und melden sich neu an.

## Etwas ändern

1. Quellen in `src/` oder `netlify/functions/lib/` ändern.
2. `python3 src/build.py` ausführen. Das erzeugt `public/index.html` und `seed.mjs` neu.
3. Prüfen: `npm test`
4. Committen und nach GitHub pushen. Netlify veröffentlicht die neue Fassung von selbst, der Link bleibt gleich.

Hinweis zu den Kosten: Bei Netlify-Tarifen mit Credits kostet jede Veröffentlichung Credits. Änderungen deshalb sammeln und nicht einzeln pushen.

## Lokal ausprobieren

```
npm install
npm run lokal        # http://localhost:8788, Daten in einem Wegwerf-Ordner
npm test             # Regeln und Speicher prüfen
node test/e2e.test.cjs   # zwei Handys gleichzeitig (braucht Playwright und den lokalen Server)
```

## Netlify

- Veröffentlichungs-Ordner: `public` (steht in `netlify.toml`), kein Build nötig.
- Funktionen und Blobs brauchen eine Veröffentlichung über GitHub. Per Zip-Upload (Drag and Drop) laufen sie nicht.
