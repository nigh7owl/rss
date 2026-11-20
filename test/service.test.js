import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Service } from '../src/service.js';
import { Store, cleanSettings, DEFAULT_SETTINGS } from '../src/store.js';
import { tempStore, testServer, RSS } from './helpers.js';

const quiet = { info() {}, error() {} };

test('Feed hinzufügen, erneut abrufen (304), doppelt abonnieren, alte Meldungen entfernen', async (t) => {
  let etagHits = 0;
  const srv = await testServer((req) => {
    if (req.headers['if-none-match'] === '"v1"') {
      etagHits++;
      return { status: 304, body: '' };
    }
    return { headers: { 'Content-Type': 'application/rss+xml', ETag: '"v1"' }, body: RSS };
  });
  t.after(srv.close);
  const store = await tempStore({ keepDays: 1 });
  const service = new Service(store, { log: quiet });
  const now = Date.parse('2026-11-20T12:00:00Z');
  const { feed, fresh } = await service.addFeed(`${srv.url}/feed`, now);
  assert.equal(feed.title, 'Beispiel & Co');
  assert.equal(fresh, 2, 'nur heute wird aufbewahrt (keepDays 1)');
  await assert.rejects(service.addFeed(`${srv.url}/feed`, now), /schon abonniert/);
  assert.equal(await service.refreshAll(now), 0);
  assert.equal(etagHits, 1);

  // Neu laden: alles liegt im Datenordner
  const again = await new Store(store.dir).load();
  assert.equal(again.feeds.length, 1);
  assert.equal(again.items.length, 2);
  assert.equal(again.state.lastRefresh, now);
});

test('Abruffehler stehen am Feed', async () => {
  const store = await tempStore();
  store.feeds.push({ id: 'x', url: 'http://127.0.0.1:9/feed', title: 'Weg' });
  const service = new Service(store, { log: quiet });
  await service.refreshAll();
  assert.match(store.feeds[0].error, /Nicht erreichbar/);
});

test('automatischer Versand: einmal am Tag ab der Uhrzeit, heute und gestern', async (t) => {
  const puts = [];
  const books = await testServer((req) => {
    if (req.method === 'PUT') puts.push(decodeURIComponent(req.url));
    return { body: { rel: 'x', url: '/view/x', changed: true } };
  });
  t.after(books.close);
  const store = await tempStore({ booksUrl: books.url, booksToken: 'books_x', autoSend: true, sendTime: '23:30' });
  const service = new Service(store, { log: quiet });
  assert.equal(await service.autoSendDue(Date.parse('2026-11-20T22:00:00Z')), false, '23:00 in Berlin: noch nicht');
  assert.equal(await service.autoSendDue(Date.parse('2026-11-20T22:31:00Z')), true);
  assert.deepEqual(puts, ['/api/sources/files/2026/11 November/2026-11-19 Tageszusammenfassung.md', '/api/sources/files/2026/11 November/2026-11-20 Tageszusammenfassung.md']);
  assert.equal(await service.autoSendDue(Date.parse('2026-11-20T22:50:00Z')), false, 'nicht zweimal');
  store.settings.autoSend = false;
  assert.equal(await service.autoSendDue(Date.parse('2026-11-21T22:50:00Z')), false, 'abgeschaltet');
});

test('Einstellungen prüfen; Schlüssel nie an eine neue Adresse', () => {
  const cur = { ...DEFAULT_SETTINGS, booksUrl: 'http://nas:3000', booksToken: 'books_alt' };
  const base = { ...cur, booksToken: '', booksDaily: '1', autoSend: undefined }; // nicht angehakt = fehlt im Formular
  assert.equal(cleanSettings(base, cur).booksToken, 'books_alt', 'leer = behalten');
  assert.equal(cleanSettings({ ...base, booksUrl: 'http://nas:3000/' }, cur).booksToken, 'books_alt');
  assert.equal(cleanSettings({ ...base, booksUrl: 'https://anders:3000' }, cur).booksToken, '');
  assert.equal(cleanSettings({ ...base, booksToken: 'books_neu' }, cur).booksToken, 'books_neu');
  assert.equal(cleanSettings({ ...base, removeToken: '1' }, cur).booksToken, '');
  assert.equal(cleanSettings(base, cur).booksDaily, true);
  assert.equal(cleanSettings(base, cur).autoSend, false, 'nicht angehakt = aus');
  assert.equal(DEFAULT_SETTINGS.autoSend, true, 'Standard: automatisch senden, sobald Books verbunden ist');
  for (const bad of [{ timezone: 'Mond/Basis' }, { sendTime: '25:00' }, { refreshMinutes: '1' }, { booksUrl: 'ftp://x' }, { booksUrl: 'http://a:b@x' }, { keepDays: '0' }]) {
    assert.throws(() => cleanSettings({ ...base, ...bad }, cur));
  }
});
