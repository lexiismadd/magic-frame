// Die Konfiguration des Schulwechsel-Widgets lesen — für das Widget und den
// Inspektor gleichermaßen.
//
// Sie kommt aus dem Editor, von Agenten über MCP und aus Hand-JSON, das jemand
// aus dem früheren Beispiel-Modul herüberkopiert. Ein Tippfehler darf die
// Kachel nie umwerfen (#102: das Modul brach ab, sobald bei einem Tag ein Text
// statt einer Liste stand). Deshalb wird hier alles auf die erwartete Form
// gebracht; was sich nicht deuten lässt, fällt still weg.

export type ChildSchedule = { name: string; days: Record<string, string[]> };
export type Reminder = { day: Weekday; text: string; icon?: string; kid?: string };

// Gespeichert werden die englischen Namen — so stand es im Beispiel-Modul, und
// so bleiben herüberkopierte Einstellungen gültig. Deutsche werden verstanden.
export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
const GERMAN_DAYS: Record<string, Weekday> = {
  montag: "monday",
  dienstag: "tuesday",
  mittwoch: "wednesday",
  donnerstag: "thursday",
  freitag: "friday",
};
const DAY_INDEX: Record<Weekday, number> = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5 };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

function parseJson(raw: unknown): { ok: boolean; value: unknown } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: [] };
  if (typeof raw !== "string") return { ok: true, value: raw };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, value: null };
  }
}

/** Ein Datum als YYYY-MM-DD, streng: "2026-9-2" oder "2026-02-30" sind keins. */
export function parseIsoDate(s: unknown): Date | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return null;
  const [y, m, d] = s.trim().split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function activities(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  return list
    .filter((x) => typeof x === "string" || typeof x === "number")
    .map((x) => String(x).trim())
    .filter(Boolean);
}

/** null = so kaputt, dass es nichts zu zeigen gibt (kein JSON, keine Liste). */
export function parseSchedules(raw: unknown): ChildSchedule[] | null {
  const { ok, value } = parseJson(raw);
  if (!ok || !Array.isArray(value)) return null;
  return value.filter(isObj).map((k, i) => {
    const days: Record<string, string[]> = {};
    if (isObj(k.days)) {
      for (const [key, v] of Object.entries(k.days)) days[String(key)] = activities(v);
    }
    const name = typeof k.name === "string" && k.name.trim() ? k.name.trim() : `#${i + 1}`;
    return { name, days };
  });
}

function weekday(v: unknown): Weekday | null {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  if ((WEEKDAYS as readonly string[]).includes(k)) return k as Weekday;
  return GERMAN_DAYS[k] ?? null;
}

export function parseReminders(raw: unknown): Reminder[] {
  const { ok, value } = parseJson(raw);
  if (!ok || !Array.isArray(value)) return [];
  const out: Reminder[] = [];
  for (const r of value) {
    if (!isObj(r)) continue;
    const day = weekday(r.day);
    const text = typeof r.text === "string" ? r.text.trim() : "";
    if (!day || !text) continue;
    out.push({
      day,
      text,
      icon: typeof r.icon === "string" && r.icon.trim() ? r.icon.trim() : undefined,
      kid: typeof r.kid === "string" && r.kid.trim() ? r.kid.trim() : undefined,
    });
  }
  return out;
}

export function remindersFor(reminders: Reminder[], date: Date): Reminder[] {
  return reminders.filter((r) => DAY_INDEX[r.day] === date.getDay());
}

/** Zahl aus der Konfiguration, auf einen sinnvollen Bereich begrenzt. */
export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** "YYYY-MM-DD Grund" pro Zeile; # beginnt einen Kommentar. */
export function parseExclusions(text: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (typeof text !== "string") return map;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s*(.*)/);
    if (match && parseIsoDate(match[1])) map.set(match[1], match[2].replace(/^[:\-–—]\s*/, "").trim());
  }
  return map;
}

/**
 * Schulfreie Tage aus einem Kalender: nur ganztägige Termine zählen — ein
 * Elternabend um 19 Uhr nimmt keinen Schultag weg. Das Ende ist exklusiv, wie
 * in iCal und Home Assistant: Herbstferien vom 27. bis zum 31. enden am 1.
 */
export function calendarExclusions(
  events: Array<{ start?: unknown; end?: unknown; isAllDay?: unknown; title?: unknown }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const ev of events) {
    if (ev.isAllDay !== true || typeof ev.start !== "string") continue;
    const first = parseIsoDate(ev.start.slice(0, 10));
    if (!first) continue;
    const last = typeof ev.end === "string" ? parseIsoDate(ev.end.slice(0, 10)) : null;
    const reason = typeof ev.title === "string" ? ev.title : "";
    const cur = new Date(first);
    let guard = 0;
    do {
      if (!map.has(isoDate(cur))) map.set(isoDate(cur), reason);
      cur.setDate(cur.getDate() + 1);
    } while (last && cur < last && ++guard < 400);
  }
  return map;
}
