import { NextRequest, NextResponse } from "next/server";
import {
  verifyAdmin,
  ForbiddenError,
  forbiddenResponse,
  UnauthorizedError,
  unauthorizedResponse,
} from "@/lib/auth/dal";
import { prisma } from "@/lib/companion/prisma";

export const dynamic = "force-dynamic";

// Die gespeicherten Widgets einer Ansicht, für die Auswahl im Digest-Editor.
// Gespeichert heißt: mit den endgültigen ids — nur auf die kann ein Digest
// zeigen, ein frisch platziertes Widget bekommt seine erst beim Speichern.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyAdmin();
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse();
    if (err instanceof ForbiddenError) return forbiddenResponse();
    throw err;
  }

  const { id } = await params;
  const widgets = await prisma.widget.findMany({
    where: { dashboardId: id },
    select: { id: true, type: true, label: true, config: true },
    orderBy: { id: "asc" },
  });
  return NextResponse.json(widgets);
}
