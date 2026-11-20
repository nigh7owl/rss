import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBooks, sendAndLog } from '../src/books.js';
import { tempStore, testServer } from './helpers.js';

/** Nachbau der Quellen-Schnittstelle von Books (src/sources.js dort). */
function fakeBooks() {
  const files = new Map();
  return testServer((req, body) => {
    if (req.headers.authorization !== 'Bearer books_gut') return { status: 401, body: { error: 'Ungültiger oder fehlender Schlüssel.' } };
    if (req.method === 'GET' && req.url === '/api/sources') return { body: { name: 'RSS', kind: 'quelle', folder: 'RSS', user: 'anna' } };
    const m = req.url.match(/^\/api\/sources\/files\/(.+)$/);
    if (req.method === 'PUT' && m) {
      const rel = `RSS/${decodeURIComponent(m[1])}`;
      const existed = files.has(rel);
      const changed = files.get(rel) !== body;
      files.set(rel, body);
      return { status: existed ? 200 : 201, body: { rel, url: `/view/${encodeURI(rel)}`, changed } };
    }
    return { status: 404, body: { error: 'Nicht gefunden' } };
  }).then((srv) => Object.assign(srv, { files }));
}

test('Verbindung prüfen und Tag senden', async (t) => {
  const books = await fakeBooks();
  t.after(books.close);
  const store = await tempStore({ booksUrl: books.url, booksToken: 'books_gut' });
  store.feeds.push({ id: 'f', title: 'Feed' });
  store.addItems([{ id: '1', feed: 'f', title: 'Hallo', link: 'https://x.example/', summary: '', time: Date.parse('2026-11-20T10:00:00Z'), day: '2026-11-20' }]);

  assert.deepEqual(await checkBooks(store.settings), { name: 'RSS', kind: 'quelle', folder: 'RSS', user: 'anna' });

  const first = await sendAndLog(store, '2026-11-20');
  assert.equal(first.ok, true);
  assert.equal(first.changed, true);
  assert.equal(first.count, 1);
  assert.equal(first.rel, 'RSS/2026/11 November/2026-11-20 Tageszusammenfassung.md');
  assert.equal(first.href, `${books.url}/view/RSS/2026/11%20November/2026-11-20%20Tageszusammenfassung.md`);
  const put = books.requests.find((r) => r.method === 'PUT');
  assert.equal(put.url, '/api/sources/files/2026/11%20November/2026-11-20%20Tageszusammenfassung.md');
  assert.match(put.headers['content-type'], /^text\/markdown/);
  assert.match(books.files.get(first.rel), /daily: 2026-11-20[\s\S]*\[Hallo\]\(https:\/\/x\.example\/\)/);

  const again = await sendAndLog(store, '2026-11-20');
  assert.equal(again.changed, false, 'unverändert');
  assert.equal(store.sends['2026-11-20'].ok, true);
});

test('Fehler von Books landen im Protokoll', async (t) => {
  const books = await fakeBooks();
  t.after(books.close);
  const store = await tempStore({ booksUrl: books.url, booksToken: 'books_falsch' });
  await assert.rejects(sendAndLog(store, '2026-11-20'), /Ungültiger oder fehlender Schlüssel/);
  assert.equal(store.sends['2026-11-20'].ok, false);
  const missing = await tempStore();
  await assert.rejects(checkBooks(missing.settings), /Adresse von Books/);
  const offline = await tempStore({ booksUrl: 'http://127.0.0.1:9', booksToken: 'books_x' });
  await assert.rejects(checkBooks(offline.settings), /nicht erreichbar/);
});

test('Webclipper-Schlüssel wird abgelehnt', async (t) => {
  const srv = await testServer(() => ({ body: { name: 'Clip', kind: 'clipper', folder: 'Inbox', user: 'anna' } }));
  t.after(srv.close);
  const store = await tempStore({ booksUrl: srv.url, booksToken: 'books_x' });
  await assert.rejects(checkBooks(store.settings), /Webclipper/);
});
