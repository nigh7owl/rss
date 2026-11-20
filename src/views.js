// HTML-Ansichten im Stil „Schlicht“ von Books: Kopfzeile, weiße Inhaltskarte, Seitenkopf, Kästen und Zeilen.
// Jeder fremde Text läuft durch h(); Skripte kommen nur aus /static (Content-Security-Policy in src/app.js).

import { createRequire } from 'node:module';
import { addDays, longDay, relativeDay, stamp, timeOf, germanDay } from './days.js';
import { groupByFeed } from './summary.js';

const { version: APP_VERSION } = createRequire(import.meta.url)('../package.json');
export { APP_VERSION };

export const h = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Logofarbe wie in Books (--logo in public/style.css)
export const LOGO_COLOR = '#37352f';

/** App-Symbol: RSS-Zeichen auf einer Kachel – dieselbe Kachel wie bei Books, Trailuma und Therapie-Planer. */
export function logoSvg(color = null) {
  const fill = color ? ` fill="${color}"` : '';
  return `<svg ${color ? 'xmlns="http://www.w3.org/2000/svg"' : 'class="logo" aria-hidden="true"'} viewBox="0 0 512 512"><rect class="logo-tile" width="512" height="512" rx="112"${fill}/><circle cx="156" cy="356" r="36" fill="#fff"/><path d="M156 236a120 120 0 0 1 120 120M156 136a220 220 0 0 1 220 220" fill="none" stroke="#fff" stroke-width="42" stroke-linecap="round"/></svg>`;
}
const FAVICON_HREF = `data:image/svg+xml,${encodeURIComponent(logoSvg(LOGO_COLOR))}`;

const ICON_PATHS = {
  rss: '<path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M10.9 12.1 21 2M15 8l3 3M18 5l3 3"/>',
  palette: '<path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4.5 4H15a2 2 0 0 0-1.5 3.3A1.6 1.6 0 0 1 12 22z"/><circle cx="7.5" cy="10.5" r="1.2"/><circle cx="12" cy="7" r="1.2"/><circle cx="16.5" cy="10.5" r="1.2"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
};

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] ?? ''}</svg>`;
}

/** Baustein „Seitenkopf“: Titel, darunter die graue Metazeile; rechts optional Knöpfe. */
const pageHead = ({ title, meta = '', actions = '' }) => `<div class="page-header"><div>
    <h1>${title}</h1>
    ${meta ? `<p class="muted">${meta}</p>` : ''}
  </div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;

/** Baustein „Leerzustand“: eine stille Zeile im Rahmen, mit Symbol. */
const emptyNote = (html, ico = 'check') => `<div class="empty">${icon(ico)}<p>${html}</p></div>`;

/** Rückmeldung nach einer Aktion (aus ?meldung=…&art=warnung). */
const flash = (msg) => (msg?.text ? `<div class="flash${msg.kind === 'warnung' ? ' warning' : ''}" role="status">${h(msg.text)}</div>` : '');

/** Knopf als kleines POST-Formular. */
const postButton = (action, label, { cls = 'btn', ico = '', back = '', title = '' } = {}) =>
  `<form class="inline-form" method="post" action="${h(action)}">${back ? `<input type="hidden" name="back" value="${h(back)}">` : ''}<button class="${cls}" type="submit"${title ? ` title="${h(title)}"` : ''}>${ico ? icon(ico) : ''}<span>${label}</span></button></form>`;

// ------------------------------------------------------------------ Grundgerüst

export function layout(ctx, { title, body, left = '', right = '', active = '' }) {
  const { settings } = ctx;
  const tri = Boolean(left || right);
  const nav = (href, key, ico, label) => `<a href="${href}"${active === key ? ' class="current" aria-current="page"' : ''} title="${label}">${icon(ico)}<span>${label}</span></a>`;
  return `<!doctype html>
<html lang="de" data-version="${h(APP_VERSION)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(title ? `${title} – ${settings.title}` : settings.title)}</title>
<script src="/static/theme.js"></script>
<link rel="stylesheet" href="/static/style.css?v=${h(APP_VERSION)}">
<link rel="icon" href="${FAVICON_HREF}">
</head>
<body>
<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="/">${logoSvg()}<span>${h(settings.title)}</span></a>
    <nav class="topnav">
      ${nav('/', 'tag', 'calendar', 'Tage')}
      ${nav('/feeds', 'feeds', 'rss', 'Feeds')}
      ${nav('/einstellungen', 'einstellungen', 'settings', 'Einstellungen')}
      <button class="mode-toggle" type="button" data-mode-toggle title="Hell, Dunkel oder Automatisch" aria-label="Hell, Dunkel oder Automatisch">${icon('palette')}</button>
    </nav>
  </div>
</header>
<div class="layout${tri ? ' tri' : ''}">
  ${tri ? `<aside class="sidebar sidebar-left">${left}</aside>` : ''}
  <main class="content">${body}</main>
  ${tri ? `<aside class="sidebar sidebar-right">${right}</aside>` : ''}
</div>
<script src="/static/app.js" defer></script>
</body>
</html>`;
}

// ------------------------------------------------------------------ Tage

/** Linke Leiste: die letzten Tage mit Meldungen (heute immer). */
function dayList(ctx, current) {
  const { counts, today } = ctx;
  const days = [...new Set([today, ...Object.keys(counts)])].sort().reverse().slice(0, 21);
  if (!days.includes(current)) days.push(current);
  const rows = days
    .sort()
    .reverse()
    .map((d) => `<li><a href="/tag/${d}"${d === current ? ' class="current" aria-current="page"' : ''}><span class="toc-t">${h(relativeDay(d, today))}</span><span class="toc-sub-count">${counts[d] ?? 0}</span></a></li>`)
    .join('');
  return `<nav class="toc-box" aria-label="Tage"><div class="toc-head">${icon('calendar')}<strong>Tage</strong><span class="toc-count">${Object.keys(counts).length}</span></div><ol>${rows}</ol></nav>`;
}

/** Rechte Leiste: Aktionen und Stand der Lieferung an Books. */
function dayActions(ctx, day) {
  const { settings, store } = ctx;
  const sent = store.sends[day];
  const connected = Boolean(settings.booksUrl && settings.booksToken);
  let status;
  if (!connected) status = `<p>${icon('info')}<span>Noch nicht mit Books verbunden – <a href="/einstellungen">Einstellungen</a>.</span></p>`;
  else if (!sent) status = `<p>${icon('clock')}<span>Für diesen Tag noch nicht gesendet.</span></p>`;
  else if (!sent.ok) status = `<p class="warn">${icon('warning')}<span>Fehler am ${h(stamp(sent.at, settings.timezone))}: ${h(sent.error)}</span></p>`;
  else {
    status = `<p>${icon('check')}<span>Gesendet am ${h(stamp(sent.at, settings.timezone))} · ${h(plural(sent.count, 'Meldung', 'Meldungen'))}${sent.changed ? '' : ' · unverändert'}</span></p>
      ${sent.href ? `<p>${icon('external')}<a href="${h(sent.href)}" target="_blank" rel="noopener">In Books öffnen</a></p>` : ''}`;
  }
  const auto = connected && settings.autoSend ? `<p>${icon('clock')}<span>Automatisch täglich um ${h(settings.sendTime)} Uhr</span></p>` : '';
  return `<div class="panel actions-panel">
    <h4>Aktionen</h4>
    <div class="actions">
      ${connected ? postButton(`/tag/${day}/senden`, 'An Books senden', { cls: 'btn primary', ico: 'send' }) : ''}
      <a class="btn" href="/markdown/${day}" download>${icon('download')}<span>Markdown herunterladen</span></a>
    </div>
    <div class="actions">
      ${postButton('/abrufen', 'Feeds jetzt abrufen', { ico: 'refresh', back: `/tag/${day}` })}
    </div>
  </div>
  <div class="panel books-panel">
    <h4>${icon('book')}Books</h4>
    ${status}${auto}
  </div>`;
}

export function dayView(ctx, day, { markdown, msg }) {
  const { store, settings, today } = ctx;
  const items = store.itemsOfDay(day);
  const groups = groupByFeed(items, store.feeds);
  const tz = settings.timezone;
  const prev = addDays(day, -1);
  const next = addDays(day, 1);
  const nav = `<a class="btn" href="/tag/${prev}" title="Vortag">${icon('chevron-left')}<span class="sr">Vortag</span></a>${
    day < today ? `<a class="btn" href="/tag/${next}" title="Folgetag">${icon('chevron')}<span class="sr">Folgetag</span></a>` : ''}${
    day !== today ? `<a class="btn" href="/tag/${today}">Heute</a>` : ''}`;
  const last = store.state.lastRefresh ? ` · abgerufen ${h(stamp(store.state.lastRefresh, tz))}` : '';
  let content;
  if (!store.feeds.length) content = emptyNote('Noch keine Feeds abonniert – <a href="/feeds">Feed hinzufügen</a>.', 'rss');
  else if (!groups.length) content = emptyNote('An diesem Tag gibt es keine Meldungen.', 'check');
  else {
    content = groups
      .map(({ feed, items: list }) => {
        const rows = list
          .map((i) => {
            const title = `<span class="item-time">${h(timeOf(i.time, tz))}</span><span class="item-t">${h(i.title)}</span>`;
            const sum = i.summary && i.summary !== i.title ? `<span class="item-sum">${h(i.summary)}</span>` : '';
            return `<li>${i.link ? `<a href="${h(i.link)}" target="_blank" rel="noopener noreferrer">` : '<span class="item-row">'}<span class="item-line">${title}</span>${sum}${i.link ? '</a>' : '</span>'}</li>`;
          })
          .join('');
        const head = `${icon('rss')}<strong>${h(feed.title)}</strong><span class="toc-count">${list.length}</span>`;
        return `<section class="toc-box feed-box">${feed.site ? `<a class="toc-head" href="${h(feed.site)}" target="_blank" rel="noopener noreferrer">${head}</a>` : `<div class="toc-head">${head}</div>`}<ol>${rows}</ol></section>`;
      })
      .join('');
  }
  const preview = store.feeds.length
    ? `<details class="md-preview"><summary>Markdown für Books ansehen</summary><pre>${h(markdown)}</pre></details>`
    : '';
  const body = `${flash(msg)}
  ${pageHead({ title: h(longDay(day)), meta: `${h(plural(items.length, 'Meldung', 'Meldungen'))} · ${h(plural(groups.length, 'Feed', 'Feeds'))}${last}`, actions: nav })}
  ${content}
  ${preview}`;
  return layout(ctx, { title: germanDay(day), body, left: dayList(ctx, day), right: dayActions(ctx, day), active: 'tag' });
}

// ------------------------------------------------------------------ Feeds

export function feedsView(ctx, { msg, value = '' }) {
  const { store, settings } = ctx;
  const tz = settings.timezone;
  const counts = {};
  for (const i of store.items) counts[i.feed] = (counts[i.feed] ?? 0) + 1;
  const feeds = [...store.feeds].sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }));
  const rows = feeds
    .map((f) => `<li class="feed-row">
      <div class="feed-main">${icon(f.error ? 'warning' : 'rss')}<div>
        <strong>${f.site ? `<a href="${h(f.site)}" target="_blank" rel="noopener noreferrer">${h(f.title)}</a>` : h(f.title)}</strong>
        <span class="muted small feed-url">${h(f.url)}</span>
        ${f.error ? `<span class="small warn">Letzter Abruf ${h(stamp(f.lastFetch, tz))}: ${h(f.error)}</span>` : `<span class="muted small">${h(plural(counts[f.id] ?? 0, 'Meldung', 'Meldungen'))} · abgerufen ${h(stamp(f.lastOk, tz))}</span>`}
      </div></div>
      ${postButton(`/feeds/${f.id}/entfernen`, 'Entfernen', { cls: 'btn small danger-text', ico: 'trash', title: `„${f.title}“ abbestellen und seine Meldungen löschen` })}
    </li>`)
    .join('');
  const list = feeds.length
    ? `<section class="toc-box"><div class="toc-head">${icon('rss')}<strong>Abonniert</strong><span class="toc-count">${feeds.length}</span></div><ul class="feed-list">${rows}</ul></section>`
    : emptyNote('Noch keine Feeds. Trage oben die Adresse eines Feeds oder einer Webseite ein.', 'rss');
  const body = `${flash(msg)}
  ${pageHead({
    title: 'Feeds',
    meta: `${h(plural(feeds.length, 'Feed', 'Feeds'))} · ${h(plural(store.items.length, 'Meldung', 'Meldungen'))} · alle ${h(settings.refreshMinutes)} Minuten abgerufen`,
    actions: feeds.length ? postButton('/abrufen', 'Jetzt abrufen', { ico: 'refresh', back: '/feeds' }) : '',
  })}
  <form class="add-feed" method="post" action="/feeds">
    <label for="feed-url" class="sr">Adresse des Feeds oder der Webseite</label>
    <input id="feed-url" type="url" name="url" value="${h(value)}" placeholder="https://… (Feed oder Webseite)" required autocomplete="off">
    <button class="btn primary" type="submit">${icon('plus')}<span>Hinzufügen</span></button>
  </form>
  ${list}`;
  return layout(ctx, { title: 'Feeds', body, active: 'feeds' });
}

// ------------------------------------------------------------------ Einstellungen

const field = (name, label, value, { type = 'text', hint = '', attrs = '' } = {}) =>
  `<label for="f-${name}">${label}</label><input id="f-${name}" type="${type}" name="${name}" value="${h(value)}" ${attrs}>${hint ? `<p class="hint">${hint}</p>` : ''}`;
const check = (name, label, on, hint = '') =>
  `<label class="check"><input type="checkbox" name="${name}" value="1"${on ? ' checked' : ''}><span>${label}</span></label>${hint ? `<p class="hint">${hint}</p>` : ''}`;

export function settingsView(ctx, { msg, info = null }) {
  const s = ctx.settings;
  const tokenHint = s.booksToken
    ? `Gespeichert (<code>${h(s.booksToken.slice(0, 10))}…</code>). Leer lassen, um ihn zu behalten.`
    : 'In Books unter <em>Konto → Quellen und Webclipper</em> eine <strong>Quelle</strong> anlegen (z. B. „RSS“) und den Schlüssel hier eintragen.';
  const connection = info
    ? `<div class="flash" role="status">Verbunden mit Books: Quelle „${h(info.name)}“ von ${h(info.user)}, Zielordner „${h(info.folder)}“.</div>`
    : '';
  const body = `<div class="form-card settings">
  <h1>${icon('settings')}Einstellungen</h1>
  ${flash(msg)}${connection}
  <form method="post" action="/einstellungen">
    <h2>${icon('book')}Books</h2>
    <p class="settings-info">${icon('info')}<span>Die Zusammenfassung geht über die Schnittstelle „Quellen und Webclipper“ von Books an den Zielordner der Quelle. Books speichert nur, wenn sich etwas geändert hat; der vorige Stand bleibt im Versionsverlauf. Mit „Im Tagebuch einbetten“ erscheint sie in der täglichen Notiz (braucht in Books „Quellen im Tagebuch“).</span></p>
    ${field('booksUrl', 'Adresse von Books', s.booksUrl, { type: 'url', attrs: 'placeholder="http://nas:3000"', hint: 'Ohne HTTPS geht der Schlüssel im Klartext über das Netz.' })}
    ${field('booksToken', 'Schlüssel der Quelle', '', { type: 'password', attrs: `autocomplete="new-password" placeholder="${s.booksToken ? '••••••••' : 'books_…'}"`, hint: tokenHint })}
    ${s.booksToken ? check('removeToken', 'Schlüssel entfernen') : ''}
    ${field('booksPath', 'Pfad im Zielordner', s.booksPath, { hint: 'Platzhalter: <code>{jahr}</code>, <code>{monat}</code> (11), <code>{monatsname}</code> (November), <code>{tag}</code>, <code>{datum}</code> (JJJJ-MM-TT). Standard: im Regal der Quelle ein Buch je Jahr, darin ein Kapitel je Monat und eine Seite je Tag.' })}
    ${check('booksDaily', 'Im Tagebuch von Books einbetten', s.booksDaily, 'Setzt <code>daily: JJJJ-MM-TT</code> im Frontmatter.')}
    ${check('booksExcerpts', 'Kurztext unter jeder Meldung', s.booksExcerpts)}
    ${field('appUrl', 'Eigene Adresse (optional)', s.appUrl, { type: 'url', attrs: 'placeholder="http://nas:3001"', hint: 'Dann zeigt Books „Original öffnen“ mit einem Link auf den Tag hier.' })}

    <h2>${icon('clock')}Zeitplan</h2>
    ${check('autoSend', 'Jeden Tag automatisch an Books senden', s.autoSend, 'Sendet den Tag und – für Nachzügler – den Vortag. Läuft das Programm zur Uhrzeit nicht, wird beim nächsten Start nachgeholt.')}
    ${field('sendTime', 'Uhrzeit', s.sendTime, { type: 'time' })}
    ${field('refreshMinutes', 'Feeds abrufen alle … Minuten', s.refreshMinutes, { type: 'number', attrs: 'min="5" max="1440"' })}

    <h2>${icon('calendar')}Allgemein</h2>
    ${field('title', 'Name', s.title)}
    ${field('timezone', 'Zeitzone', s.timezone, { hint: 'Bestimmt, zu welchem Tag eine Meldung gehört, z. B. <code>Europe/Berlin</code>.' })}
    ${field('keepDays', 'Meldungen aufbewahren (Tage)', s.keepDays, { type: 'number', attrs: 'min="1" max="3650"' })}

    <div class="actions form-actions"><button class="btn primary" type="submit">${icon('check')}<span>Speichern</span></button></div>
  </form>
  ${s.booksUrl && s.booksToken ? `<form method="post" action="/einstellungen/pruefen"><button class="btn" type="submit">${icon('key')}<span>Verbindung zu Books prüfen</span></button></form>` : ''}
</div>`;
  return layout(ctx, { title: 'Einstellungen', body, active: 'einstellungen' });
}

// ------------------------------------------------------------------ Fehler

export function errorView(ctx, status, message) {
  const body = `<div class="empty error"><h1>${status === 404 ? 'Nicht gefunden' : 'Das hat nicht geklappt'}</h1><p>${h(message)}</p><p><a class="btn" href="/">Zur Startseite</a></p></div>`;
  return layout(ctx, { title: 'Fehler', body });
}
