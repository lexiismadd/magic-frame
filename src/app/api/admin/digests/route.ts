import { NextRequest, NextResponse } from "next/server";
import {
  verifyAdmin,
  ForbiddenError,
  forbiddenResponse,
  UnauthorizedError,
  unauthorizedResponse,
} from "@/lib/auth/dal";
import { prisma } from "@/lib/companion/prisma";
import { digestEntries, digestName, digestSlug } from "@/lib/digest/input";

export const dynamic = "force-dynamic";

// Digests anlegen und auflisten. Nur für Admins, wie alles unter /api/admin:
// ein Digest entscheidet, was über die Companion-Adresse aus dem Haus geht.

function authError(err: unknown) {
  if (err instanceof UnauthorizedError) return unauthorizedResponse();
  if (err instanceof ForbiddenError) return forbiddenResponse();
  return null;
}

export async function GET() {
  try {
    await verifyAdmin();
    const digests = await prisma.digest.findMany({
      include: { entries: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(digests);
  } catch (err) {
    const res = authError(err);
    if (res) return res;
    throw err;
  }
}

export async function POST(req: NextRequest) {
  try {
    await verifyAdmin();
  } catch (err) {
    const res = authError(err);
    if (res) return res;
    throw err;
  }

  const body = await req.json().catch(() => null);
  const name = digestName(body?.name);
  const slug = digestSlug(body?.slug);
  if (!name || !slug) {
    return NextResponse.json({ error: "Name und Adresse fehlen." }, { status: 400 });
  }
  const entries = body?.entries === undefined ? [] : digestEntries(body.entries);
  if (!entries) {
    return NextResponse.json({ error: "Die Widget-Liste ist ungültig." }, { status: 400 });
  }

  try {
    const digest = await prisma.digest.create({
      data: {
        slug,
        name,
        entries: entries.length ? { create: entries as any } : undefined,
      },
      include: { entries: { orderBy: { order: "asc" } } },
    });
    return NextResponse.json(digest, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Diese Adresse hat schon ein anderer Digest." }, { status: 409 });
    }
    throw e;
  }
}
