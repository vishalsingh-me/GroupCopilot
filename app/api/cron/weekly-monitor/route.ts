import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCardsByBoard, getListNameMap, isTrelloConfigured } from "@/lib/trello/client";
import { writeAuditLog } from "@/lib/agent/stateMachine";

/**
 * GET /api/cron/weekly-monitor
 *
 * Vercel Cron job — runs daily (see vercel.json).
 * For every room in MONITOR state:
 *   1. Syncs Trello card statuses into TrelloCardCache
 *   2. Identifies cards with no movement for 7+ days
 *   3. Posts a nudge message in the room chat if stalls are found
 *   4. Updates the HealthSnapshot for the current week
 *
 * Secured by CRON_SECRET — Vercel sets this automatically on cron invocations.
 */
export async function GET(req: Request) {
  const secret = req.headers.get("authorization");
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
  const DONE_STATUSES = ["Done", "Complete", "Completed", "Closed"];

  // Find all rooms currently in MONITOR state
  const sessions = await prisma.agentSession.findMany({
    where: { state: "MONITOR" },
    include: { room: true },
  });

  const results: Array<{ roomId: string; stalledCount: number; nudged: boolean }> = [];

  for (const session of sessions) {
    const room = session.room;
    let stalledTitles: string[] = [];

    // Sync Trello if connected
    if (room.trelloBoardId && isTrelloConfigured()) {
      try {
        const [cards, listNameMap] = await Promise.all([
          getCardsByBoard(room.trelloBoardId),
          getListNameMap(room.trelloBoardId),
        ]);

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
      } catch (err) {
        console.error(`Trello sync failed for room ${room.id}:`, err);
      }
    }

    // Detect stalled cards (not done, no movement in 7+ days)
    const stalled = await prisma.trelloCardCache.findMany({
      where: {
        roomId: room.id,
        status: { notIn: DONE_STATUSES },
        lastSyncedAt: { lt: new Date(Date.now() - STALE_THRESHOLD_MS) },
      },
    });

    stalledTitles = stalled.map((c) => c.title);

    // Count participation (messages sent by users in last 7 days)
    const recentMessages = await prisma.message.findMany({
      where: {
        roomId: room.id,
        senderType: "user",
        createdAt: { gte: new Date(Date.now() - STALE_THRESHOLD_MS) },
      },
      select: { senderUserId: true },
    });

    const participation: Record<string, number> = {};
    for (const msg of recentMessages) {
      if (msg.senderUserId) {
        participation[msg.senderUserId] = (participation[msg.senderUserId] ?? 0) + 1;
      }
    }

    // Upsert HealthSnapshot
    await prisma.healthSnapshot.upsert({
      where: { roomId_weekNumber: { roomId: room.id, weekNumber: session.weekNumber } },
      update: { participation, stallCount: stalledTitles.length },
      create: {
        roomId: room.id,
        weekNumber: session.weekNumber,
        participation,
        stallCount: stalledTitles.length,
      },
    });

    // Post a nudge message if there are stalled tasks
    let nudged = false;
    if (stalledTitles.length > 0) {
      const taskList = stalledTitles.map((t) => `- **${t}**`).join("\n");
      await prisma.message.create({
        data: {
          roomId: room.id,
          senderType: "system",
          senderUserId: null,
          content: `Weekly check-in: ${stalledTitles.length} task(s) haven't moved in over a week:\n${taskList}\n\nDoes anyone want to provide an update or flag a blocker?`,
          mode: "brainstorm",
        },
      });
      nudged = true;
      await writeAuditLog(room.id, "monitor_nudge_sent", { stalledTasks: stalledTitles, weekNumber: session.weekNumber });
    }

    results.push({ roomId: room.id, stalledCount: stalledTitles.length, nudged });
  }

  return NextResponse.json({ ok: true, processed: sessions.length, results });
}
