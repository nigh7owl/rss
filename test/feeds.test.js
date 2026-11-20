import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, discoverFeeds, parseDate, excerpt, toItems, resolveFeed } from '../src/feeds.js';
import { RSS, ATOM, RDF, testServer } from './helpers.js';

test('RSS 2.0: Titel, Links, Daten und Kurztext', () => {
  const feed = parseFeed(RSS, 'https://example.org/feed.xml');
  assert.equal(feed.title, 'Beispiel & Co');
  assert.equal(feed.site, 'https://example.org/');
  assert.equal(feed.items.length, 3);
  const [a, b] = feed.items;
  assert.equal(a.key, 'id-1');
  assert.equal(a.link, 'https://example.org/1');
  assert.equal(a.date, Date.parse('2026-11-20T07:15:00Z'));
  assert.equal(a.summary, 'Ein kurzer Text ähnlich & gut.');
  assert.equal(b.link, 'https://example.org/2', 'relative Links gegen die Webseite auflösen');
  assert.equal(b.date, Date.parse('2026-11-19T22:30:00Z'), 'CET wird verstanden');
  assert.equal(b.key, '/2', 'ohne guid zählt der Link');
});

test('Atom und RDF', () => {
  const atom = parseFeed(ATOM);
  assert.equal(atom.title, 'Atom & Blog');
  assert.equal(atom.site, 'https://blog.example/');
  assert.deepEqual(atom.items.map((i) => [i.key, i.title, i.link]), [['tag:blog.example,2026:1', 'Hallo Atom', 'https://blog.example/hallo']]);
  const rdf = parseFeed(RDF);
  assert.equal(rdf.title, 'RDF-Feed');
  assert.equal(rdf.items[0].title, 'RDF-Eintrag');
  assert.equal(rdf.items[0].date, Date.parse('2026-11-20T08:00:00Z'));
});

test('kein Feed → verständlicher Fehler', () => {
  assert.throws(() => parseFeed('<html><body>Hallo</body></html>'), /kein RSS- oder Atom-Feed/);
});

test('Datum, Auszug, Feed-Suche in HTML', () => {
  assert.equal(parseDate('Fri, 20 Nov 2026 08:15:00 MESZ'), Date.parse('2026-11-20T06:15:00Z'));
  assert.equal(parseDate('gestern'), null);
  assert.equal(excerpt('<p>' + 'Wort '.repeat(100) + '</p>').length <= 222, true);
  assert.match(excerpt('<p>' + 'Wort '.repeat(100) + '</p>'), / …$/);
  const html = `<head><link rel="stylesheet" href="/a.css"><link rel="alternate" type="application/rss+xml" title="Feed" href="/feed.xml?a=1&amp;b=2"><link rel='alternate' type='application/atom+xml' href='https://x.example/atom'></head>`;
  assert.deepEqual(discoverFeeds(html, 'https://site.example/blog/'), ['https://site.example/feed.xml?a=1&b=2', 'https://x.example/atom']);
});

test('Meldungen: Tag in der Zeitzone, ohne Datum = jetzt, Zukunft = jetzt', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const parsed = parseFeed(RSS);
  parsed.items.push({ key: 'x', title: 'Ohne Datum', link: '', date: null, summary: '' });
  const items = toItems({ id: 'f1' }, parsed, { now, tz: 'Europe/Berlin' });
  assert.deepEqual(items.map((i) => i.day), ['2026-11-20', '2026-11-19', '2026-11-20', '2026-11-20']);
  assert.equal(items[2].time, now, '23:10 GMT liegt in der Zukunft');
  assert.equal(items[3].dated, false);
  assert.equal(new Set(items.map((i) => i.id)).size, 4);
});

test('Webseite mit Verweis auf den Feed wird aufgelöst', async (t) => {
  const srv = await testServer((req) => req.url === '/'
    ? { headers: { 'Content-Type': 'text/html' }, body: '<html><head><link rel="alternate" type="application/rss+xml" href="/feed"></head></html>' }
    : { headers: { 'Content-Type': 'application/rss+xml' }, body: RSS });
  t.after(srv.close);
  const r = await resolveFeed(`${srv.url}/`);
  assert.equal(r.url, `${srv.url}/feed`);
  assert.equal(r.parsed.title, 'Beispiel & Co');
  await assert.rejects(resolveFeed('ftp://x'), /http/);
});
