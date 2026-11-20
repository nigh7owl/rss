// Anbindung an Books über die vorhandene Schnittstelle „Quellen und Webclipper“ (/api/sources):
// Ein Schlüssel der Art „Quelle“ legt Dateien in seinem Zielordner an bzw. ersetzt sie (PUT /api/sources/files/<Pfad>).
// Books speichert nur bei inhaltlicher Änderung; der vorige Stand bleibt im Versionsverlauf der Seite.

import { UserError } from './store.js';
import { USER_AGENT } from './feeds.js';
import { summaryMarkdown, summaryPath } from './summary.js';

const TIMEOUT_MS = 30_000;

const encodePath = (rel) => rel.split('/').map(encodeURIComponent).join('/');

/** Fehlertext aus einer Antwort von Books (JSON mit `error`). */
async function problem(res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error ? String(body.error) : '';
  } catch {
    // keine JSON-Antwort (z. B. Reverse-Proxy)
  }
  const hints = {
    401: 'Der Schlüssel ist ungültig.',
    403: 'Books lehnt ab (Quellen abgeschaltet, schreibgeschützt oder Schlüssel eines Webclippers).',
    404: 'Unter dieser Adresse antwortet kein Books mit Quellen-Schnittstelle.',
    429: 'Zu viele Fehlversuche – Books bremst diese Adresse gerade.',
  };
  return new UserError(`Books: ${detail || hints[res.status] || `Antwort ${res.status} ${res.statusText}`}`, 502);
}

async function call(settings, method, apiPath, { body, type, fetchImpl = fetch } = {}) {
  if (!settings.booksUrl) throw new UserError('Die Adresse von Books ist nicht eingetragen (Einstellungen).');
  if (!settings.booksToken) throw new UserError('Der Schlüssel für Books fehlt (Einstellungen).');
  const headers = { Authorization: `Bearer ${settings.booksToken}`, Accept: 'application/json', 'User-Agent': USER_AGENT };
  if (type) headers['Content-Type'] = type;
  let res;
  try {
    res = await fetchImpl(`${settings.booksUrl}/api/sources${apiPath}`, { method, headers, body, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'Zeitüberschreitung' : err.cause?.code ?? err.message;
    throw new UserError(`Books ist nicht erreichbar (${reason}).`, 502);
  }
  if (!res.ok) throw await problem(res);
  try {
    return await res.json();
  } catch {
    throw new UserError('Books: unerwartete Antwort (kein JSON).', 502);
  }
}

/** Verbindung prüfen: GET /api/sources → { name, kind, folder, user }. */
export async function checkBooks(settings, opts = {}) {
  const info = await call(settings, 'GET', '', opts);
  if (info.kind && info.kind !== 'quelle') {
    throw new UserError(`Der Schlüssel gehört zum Webclipper „${info.name}“. Bitte in Books eine Quelle anlegen.`);
  }
  return info;
}

/**
 * Zusammenfassung eines Tages an Books senden.
 * Gibt { day, rel, url, changed, href, count, at } zurück; `href` ist der Link auf die Seite in Books.
 */
export async function sendSummary(store, day, { fetchImpl = fetch, now = Date.now() } = {}) {
  const { settings } = store;
  const items = store.itemsOfDay(day);
  const markdown = summaryMarkdown(day, items, store.feeds, settings, { appUrl: settings.appUrl });
  const rel = summaryPath(settings.booksPath, day);
  const res = await call(settings, 'PUT', `/files/${encodePath(rel)}`, { body: markdown, type: 'text/markdown; charset=utf-8', fetchImpl });
  return {
    day,
    rel: res.rel ?? rel,
    href: res.url ? `${settings.booksUrl}${res.url}` : '',
    changed: Boolean(res.changed),
    count: items.length,
    at: now,
  };
}

/** Senden und das Ergebnis (auch Fehler) im Protokoll vermerken. */
export async function sendAndLog(store, day, opts = {}) {
  try {
    const result = await sendSummary(store, day, opts);
    store.sends[day] = { ...result, ok: true };
    await store.saveSends();
    return store.sends[day];
  } catch (err) {
    store.sends[day] = { ...(store.sends[day] ?? {}), day, ok: false, error: err.message, at: opts.now ?? Date.now() };
    await store.saveSends();
    throw err;
  }
}
