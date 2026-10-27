import "server-only";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  parseSchedules,
  parseReminders,
  remindersFor,
  parseExclusions,
  parseIsoDate,
  isoDate,
  clampInt,
  getScheduleInfo,
} from "@/lib/widgets/school-rotation";
import { wmoToText } from "@/lib/weather/wmo";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export type DigestTextOptions = {
  SchoolRotation?: { kidFilter?: string; includeReminders?: boolean };
  Calendar?: { range?: "today" | "tomorrow" | "next3h" | "next6h" | "next12h" | "next24h" };
  Todos?: { dueFilter?: "today" | "overdue" | "all" };
  Weather?: { detail?: "oneliner" | "full" };
  ShoppingList?: { filter?: "all" | "unchecked" };
};

type WidgetWithConfig = {
  id: string;
  type: string;
  label: string;
  config: any;
};

type DigestEntry = {
  widgetId: string;
  order: number;
  textOptions: any;
};

export async function renderDigest(
  slug: string,
  now?: Date,
): Promise<{ text: string; lines: string[] } | null> {
  const digest = await prisma.digest.findUnique({
    where: { slug },
    include: { entries: { orderBy: { order: "asc" } } },
  });
  if (!digest) return null;

  const dashboardIds = [...new Set(digest.entries.map((e) => e.dashboardId))];
  const widgets = await prisma.widget.findMany({
    where: { dashboardId: { in: dashboardIds } },
  });
  const widgetMap = new Map<string, WidgetWithConfig>();
  for (const w of widgets) widgetMap.set(w.id, w as any);

  const today = now ?? new Date();
  const lines: string[] = [];

  for (const entry of digest.entries) {
    const widget = widgetMap.get(entry.widgetId);
    if (!widget) continue;

    const entryLines = await widgetToText(widget, entry.textOptions as any, today);
    if (entryLines.length > 0) lines.push(...entryLines);
  }

  return { text: lines.join("\n"), lines };
}

async function widgetToText(
  widget: WidgetWithConfig,
  opts: any,
  today: Date,
): Promise<string[]> {
  switch (widget.type) {
    case "SchoolRotationWidget.tsx":
      return schoolRotationToText(widget.config, opts ?? {}, today);
    case "CalendarWidget.tsx":
      return calendarToText(widget.config, opts ?? {}, today);
    case "TodosWidget.tsx":
      return todosToText(widget.config, opts ?? {}, today);
    case "ShoppingListWidget.tsx":
      return shoppingListToText(opts ?? {});
    case "WeatherWidget.tsx":
      return weatherToText(widget.config, opts ?? {});
    case "SensorWidget.tsx":
      return sensorToText(widget.config, opts ?? {});
    case "EnvironmentWidget.tsx":
      return environmentToText(widget.config, opts ?? {});
    case "TextWidget.tsx":
      return textWidgetToText(widget.config);
    default:
      return [];
  }
}

function schoolRotationToText(config: any, opts: any, today: Date): string[] {
  const start = parseIsoDate(config.startDate);
  const end = parseIsoDate(config.endDate);
  if (!start || !end || start > end) return [];

  const cycle = clampInt(config.cycleDays, 1, 30, 6);
  const excl = parseExclusions(config.noSchoolDates);
  const kids = parseSchedules(config.schedules);
  if (!kids) return [];

  const info = getScheduleInfo(today, start, end, excl, cycle, 3);
  const lines: string[] = [];

  if (info.status === "after-end") {
    lines.push("School year is over");
    return lines;
  }

  if (info.status === "before-start") {
    lines.push("School has not started yet");
    return lines;
  }

  const kidFilter = opts.kidFilter?.trim().toLowerCase();
  const filteredKids = kidFilter
    ? kids.filter((k) => k.name.toLowerCase() === kidFilter)
    : kids;

  if (info.status === "school-day" && info.todayRotation !== null) {
    const parts = filteredKids.map((kid) => {
      const acts = kid.days[String(info.todayRotation)] || [];
      return `${kid.name}: ${acts.length > 0 ? acts.join(", ") : "—"}`;
    });
    lines.push(`Day ${info.todayRotation} — ${parts.join(" · ")}`);
  } else {
    const label = info.status === "weekend" ? "Weekend" : "No school";
    lines.push(info.reason ? `${label} — ${info.reason}` : label);
  }

  if (opts.includeReminders !== false) {
    const reminders = parseReminders(config.reminders);
    const active = remindersFor(reminders, today);
    for (const r of active) {
      if (kidFilter && r.kid && r.kid.toLowerCase() !== kidFilter) continue;
      const icon = r.icon || "🔔";
      const kidLabel = r.kid ? ` (${r.kid})` : "";
      lines.push(`${icon} ${r.text}${kidLabel}`);
    }
  }

  return lines;
}

async function calendarToText(config: any, opts: any, today: Date): Promise<string[]> {
  const range = opts.range || "today";
  const feeds = config.feeds || config.calendarFeeds;
  if (!feeds) return [];

  let startDate = isoDate(today);
  let days = 1;
  let hoursLimit: number | null = null;

  switch (range) {
    case "tomorrow": {
      const tom = new Date(today);
      tom.setDate(tom.getDate() + 1);
      startDate = isoDate(tom);
      days = 1;
      break;
    }
    case "next3h": hoursLimit = 3; break;
    case "next6h": hoursLimit = 6; break;
    case "next12h": hoursLimit = 12; break;
    case "next24h": hoursLimit = 24; days = 2; break;
    default: break;
  }

  try {
    const base = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const url = new URL("/api/calendar", base);
    url.searchParams.set("feeds", typeof feeds === "string" ? feeds : JSON.stringify(feeds));
    url.searchParams.set("mode", "range");
    url.searchParams.set("start", startDate);
    url.searchParams.set("days", String(days));
    url.searchParams.set("limit", "50");

    const res = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return ["(calendar unavailable)"];
    const data = await res.json();
    const events: any[] = data.events || [];

    const cutoff = hoursLimit
      ? new Date(today.getTime() + hoursLimit * 3600000)
      : null;

    const lines: string[] = [];
    for (const ev of events) {
      if (cutoff && ev.start) {
        const evStart = new Date(ev.start);
        if (evStart > cutoff) continue;
      }
      const time = ev.isAllDay
        ? "(all day)"
        : ev.start
          ? new Date(ev.start).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
          : "";
      const title = ev.title || ev.summary || "(no title)";
      lines.push(`${time} ${title}`.trim());
    }
    return lines.length > 0 ? lines : [];
  } catch {
    return ["(calendar unavailable)"];
  }
}

async function todosToText(config: any, opts: any, today: Date): Promise<string[]> {
  const dueFilter = opts.dueFilter || "today";
  const assignee = config.assignee?.trim() || null;

  try {
    const where: any = { completedAt: null };
    if (assignee) where.assignee = assignee;

    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    if (dueFilter === "today") {
      where.dueDate = { lte: todayEnd };
    } else if (dueFilter === "overdue") {
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      where.dueDate = { lt: todayStart };
    }

    const todos = await prisma.todo.findMany({
      where,
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 20,
    });

    return todos.map((t) => {
      const due = t.dueDate
        ? ` (${isoDate(t.dueDate)})`
        : "";
      return `☐ ${t.title}${due}`;
    });
  } catch {
    return [];
  }
}

async function shoppingListToText(opts: any): Promise<string[]> {
  try {
    const filter = opts.filter || "unchecked";
    const where: any = filter === "unchecked" ? { checked: false } : {};

    const items = await prisma.shoppingItem.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    return items.map((item) => `• ${item.text}`);
  } catch {
    return [];
  }
}

function weatherApiUrl(config: any): URL {
  const base = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const url = new URL("/api/weather", base);
  if (config.lat) url.searchParams.set("lat", String(config.lat));
  if (config.lon) url.searchParams.set("lon", String(config.lon));
  if (config.provider) url.searchParams.set("provider", config.provider);
  if (config.unitTemp) url.searchParams.set("temperature_unit", config.unitTemp);
  if (config.unitWind) url.searchParams.set("wind_speed_unit", config.unitWind);
  if (config.haEntity) url.searchParams.set("haEntity", config.haEntity);
  if (config.wuStation) url.searchParams.set("wuStation", config.wuStation);
  return url;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dailyForecastLines(data: any, tempUnit: string, count: number, startIdx = 1): string[] {
  const daily = data.daily;
  if (!daily?.temperature_2m_max?.length) return [];
  const lines: string[] = [];
  const max = Math.min(count, daily.temperature_2m_max.length - startIdx);
  for (let i = startIdx; i < startIdx + max; i++) {
    const d = new Date(daily.time?.[i] || Date.now());
    const day = DAY_NAMES[d.getDay()];
    const hi = Math.round(daily.temperature_2m_max[i]);
    const lo = Math.round(daily.temperature_2m_min[i]);
    const cond = wmoToText(daily.weather_code?.[i] ?? 0, "en");
    lines.push(`${day}: ${lo}–${hi}${tempUnit} ${cond}`);
  }
  return lines;
}

function todayHourlyLines(data: any, tempUnit: string): string[] {
  const h = data.hourly;
  if (!h || !Array.isArray(h.time)) return [];
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(23, 59, 59, 999);
  let startIdx = h.time.findIndex((t: string) => new Date(t).getTime() >= now.getTime() - 3600000);
  if (startIdx < 0) startIdx = 0;
  const lines: string[] = [];
  for (let idx = startIdx; idx < h.time.length; idx++) {
    const d = new Date(h.time[idx]);
    if (d.getTime() > midnight.getTime()) break;
    const hh = d.getHours().toString().padStart(2, "0") + ":00";
    const temp = Math.round(h.temperature_2m?.[idx] ?? 0);
    const cond = wmoToText(h.weather_code?.[idx] ?? 0, "en");
    const pop = h.precipitation_probability?.[idx];
    const popStr = typeof pop === "number" && pop > 0 ? ` ${pop}%` : "";
    lines.push(`${hh} ${temp}${tempUnit} ${cond}${popStr}`);
  }
  return lines;
}

async function weatherToText(config: any, opts: any): Promise<string[]> {
  try {
    const res = await fetch(weatherApiUrl(config).toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return ["(weather unavailable)"];
    const data = await res.json();

    const cur = data.current;
    if (!cur) return ["(weather unavailable)"];

    const tempUnit = config.unitTemp === "fahrenheit" ? "°F" : "°C";
    const condition = wmoToText(cur.weather_code ?? 0, "en");
    const temp = Math.round(cur.temperature_2m ?? 0);
    const feelsLike = Math.round(cur.apparent_temperature ?? temp);
    const detail = opts.detail || "oneliner";

    if (detail === "oneliner") {
      const parts = [`${condition}, ${temp}${tempUnit}`];
      if (Math.abs(feelsLike - temp) >= 2) parts.push(`(feels ${feelsLike}${tempUnit})`);
      return [parts.join(" ")];
    }

    if (detail === "highlow") {
      const daily = data.daily;
      if (!daily?.temperature_2m_max?.length) return [`${condition}, ${temp}${tempUnit}`];
      const hi = Math.round(daily.temperature_2m_max[0]);
      const lo = Math.round(daily.temperature_2m_min[0]);
      return [`${condition}, ${temp}${tempUnit} (${lo}–${hi}${tempUnit})`];
    }

    if (detail === "hourly") {
      const hourly = todayHourlyLines(data, tempUnit);
      if (hourly.length === 0) return [`${condition}, ${temp}${tempUnit}`];
      return hourly;
    }

    const lines: string[] = [];
    lines.push(`${condition}, ${temp}${tempUnit}`);
    if (Math.abs(feelsLike - temp) >= 2) lines.push(`Feels like ${feelsLike}${tempUnit}`);
    if (cur.relative_humidity_2m != null) lines.push(`Humidity: ${cur.relative_humidity_2m}%`);
    if (cur.wind_speed_10m != null) {
      lines.push(`Wind: ${Math.round(cur.wind_speed_10m)} ${config.unitWind || "kmh"}`);
    }
    lines.push(...dailyForecastLines(data, tempUnit, 3));
    return lines;
  } catch {
    return ["(weather unavailable)"];
  }
}

async function sensorToText(config: any, opts: any): Promise<string[]> {
  try {
    const entities: any[] = config.entities || [];
    const slots = entities.filter((s: any) => s.entityId);
    if (slots.length === 0) return [];

    const base = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const ids = slots.map((s: any) => s.entityId).join(",");
    const url = new URL("/api/ha/state", base);
    url.searchParams.set("ids", ids);

    const res = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return ["(sensors unavailable)"];
    const data = await res.json();

    const lines: string[] = [];
    for (const slot of slots) {
      const entity = data[slot.entityId];
      if (!entity) continue;
      const val = entity.state;
      if (val === "unavailable" || val === "unknown") continue;
      const label = slot.label || entity.attributes?.friendly_name || slot.entityId;
      const unit = slot.unit || entity.attributes?.unit_of_measurement || "";
      const decimals = typeof slot.decimals === "number" ? slot.decimals : undefined;
      const formatted = decimals !== undefined && !isNaN(Number(val))
        ? Number(val).toFixed(decimals)
        : val;
      lines.push(`${label}: ${formatted}${unit ? " " + unit : ""}`);
    }
    return lines;
  } catch {
    return ["(sensors unavailable)"];
  }
}

async function environmentToText(config: any, opts: any): Promise<string[]> {
  try {
    const base = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const url = new URL("/api/environment", base);
    if (config.lat) url.searchParams.set("lat", String(config.lat));
    if (config.lon) url.searchParams.set("lon", String(config.lon));
    if (config.unitWind) url.searchParams.set("wind_speed_unit", config.unitWind);

    const res = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return ["(environment unavailable)"];
    const data = await res.json();

    const lines: string[] = [];
    const scale = config.aqiScale === "us" ? "us" : "european";

    if (config.showAqi !== false && data.aqi) {
      const val = scale === "us" ? data.aqi.us : data.aqi.european;
      if (val != null) lines.push(`AQI (${scale === "us" ? "US" : "EU"}): ${val}`);
    }
    if (config.showPm25 !== false && data.pollutants?.pm2_5 != null) {
      lines.push(`PM2.5: ${data.pollutants.pm2_5} µg/m³`);
    }
    if (config.showPm10 && data.pollutants?.pm10 != null) {
      lines.push(`PM10: ${data.pollutants.pm10} µg/m³`);
    }
    if (config.showOzone && data.pollutants?.ozone != null) {
      lines.push(`Ozone: ${data.pollutants.ozone} µg/m³`);
    }
    if (config.showNo2 && data.pollutants?.nitrogen_dioxide != null) {
      lines.push(`NO₂: ${data.pollutants.nitrogen_dioxide} µg/m³`);
    }
    if (config.showPollen !== false && data.pollen) {
      const pollenEntries: string[] = [];
      const names: Record<string, string> = {
        alder: "Alder", birch: "Birch", grass: "Grass",
        mugwort: "Mugwort", olive: "Olive", ragweed: "Ragweed",
      };
      for (const [key, label] of Object.entries(names)) {
        const v = data.pollen[key];
        if (v == null || (config.hidePollenZero && v === 0)) continue;
        pollenEntries.push(`${label}: ${v}`);
      }
      if (pollenEntries.length > 0) lines.push(`Pollen: ${pollenEntries.join(", ")}`);
    }
    if (config.showUv && data.uv != null) {
      lines.push(`UV: ${data.uv}`);
    }
    if (config.showWind && data.wind?.speed != null) {
      lines.push(`Wind: ${Math.round(data.wind.speed)} ${data.wind.unit || "kmh"}`);
    }
    if (config.showSolar && data.solar?.shortwave != null) {
      lines.push(`Solar: ${Math.round(data.solar.shortwave)} W/m²`);
    }

    if (config.haEntities?.length) {
      const haSlots = config.haEntities.filter((s: any) => s.entityId);
      if (haSlots.length > 0) {
        const haIds = haSlots.map((s: any) => s.entityId).join(",");
        const haUrl = new URL("/api/ha/state", base);
        haUrl.searchParams.set("ids", haIds);
        try {
          const haRes = await fetch(haUrl.toString(), {
            cache: "no-store",
            signal: AbortSignal.timeout(10_000),
          });
          if (haRes.ok) {
            const haData = await haRes.json();
            for (const slot of haSlots) {
              const entity = haData[slot.entityId];
              if (!entity || entity.state === "unavailable" || entity.state === "unknown") continue;
              const label = slot.label || entity.attributes?.friendly_name || slot.entityId;
              const unit = slot.unit || entity.attributes?.unit_of_measurement || "";
              lines.push(`${label}: ${entity.state}${unit ? " " + unit : ""}`);
            }
          }
        } catch {}
      }
    }

    return lines;
  } catch {
    return ["(environment unavailable)"];
  }
}

function textWidgetToText(config: any): string[] {
  const lines: string[] = [];
  if (config.text) lines.push(config.text);
  if (config.subtext) lines.push(config.subtext);
  return lines;
}
