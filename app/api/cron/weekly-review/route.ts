import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateFromPrompt } from "@/lib/llm/gemini";
import { advanceSession, currentWeekNumber, writeAuditLog } from "@/lib/agent/stateMachine";
import { weeklyReviewPrompt } from "@/lib/agent/prompts";
import { patchSessionData } from "@/lib/agent/stateMachine";

/**
 * GET /api/cron/weekly-review
 *
 * Vercel Cron job — runs once per week (Sunday evening, see vercel.json).
 * For every room in MONITOR state that has reached end-of-week:
 *   1. Gathers completed / stalled task data from TrelloCardCache
 *   2. Generates a weekly review summary via Gemini
 *   3. Posts it as a system message in the room
 *   4. Advances the session to IDLE (ready for next week)
 *
 * Secured by CRON_SECRET.
 */
export async function GET(req: Request) {
  const secret = req.headers.get("authorization");
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const DONE_STATUSES = ["Done", "Complete", "Completed", "Closed"];
  const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

  // Find rooms in MONITOR state from the current or previous week
  const currentWeek = currentWeekNumber();
  const sessions = await prisma.agentSession.findMany({
    where: {
      state: "MONITOR",
      weekNumber: { lte: currentWeek },
    },
    include: {
      room: { include: { members: { include: { user: true } } } },
    },
  });

  const results: Array<{ roomId: string; reviewGenerated: boolean }> = [];

  for (const session of sessions) {
    const room = session.room;

    try {
      const allCards = await prisma.trelloCardCache.findMany({ where: { roomId: room.id } });
      const completed = allCards.filter((c) => DONE_STATUSES.includes(c.status)).map((c) => c.title);
      const stalled = allCards
        .filter((c) => !DONE_STATUSES.includes(c.status) && c.lastSyncedAt < new Date(Date.now() - STALE_THRESHOLD_MS))
        .map((c) => c.title);
      const published = allCards.map((c) => c.title);

      const memberNames = room.members.map((m) => m.user.name ?? m.user.email);

      const { text } = await generateFromPrompt(
        weeklyReviewPrompt(
          { projectGoal: room.projectGoal, memberNames, weekNumber: session.weekNumber },
          published,
          stalled,
          completed
        ),
        `Week ${session.weekNumber} complete. ${completed.length} task(s) done, ${stalled.length} stalled. Great work — see you next week!`
      );

      // Post review as a system message
      await prisma.message.create({
        data: {
          roomId: room.id,
          senderType: "system",
          senderUserId: null,
          content: `**Week ${session.weekNumber} Review**\n\n${text}`,
          mode: "brainstorm",
          metadata: { type: "weekly_review", weekNumber: session.weekNumber },
        },
      });

      // Save review summary on session data for next week's kickoff
      await patchSessionData(session.id, { reviewSummary: text });

      // Advance to IDLE — ready for next week's planning
      await advanceSession(session.id, "WEEKLY_REVIEW");
      await advanceSession(session.id, "IDLE");

      await writeAuditLog(room.id, "weekly_review_completed", {
        weekNumber: session.weekNumber,
        completedCount: completed.length,
        stalledCount: stalled.length,
      });

      results.push({ roomId: room.id, reviewGenerated: true });
    } catch (err) {
      console.error(`Weekly review failed for room ${room.id}:`, err);
      results.push({ roomId: room.id, reviewGenerated: false });
    }
  }

  return NextResponse.json({ ok: true, processed: sessions.length, results });
}
