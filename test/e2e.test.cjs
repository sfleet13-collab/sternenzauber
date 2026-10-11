/* Zwei Handys gleichzeitig gegen den lokalen Testserver (node test/dev-server.mjs 8788):
   node test/e2e.test.cjs */
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const URL0 = process.env.SZ_URL || 'http://localhost:8788/', OUT = process.env.SZ_OUT || path.join(__dirname, 'tmp');
const PW = process.env.SZ_PW || 'Zimtstern-Bratapfel-58', CODE = process.env.SZ_CODE || 'STERN2026';
let fails = 0, n = 0; const ok = (c, l) => { n++; console.log((c ? 'ok      ' : 'FEHLER  ') + l); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch()), errs = [];
  const phone = async () => { const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|401/.test(m.text())) errs.push('console: ' + m.text()); }); await p.goto(URL0); await p.waitForTimeout(300); return p; };
  const reg = async (p, first, last, tel, mail) => { await p.fill('#g-first', first); await p.fill('#g-last', last); await p.fill('#g-phone', tel); await p.fill('#g-mail', mail); await p.check('#g-ok'); await p.click('#f-reg [type=submit]'); await p.waitForSelector('#userbar:not([hidden])', { timeout: 8000 }); };
  const bar = p => p.evaluate(() => document.querySelector('#userbar').innerText.split('\n')[0]);
  const refresh = async p => { await p.click('[data-h=refresh]'); await p.waitForTimeout(700); };
  const cellText = (p, s, t) => p.evaluate(([s, t]) => { const e = document.querySelector('[data-s="' + s + '"][data-t="' + t + '"]'); return e ? e.innerText : null; }, [s, t]);

  const A = await phone(), B = await phone();
  ok(!(await A.content()).includes('Assi') && !(await A.content()).includes(CODE), 'Startseite enthält weder Namen noch Codes');
  // A: Orga
  await A.click('[data-act=gate][data-v=orga]'); await A.fill('#g-pw', 'falsch'); await A.click('#f-orga [type=submit]'); await A.waitForSelector('#g-err:not([hidden])');
  ok((await A.textContent('#g-err')).includes('stimmt nicht'), 'falsches Orga-Passwort: Hinweis');
  await A.check('#g-show'); ok((await A.getAttribute('#g-pw', 'type')) === 'text', '«Passwort anzeigen» zeigt das Passwort');
  await A.fill('#g-pw', PW); await A.click('#f-orga [type=submit]'); await A.waitForSelector('#g-first');
  await reg(A, 'Susan', 'Fleet', '0151 1112223', 'susan@beispiel.de');
  ok((await bar(A)).includes('Susan F.') && (await bar(A)).includes('Orga'), 'A ist als Orga angemeldet: ' + await bar(A));
  // B: Helferin
  await B.fill('#g-code', CODE.toLowerCase()); await B.click('#f-code [type=submit]'); await B.waitForSelector('#g-first');
  await reg(B, 'Astrid', 'König', '0171 2345678', 'astrid@beispiel.de');
  ok((await bar(B)).includes('Astrid K.') && (await bar(B)).includes('Helfer'), 'B ist als Helferin angemeldet: ' + await bar(B));
  ok((await B.$$eval('#tabs [data-tab]', x => x.map(e => e.dataset.tab).join())) === 'plan,meine,sos', 'Helferin hat keine Orga-Reiter');

  // B trägt sich ein, A sieht es
  const open = await B.$$eval('button.cell.is-open', x => x.map(e => [e.dataset.s, e.dataset.t]));
  const [s1, t1] = open[0];
  await B.click('[data-s="' + s1 + '"][data-t="' + t1 + '"]'); await B.waitForSelector('#f-who');
  const who = await B.$$eval('#f-who option', x => x.map(o => o.textContent));
  ok(who[0] === 'Mich (Astrid K.)' && who.includes('Assi') && who.includes('Susan F.') && who[who.length - 1] === 'Neue Person anlegen …' && who.length > 80, 'Auswahl «Wen möchtest du eintragen?» mit der ganzen Helferliste (' + who.length + ' Einträge)');
  await B.click('[data-d=join]'); await B.waitForTimeout(700); await B.click('[data-d=cancel]');
  ok((await cellText(B, s1, t1)).includes('Astrid K.'), 'B steht im Feld');
  await refresh(A);
  ok((await cellText(A, s1, t1)).includes('Astrid K.'), 'A sieht den Eintrag von B nach «Aktualisieren»');
  // A trägt sich ins selbe Feld ein, B bekommt es von selbst (ohne Tippen)
  await A.click('[data-s="' + s1 + '"][data-t="' + t1 + '"]'); ok(!(await A.$('#f-tent')) && !(await A.$eval('#dlg', e => e.innerText)).includes('Zusage'), 'kein Feld «Zusage» mehr im Orga-Dialog');
  await A.click('[data-d=addme]'); await A.click('#dform [type=submit]'); await A.waitForTimeout(600);
  ok((await cellText(A, s1, t1)).includes('Susan F.') && (await cellText(A, s1, t1)).includes('Astrid K.'), 'A steht zusätzlich im Feld');
  const t0 = Date.now(); let auto = false; while (Date.now() - t0 < 36000) { if ((await cellText(B, s1, t1)).includes('Susan F.')) { auto = true; break; } await B.waitForTimeout(1000); }
  ok(auto, 'B sieht den Eintrag von A von selbst nach ' + Math.round((Date.now() - t0) / 1000) + ' s');

  // B trägt eine weitere Person ein
  const [s2, t2] = open[1];
  await B.click('[data-s="' + s2 + '"][data-t="' + t2 + '"]'); await B.selectOption('#f-who', '+'); await B.fill('#f-cfirst', 'Lena'); await B.fill('#f-clast', 'König'); await B.click('[data-d=join]'); await B.waitForTimeout(700);
  ok((await B.$$eval('#dlg .chips li', x => x.map(e => e.innerText.replace(/\s+/g, ' ').trim()).join(' | '))).includes('Lena K.'), 'weitere Person ist eingetragen');
  ok((await B.$$eval('#f-who option', x => x.map(o => o.textContent).join(' | '))).startsWith('Mich (Astrid K.)'), 'danach kann B sich selbst dazu eintragen');
  await B.click('[data-d=cancel]');
  await B.click('[data-s="' + open[2][0] + '"][data-t="' + open[2][1] + '"]');
  ok((await B.$$eval('#f-who option', x => x.map(o => o.textContent).slice(0, 2).join(' | '))) === 'Mich (Astrid K.) | Lena K.', 'Lena K. steht jetzt oben in der Auswahl');
  await B.selectOption('#f-who', { label: 'Lena K.' }); await B.click('[data-d=join]'); await B.waitForTimeout(600);
  // und wieder austragen (zweimal tippen)
  await B.click('#dlg [data-d=leave]'); await B.click('#dlg [data-d=leave]'); await B.waitForTimeout(600); await B.click('[data-d=cancel]');
  ok(!(await cellText(B, open[2][0], open[2][1])).includes('Lena K.'), 'Lena K. ist dort wieder ausgetragen');
  // jemanden aus der Helferliste per Auswahl eintragen, ohne etwas zu tippen
  await B.click('[data-s="' + open[3][0] + '"][data-t="' + open[3][1] + '"]'); await B.selectOption('#f-who', 'n:Assi'); await B.click('[data-d=join]'); await B.waitForTimeout(700);
  ok((await B.$$eval('#dlg .chips li', x => x.map(e => e.innerText.replace(/\s+/g, ' ').trim()).join(' | '))).includes('Assi ×'), 'Assi per Auswahl eingetragen, B kann den Eintrag wieder entfernen');
  await B.click('[data-d=cancel]'); await refresh(A);
  ok((await cellText(A, open[3][0], open[3][1])).includes('Assi'), 'A sieht Assi im Feld');
  await B.click('[data-s="' + open[3][0] + '"][data-t="' + open[3][1] + '"]'); await B.click('#dlg [data-d=leave]'); await B.click('#dlg [data-d=leave]'); await B.waitForTimeout(600); await B.click('[data-d=cancel]');
  ok(!(await cellText(B, open[3][0], open[3][1])).includes('Assi'), 'Assi ist wieder ausgetragen');
  await B.click('[data-tab=meine]'); await B.waitForTimeout(200);
  const meine = await B.$eval('#view', e => e.innerText);
  ok(/2 Schichten/.test(meine) && meine.includes('für Lena K.') && meine.includes('Von dir mit eingetragen: Lena K.'), '«Meine Schichten» zeigt beide');
  await B.screenshot({ path: path.join(OUT, 'b-meine.png') }); await B.click('[data-tab=plan]');

  // Orga: Helferliste mit Kontaktdaten, Helferin: keine fremden Daten auf dem Gerät
  await refresh(A); await A.click('[data-tab=helfer]'); await A.fill('#q', 'Astrid'); await A.waitForTimeout(200);
  ok((await A.$eval('#view', e => e.innerText)).includes('01712345678'), 'Orga sieht die Handynummer von Astrid');
  await A.fill('#q', 'Lena'); await A.waitForTimeout(200);
  ok((await A.$eval('#view', e => e.innerText)).includes('eingetragen von Astrid K.'), 'Orga sieht, wer Lena eingetragen hat');
  const onB = await B.evaluate(() => Object.keys(localStorage).map(k => localStorage.getItem(k)).join(' '));
  ok(!onB.includes('01511112223') && !onB.includes('susan@beispiel.de') && !onB.includes('Zimtstern'), 'auf dem Gerät der Helferin liegen keine fremden Kontaktdaten oder Passwörter');

  // Beide gleichzeitig ins selbe leere Feld
  await A.click('[data-tab=plan]'); await refresh(A); await refresh(B);
  const free = (await B.$$eval('button.cell.is-open', x => x.map(e => [e.dataset.s, e.dataset.t])))[0];
  await A.click('[data-s="' + free[0] + '"][data-t="' + free[1] + '"]'); await A.click('[data-d=addme]');
  await B.click('[data-s="' + free[0] + '"][data-t="' + free[1] + '"]'); await B.waitForSelector('#f-who');
  await Promise.all([A.click('#dform [type=submit]'), B.click('[data-d=join]')]); await A.waitForTimeout(900); await B.click('[data-d=cancel]');
  await refresh(A); await refresh(B);
  const both = [await cellText(A, free[0], free[1]), await cellText(B, free[0], free[1])];
  ok(both.every(t => t.includes('Susan F.') && t.includes('Astrid K.')), 'gleichzeitig eingetragen: beide stehen drin');

  // Anmeldung bleibt nach dem Schliessen
  await A.reload(); await A.waitForTimeout(700); await B.reload(); await B.waitForTimeout(700);
  ok((await bar(A)).includes('Orga') && (await bar(B)).includes('Astrid K.'), 'beide bleiben nach dem Neuladen angemeldet');

  // PDF
  await A.click('[data-act=pdf]'); await A.selectOption('#f-pgroup', { index: 1 }); await A.click('#dform [type=submit]'); await A.waitForSelector('a[download]', { timeout: 15000 });
  const pdf = await A.evaluate(async () => { const a = document.querySelector('a[download]'), buf = new Uint8Array(await (await fetch(a.href)).arrayBuffer()); return { name: a.download, head: String.fromCharCode(...buf.slice(0, 5)), size: buf.length, data: Array.from(buf) }; });
  fs.writeFileSync(path.join(OUT, pdf.name), Buffer.from(pdf.data));
  ok(pdf.head === '%PDF-' && pdf.size > 5000 && /getraenke/.test(pdf.name), 'PDF für einen Bereich: ' + pdf.name + ', ' + Math.round(pdf.size / 1024) + ' KB');
  await A.click('[data-d=cancel]'); await A.click('[data-act=pdf]'); await A.click('#dform [type=submit]'); await A.waitForSelector('a[download]', { timeout: 15000 });
  const all = await A.evaluate(async () => { const a = document.querySelector('a[download]'); return { name: a.download, data: Array.from(new Uint8Array(await (await fetch(a.href)).arrayBuffer())), text: document.querySelector('#dlg').innerText }; });
  fs.writeFileSync(path.join(OUT, all.name), Buffer.from(all.data)); ok(/Seiten/.test(all.text), 'PDF für alle Bereiche: ' + all.text.split('\n').slice(0, 3).join(' / '));
  await A.click('[data-d=cancel]');

  // SOS: alle dürfen melden, benannte Personen und Orga sehen und übernehmen
  const C = await phone(); await C.fill('#g-code', CODE); await C.click('#f-code [type=submit]'); await C.waitForSelector('#g-first'); await reg(C, 'Saskia', 'Melis', '0160 4445556', 'saskia@beispiel.de');
  await B.click('[data-tab=sos]'); ok((await B.$eval('#view', e => e.innerText)).includes('Nina Blasberg, Julian Richter, Magnus, Melli Schittek, Frank Blasberg, Betsy Arens, Saskia Melis'), 'Helfer sehen, an wen die SOS-Meldung geht');
  await B.click('[data-act=sos-new]'); await B.click('#dlg [data-d=sos-st]'); await B.click('#dlg [data-d=sos-need]'); await B.click('#dform [type=submit]'); await B.waitForTimeout(600); await B.click('[data-d=cancel]');
  ok(!(await B.$('[data-act=sos-go]')), 'eine normale Helferin kann melden, aber nicht übernehmen');
  await C.click('[data-tab=sos]'); await refresh(C); ok(!!(await C.$('[data-act=sos-go]')) && (await C.$eval('#view', e => e.innerText)).includes('von Astrid K.'), 'benannte SOS-Empfängerin sieht die Meldung und kann übernehmen');
  await C.click('[data-act=sos-go]'); await C.waitForTimeout(600); await A.click('[data-tab=sos]'); await refresh(A);
  ok((await A.$eval('#view', e => e.innerText)).includes('unterwegs: Saskia M.'), 'Orga sieht, wer unterwegs ist'); await B.click('[data-tab=plan]');
  // Helferliste als PDF (nur Orga)
  await A.click('[data-tab=helfer]'); await A.fill('#q', ''); await A.waitForTimeout(200); await A.click('[data-act=pdf-helfer]'); await A.waitForSelector('a[download]', { timeout: 15000 });
  const hl = await A.evaluate(async () => { const a = document.querySelector('a[download]'), buf = new Uint8Array(await (await fetch(a.href)).arrayBuffer()); return { name: a.download, head: String.fromCharCode(...buf.slice(0, 5)), data: Array.from(buf) }; });
  fs.writeFileSync(path.join(OUT, hl.name), Buffer.from(hl.data)); ok(hl.head === '%PDF-' && hl.name === 'sternenzauber-helferliste.pdf', 'Helferliste als PDF: ' + Math.round(hl.data.length / 1024) + ' KB');
  await A.click('[data-d=cancel]'); await A.click('[data-tab=plan]');
  ok(!(await B.$('[data-act=pdf-helfer]')), 'Helfer haben keinen Knopf für die Helferliste');
  // Fusszeile, Einrichten ohne Super-Admin, kein seitliches Verrutschen
  const foot = await A.$eval('.made', e => e.innerText.replace(/\s+/g, ' ').trim()); ok(/^Version \d/.test(foot) && !/Made|Susan/.test(foot), 'Fusszeile nur noch mit Version: ' + foot);
  await A.click('[data-tab=einrichten]'); await A.waitForTimeout(200);
  const setup = await A.$eval('#view', e => e.innerText);
  ok(!/Super-Admin/.test(setup) && setup.includes('Neues Jahr anlegen') && setup.includes('Orga-Passwort') && !setup.includes('Vorschau zurücksetzen'), 'Einrichten: kein Super-Admin, Orga legt Jahre an');
  ok(setup.includes('Orga-Team: Nina B., Julian R., Astrid und Susan.'), 'Orga-Team steht in den Hinweisen');
  ok(setup.includes('SOS-Empfänger') && setup.includes('Saskia Melis') && setup.includes('Frank Blasberg'), 'SOS-Empfänger stehen unter «Einrichten»');
  for (const [p, name] of [[A, 'A'], [B, 'B']]) ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), name + ': nichts ragt seitlich heraus');
  await A.screenshot({ path: path.join(OUT, 'a-einrichten.png'), fullPage: true });
  await B.click('[data-s="' + s1 + '"][data-t="' + t1 + '"]'); await B.waitForTimeout(300); await B.screenshot({ path: path.join(OUT, 'b-dialog.png') }); await B.click('[data-d=cancel]');
  await B.screenshot({ path: path.join(OUT, 'b-plan.png') });
  ok(!errs.length, 'keine Fehler im Browser' + (errs.length ? ': ' + errs.slice(0, 4).join(' ;; ') : ''));
  await b.close();
  console.log(fails ? fails + ' von ' + n + ' Prüfungen fehlgeschlagen' : 'Alle ' + n + ' Prüfungen bestanden'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ABBRUCH', e.message.split('\n').slice(0, 6).join('\n')); process.exit(1); });
