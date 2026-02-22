import { NextResponse } from "next/server";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/approvals/[id]
 *
 * Fetch a single approval request with full vote tally.
 * The caller must be a member of the room the approval belongs to.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const approval = await prisma.approvalRequest.findUnique({
      where: { id },
      include: {
        votes: { select: { userId: true, vote: true, comment: true, votedAt: true } },
        session: { include: { room: true } },
      },
    });

    if (!approval) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Auth: require membership in the approval's room
    const { user } = await requireRoomMember(approval.session.room.code);

    const memberCount = await prisma.roomMember.count({
      where: { roomId: approval.session.roomId },
    });

    return NextResponse.json({
      approval: {
        id: approval.id,
        type: approval.type,
        payload: approval.payload,
        status: approval.status,
        resolvedAt: approval.resolvedAt,
        votes: approval.votes,
        approveCount: approval.votes.filter((v) => v.vote === "approve").length,
        changeCount: approval.votes.filter((v) => v.vote === "request_change").length,
        memberCount,
        userVote: approval.votes.find((v) => v.userId === user.id)?.vote ?? null,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load approval" }, { status: 400 });
  }
}
