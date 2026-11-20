import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Store } from '../src/store.js';

export async function tempStore(settings = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rss-test-'));
  const store = await new Store(dir).load();
  store.settings = { ...store.settings, timezone: 'Europe/Berlin', ...settings };
  return store;
}

/** Kleiner HTTP-Server für Tests; `handler(req, body)` gibt { status, headers, body } zurück. */
export async function testServer(handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString('utf8');
    requests.push({ method: req.method, url: req.url, headers: req.headers, body });
    const r = await handler(req, body);
    res.writeHead(r.status ?? 200, r.headers ?? { 'Content-Type': 'application/json' });
    res.end(typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {}));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

export const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>Beispiel &amp; Co</title>
  <link>https://example.org/</link>
  <atom:link href="https://example.org/feed.xml" rel="self" type="application/rss+xml"/>
  <item>
    <title>Erste Meldung</title>
    <link>https://example.org/1</link>
    <guid isPermaLink="false">id-1</guid>
    <pubDate>Fri, 20 Nov 2026 08:15:00 +0100</pubDate>
    <description><![CDATA[<p>Ein <b>kurzer</b> Text &auml;hnlich &amp; gut.</p>]]></description>
  </item>
  <item>
    <title>Zweite #1 [Meldung]</title>
    <link>/2</link>
    <pubDate>Thu, 19 Nov 2026 23:30:00 CET</pubDate>
  </item>
  <item>
    <title>Spät am Abend</title>
    <link>https://example.org/3</link>
    <pubDate>Fri, 20 Nov 2026 23:10:00 GMT</pubDate>
  </item>
</channel>
</rss>`;

export const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="html">Atom &amp;amp; &lt;b&gt;Blog&lt;/b&gt;</title>
  <link href="https://blog.example/" rel="alternate"/>
  <link href="https://blog.example/atom.xml" rel="self"/>
  <entry>
    <id>tag:blog.example,2026:1</id>
    <title>Hallo Atom</title>
    <link href="https://blog.example/hallo" rel="alternate"/>
    <updated>2026-11-20T10:00:00Z</updated>
    <summary>Zusammenfassung</summary>
  </entry>
</feed>`;

export const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://rdf.example/"><title>RDF-Feed</title><link>https://rdf.example/</link></channel>
  <item rdf:about="https://rdf.example/a"><title>RDF-Eintrag</title><link>https://rdf.example/a</link><dc:date>2026-11-20T09:00:00+01:00</dc:date></item>
</rdf:RDF>`;
