// Feeds abrufen und lesen: RSS 2.0, RSS 1.0 (RDF) und Atom. Webseiten-Adressen werden über
// <link rel="alternate" type="application/rss+xml"> zum Feed aufgelöst.

import { XMLParser } from 'fast-xml-parser';
import { UserError, feedId, itemId } from './store.js';
import { dayOf } from './days.js';

export const USER_AGENT = 'rss/0.1 (kleiner Feed-Leser für Books)';
const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const EXCERPT_LEN = 220;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  htmlEntities: true,
  trimValues: true,
  isArray: (name) => ['item', 'entry', 'link'].includes(name),
});

// ------------------------------------------------------------------ Text

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü',
  szlig: 'ß', eacute: 'é', egrave: 'è', agrave: 'à', aacute: 'á', ccedil: 'ç', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', sbquo: '‚', euro: '€', copy: '©', reg: '®', trade: '™', middot: '·', bull: '•',
  deg: '°', times: '×', frac12: '½', thinsp: ' ', ensp: ' ', emsp: ' ', zwnj: '', zwj: '',
};

export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (all, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return NAMED[code] ?? all;
  });
}

/** HTML → einzeiliger Klartext. */
export function plainText(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, ' ')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Kurzer Auszug, an einer Wortgrenze gekürzt. */
export function excerpt(html, length = EXCERPT_LEN) {
  const text = plainText(html);
  if (text.length <= length) return text;
  const cut = text.slice(0, length);
  const space = cut.lastIndexOf(' ');
  return `${(space > length * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, '')} …`;
}

/** Wert eines XML-Knotens als Text (Atom: `<title type="html">` kommt als Objekt mit #text). */
function text(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === 'object') return text(value['#text']);
  return String(value);
}

// Zeitzonen-Kürzel, die Date.parse nicht kennt (RFC 822 erlaubt nur wenige)
const ZONES = { CET: '+0100', CEST: '+0200', MEZ: '+0100', MESZ: '+0200', WET: '+0000', WEST: '+0100', EET: '+0200', EEST: '+0300', BST: '+0100', UT: '+0000', Z: '+0000' };

/** Datum aus dem Feed → Millisekunden oder null. */
export function parseDate(value) {
  const raw = text(value).trim();
  if (!raw) return null;
  let ms = Date.parse(raw);
  if (Number.isNaN(ms)) {
    const fixed = raw.replace(/\b([A-Z]{1,4})$/, (z) => ZONES[z] ?? z);
    ms = Date.parse(fixed);
  }
  return Number.isNaN(ms) ? null : ms;
}

const httpUrl = (value, base) => {
  try {
    const url = new URL(String(value ?? '').trim(), base);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};

// ------------------------------------------------------------------ Lesen

/** Atom-Link: rel="alternate" (oder ohne rel), sonst der erste. */
function atomLink(links) {
  const list = (links ?? []).filter((l) => typeof l === 'object');
  const alt = list.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? list[0];
  return alt?.['@_href'] ?? '';
}

/** RSS-Link: der erste Text-Link (atom:link-Objekte überspringen). */
function rssLink(links) {
  for (const l of links ?? []) {
    if (typeof l === 'string' || typeof l === 'number') return String(l);
    if (l?.['#text']) return l['#text'];
    if (l?.['@_href'] && !l['@_rel']) return l['@_href'];
  }
  return '';
}

/**
 * Feed-XML lesen → { title, site, items: [{ key, title, link, date, summary }] }.
 * Wirft UserError, wenn es kein Feed ist. `base` löst relative Links auf.
 */
export function parseFeed(xml, base = undefined) {
  let doc;
  try {
    doc = parser.parse(String(xml));
  } catch (err) {
    throw new UserError(`Kein gültiges XML: ${err.message}`);
  }
  const entries = [];
  let title = '';
  let site = '';
  if (doc.rss?.channel || doc['rdf:RDF']) {
    const root = doc.rss?.channel ?? doc['rdf:RDF'];
    const channel = doc.rss?.channel ?? doc['rdf:RDF'].channel ?? {};
    title = text(channel.title);
    site = rssLink(channel.link);
    const items = root.item ?? (doc['rdf:RDF']?.item) ?? [];
    for (const item of items) {
      const link = rssLink(item.link) || (item.guid?.['@_isPermaLink'] !== 'false' && /^https?:/.test(text(item.guid)) ? text(item.guid) : '');
      entries.push({
        key: text(item.guid) || item['@_rdf:about'] || link,
        title: text(item.title),
        link,
        dateRaw: text(item.pubDate || item['dc:date'] || item.date || item.updated),
        summary: text(item.description) || text(item['content:encoded']),
      });
    }
  } else if (doc.feed) {
    const feed = doc.feed;
    title = text(feed.title);
    site = atomLink(feed.link);
    for (const entry of feed.entry ?? []) {
      const link = atomLink(entry.link);
      entries.push({
        key: text(entry.id) || link,
        title: text(entry.title),
        link,
        dateRaw: text(entry.published || entry.updated || entry.issued || entry.modified),
        summary: text(entry.summary) || text(entry.content),
      });
    }
  } else {
    throw new UserError('Das ist kein RSS- oder Atom-Feed.');
  }
  const siteUrl = httpUrl(site, base);
  return {
    title: plainText(title),
    site: siteUrl,
    items: entries.map((e) => {
      const itemTitle = plainText(e.title);
      const link = httpUrl(e.link, siteUrl || base);
      return {
        key: e.key || `${itemTitle}|${e.dateRaw}`,
        title: itemTitle,
        link,
        date: parseDate(e.dateRaw),
        summary: excerpt(e.summary),
      };
    }).filter((e) => e.title || e.link),
  };
}

/** Feed-Adressen einer HTML-Seite (<link rel="alternate" type="application/rss+xml|atom+xml">). */
export function discoverFeeds(html, base) {
  const found = [];
  for (const tag of String(html).match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(2).find((v) => v !== undefined) ?? '';
    if (!/\balternate\b/i.test(attr('rel'))) continue;
    if (!/application\/(rss|atom|rdf)\+xml/i.test(attr('type'))) continue;
    const url = httpUrl(decodeEntities(attr('href')), base);
    if (url && !found.includes(url)) found.push(url);
  }
  return found;
}

// ------------------------------------------------------------------ Abrufen

/** Lädt eine Adresse; `cache` (etag, lastModified) für bedingte Anfragen. */
export async function download(url, { cache = {}, fetchImpl = fetch } = {}) {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/rss+xml, application/atom+xml, application/rdf+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.5',
  };
  if (cache.etag) headers['If-None-Match'] = cache.etag;
  if (cache.lastModified) headers['If-Modified-Since'] = cache.lastModified;
  let res;
  try {
    res = await fetchImpl(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'Zeitüberschreitung' : err.cause?.code ?? err.message;
    throw new UserError(`Nicht erreichbar (${reason}).`, 502);
  }
  if (res.status === 304) return { notModified: true };
  if (!res.ok) throw new UserError(`Der Server antwortet mit ${res.status} ${res.statusText}.`, 502);
  if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new UserError('Der Feed ist größer als 10 MB.', 413);
  const body = await res.text();
  if (Buffer.byteLength(body) > MAX_BYTES) throw new UserError('Der Feed ist größer als 10 MB.', 413);
  return {
    body,
    url: res.url || url,
    type: res.headers.get('content-type') ?? '',
    etag: res.headers.get('etag') ?? '',
    lastModified: res.headers.get('last-modified') ?? '',
  };
}

/**
 * Feed zu einer Adresse finden: direkt ein Feed oder eine Webseite, die auf einen verweist.
 * Gibt { url, parsed, response } zurück.
 */
export async function resolveFeed(input, { fetchImpl = fetch } = {}) {
  const url = httpUrl(input);
  if (!url) throw new UserError('Bitte eine Adresse mit http:// oder https:// angeben.');
  const response = await download(url, { fetchImpl });
  const looksHtml = /html/i.test(response.type) || /^\s*<!doctype html|^\s*<html/i.test(response.body);
  if (!looksHtml) return { url: response.url, parsed: parseFeed(response.body, response.url), response };
  const [found] = discoverFeeds(response.body, response.url);
  if (!found) throw new UserError('Auf dieser Seite wurde kein RSS- oder Atom-Feed gefunden.');
  const feedResponse = await download(found, { fetchImpl });
  return { url: feedResponse.url, parsed: parseFeed(feedResponse.body, feedResponse.url), response: feedResponse };
}

/**
 * Gelesene Einträge → Meldungen für den Speicher. Einträge ohne Datum zählen zum Zeitpunkt, an dem sie zuerst
 * gesehen werden; Daten in der Zukunft werden auf jetzt gesetzt.
 */
export function toItems(feed, parsed, { now = Date.now(), tz }) {
  return parsed.items.map((e) => {
    const time = e.date && e.date <= now + 10 * 60_000 ? e.date : now;
    return {
      id: itemId(feed.id, e.key),
      feed: feed.id,
      title: e.title || e.link,
      link: e.link,
      summary: e.summary,
      time,
      day: dayOf(time, tz),
      dated: Boolean(e.date),
      seen: now,
    };
  });
}

/** Neuer Feed-Eintrag für den Speicher. */
export function newFeed(url, parsed, response, now = Date.now()) {
  return {
    id: feedId(url),
    url,
    title: parsed.title || new URL(url).hostname,
    site: parsed.site,
    added: now,
    lastFetch: now,
    lastOk: now,
    error: '',
    etag: response.etag ?? '',
    lastModified: response.lastModified ?? '',
  };
}
