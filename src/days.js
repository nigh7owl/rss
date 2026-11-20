// Tage und Uhrzeiten: Ein Tag ist immer ein Kalendertag in der eingestellten Zeitzone (Schlüssel JJJJ-MM-TT).

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isDay = (value) => DAY_RE.test(String(value ?? '')) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** Zeitzone des Systems (Docker: TZ), sonst Europe/Berlin. */
export function systemTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';
  } catch {
    return 'Europe/Berlin';
  }
}

export function validTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('de-DE', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const partsCache = new Map();
function partsFormat(tz) {
  if (!partsCache.has(tz)) {
    partsCache.set(tz, new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  }
  return partsCache.get(tz);
}

/** Datum und Uhrzeit eines Zeitpunkts in der Zeitzone: { day: 'JJJJ-MM-TT', time: 'HH:MM' }. */
export function localParts(ms, tz) {
  const p = Object.fromEntries(partsFormat(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export const dayOf = (ms, tz) => localParts(ms, tz).day;
export const timeOf = (ms, tz) => localParts(ms, tz).time;

/** Tag ± n Tage (reine Kalenderrechnung, unabhängig von der Zeitzone). */
export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const longFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });

/** „Freitag, 20. November 2026“ */
export const longDay = (day) => longFmt.format(new Date(`${day}T12:00:00Z`));
/** „Fr., 20.11.“ */
export const shortDay = (day) => shortFmt.format(new Date(`${day}T12:00:00Z`));
/** „20.11.2026“ */
export const germanDay = (day) => day.split('-').reverse().join('.');

/** Datum und Uhrzeit für Metazeilen: „20.11.2026, 14:05“ */
export function stamp(ms, tz) {
  if (!ms) return '–';
  const { day, time } = localParts(ms, tz);
  return `${germanDay(day)}, ${time}`;
}

/** Bezeichnung relativ zu heute: „Heute“, „Gestern“ oder das kurze Datum. */
export function relativeDay(day, today) {
  if (day === today) return 'Heute';
  if (day === addDays(today, -1)) return 'Gestern';
  return shortDay(day);
}
