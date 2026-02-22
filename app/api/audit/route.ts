import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const QuerySchema = z.object({
  roomCode: z.string().trim().min(4),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

/**
 * GET /api/audit?roomCode=ABC&limit=50&cursor=<id>
 *
 * Read-only audit log for a room. Returns agent actions, approvals, and
 * Trello publish events in reverse chronological order (newest first).
 * Supports cursor-based pagination via the last returned entry's id.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = QuerySchema.parse(Object.fromEntries(searchParams));

    const { room } = await requireRoomMember(query.roomCode.toUpperCase());

    const logs = await prisma.auditLog.findMany({
      where: { roomId: room.id },
      orderBy: { createdAt: "desc" },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        actor: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    const hasMore = logs.length > query.limit;
    const items = hasMore ? logs.slice(0, -1) : logs;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return NextResponse.json({
      logs: items.map((l) => ({
        id: l.id,
        type: l.type,
        actor: l.actor,
        payload: l.payload,
        createdAt: l.createdAt,
      })),
      nextCursor,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: error.issues } }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Unable to load audit log" }, { status: 400 });
  }
}
