import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { Service } from '../src/service.js';
import { dayOf } from '../src/days.js';
import { tempStore, testServer, RSS } from './helpers.js';

async function start(t, { password = '', settings = {} } = {}) {
  const store = await tempStore(settings);
  const service = new Service(store, { log: { info() {}, error() {} } });
  const app = createApp({ store, service, password });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (path, form, headers = {}) =>
    fetch(url + path, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(form) });
  return { store, url, post };
}

test('Startseite → heute; Tagesansicht mit Kopfzeile, Leerzustand und Sicherheitskopf', async (t) => {
  const { url, store } = await start(t);
  const res = await fetch(url, { redirect: 'manual' });
  const today = dayOf(Date.now(), store.settings.timezone);
  assert.equal(res.headers.get('location'), `/tag/${today}`);
  const page = await fetch(`${url}/tag/${today}`);
  const html = await page.text();
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(html, /class="topbar"/);
  assert.match(html, /Noch keine Feeds abonniert/);
  assert.match(html, /Noch nicht mit Books verbunden/);
  assert.equal((await fetch(`${url}/tag/2026-13-45`)).status, 404);
  assert.equal((await fetch(`${url}/static/style.css`)).status, 200);
  assert.deepEqual(await (await fetch(`${url}/health`)).json(), { status: 'ok' });
});

test('Feed abonnieren, Tag ansehen, Markdown herunterladen, abbestellen', async (t) => {
  const feed = await testServer(() => ({ headers: { 'Content-Type': 'application/rss+xml' }, body: RSS }));
  t.after(feed.close);
  const { url, post, store } = await start(t, { keepDays: 3650 });
  const res = await post('/feeds', { url: `${feed.url}/rss` });
  assert.equal(res.status, 302);
  assert.match(decodeURIComponent(res.headers.get('location')), /„Beispiel & Co“ abonniert/);
  const html = await (await fetch(`${url}/tag/2026-11-20`)).text();
  assert.match(html, /Erste Meldung/);
  assert.match(html, /Beispiel &amp; Co/);
  assert.match(html, /<title>20\.11\.2026 – RSS<\/title>/);
  const md = await fetch(`${url}/markdown/2026-11-20`);
  assert.match(md.headers.get('content-disposition'), /attachment/);
  assert.match(await md.text(), /## Beispiel & Co/);
  const bad = await post('/feeds', { url: 'keine adresse' });
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /http:\/\/ oder https:\/\//);
  const id = store.feeds[0].id;
  assert.equal((await post(`/feeds/${id}/entfernen`, {})).status, 302);
  assert.equal(store.feeds.length, 0);
  assert.equal(store.items.length, 0);
});

test('Senden über die Oberfläche und Einstellungen', async (t) => {
  const books = await testServer((req) => (req.method === 'GET'
    ? { body: { name: 'RSS', kind: 'quelle', folder: 'Nachrichten', user: 'anna' } }
    : { status: 201, body: { rel: 'Nachrichten/2026/2026-11-20 Tageszusammenfassung.md', url: '/view/x', changed: true } }));
  t.after(books.close);
  const { url, post, store } = await start(t);
  const form = { booksUrl: books.url, booksToken: 'books_abc', booksPath: '{jahr}/{datum} Tageszusammenfassung.md', booksDaily: '1', sendTime: '23:30', refreshMinutes: '30', keepDays: '60', title: 'Nachrichten', timezone: 'Europe/Berlin' };
  assert.equal((await post('/einstellungen', form)).status, 302);
  assert.equal(store.settings.booksToken, 'books_abc');
  assert.equal(store.settings.title, 'Nachrichten');
  const settings = await (await fetch(`${url}/einstellungen`)).text();
  assert.doesNotMatch(settings, /value="books_abc"/, 'Schlüssel nie im Formular');
  assert.match(await (await post('/einstellungen/pruefen', {})).text(), /Zielordner „Nachrichten“/);
  const sent = await post('/tag/2026-11-20/senden', {});
  assert.match(decodeURIComponent(sent.headers.get('location')), /An Books gesendet/);
  assert.match(await (await fetch(`${url}/tag/2026-11-20`)).text(), /Gesendet am/);
  const invalid = await post('/einstellungen', { ...form, sendTime: 'abends' });
  assert.equal(invalid.status, 422);
});

test('fremde Seiten dürfen nichts abschicken (CSRF)', async (t) => {
  const { post } = await start(t);
  assert.equal((await post('/abrufen', {}, { Origin: 'https://boese.example' })).status, 403);
  assert.equal((await post('/abrufen', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await post('/abrufen', { back: '//boese.example' })).headers.get('location').startsWith('/?'), true, 'kein Rücksprung nach außen');
});

test('Passwort per RSS_PASSWORD', async (t) => {
  const { url } = await start(t, { password: 'geheim' });
  assert.equal((await fetch(`${url}/feeds`)).status, 401);
  assert.equal((await fetch(`${url}/health`)).status, 200);
  const auth = { Authorization: `Basic ${Buffer.from('x:geheim').toString('base64')}` };
  assert.equal((await fetch(`${url}/feeds`, { headers: auth })).status, 200);
  assert.equal((await fetch(`${url}/feeds`, { headers: { Authorization: `Basic ${Buffer.from('x:falsch').toString('base64')}` } })).status, 401);
});
