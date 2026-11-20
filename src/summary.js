// Tageszusammenfassung als Markdown für Books: alle Meldungen eines Tages, nach Feed gruppiert.
//
// Frontmatter: `title`, auf Wunsch `daily` (Books bettet die Seite dann in die tägliche Notiz ein, siehe
// „Quellen im Tagebuch“ in Books) mit `order`, dazu `tags`, `meldungen` und `feeds`. `source` und
// `source_updated` ergänzt Books selbst.

import { germanDay, longDay, timeOf } from './days.js';

/** Reihenfolge in der täglichen Notiz von Books (trailuma belegt 1–4). */
export const DAILY_ORDER = 20;

/**
 * Text für Markdown entschärfen – auch Obsidian-Syntax, die Books versteht: #tags, [[Links]], $Formeln$,
 * ==Hervorhebung==, %%Kommentare%%.
 */
export function mdEscape(value) {
  return String(value ?? '')
    .replace(/[\\`*_[\]<>|$~]/g, '\\$&')
    .replace(/(^|\s)#/g, '$1\\#')
    .replace(/==/g, '=\\=')
    .replace(/%%/g, '%\\%')
    .replace(/^(\s*)([-+]|\d+[.)])(\s)/, '$1\\$2$3');
}

/** Adresse für einen Markdown-Link: Leerzeichen und Klammern kodieren. */
export const mdUrl = (url) => String(url).replace(/[\s()<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);

/** YAML-Wert in doppelten Anführungszeichen. */
const yamlString = (value) => JSON.stringify(String(value));

/** Pfad der Zusammenfassung in Books: {jahr}, {monat}, {tag}, {datum} im Muster ersetzen. */
export function summaryPath(pattern, day) {
  const [jahr, monat, tag] = day.split('-');
  return pattern.replaceAll('{jahr}', jahr).replaceAll('{monat}', monat).replaceAll('{tag}', tag).replaceAll('{datum}', day);
}

/** Meldungen nach Feed gruppieren: [{ feed, items }], Feeds alphabetisch. */
export function groupByFeed(items, feeds) {
  const byId = new Map(feeds.map((f) => [f.id, f]));
  const groups = new Map();
  for (const item of items) {
    const feed = byId.get(item.feed);
    if (!feed) continue;
    if (!groups.has(feed.id)) groups.set(feed.id, { feed, items: [] });
    groups.get(feed.id).items.push(item);
  }
  return [...groups.values()].sort((a, b) => a.feed.title.localeCompare(b.feed.title, 'de', { sensitivity: 'base' }));
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Markdown der Zusammenfassung eines Tages.
 * `settings`: timezone, booksDaily, booksExcerpts. `appUrl` (optional) wird als source_url eingetragen.
 */
export function summaryMarkdown(day, items, feeds, settings, { appUrl = '' } = {}) {
  const groups = groupByFeed(items, feeds);
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  const front = ['---', `title: ${yamlString(`Tageszusammenfassung ${germanDay(day)}`)}`];
  if (settings.booksDaily) front.push(`daily: ${day}`, `order: ${DAILY_ORDER}`);
  front.push('tags:', '  - rss', `meldungen: ${count}`, `feeds: ${groups.length}`);
  if (appUrl) front.push(`source_url: ${yamlString(`${appUrl}/tag/${day}`)}`);
  front.push('---', '');

  const lines = [...front];
  lines.push(`${longDay(day)} · ${plural(count, 'Meldung', 'Meldungen')} aus ${plural(groups.length, 'Feed', 'Feeds')}`, '');
  if (!count) {
    lines.push('*An diesem Tag gab es keine Meldungen.*', '');
    return lines.join('\n');
  }
  for (const { feed, items: list } of groups) {
    lines.push(`## ${mdEscape(feed.title)}`, '');
    for (const item of list) {
      const title = mdEscape(item.title);
      const linked = item.link ? `[${title}](${mdUrl(item.link)})` : title;
      lines.push(`- ${timeOf(item.time, settings.timezone)} · ${linked}`);
      if (settings.booksExcerpts && item.summary && item.summary !== item.title) lines.push(`  ${mdEscape(item.summary)}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
