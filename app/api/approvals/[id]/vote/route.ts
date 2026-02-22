import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { castVote, writeAuditLog, getOrCreateSession, advanceSession } from "@/lib/agent/stateMachine";
import { dispatch } from "@/lib/agent/dispatcher";

const VoteSchema = z.object({
  vote: z.enum(["approve", "request_change"]),
  comment: z.string().trim().max(500).optional(),
});

/**
 * POST /api/approvals/[id]/vote
 *
 * Cast or update a vote on an approval gate.
 * If the gate resolves (all approve or any request_change), the agent state
 * machine automatically advances or reverts.
 *
 * Body: { vote: "approve" | "request_change", comment?: string }
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const body = VoteSchema.parse(await req.json());

    // Load the approval and verify the user is a room member
    const approval = await prisma.approvalRequest.findUnique({
      where: { id },
      include: {
        session: {
          include: { room: { include: { members: { include: { user: true } } } } },
        },
        votes: true,
      },
    });

    if (!approval) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (approval.status !== "pending") {
      return NextResponse.json(
        { error: "This approval gate is already resolved." },
        { status: 409 }
      );
    }

    const { user } = await requireRoomMember(approval.session.room.code);

    // Cast the vote
    const { resolved, status } = await castVote(id, user.id, body.vote, body.comment);

    await writeAuditLog(
      approval.session.roomId,
      "vote_cast",
      { approvalId: id, vote: body.vote, resolved, status },
      user.id
    );

    if (!resolved) {
      const approveCount = approval.votes.filter((v) => v.vote === "approve").length + (body.vote === "approve" ? 1 : 0);
      const memberCount = approval.session.room.members.length;
      return NextResponse.json({
        resolved: false,
        status: "pending",
        message: `Vote recorded. ${approveCount}/${memberCount} approved so far.`,
      });
    }

    // Gate resolved — drive the state machine forward with a synthetic dispatch
    const room = approval.session.room;
    const members = room.members;
    const memberNameMap: Record<string, string> = {};
    for (const m of members) {
      memberNameMap[m.userId] = m.user.name ?? m.user.email;
    }

    const session = await prisma.agentSession.findUniqueOrThrow({
      where: { id: approval.session.id },
    });

    // Build a synthetic user message that the dispatcher can interpret
    const syntheticMessage = status === "approved" ? "approve" : body.comment ?? "request_change";

    const result = await dispatch({
      session: session as Parameters<typeof dispatch>[0]["session"],
      roomId: room.id,
      userId: user.id,
      userMessage: syntheticMessage,
      memberIds: members.map((m) => m.userId),
      memberNames: members.map((m) => m.user.name ?? m.user.email),
      memberNameMap,
      projectGoal: room.projectGoal,
    });

    // Persist the agent's response as an assistant message
    if (result.text) {
      await prisma.message.create({
        data: {
          roomId: room.id,
          senderType: "assistant",
          senderUserId: null,
          content: result.text,
          mode: "brainstorm",
          metadata: result.approvalRequestId
            ? { approvalRequestId: result.approvalRequestId, agentState: result.newState }
            : result.newState
              ? { agentState: result.newState }
              : undefined,
        },
      });
    }

    return NextResponse.json({
      resolved: true,
      status,
      agentState: result.newState,
      approvalRequestId: result.approvalRequestId,
      message:
        status === "approved"
          ? "Gate approved — moving to the next phase."
          : "Changes requested — agent will revise.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: error.issues } }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Unable to record vote" }, { status: 400 });
  }
}
