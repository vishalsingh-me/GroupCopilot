import { NextResponse } from "next/server";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { currentWeekNumber } from "@/lib/agent/stateMachine";

/**
 * GET /api/rooms/[code]/session
 *
 * Returns the current agent session for the room (this week) plus any open
 * approval gate. The frontend uses this to render the correct phase UI and
 * approval action buttons.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room, user } = await requireRoomMember(code.toUpperCase());
    const weekNumber = currentWeekNumber();

    const session = await prisma.agentSession.findUnique({
      where: { roomId_weekNumber: { roomId: room.id, weekNumber } },
    });

    if (!session) {
      return NextResponse.json({ session: null, approval: null });
    }

    // Fetch the open approval gate (if any) along with vote tally
    const approval = await prisma.approvalRequest.findFirst({
      where: { sessionId: session.id, status: "pending" },
      include: { votes: { select: { userId: true, vote: true, comment: true, votedAt: true } } },
      orderBy: { id: "desc" },
    });

    // Fetch total member count for quorum display
    const memberCount = await prisma.roomMember.count({ where: { roomId: room.id } });

    return NextResponse.json({
      session: {
        id: session.id,
        state: session.state,
        weekNumber: session.weekNumber,
        data: session.data,
      },
      approval: approval
        ? {
            id: approval.id,
            type: approval.type,
            payload: approval.payload,
            status: approval.status,
            votes: approval.votes,
            approveCount: approval.votes.filter((v) => v.vote === "approve").length,
            changeCount: approval.votes.filter((v) => v.vote === "request_change").length,
            memberCount,
            userVote: approval.votes.find((v) => v.userId === user.id)?.vote ?? null,
          }
        : null,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load session" }, { status: 400 });
  }
}
