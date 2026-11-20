// Speicher ohne Datenbank: ein paar JSON-Dateien im Datenordner, im Arbeitsspeicher gehalten und atomar geschrieben.
//
//   settings.json  Einstellungen (Books-Adresse und -Schlüssel, Zeitplan …)
//   feeds.json     abonnierte Feeds mit Abrufstatus
//   items.json     Meldungen (werden nach `keepDays` Tagen entfernt)
//   sends.json     Protokoll der Lieferungen an Books je Tag

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { systemTimeZone, validTimeZone, isDay } from './days.js';

export const DEFAULT_SETTINGS = {
  title: 'RSS',
  timezone: systemTimeZone(),
  refreshMinutes: 30, // Feeds abrufen alle … Minuten
  keepDays: 60, // Meldungen aufbewahren
  booksUrl: '', // z. B. http://nas:3000
  booksToken: '', // Schlüssel einer Quelle (books_…)
  booksPath: '{jahr}/{datum} Tageszusammenfassung.md', // Pfad im Zielordner der Quelle
  booksDaily: true, // `daily:` ins Frontmatter → Books bettet die Zusammenfassung in die tägliche Notiz ein
  booksExcerpts: true, // Kurztext unter jeder Meldung
  autoSend: false, // täglich automatisch senden
  sendTime: '23:30', // Uhrzeit dafür
  appUrl: '', // eigene Adresse (optional) – Books zeigt dann „Original öffnen“
};

export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const feedId = (url) => crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
export const itemId = (feed, key) => crypto.createHash('sha1').update(`${feed}\n${key}`).digest('hex').slice(0, 16);

/** Pfad für die Zusammenfassung in Books prüfen: relativ, ohne `..` und versteckte Teile, endet auf .md. */
export function checkBooksPath(pattern) {
  const value = String(pattern ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!value) throw new UserError('Der Pfad in Books darf nicht leer sein.');
  if (!value.endsWith('.md')) throw new UserError('Der Pfad in Books muss auf „.md“ enden.');
  if (!value.includes('{datum}')) throw new UserError('Der Pfad in Books braucht den Platzhalter {datum}, sonst überschreibt jeder Tag den vorigen.');
  if (value.split('/').some((part) => !part.trim() || part === '..' || part.startsWith('.'))) {
    throw new UserError('Der Pfad in Books darf keine leeren, versteckten oder „..“-Teile enthalten.');
  }
  return value;
}

/** Adresse ohne Schrägstrich am Ende; leer bleibt leer. */
function cleanUrl(value, label) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UserError(`${label} ist keine gültige Internetadresse.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new UserError(`${label} muss mit http:// oder https:// beginnen.`);
  if (parsed.username || parsed.password) throw new UserError(`${label} darf keinen Benutzernamen oder kein Passwort enthalten.`);
  return parsed.origin + parsed.pathname.replace(/\/+$/, '');
}

/** Einstellungen aus dem Formular prüfen; `current` liefert die bisherigen Werte. */
export function cleanSettings(input, current) {
  const next = { ...current };
  const title = String(input.title ?? current.title).trim();
  next.title = title.slice(0, 60) || DEFAULT_SETTINGS.title;

  const tz = String(input.timezone ?? current.timezone).trim();
  if (!validTimeZone(tz)) throw new UserError(`Unbekannte Zeitzone „${tz}“ (Beispiel: Europe/Berlin).`);
  next.timezone = tz;

  const minutes = Number(input.refreshMinutes ?? current.refreshMinutes);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) throw new UserError('Abrufen: zwischen 5 und 1440 Minuten.');
  next.refreshMinutes = minutes;

  const keep = Number(input.keepDays ?? current.keepDays);
  if (!Number.isInteger(keep) || keep < 1 || keep > 3650) throw new UserError('Aufbewahren: zwischen 1 und 3650 Tagen.');
  next.keepDays = keep;

  const url = cleanUrl(input.booksUrl ?? current.booksUrl, 'Die Adresse von Books');
  next.booksUrl = url;
  next.appUrl = cleanUrl(input.appUrl ?? current.appUrl, 'Die eigene Adresse');

  // Leeres Feld = Schlüssel behalten. Ändert sich die Adresse, wird ein alter Schlüssel nie an die neue geschickt.
  const token = String(input.booksToken ?? '').trim();
  if (token) next.booksToken = token;
  else if (url !== current.booksUrl) next.booksToken = '';
  if (input.removeToken) next.booksToken = '';

  next.booksPath = checkBooksPath(input.booksPath ?? current.booksPath);
  next.booksDaily = Boolean(input.booksDaily);
  next.booksExcerpts = Boolean(input.booksExcerpts);
  next.autoSend = Boolean(input.autoSend);
  const time = String(input.sendTime ?? current.sendTime).trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new UserError('Uhrzeit bitte als HH:MM angeben, z. B. 23:30.');
  next.sendTime = time;
  return next;
}

export class Store {
  constructor(dir) {
    this.dir = path.resolve(dir);
    this.settings = { ...DEFAULT_SETTINGS };
    this.feeds = [];
    this.items = [];
    this.sends = {};
    this.state = {}; // interne Merker (z. B. letzter automatischer Versand)
    this.queue = Promise.resolve();
  }

  async load() {
    await fs.mkdir(this.dir, { recursive: true });
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.read('settings.json', {})) };
    this.feeds = await this.read('feeds.json', []);
    this.items = await this.read('items.json', []);
    const sends = await this.read('sends.json', {});
    this.state = sends._state ?? {};
    delete sends._state;
    this.sends = sends;
    return this;
  }

  async read(name, fallback) {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir, name), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return fallback;
      throw new Error(`${name} ist beschädigt: ${err.message}`);
    }
  }

  /** Schreibt nacheinander (nie zwei Schreibvorgänge gleichzeitig) und atomar über eine temporäre Datei. */
  write(name, data) {
    const file = path.join(this.dir, name);
    const json = `${JSON.stringify(data, null, 2)}\n`;
    // Ein Fehler beim vorigen Schreiben hält die folgenden nicht auf
    this.queue = this.queue.catch(() => {}).then(async () => {
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, json, { mode: 0o600 });
      await fs.rename(tmp, file);
    });
    return this.queue;
  }

  saveSettings(next) {
    this.settings = next;
    return this.write('settings.json', next);
  }
  saveFeeds() {
    return this.write('feeds.json', this.feeds);
  }
  saveItems() {
    return this.write('items.json', this.items);
  }
  saveSends() {
    return this.write('sends.json', { _state: this.state, ...this.sends });
  }

  feed(id) {
    return this.feeds.find((f) => f.id === id) ?? null;
  }

  /** Neue Meldungen übernehmen (bekannte bleiben, wie sie sind); gibt die Zahl der neuen zurück. */
  addItems(items) {
    const known = new Set(this.items.map((i) => i.id));
    const fresh = items.filter((i) => !known.has(i.id));
    this.items.push(...fresh);
    return fresh.length;
  }

  /** Meldungen eines Tages, nach Zeit sortiert. */
  itemsOfDay(day) {
    return this.items.filter((i) => i.day === day).sort((a, b) => a.time - b.time || a.title.localeCompare(b.title, 'de'));
  }

  /** Anzahl der Meldungen je Tag: { 'JJJJ-MM-TT': n } */
  dayCounts() {
    const counts = {};
    for (const i of this.items) counts[i.day] = (counts[i.day] ?? 0) + 1;
    return counts;
  }

  /** Alte Meldungen entfernen: alles vor `firstDay`. */
  prune(firstDay) {
    if (!isDay(firstDay)) return 0;
    const before = this.items.length;
    this.items = this.items.filter((i) => i.day >= firstDay);
    for (const day of Object.keys(this.sends)) if (day < firstDay) delete this.sends[day];
    return before - this.items.length;
  }

  removeFeed(id) {
    this.feeds = this.feeds.filter((f) => f.id !== id);
    this.items = this.items.filter((i) => i.feed !== id);
  }
}
