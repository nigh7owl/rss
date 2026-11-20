// Express-Routen. Kein Konto: Das Programm läuft standardmäßig nur auf 127.0.0.1; mit RSS_PASSWORD fragt der
// Browser per HTTP-Basic-Anmeldung nach einem Passwort (für Betrieb im Heimnetz oder hinter einem Reverse-Proxy).

import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserError, cleanSettings } from './store.js';
import { checkBooks, sendAndLog } from './books.js';
import { summaryMarkdown, summaryPath } from './summary.js';
import { dayOf, isDay } from './days.js';
import { dayView, feedsView, settingsView, errorView } from './views.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'";

const sha = (value) => crypto.createHash('sha256').update(String(value)).digest();

/** Nur Rücksprünge innerhalb des Programms. */
const backTo = (value, fallback) => (typeof value === 'string' && /^\/(?!\/)[^\s\\]*$/.test(value) ? value : fallback);

/** Weiterleitung mit Rückmeldung. */
const withMsg = (url, text, kind = 'ok') => `${url}${url.includes('?') ? '&' : '?'}meldung=${encodeURIComponent(text)}${kind === 'warnung' ? '&art=warnung' : ''}`;
const msgOf = (req) => ({ text: typeof req.query.meldung === 'string' ? req.query.meldung.slice(0, 500) : '', kind: req.query.art });

export function createApp({ store, service, password = process.env.RSS_PASSWORD ?? '', fetchImpl = fetch }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use((req, res, next) => {
    res.set({ 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    next();
  });

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // Optionales Passwort (HTTP Basic, Benutzername beliebig)
  if (password) {
    const expected = sha(password);
    app.use((req, res, next) => {
      const [scheme, encoded] = String(req.get('authorization') ?? '').split(' ');
      const given = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString('utf8').split(':').slice(1).join(':') : null;
      if (given !== null && crypto.timingSafeEqual(sha(given), expected)) return next();
      res.set('WWW-Authenticate', 'Basic realm="RSS", charset="UTF-8"').status(401).send('Anmeldung erforderlich.');
    });
  }

  app.use('/static', express.static(PUBLIC_DIR, { maxAge: '1h' }));

  // Schutz vor fremden Seiten, die Formulare hierher schicken (CSRF): nur Anfragen von dieser Seite selbst
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const site = req.get('sec-fetch-site');
    const origin = req.get('origin');
    let sameHost = true;
    if (origin) {
      try {
        sameHost = new URL(origin).host === req.get('host');
      } catch {
        sameHost = false;
      }
    }
    if ((site && !['same-origin', 'none'].includes(site)) || !sameHost) return next(new UserError('Anfrage von einer fremden Seite abgelehnt.', 403));
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

  const ctx = () => {
    const { settings } = store;
    return { store, settings, today: dayOf(Date.now(), settings.timezone), counts: store.dayCounts() };
  };
  const markdownOf = (day) => summaryMarkdown(day, store.itemsOfDay(day), store.feeds, store.settings, { appUrl: store.settings.appUrl });
  const dayParam = (req) => {
    if (!isDay(req.params.day)) throw new UserError('Unbekannter Tag – erwartet wird JJJJ-MM-TT.', 404);
    return req.params.day;
  };

  // ---------------------------------------------------------------- Tage
  app.get('/', (req, res) => res.redirect(`/tag/${ctx().today}`));

  app.get('/tag/:day', (req, res) => {
    const day = dayParam(req);
    res.send(dayView(ctx(), day, { markdown: markdownOf(day), msg: msgOf(req) }));
  });

  app.get('/markdown/:day', (req, res) => {
    const day = dayParam(req);
    const name = path.posix.basename(summaryPath(store.settings.booksPath, day));
    res.set('Content-Type', 'text/markdown; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${day}.md"; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.send(markdownOf(day));
  });

  app.post('/tag/:day/senden', async (req, res) => {
    const day = dayParam(req);
    try {
      const r = await sendAndLog(store, day, { fetchImpl });
      res.redirect(withMsg(`/tag/${day}`, r.changed ? `An Books gesendet: ${r.rel}` : `Books hat die Zusammenfassung schon in diesem Stand (${r.rel}).`));
    } catch (err) {
      if (!(err instanceof UserError)) throw err;
      res.redirect(withMsg(`/tag/${day}`, err.message, 'warnung'));
    }
  });

  app.post('/abrufen', async (req, res) => {
    const fresh = await service.refreshAll();
    const failed = store.feeds.filter((f) => f.error).length;
    const text = `${fresh === 1 ? 'Eine neue Meldung' : `${fresh} neue Meldungen`}${failed ? ` · ${failed} ${failed === 1 ? 'Feed' : 'Feeds'} mit Fehler` : ''}.`;
    res.redirect(withMsg(backTo(req.body.back, '/'), text, failed ? 'warnung' : 'ok'));
  });

  // ---------------------------------------------------------------- Feeds
  app.get('/feeds', (req, res) => res.send(feedsView(ctx(), { msg: msgOf(req) })));

  app.post('/feeds', async (req, res) => {
    const input = String(req.body.url ?? '').trim();
    try {
      const { feed, fresh } = await service.addFeed(input);
      res.redirect(withMsg('/feeds', `„${feed.title}“ abonniert – ${fresh === 1 ? 'eine Meldung' : `${fresh} Meldungen`} übernommen.`));
    } catch (err) {
      if (!(err instanceof UserError)) throw err;
      res.status(err.status === 502 || err.status === 413 ? 422 : err.status).send(feedsView(ctx(), { msg: { text: err.message, kind: 'warnung' }, value: input }));
    }
  });

  app.post('/feeds/:id/entfernen', async (req, res) => {
    const feed = store.feed(req.params.id);
    if (!feed) throw new UserError('Diesen Feed gibt es nicht.', 404);
    store.removeFeed(feed.id);
    await store.saveFeeds();
    await store.saveItems();
    res.redirect(withMsg('/feeds', `„${feed.title}“ abbestellt.`));
  });

  // ---------------------------------------------------------------- Einstellungen
  app.get('/einstellungen', (req, res) => res.send(settingsView(ctx(), { msg: msgOf(req) })));

  app.post('/einstellungen', async (req, res) => {
    let next;
    try {
      next = cleanSettings(req.body, store.settings);
    } catch (err) {
      if (!(err instanceof UserError)) throw err;
      return res.status(422).send(settingsView(ctx(), { msg: { text: err.message, kind: 'warnung' } }));
    }
    const redate = next.timezone !== store.settings.timezone;
    const lostToken = store.settings.booksToken && !next.booksToken && !req.body.removeToken;
    await store.saveSettings(next);
    if (redate) await service.redate();
    res.redirect(withMsg('/einstellungen', lostToken ? 'Gespeichert. Die Adresse von Books hat sich geändert – bitte den Schlüssel neu eintragen.' : 'Gespeichert.', lostToken ? 'warnung' : 'ok'));
  });

  app.post('/einstellungen/pruefen', async (req, res) => {
    try {
      const info = await checkBooks(store.settings, { fetchImpl });
      res.send(settingsView(ctx(), { msg: null, info }));
    } catch (err) {
      if (!(err instanceof UserError)) throw err;
      res.send(settingsView(ctx(), { msg: { text: err.message, kind: 'warnung' } }));
    }
  });

  // ---------------------------------------------------------------- Fehler
  app.use((req, res) => res.status(404).send(errorView(ctx(), 404, 'Diese Seite gibt es nicht.')));
  app.use((err, req, res, _next) => {
    const status = err instanceof UserError ? err.status : err.status ?? 500;
    if (status >= 500 && !(err instanceof UserError)) console.error(err);
    res.status(status).send(errorView(ctx(), status, status >= 500 && !(err instanceof UserError) ? 'Ein unerwarteter Fehler ist aufgetreten.' : err.message));
  });

  return app;
}
