#!/usr/bin/env node
// Start: rss [Datenordner] [--port 3001] [--host 127.0.0.1]
//        rss [Datenordner] --senden [JJJJ-MM-TT]   Feeds abrufen, Tag an Books senden und beenden

import { parseArgs } from 'node:util';
import { Store } from '../src/store.js';
import { Service } from '../src/service.js';
import { createApp } from '../src/app.js';
import { sendAndLog } from '../src/books.js';
import { dayOf, isDay } from '../src/days.js';
import { APP_VERSION } from '../src/views.js';

const HELP = `rss ${APP_VERSION} – kleiner RSS-Leser, schickt Tageszusammenfassungen an Books

rss [Datenordner] [Optionen]

  -p, --port <port>        Port (Standard: 3001, Umgebung RSS_PORT)
      --host <adresse>     Adresse (Standard: 127.0.0.1, für alle: 0.0.0.0, Umgebung RSS_HOST)
      --senden [Tag]       Feeds abrufen, den Tag (Standard: heute) an Books senden und beenden
  -h, --help               Diese Hilfe

Datenordner: Standard ./data (Umgebung RSS_DATA). Passwort für die Oberfläche: Umgebung RSS_PASSWORD.`;

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: 'string', short: 'p' },
      host: { type: 'string' },
      senden: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
} catch (err) {
  console.error(`${err.message}\n\n${HELP}`);
  process.exit(2);
}
const { values, positionals } = args;
if (values.help) {
  console.log(HELP);
  process.exit(0);
}

const dataDir = positionals.find((p) => !isDay(p)) ?? process.env.RSS_DATA ?? 'data';
const store = await new Store(dataDir).load();
const service = new Service(store);

if (values.senden) {
  const day = positionals.find(isDay) ?? dayOf(Date.now(), store.settings.timezone);
  try {
    await service.refreshAll();
    const r = await sendAndLog(store, day);
    console.log(`${day}: ${r.count} Meldungen an Books gesendet (${r.rel}${r.changed ? '' : ', unverändert'}).`);
    process.exit(0);
  } catch (err) {
    console.error(`${day}: ${err.message}`);
    process.exit(1);
  }
}

const port = Number(values.port ?? process.env.RSS_PORT ?? 3001);
const host = values.host ?? process.env.RSS_HOST ?? '127.0.0.1';
const app = createApp({ store, service });
const server = app.listen(port, host, () => {
  console.log(`rss ${APP_VERSION} läuft auf http://${host.includes(':') ? `[${host}]` : host}:${port} (Daten: ${store.dir})`);
  service.start();
});
server.on('error', (err) => {
  console.error(`Start fehlgeschlagen: ${err.message}`);
  process.exit(1);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    service.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
