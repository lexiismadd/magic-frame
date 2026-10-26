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

  const widgets = await prisma.widget.findMany({
    where: { dashboardId: digest.dashboardId },
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
    const url = new URL("/api/calendar", process.env.APP_BASE_URL || "http://localhost:3000");
    url.searchParams.set("feeds", typeof feeds === "string" ? feeds : JSON.stringify(feeds));
    url.searchParams.set("mode", "range");
    url.searchParams.set("start", startDate);
    url.searchParams.set("days", String(days));
    url.searchParams.set("limit", "50");

    const res = await fetch(url.toString(), { cache: "no-store" });
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
