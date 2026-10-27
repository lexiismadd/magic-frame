import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth/shortcut";
import { renderDigest } from "@/lib/digest/to-text";
import { isLocale } from "@/lib/i18n/locales";

export const dynamic = "force-dynamic";

// Ein Digest als Text, für Home Assistant und andere Automationen (#131).
//
// Anders als die Display-Routen nicht offen: ein Wandtablet kann sich nicht
// anmelden, eine Automation schon — und eine fertige Zusammenfassung des
// Haushalts gehört nicht zu dem, was jeder im Netz abrufen kann. Also der
// Companion-Token, am besten als Authorization-Header; ?key= geht auch.
//
// ?format=json liefert { lines, text }: ein REST-Sensor in Home Assistant
// speichert als Zustand höchstens 255 Zeichen, der ganze Text gehört dort in
// ein Attribut. ?lang= überstimmt die Standardsprache der Installation.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const userId = await resolveUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const lang = req.nextUrl.searchParams.get("lang");
  const result = await renderDigest(slug, { locale: isLocale(lang) ? lang : undefined });
  if (!result) {
    return NextResponse.json({ error: "Digest nicht gefunden." }, { status: 404 });
  }

  if (req.nextUrl.searchParams.get("format") === "json") {
    return NextResponse.json({ lines: result.lines, text: result.text });
  }
  return new NextResponse(result.text, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
