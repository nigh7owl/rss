# Projektnotizen

Hier steht alles, was bei der Arbeit an rss zu beachten ist, und was für die Zukunft geplant ist. Neue Regeln und Ideen kommen in diese Datei.

## Zu beachten

### Allgemein

- Oberfläche, Texte, Commit-Nachrichten und Dokumentation sind auf Deutsch.
- Jeder Pull Request erhöht die Version in `package.json` und `package-lock.json` (SemVer, z. B. per `npm version <x.y.z> --no-git-tag-version`) und nennt sie im PR-Titel und im Abschnitt „Version“ der Vorlage `.github/pull_request_template.md`. Solange rss in der Beta ist (0.x), erhöhen auch inkompatible Änderungen nur die Minor-Version.
- Vor dem Pushen `npm test` ausführen.
- rss bleibt klein: keine Datenbank (JSON-Dateien im Datenordner, `src/store.js`), keine Konten, kein Build-Schritt, nur zwei Abhängigkeiten (`express`, `fast-xml-parser`).

### Design

- rss übernimmt das Farbschema „Schlicht“ von Books: Die Variablen oben in `public/style.css` (`:root` und Dunkelmodus doppelt über `prefers-color-scheme` und `data-mode`) sind aus Books kopiert und werden bei Änderungen dort nachgezogen. Graustufen, keine Schatten, innere Kästen mit Umrandung, Ecken nur `--radius` bzw. `--radius-pill`.
- Es gelten die Bausteine aus dem „Design-Baukasten“ von Books (`docs/projekt.md` dort) unter denselben Klassennamen: Seitenkopf (`page-header`, Titel 2,4 rem mit grauer Metazeile), Zwischenüberschrift (`section-title`, `form-card h2`), Kasten (`toc-box` mit `toc-head` und Zähler-Pille `toc-count`), Zeile (`--row-pad`/`--row-font`), Leerzustand (`empty`), Knopf (`btn`, `primary`), Hinweis (`flash`, `flash warning`, `settings-info`), Seitenleisten-Panel (`panel` mit `h4` in Kapitälchen), Aktionen rechts (`actions-panel`). Neue Ansichten erfinden keine eigenen Kästen.
- Der Hauptinhalt liegt immer auf der weißen Karte (`main.content`) in der mittleren Spalte (`--tri-cols`), Formulare sind 640 px breit, die Einstellungen nutzen die volle Kartenbreite.
- Das App-Symbol (`logoSvg` in `src/views.js`) ist die Kachel der Programmfamilie (Books, Trailuma, Therapie-Planer) mit einem RSS-Zeichen; Farbe `LOGO_COLOR` = `--logo`.
- Hell/Dunkel/Automatisch wählt jede Person im Browser (`rss-mode` in `localStorage`, gesetzt von `public/theme.js` vor dem ersten Zeichnen, umgeschaltet in `public/app.js`).

### Anbindung an Books

- rss nutzt ausschließlich die vorhandene Schnittstelle „Quellen und Webclipper“ von Books (`/api/sources`, siehe README dort): ein Schlüssel der Art **Quelle**, `PUT /api/sources/files/<Pfad>` mit `Content-Type: text/markdown`, `GET /api/sources` zum Prüfen (`src/books.js`). Books ändert dafür nichts.
- Books speichert nur bei inhaltlicher Änderung und legt den vorigen Stand in den Versionsverlauf; rss darf deshalb denselben Tag beliebig oft senden. `source` und `source_updated` setzt Books, nicht rss.
- Eine Markdown-Datei je Tag. Aufbau in Books (Standardpfad `{jahr}/{monat} {monatsname}/{datum} Tageszusammenfassung.md` in `DEFAULT_SETTINGS`): Regal der Quelle → Buch je Jahr → Kapitel je Monat (Ordner „11 November“; Books zeigt „November“ und sortiert nach der Zahl, `cleanName` dort) → Seite je Tag. Jahre ohne Zahl-Präfix sortiert Books numerisch nach dem Namen.
- Frontmatter der Zusammenfassung (`summaryMarkdown` in `src/summary.js`): `title` (der Tag ausgeschrieben), `order` = Tag im Monat (immer – sortiert die Seiten im Monatskapitel; in der täglichen Notiz zählt `order` nur innerhalb des Kastens dieser Quelle, stört also trailuma nicht), auf Wunsch `daily: JJJJ-MM-TT` (Books bettet die Seite dann über „Quellen im Tagebuch“ in die tägliche Notiz ein), `tags: [rss]`, `meldungen`, `feeds`, optional `source_url` (eigene Adresse → „Original öffnen“ in Books).
- Fremder Text im Markdown läuft durch `mdEscape`: neben Markdown auch die Obsidian-Syntax, die Books versteht (`#tag`, `[[…]]`, `$…$`, `==…==`, `%%…%%`), damit Meldungen keine Tags, Links oder Formeln erzeugen.
- Der Schlüssel steht im Klartext in `settings.json` (Datei mit Rechten 0600), wird im Formular nie angezeigt (nur die ersten Zeichen) und nie an eine neue Adresse geschickt: Ändert sich die Adresse von Books ohne neuen Schlüssel, wird der alte verworfen (`cleanSettings`).
- Automatischer Versand (`autoSendDue` in `src/service.js`, Standard an, wirkt erst mit Adresse und Schlüssel): einmal am Tag ab der eingestellten Uhrzeit, vorher Feeds abrufen, dann Vortag und Tag senden (der Vortag fängt Meldungen nach dem letzten Versand ein). Der Merker `lastAutoSend` steht in `sends.json` (`_state`), damit ein Neustart nicht doppelt sendet und ein verpasster Versand nachgeholt wird.

### Tage und Meldungen

- Ein Tag ist ein Kalendertag in der eingestellten Zeitzone (`src/days.js`). Meldungen gehören zum Tag ihres Datums aus dem Feed; ohne Datum (oder mit Datum in der Zukunft) zum Zeitpunkt, an dem rss sie zuerst sieht. Nach einem Wechsel der Zeitzone ordnet `Service.redate` alle Meldungen neu zu.
- Erkannt wird eine Meldung an `guid`/`id`, sonst am Link (`itemId` aus Feed und Schlüssel). Bekannte Meldungen werden nie geändert.
- Meldungen älter als `keepDays` werden beim Abrufen entfernt, ebenso deren Versandprotokoll; alte Einträge eines neuen Feeds werden gar nicht erst übernommen.

### Sicherheit

- Standardmäßig nur auf `127.0.0.1`. Optional `RSS_PASSWORD` (HTTP-Basic, Vergleich über SHA-256 und `timingSafeEqual`); `/health` bleibt ohne Anmeldung.
- POST-Anfragen nur von der eigenen Seite (`Sec-Fetch-Site`/`Origin`), Rücksprünge nur auf eigene Pfade (`backTo`), Content-Security-Policy ohne Inline-Skripte, alle fremden Texte über `h()`, Links aus Feeds nur `http`/`https`.
- Feeds: höchstens 10 MB, 20 s Zeitlimit, bedingte Anfragen (ETag/Last-Modified).

## Ideen für später

- Volltext der Artikel: aus dem Feed (`content:encoded`, Atom `content`), sofern vorhanden, sonst die Artikelseite abrufen und den Hauptinhalt nach Markdown wandeln – in der Tagesdatei zu lang, eher als eigene Seiten je Artikel unter dem Tag.

- OPML-Import und -Export der Feeds.
- Gelesen/ungelesen und eine Suche über alle Meldungen.
- Feeds in Gruppen (z. B. „Nachrichten“, „Technik“) – in der Zusammenfassung als eigene Abschnitte.
- Wochenzusammenfassung als eigene Seite in Books.
- Je Feed abschaltbar, ob er in die Zusammenfassung kommt.
