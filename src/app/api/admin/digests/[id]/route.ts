import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSession } from "@/lib/auth/session";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function requireAuth() {
  const session = await getSession();
  if (!session.userId) throw new Error("Unauthorized");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const digest = await prisma.digest.findUnique({
    where: { id },
    include: {
      entries: { orderBy: { order: "asc" } },
      dashboard: {
        select: {
          id: true,
          name: true,
          widgets: { select: { id: true, type: true, label: true, config: true } },
        },
      },
    },
  });

  if (!digest) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(digest);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, slug, entries } = body;

  const existing = await prisma.digest.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const safeSlug = slug
    ? slug
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
    : existing.slug;

  await prisma.$transaction([
    prisma.digestEntry.deleteMany({ where: { digestId: id } }),
    prisma.digest.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        slug: safeSlug,
        ...(entries
          ? {
              entries: {
                create: entries.map((e: any, i: number) => ({
                  widgetId: e.widgetId,
                  order: e.order ?? i,
                  textOptions: e.textOptions ?? {},
                })),
              },
            }
          : {}),
      },
    }),
  ]);

  const updated = await prisma.digest.findUnique({
    where: { id },
    include: {
      entries: { orderBy: { order: "asc" } },
      dashboard: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    await prisma.digest.delete({ where: { id } });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
