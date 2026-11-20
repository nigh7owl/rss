# RSS 📰

Ein kleiner RSS-Leser im schlichten Stil von [Books](https://github.com/nigh7owl/books). Er ruft deine Feeds regelmäßig ab, zeigt die Meldungen Tag für Tag und schickt jeden Tag eine **Zusammenfassung aller Meldungen als Markdown-Datei an Books** – über die Schnittstelle „Quellen und Webclipper“, die Books schon hat. Keine Datenbank, keine Konten: ein paar JSON-Dateien im Datenordner.

## Funktionen

- **Feeds abonnieren:** RSS 2.0, RSS 1.0 (RDF) und Atom. Statt der Feed-Adresse reicht auch die Adresse der Webseite, wenn sie auf ihren Feed verweist.
- **Tagesansicht:** alle Meldungen eines Tages, nach Feed gruppiert, mit Uhrzeit und Kurztext; links die letzten Tage mit Anzahl, rechts die Aktionen. Vor- und zurückblättern, „Heute“.
- **An Books senden:** von Hand je Tag oder **automatisch jeden Tag** zur eingestellten Uhrzeit (dabei auch der Vortag, falls nach dem letzten Versand noch etwas kam). Books speichert nur, wenn sich etwas geändert hat; der vorige Stand bleibt im Versionsverlauf der Seite.
- **Im Tagebuch von Books:** Die Zusammenfassung trägt `daily: JJJJ-MM-TT` – ist in Books „Quellen im Tagebuch“ an, erscheint sie in der täglichen Notiz.
- **Markdown herunterladen** und als Vorschau ansehen, genau so, wie es an Books geht.
- Abruf alle 30 Minuten (einstellbar), mit ETag/Last-Modified; alte Meldungen werden nach 60 Tagen (einstellbar) entfernt.
- **Schlichte Oberfläche** wie Books: Graustufen, Hell/Dunkel/Automatisch über das Paletten-Symbol, mobile Ansicht.

## Installation & Start

Voraussetzung: [Node.js](https://nodejs.org/) 20 oder neuer.

```bash
npm install
```

```bash
npm start
```

Danach ist RSS unter <http://localhost:3001> erreichbar. Die Daten liegen in `./data`.

### Optionen

```
rss [Datenordner] [Optionen]

  -p, --port <port>        Port (Standard: 3001, Umgebung RSS_PORT)
      --host <adresse>     Adresse (Standard: 127.0.0.1, für alle: 0.0.0.0, Umgebung RSS_HOST)
      --senden [Tag]       Feeds abrufen, den Tag (Standard: heute) an Books senden und beenden
  -h, --help               Diese Hilfe
```

Datenordner: Standard `./data` (Umgebung `RSS_DATA`). Mit `RSS_PASSWORD` fragt der Browser nach einem Passwort (HTTP-Basic, Benutzername beliebig) – sinnvoll, sobald RSS nicht nur auf `127.0.0.1` läuft.

`--senden` passt zu einem eigenen Zeitplan (cron, Aufgabenplaner der NAS), wenn RSS nicht dauerhaft läuft:

```bash
node bin/rss.js /pfad/zu/daten --senden
```

## Mit Books verbinden

1. In Books unter **Konto → Quellen und Webclipper** eine neue **Quelle** anlegen, z. B. „RSS“. Der Zielordner ist dann das Regal „RSS“ (später änderbar). Den Schlüssel (`books_…`) kopieren – Books zeigt ihn nur einmal.
2. In RSS unter **Einstellungen** die Adresse von Books (z. B. `http://nas:3000`) und den Schlüssel eintragen, speichern, „Verbindung zu Books prüfen“.
3. Auf einer Tagesseite „An Books senden“ – oder unter *Zeitplan* „Jeden Tag automatisch an Books senden“ anhaken.

Die Datei landet unter `RSS/2026/2026-11-20 Tageszusammenfassung.md` (Pfad im Zielordner einstellbar, Platzhalter `{jahr}`, `{monat}`, `{tag}`, `{datum}`) und sieht so aus:

```markdown
---
title: "Tageszusammenfassung 20.11.2026"
daily: 2026-11-20
order: 20
tags:
  - rss
meldungen: 3
feeds: 2
---

Freitag, 20. November 2026 · 3 Meldungen aus 2 Feeds

## heise online

- 07:30 · [Node.js 26 erschienen](https://www.heise.de/…)
  Die neue Version bringt einen schnelleren Test-Runner …

## Tagesschau

- 05:40 · [Wetter: Erster Schnee in den Alpen](https://www.tagesschau.de/…)
  Oberhalb von 1200 Metern fällt am Wochenende Schnee.
- 08:30 · [Bundestag beschließt Haushalt für 2027](https://www.tagesschau.de/…)
```

`source` und `source_updated` ergänzt Books beim Speichern. Die Seite ist in Books schreibgeschützt (sie gehört der Quelle); mit „Eigene Adresse“ in den Einstellungen zeigt Books „Original öffnen“ mit einem Link zurück auf den Tag in RSS. Zeichen, die Books als Markdown oder Obsidian-Syntax lesen würde (`#tag`, `[[…]]`, `$…$` …), werden in Titeln und Kurztexten entschärft.

## Docker

```bash
mkdir -p data
```

```bash
docker compose up -d
```

RSS ist dann unter <http://localhost:3001> erreichbar, die Daten liegen in `./data`. Anpassen über eine Datei `.env` neben der `compose.yaml`:

```dotenv
RSS_DIR=/pfad/zu/rss-daten
RSS_PUBLISH=127.0.0.1:3001
RSS_UID=1026
RSS_GID=100
RSS_TZ=Europe/Berlin
RSS_PASSWORD=
```

Der Container läuft als `RSS_UID:RSS_GID` (Standard 1000:1000); diesem Benutzer muss `RSS_DIR` gehören. Laufen Books und RSS in derselben Compose-Umgebung, ist die Adresse von Books der Dienstname, z. B. `http://books:3000`.

## Daten

| Datei | Inhalt |
| --- | --- |
| `settings.json` | Einstellungen, auch Adresse und Schlüssel für Books (Rechte 0600) |
| `feeds.json` | abonnierte Feeds mit Abrufstatus |
| `items.json` | Meldungen der aufbewahrten Tage |
| `sends.json` | wann welcher Tag an Books ging (und Fehler) |

## Datenschutz und Sicherheit

- RSS verbindet sich nur mit deinen Feeds und deinem Books – keine Telemetrie, keine Schriften oder Skripte von fremden Servern.
- Standardmäßig nur auf `127.0.0.1` erreichbar; für das Heimnetz `--host 0.0.0.0` und `RSS_PASSWORD` setzen.
- Formulare nehmen nur Anfragen von RSS selbst an (Schutz vor fremden Seiten), eine Content-Security-Policy erlaubt nur eigene Skripte, Texte aus Feeds werden nie als HTML ausgegeben.
- Der Schlüssel für Books wird nie angezeigt und nie an eine geänderte Adresse geschickt. Ohne HTTPS geht er im Klartext über das Netz.

## Entwicklung

```bash
npm test
```

| Datei | Inhalt |
| --- | --- |
| `src/feeds.js` | Feeds abrufen und lesen (RSS, RDF, Atom), Feed-Suche in Webseiten |
| `src/summary.js` | Tageszusammenfassung als Markdown |
| `src/books.js` | Anbindung an Books (`/api/sources`) |
| `src/service.js` | Abrufen, Aufräumen, Zeitplan |
| `src/store.js` | JSON-Dateien, Einstellungen prüfen |
| `src/days.js` | Tage und Uhrzeiten in der Zeitzone |
| `src/views.js`, `public/style.css` | Oberfläche im Stil „Schlicht“ von Books |
| `src/app.js` | Express-Routen |

Projektregeln und Ideen: [`docs/projekt.md`](docs/projekt.md).
