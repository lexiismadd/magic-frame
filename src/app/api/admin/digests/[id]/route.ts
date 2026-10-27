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

type Ctx = { params: Promise<{ id: string }> };

async function guard(): Promise<NextResponse | null> {
  try {
    await verifyAdmin();
    return null;
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse();
    if (err instanceof ForbiddenError) return forbiddenResponse();
    throw err;
  }
}

const notFound = () => NextResponse.json({ error: "Digest nicht gefunden." }, { status: 404 });

export async function GET(_req: NextRequest, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;

  const { id } = await params;
  const digest = await prisma.digest.findUnique({
    where: { id },
    include: { entries: { orderBy: { order: "asc" } } },
  });
  return digest ? NextResponse.json(digest) : notFound();
}

// Ersetzt Name, Adresse und die ganze Widget-Liste in einem Zug — wie das
// Speichern einer Ansicht. Was fehlt, bleibt, wie es war.
export async function PUT(req: NextRequest, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.digest.findUnique({ where: { id } });
  if (!existing) return notFound();

  const body = await req.json().catch(() => null);
  const name = body?.name === undefined ? existing.name : digestName(body.name);
  const slug = body?.slug === undefined ? existing.slug : digestSlug(body.slug);
  if (!name || !slug) {
    return NextResponse.json({ error: "Name und Adresse fehlen." }, { status: 400 });
  }
  const entries = body?.entries === undefined ? undefined : digestEntries(body.entries);
  if (entries === null) {
    return NextResponse.json({ error: "Die Widget-Liste ist ungültig." }, { status: 400 });
  }

  try {
    await prisma.$transaction([
      ...(entries ? [prisma.digestEntry.deleteMany({ where: { digestId: id } })] : []),
      prisma.digest.update({
        where: { id },
        data: {
          name,
          slug,
          ...(entries?.length ? { entries: { create: entries as any } } : {}),
        },
      }),
    ]);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Diese Adresse hat schon ein anderer Digest." }, { status: 409 });
    }
    throw e;
  }

  const updated = await prisma.digest.findUnique({
    where: { id },
    include: { entries: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;

  const { id } = await params;
  try {
    await prisma.digest.delete({ where: { id } });
  } catch (e: any) {
    if (e?.code === "P2025") return notFound();
    throw e;
  }
  return NextResponse.json({ ok: true });
}
