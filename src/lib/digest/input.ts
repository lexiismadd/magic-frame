// Was der Digest-Editor schickt, bevor es in die Datenbank darf. Die Routen
// sind Admins vorbehalten, aber auch ein Admin-Browser schickt manchmal
// Unsinn (ein halb geladener Editor, ein altes Tab) — und ein Eintrag mit
// einer Zahl als widgetId fiele erst beim nächsten Abruf um, mitten in der
// SMS am Morgen.

export type DigestEntryInput = {
  dashboardId: string;
  widgetId: string;
  order: number;
  textOptions: Record<string, unknown>;
};

/** Kleinbuchstaben, Ziffern, Bindestriche — sonst "". */
export function digestSlug(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export function digestName(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, 120) : "";
}

/** null = keine Liste oder ein Eintrag ohne Ansicht/Widget. */
export function digestEntries(raw: unknown): DigestEntryInput[] | null {
  if (!Array.isArray(raw) || raw.length > 100) return null;
  const out: DigestEntryInput[] = [];
  for (const [i, e] of raw.entries()) {
    if (!e || typeof e !== "object") return null;
    const { dashboardId, widgetId, textOptions } = e as Record<string, unknown>;
    if (typeof dashboardId !== "string" || !dashboardId || typeof widgetId !== "string" || !widgetId) return null;
    out.push({
      dashboardId,
      widgetId,
      order: i,
      textOptions:
        textOptions && typeof textOptions === "object" && !Array.isArray(textOptions)
          ? (textOptions as Record<string, unknown>)
          : {},
    });
  }
  return out;
}
