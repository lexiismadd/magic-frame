import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth/shortcut";
import { renderDigest } from "@/lib/digest/to-text";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const userId = await resolveUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const format = req.nextUrl.searchParams.get("format");
  const result = await renderDigest(slug);

  if (!result) {
    return NextResponse.json({ error: "Digest not found" }, { status: 404 });
  }

  if (format === "json") {
    return NextResponse.json({ lines: result.lines, text: result.text });
  }

  return new NextResponse(result.text, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
