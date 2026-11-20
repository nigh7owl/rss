// Abläufe: Feeds abrufen, alte Meldungen entfernen und nach Zeitplan an Books senden.

import { download, parseFeed, toItems, newFeed, resolveFeed } from './feeds.js';
import { sendAndLog } from './books.js';
import { UserError } from './store.js';
import { addDays, dayOf, localParts } from './days.js';

export class Service {
  constructor(store, { fetchImpl = fetch, log = console } = {}) {
    this.store = store;
    this.fetchImpl = fetchImpl;
    this.log = log;
    this.refreshing = null;
    this.timer = null;
  }

  get tz() {
    return this.store.settings.timezone;
  }

  /** Erster Tag, der aufbewahrt wird. */
  firstKeptDay(now = Date.now()) {
    return addDays(dayOf(now, this.tz), -(this.store.settings.keepDays - 1));
  }

  /** Meldungen eines Feeds übernehmen (nur aufbewahrte Tage); gibt die Zahl der neuen zurück. */
  ingest(feed, parsed, now) {
    const first = this.firstKeptDay(now);
    return this.store.addItems(toItems(feed, parsed, { now, tz: this.tz }).filter((i) => i.day >= first));
  }

  /** Feed hinzufügen (Adresse eines Feeds oder einer Webseite mit Feed). */
  async addFeed(input, now = Date.now()) {
    const { url, parsed, response } = await resolveFeed(input, { fetchImpl: this.fetchImpl });
    const feed = newFeed(url, parsed, response, now);
    if (this.store.feed(feed.id)) throw new UserError(`„${this.store.feed(feed.id).title}“ ist schon abonniert.`);
    this.store.feeds.push(feed);
    const fresh = this.ingest(feed, parsed, now);
    await this.store.saveFeeds();
    await this.store.saveItems();
    return { feed, fresh };
  }

  /** Einen Feed abrufen; Fehler landen am Feed (`error`), nicht als Ausnahme. */
  async refreshFeed(feed, now = Date.now()) {
    feed.lastFetch = now;
    try {
      const res = await download(feed.url, { cache: feed, fetchImpl: this.fetchImpl });
      feed.error = '';
      feed.lastOk = now;
      if (res.notModified) return 0;
      feed.etag = res.etag;
      feed.lastModified = res.lastModified;
      const parsed = parseFeed(res.body, res.url);
      if (parsed.site) feed.site = parsed.site;
      return this.ingest(feed, parsed, now);
    } catch (err) {
      feed.error = err.message;
      return 0;
    }
  }

  /** Alle Feeds abrufen (nie zweimal gleichzeitig) und alte Meldungen entfernen. */
  refreshAll(now = Date.now()) {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      let fresh = 0;
      // höchstens vier Feeds gleichzeitig
      const queue = [...this.store.feeds];
      const worker = async () => {
        for (let feed = queue.shift(); feed; feed = queue.shift()) fresh += await this.refreshFeed(feed, now);
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      this.store.prune(this.firstKeptDay(now));
      this.store.state.lastRefresh = now;
      await this.store.saveFeeds();
      await this.store.saveItems();
      await this.store.saveSends();
      return fresh;
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /** Tage neu zuordnen (nach Wechsel der Zeitzone). */
  async redate() {
    for (const item of this.store.items) item.day = dayOf(item.time, this.tz);
    await this.store.saveItems();
  }

  /**
   * Automatischer Versand: Ist die Uhrzeit erreicht und heute noch nicht gesendet, werden die Feeds abgerufen und
   * heute und gestern geschickt (gestern fängt Meldungen nach dem letzten Versand ein; unveränderte Tage speichert
   * Books nicht neu). Läuft der Dienst zur Uhrzeit nicht, holt er den Versand beim nächsten Start nach.
   */
  async autoSendDue(now = Date.now()) {
    const { settings, state } = this.store;
    if (!settings.autoSend || !settings.booksUrl || !settings.booksToken) return false;
    const { day, time } = localParts(now, this.tz);
    if (time < settings.sendTime || state.lastAutoSend === day) return false;
    state.lastAutoSend = day;
    await this.store.saveSends();
    await this.refreshAll(now);
    for (const d of [addDays(day, -1), day]) {
      try {
        const r = await sendAndLog(this.store, d, { fetchImpl: this.fetchImpl, now });
        this.log.info?.(`Books: ${d} gesendet (${r.count} Meldungen${r.changed ? '' : ', unverändert'}).`);
      } catch (err) {
        this.log.error?.(`Books: ${d} nicht gesendet: ${err.message}`);
      }
    }
    return true;
  }

  /** Zeitplan starten: jede Minute prüfen, ob Abruf oder Versand fällig ist. */
  start() {
    const tick = async () => {
      try {
        const last = this.store.state.lastRefresh ?? 0;
        if (Date.now() - last >= this.store.settings.refreshMinutes * 60_000) await this.refreshAll();
        await this.autoSendDue();
      } catch (err) {
        this.log.error?.(`Zeitplan: ${err.message}`);
      }
    };
    tick();
    this.timer = setInterval(tick, 60_000);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
  }
}
