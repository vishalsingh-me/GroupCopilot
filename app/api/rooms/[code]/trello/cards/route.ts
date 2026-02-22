import { NextResponse } from "next/server";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getCardsByBoard, getListNameMap, isTrelloConfigured } from "@/lib/trello/client";

/**
 * GET /api/rooms/[code]/trello/cards
 *
 * Returns Trello cards for the room's board, merging live Trello data with
 * the local cache. Also refreshes the cache on every call.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room } = await requireRoomMember(code.toUpperCase());

    if (!room.trelloBoardId) {
      return NextResponse.json({ cards: [], connected: false });
    }

    if (!isTrelloConfigured()) {
      // Fall back to cache-only if env not set
      const cached = await prisma.trelloCardCache.findMany({
        where: { roomId: room.id },
        orderBy: { lastSyncedAt: "desc" },
      });
      return NextResponse.json({ cards: cached, connected: false, stale: true });
    }

    // Fetch live cards + list names in parallel
    const [cards, listNameMap] = await Promise.all([
      getCardsByBoard(room.trelloBoardId),
      getListNameMap(room.trelloBoardId),
    ]);

    // Upsert every card into the cache
    await Promise.all(
      cards.map((card) =>
        prisma.trelloCardCache.upsert({
          where: { trelloCardId: card.id },
          update: {
            title: card.name,
            status: listNameMap[card.idList] ?? "Unknown",
            dueDate: card.due ? new Date(card.due) : null,
            lastSyncedAt: new Date(),
          },
          create: {
            roomId: room.id,
            trelloCardId: card.id,
            title: card.name,
            status: listNameMap[card.idList] ?? "Unknown",
            dueDate: card.due ? new Date(card.due) : null,
          },
        })
      )
    );

    return NextResponse.json({
      connected: true,
      cards: cards.map((c) => ({
        id: c.id,
        title: c.name,
        description: c.desc,
        status: listNameMap[c.idList] ?? "Unknown",
        dueDate: c.due,
        url: c.url,
        idMembers: c.idMembers,
      })),
    });
  } catch (error) {
    console.error(error);
    // On Trello API failure, serve stale cache
    const { code } = await ctx.params;
    try {
      const { room } = await requireRoomMember(code.toUpperCase());
      const cached = await prisma.trelloCardCache.findMany({
        where: { roomId: room.id },
        orderBy: { lastSyncedAt: "desc" },
      });
      return NextResponse.json({ cards: cached, connected: false, stale: true });
    } catch {
      return NextResponse.json({ error: "Unable to load Trello cards" }, { status: 400 });
    }
  }
}
