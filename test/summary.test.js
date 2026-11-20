import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summaryMarkdown, summaryPath, mdEscape, mdUrl } from '../src/summary.js';
import { checkBooksPath, DEFAULT_SETTINGS } from '../src/store.js';

const feeds = [
  { id: 'b', title: 'Zeitung' },
  { id: 'a', title: 'blog' },
];
const at = (iso) => Date.parse(iso);
const items = [
  { feed: 'b', title: 'Wahl: #1 [Ergebnis] $5', link: 'https://z.example/a b(1)', summary: '- Kein Listenpunkt', time: at('2026-11-20T07:00:00Z'), day: '2026-11-20' },
  { feed: 'a', title: 'Eintrag', link: '', summary: '', time: at('2026-11-20T09:30:00Z'), day: '2026-11-20' },
  { feed: 'x', title: 'Feed entfernt', link: '', summary: '', time: at('2026-11-20T09:30:00Z'), day: '2026-11-20' },
];
const settings = { timezone: 'Europe/Berlin', booksDaily: true, booksExcerpts: true };

test('Markdown der Tageszusammenfassung', () => {
  const md = summaryMarkdown('2026-11-20', items, feeds, settings, { appUrl: 'http://nas:3001' });
  assert.equal(md, `---
title: "Freitag, 20. November 2026"
order: 20
daily: 2026-11-20
tags:
  - rss
meldungen: 2
feeds: 2
source_url: "http://nas:3001/tag/2026-11-20"
---

2 Meldungen aus 2 Feeds

## blog

- 10:30 · Eintrag

## Zeitung

- 08:00 · [Wahl: \\#1 \\[Ergebnis\\] \\$5](https://z.example/a%20b%281%29)
  \\- Kein Listenpunkt
`);
});

test('ohne Tagebuch und Kurztexte; leerer Tag', () => {
  const md = summaryMarkdown('2026-11-20', items, feeds, { ...settings, booksDaily: false, booksExcerpts: false });
  assert.doesNotMatch(md, /daily:|Listenpunkt/);
  assert.match(md, /^order: 20$/m, 'order sortiert die Tage im Monatskapitel, auch ohne Tagebuch');
  assert.match(summaryMarkdown('2026-11-03', [], feeds, settings), /^order: 3$/m);
  const empty = summaryMarkdown('2026-11-21', [], feeds, settings);
  assert.match(empty, /0 Meldungen aus 0 Feeds/);
  assert.match(empty, /keine Meldungen/);
});

test('Escaping und Pfade', () => {
  assert.equal(mdEscape('a_b *c* ==d== %%e%% <f>'), 'a\\_b \\*c\\* =\\=d=\\= %\\%e%\\% \\<f\\>');
  assert.equal(mdUrl('https://x/a (b)'), 'https://x/a%20%28b%29');
  assert.equal(summaryPath('{jahr}/{monat}/{datum} RSS.md', '2026-11-20'), '2026/11/2026-11-20 RSS.md');
  assert.equal(summaryPath(DEFAULT_SETTINGS.booksPath, '2026-03-05'), '2026/03 März/2026-03-05 Tageszusammenfassung.md');
  assert.equal(checkBooksPath('/{jahr}/{datum}.md'), '{jahr}/{datum}.md');
  for (const bad of ['', 'a.txt', 'fest.md', '../{datum}.md', '.x/{datum}.md', 'a//{datum}.md']) assert.throws(() => checkBooksPath(bad));
});
