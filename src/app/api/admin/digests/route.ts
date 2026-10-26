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
  return session.userId;
}

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const digests = await prisma.digest.findMany({
    include: {
      entries: { orderBy: { order: "asc" } },
      dashboard: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(digests);
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { slug, name, dashboardId, entries } = body;

  if (!slug || !name || !dashboardId) {
    return NextResponse.json({ error: "slug, name, and dashboardId are required" }, { status: 400 });
  }

  const safeSlug = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!safeSlug) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const dashboard = await prisma.dashboard.findUnique({ where: { id: dashboardId } });
  if (!dashboard) {
    return NextResponse.json({ error: "View not found" }, { status: 404 });
  }

  try {
    const digest = await prisma.digest.create({
      data: {
        slug: safeSlug,
        name,
        dashboardId,
        entries: entries?.length
          ? {
              create: entries.map((e: any, i: number) => ({
                widgetId: e.widgetId,
                order: e.order ?? i,
                textOptions: e.textOptions ?? {},
              })),
            }
          : undefined,
      },
      include: { entries: { orderBy: { order: "asc" } } },
    });

    return NextResponse.json(digest, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "A digest with this slug already exists" }, { status: 409 });
    }
    throw e;
  }
}
