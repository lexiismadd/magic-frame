"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Save,
  Eye,
  Clock as ClockIcon,
  CloudSun,
  Calendar as CalendarIcon,
  Zap,
  Bell,
  Power,
  Timer as TimerIcon,
  MessageSquare,
  ShoppingCart,
  ClipboardList,
  Image as ImageIcon,
  Gauge,
  Video,
  Music,
  Rss,
  QrCode,
  Activity,
  Leaf,
  Type as TypeIcon,
  GraduationCap,
  Copy,
} from "lucide-react";
import Link from "next/link";
import { useT } from "@/lib/i18n/LocaleProvider";

const WIDGET_META: Record<string, { color: string; Icon: any; label: string }> = {
  "ClockWidget.tsx":           { color: "rgba(59,130,246,0.55)",  Icon: ClockIcon,      label: "Clock" },
  "WeatherWidget.tsx":         { color: "rgba(6,182,212,0.55)",   Icon: CloudSun,       label: "Weather" },
  "CalendarWidget.tsx":        { color: "rgba(139,92,246,0.55)",  Icon: CalendarIcon,   label: "Calendar" },
  "HomeAssistantWidget.tsx":   { color: "rgba(34,197,94,0.55)",   Icon: Zap,            label: "Home Assistant" },
  "HANotificationWidget.tsx":  { color: "rgba(249,115,22,0.55)",  Icon: Bell,           label: "Notifications" },
  "ButtonWidget.tsx":          { color: "rgba(245,158,11,0.55)",  Icon: Power,          label: "Button" },
  "TimerWidget.tsx":           { color: "rgba(16,185,129,0.55)",  Icon: TimerIcon,      label: "Timer" },
  "MessagesWidget.tsx":        { color: "rgba(217,70,239,0.55)",  Icon: MessageSquare,  label: "Messages" },
  "ShoppingListWidget.tsx":    { color: "rgba(234,179,8,0.55)",   Icon: ShoppingCart,   label: "Shopping List" },
  "TodosWidget.tsx":           { color: "rgba(99,102,241,0.55)",  Icon: ClipboardList,  label: "Todos" },
  "ImageWidget.tsx":           { color: "rgba(168,85,247,0.55)",  Icon: ImageIcon,      label: "Image" },
  "SensorWidget.tsx":          { color: "rgba(20,184,166,0.55)",  Icon: Gauge,          label: "Sensor" },
  "EnvironmentWidget.tsx":     { color: "rgba(132,204,22,0.55)",  Icon: Leaf,           label: "Environment" },
  "CameraWidget.tsx":          { color: "rgba(244,63,94,0.55)",   Icon: Video,          label: "Camera" },
  "MediaPlayerWidget.tsx":     { color: "rgba(236,72,153,0.55)",  Icon: Music,          label: "Media" },
  "RssWidget.tsx":             { color: "rgba(245,158,11,0.55)",  Icon: Rss,            label: "RSS" },
  "QrWidget.tsx":              { color: "rgba(6,182,212,0.55)",   Icon: QrCode,         label: "QR Code" },
  "StatusWidget.tsx":          { color: "rgba(14,165,233,0.55)",  Icon: Activity,       label: "Status" },
  "TextWidget.tsx":            { color: "rgba(14,165,233,0.55)",  Icon: TypeIcon,       label: "Text" },
  "SchoolRotationWidget.tsx":  { color: "rgba(59,130,246,0.55)",  Icon: GraduationCap,  label: "School Rotation" },
};

const SUPPORTED_TYPES = new Set([
  "SchoolRotationWidget.tsx",
  "CalendarWidget.tsx",
  "TodosWidget.tsx",
  "ShoppingListWidget.tsx",
]);

type ViewWidget = { id: string; type: string; label: string; config: any };
type DigestEntryDraft = {
  widgetId: string;
  order: number;
  textOptions: Record<string, any>;
};
type DigestData = {
  id: string;
  slug: string;
  name: string;
  dashboardId: string;
  dashboard: { id: string; name: string; widgets: ViewWidget[] };
  entries: DigestEntryDraft[];
};

function TextOptionsEditor({
  widgetType,
  options,
  onChange,
}: {
  widgetType: string;
  options: Record<string, any>;
  onChange: (opts: Record<string, any>) => void;
}) {
  const t = useT();

  switch (widgetType) {
    case "SchoolRotationWidget.tsx":
      return (
        <div className="space-y-3 pl-9">
          <label className="block">
            <span className="text-xs text-[var(--mf-fg)]/60 block mb-1">{t("Kind filtern")}</span>
            <input
              type="text"
              value={options.kidFilter || ""}
              onChange={(e) => onChange({ ...options, kidFilter: e.target.value })}
              placeholder={t("alle Kinder")}
              className="w-full bg-[var(--mf-surface)] border border-[var(--mf-bdr)]/10 text-[var(--mf-fg)] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={options.includeReminders !== false}
              onChange={(e) =>
                onChange({ ...options, includeReminders: e.target.checked })
              }
              className="rounded"
            />
            <span className="text-[var(--mf-fg)]/70">{t("Erinnerungen anzeigen")}</span>
          </label>
        </div>
      );

    case "CalendarWidget.tsx":
      return (
        <div className="pl-9">
          <label className="block">
            <span className="text-xs text-[var(--mf-fg)]/60 block mb-1">{t("Zeitraum")}</span>
            <select
              value={options.range || "today"}
              onChange={(e) => onChange({ ...options, range: e.target.value })}
              className="w-full bg-[var(--mf-surface)] border border-[var(--mf-bdr)]/10 text-[var(--mf-fg)] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="today">{t("Heute")}</option>
              <option value="tomorrow">{t("Morgen")}</option>
              <option value="next3h">{t("Nächste 3 Stunden")}</option>
              <option value="next6h">{t("Nächste 6 Stunden")}</option>
              <option value="next12h">{t("Nächste 12 Stunden")}</option>
              <option value="next24h">{t("Nächste 24 Stunden")}</option>
            </select>
          </label>
        </div>
      );

    case "TodosWidget.tsx":
      return (
        <div className="pl-9">
          <label className="block">
            <span className="text-xs text-[var(--mf-fg)]/60 block mb-1">{t("Filter")}</span>
            <select
              value={options.dueFilter || "today"}
              onChange={(e) => onChange({ ...options, dueFilter: e.target.value })}
              className="w-full bg-[var(--mf-surface)] border border-[var(--mf-bdr)]/10 text-[var(--mf-fg)] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="today">{t("Fällig heute")}</option>
              <option value="overdue">{t("Überfällig")}</option>
              <option value="all">{t("Alle offenen")}</option>
            </select>
          </label>
        </div>
      );

    case "ShoppingListWidget.tsx":
      return (
        <div className="pl-9">
          <label className="block">
            <span className="text-xs text-[var(--mf-fg)]/60 block mb-1">{t("Anzeigen")}</span>
            <select
              value={options.filter || "unchecked"}
              onChange={(e) => onChange({ ...options, filter: e.target.value })}
              className="w-full bg-[var(--mf-surface)] border border-[var(--mf-bdr)]/10 text-[var(--mf-fg)] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="unchecked">{t("Nur offene")}</option>
              <option value="all">{t("Alle Einträge")}</option>
            </select>
          </label>
        </div>
      );

    default:
      return null;
  }
}

function WidgetIcon({ type, size = 16 }: { type: string; size?: number }) {
  const meta = WIDGET_META[type];
  if (!meta) return null;
  const { Icon, color } = meta;
  return (
    <span
      className="inline-flex items-center justify-center rounded-md shrink-0"
      style={{ background: color, width: size + 8, height: size + 8 }}
    >
      <Icon size={size} className="text-white" />
    </span>
  );
}

export default function DigestEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = useT();
  const router = useRouter();
  const [digestId, setDigestId] = useState<string | null>(null);
  const [digest, setDigest] = useState<DigestData | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [entries, setEntries] = useState<DigestEntryDraft[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  useEffect(() => {
    params.then((p) => setDigestId(p.id));
  }, [params]);

  const load = useCallback(async () => {
    if (!digestId) return;
    const res = await fetch(`/api/admin/digests/${digestId}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data: DigestData = await res.json();
    setDigest(data);
    setName(data.name);
    setSlug(data.slug);
    setEntries(data.entries.map((e) => ({
      widgetId: e.widgetId,
      order: e.order,
      textOptions: (e as any).textOptions ?? {},
    })));
    setDirty(false);
  }, [digestId]);

  useEffect(() => { load(); }, [load]);

  const viewWidgets = digest?.dashboard?.widgets ?? [];
  const widgetMap = new Map(viewWidgets.map((w) => [w.id, w]));
  const entryWidgetIds = new Set(entries.map((e) => e.widgetId));
  const availableWidgets = viewWidgets.filter(
    (w) => !entryWidgetIds.has(w.id) && SUPPORTED_TYPES.has(w.type),
  );
  const unsupportedWidgets = viewWidgets.filter(
    (w) => !entryWidgetIds.has(w.id) && !SUPPORTED_TYPES.has(w.type),
  );

  function addWidget(widgetId: string) {
    setEntries((prev) => [
      ...prev,
      { widgetId, order: prev.length, textOptions: {} },
    ]);
    setExpanded((prev) => new Set(prev).add(widgetId));
    setDirty(true);
  }

  function removeWidget(widgetId: string) {
    setEntries((prev) => prev.filter((e) => e.widgetId !== widgetId));
    setDirty(true);
  }

  function updateTextOptions(widgetId: string, opts: Record<string, any>) {
    setEntries((prev) =>
      prev.map((e) =>
        e.widgetId === widgetId ? { ...e, textOptions: opts } : e,
      ),
    );
    setDirty(true);
  }

  function toggleExpand(widgetId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(widgetId)) next.delete(widgetId);
      else next.add(widgetId);
      return next;
    });
  }

  function handleDragStart(index: number) {
    dragItem.current = index;
  }

  function handleDragEnter(index: number) {
    dragOver.current = index;
  }

  function handleDragEnd() {
    if (dragItem.current === null || dragOver.current === null) return;
    const from = dragItem.current;
    const to = dragOver.current;
    if (from === to) return;
    setEntries((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next.map((e, i) => ({ ...e, order: i }));
    });
    setDirty(true);
    dragItem.current = null;
    dragOver.current = null;
  }

  async function save() {
    if (!digestId) return;
    setError(null);
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/digests/${digestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          entries: entries.map((e, i) => ({
            widgetId: e.widgetId,
            order: i,
            textOptions: e.textOptions,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t("Speichern fehlgeschlagen."));
        return;
      }
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError(t("Netzwerkfehler."));
    } finally {
      setSaving(false);
    }
  }

  async function loadPreview() {
    if (!digest) return;
    setPreviewLoading(true);
    setPreview(null);

    await save();

    try {
      const res = await fetch(`/api/digest/${digest.slug}?format=json&t=${Date.now()}`);
      if (!res.ok) {
        setPreview(`(${t("Fehler")}: ${res.status})`);
        return;
      }
      const data = await res.json();
      setPreview(data.text || t("(leer)"));
    } catch {
      setPreview(`(${t("Vorschau nicht verfügbar")})`);
    } finally {
      setPreviewLoading(false);
    }
  }

  if (!digest) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[900px] mx-auto px-8 py-10">
          <div className="text-[var(--mf-fg)]/40 text-sm">{t("Wird geladen…")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[900px] mx-auto px-8 py-10">
        <header className="mb-8">
          <Link
            href="/editor/digests"
            className="text-sm text-[var(--mf-fg)]/50 hover:text-[var(--mf-fg)] inline-flex items-center gap-1 mb-4"
          >
            <ArrowLeft size={14} /> {t("Alle Digests")}
          </Link>

          <div className="flex items-end justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--mf-fg)]/40 mb-2">
                Digest
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <label className="flex-1">
                  <span className="text-xs text-[var(--mf-fg)]/60 block mb-1">{t("Name")}</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setDirty(true); }}
                    className="w-full bg-[var(--mf-surface-2)] border border-[var(--mf-bdr)]/10 text-[var(--mf-fg)] rounded-lg px-3 py-2 text-lg font-semibold outline-none focus:border-blue-500"
                  />
                </label>
                <label className="sm:w-60">
                  <span className="text-xs text-[var(--mf-fg)]/60 block mb-1">Slug</span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                      setDirty(true);
                    }}
                    className="w-full bg-[var(--mf-surface-2)] border border-[var(--mf-bdr)]/10 text-[var(--mf-fg)] font-mono rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </label>
              </div>
              <div className="text-xs text-[var(--mf-fg)]/40 mt-2">
                {t("View")}: <span className="text-[var(--mf-fg)]/60">{digest.dashboard.name}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 pb-1">
              <button
                onClick={loadPreview}
                disabled={previewLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm text-[var(--mf-fg)]/70 hover:text-[var(--mf-fg)] border border-[var(--mf-bdr)]/10 hover:border-[var(--mf-bdr)]/30"
              >
                <Eye size={14} /> {t("Vorschau")}
              </button>
              <button
                onClick={save}
                disabled={saving || !dirty}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white px-4 py-2 rounded-full text-sm font-medium shadow-sm shadow-blue-500/30"
              >
                <Save size={14} />
                {saving ? t("Speichert…") : saved ? t("Gespeichert") : t("Speichern")}
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main: Selected entries */}
          <div className="lg:col-span-2">
            <div className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--mf-fg)]/40 mb-3">
              {t("Einträge")} ({entries.length})
            </div>

            {entries.length === 0 ? (
              <div className="bg-[var(--mf-surface-2)]/60 border border-[var(--mf-bdr)]/10 border-dashed rounded-2xl p-8 text-center">
                <p className="text-[var(--mf-fg)]/50 text-sm mb-2">{t("Noch keine Widgets ausgewählt.")}</p>
                <p className="text-[var(--mf-fg)]/30 text-xs">{t("Füge Widgets aus der Liste rechts hinzu.")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {entries.map((entry, index) => {
                  const widget = widgetMap.get(entry.widgetId);
                  if (!widget) return null;
                  const meta = WIDGET_META[widget.type];
                  const isExpanded = expanded.has(entry.widgetId);
                  const displayName = widget.label || meta?.label || widget.type.replace(".tsx", "");

                  return (
                    <div
                      key={entry.widgetId}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragEnter={() => handleDragEnter(index)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      className="bg-[var(--mf-surface-2)]/60 border border-[var(--mf-bdr)]/10 rounded-xl overflow-hidden"
                    >
                      <div className="flex items-center gap-2 p-3">
                        <GripVertical
                          size={14}
                          className="text-[var(--mf-fg)]/30 cursor-grab shrink-0"
                        />
                        <WidgetIcon type={widget.type} />
                        <span className="font-medium text-sm flex-1 truncate">
                          {displayName}
                        </span>
                        <button
                          onClick={() => toggleExpand(entry.widgetId)}
                          className="text-[var(--mf-fg)]/40 hover:text-[var(--mf-fg)]/80 p-1"
                        >
                          {isExpanded ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )}
                        </button>
                        <button
                          onClick={() => removeWidget(entry.widgetId)}
                          className="text-red-400/60 hover:text-red-300 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="px-3 pb-3 border-t border-[var(--mf-bdr)]/5 pt-3">
                          <TextOptionsEditor
                            widgetType={widget.type}
                            options={entry.textOptions}
                            onChange={(opts) =>
                              updateTextOptions(entry.widgetId, opts)
                            }
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Preview panel */}
            {preview !== null && (
              <div className="mt-6">
                <div className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--mf-fg)]/40 mb-3">
                  {t("Vorschau")}
                </div>
                <div className="bg-[var(--mf-surface-2)]/60 border border-[var(--mf-bdr)]/10 rounded-xl p-4">
                  <pre className="text-sm text-[var(--mf-fg)]/80 whitespace-pre-wrap font-mono leading-relaxed">
                    {preview}
                  </pre>
                  <EndpointCopy slug={slug} />
                </div>
              </div>
            )}
          </div>

          {/* Sidebar: Available widgets */}
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--mf-fg)]/40 mb-3">
              {t("Verfügbare Widgets")}
            </div>

            {availableWidgets.length === 0 && unsupportedWidgets.length === 0 ? (
              <div className="text-xs text-[var(--mf-fg)]/30 p-4">
                {entries.length > 0
                  ? t("Alle unterstützten Widgets sind bereits im Digest.")
                  : t("Keine Widgets in diesem View.")}
              </div>
            ) : (
              <div className="space-y-1">
                {availableWidgets.map((w) => {
                  const meta = WIDGET_META[w.type];
                  const displayName = w.label || meta?.label || w.type.replace(".tsx", "");
                  return (
                    <button
                      key={w.id}
                      onClick={() => addWidget(w.id)}
                      className="w-full flex items-center gap-2 p-2.5 rounded-lg text-sm hover:bg-[var(--mf-elev)]/5 border border-transparent hover:border-[var(--mf-bdr)]/10 transition-colors text-left"
                    >
                      <WidgetIcon type={w.type} size={14} />
                      <span className="flex-1 truncate text-[var(--mf-fg)]/80">
                        {displayName}
                      </span>
                      <Plus
                        size={14}
                        className="text-[var(--mf-fg)]/30 shrink-0"
                      />
                    </button>
                  );
                })}

                {unsupportedWidgets.length > 0 && (
                  <>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--mf-fg)]/25 pt-3 pb-1 px-1">
                      {t("Nicht unterstützt")}
                    </div>
                    {unsupportedWidgets.map((w) => {
                      const meta = WIDGET_META[w.type];
                      const displayName = w.label || meta?.label || w.type.replace(".tsx", "");
                      return (
                        <div
                          key={w.id}
                          className="flex items-center gap-2 p-2.5 rounded-lg text-sm opacity-30 cursor-not-allowed"
                        >
                          <WidgetIcon type={w.type} size={14} />
                          <span className="flex-1 truncate">{displayName}</span>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EndpointCopy({ slug }: { slug: string }) {
  const t = useT();
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}/api/digest/${slug}`);
  }, [slug]);

  return (
    <div className="mt-3 pt-3 border-t border-[var(--mf-bdr)]/5 flex items-center gap-2">
      <code className="text-xs text-[var(--mf-fg)]/40 font-mono flex-1 truncate">
        /api/digest/{slug}
      </code>
      <button
        onClick={() => {
          if (!url) return;
          navigator.clipboard?.writeText(url).then(
            () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
            () => {},
          );
        }}
        className="text-xs text-[var(--mf-fg)]/40 hover:text-[var(--mf-fg)]/70 flex items-center gap-1"
      >
        <Copy size={11} />
        {copied ? t("Kopiert") : t("URL kopieren")}
      </button>
    </div>
  );
}
