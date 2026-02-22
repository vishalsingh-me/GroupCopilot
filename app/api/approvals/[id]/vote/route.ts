import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { advanceSession, castVote, writeAuditLog } from "@/lib/agent/stateMachine";
import { dispatch } from "@/lib/agent/dispatcher";

const VoteSchema = z.object({
  vote: z.enum(["approve", "request_change"]),
  comment: z.string().trim().max(500).optional(),
});

type VoteErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "ALREADY_RESOLVED"
  | "VOTE_FAILED";

function jsonError(status: number, error: VoteErrorCode, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, message, ...(extra ?? {}) }, { status });
}

function authHeaderSnapshot(headers: Headers) {
  return {
    host: headers.get("host"),
    origin: headers.get("origin"),
    referer: headers.get("referer"),
    userAgent: headers.get("user-agent"),
    forwardedFor: headers.get("x-forwarded-for"),
    forwardedHost: headers.get("x-forwarded-host"),
    forwardedProto: headers.get("x-forwarded-proto"),
    cookiePresent: Boolean(headers.get("cookie")),
  };
}

function roomCodeFromBody(rawBody: unknown): string | null {
  if (!rawBody || typeof rawBody !== "object") return null;
  const value = (rawBody as Record<string, unknown>).roomCode;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function logVoteError(stage: string, error: unknown, context: Record<string, unknown> = {}) {
  const prismaMeta =
    error instanceof Prisma.PrismaClientKnownRequestError
      ? {
          code: error.code,
          clientVersion: error.clientVersion,
          meta: error.meta,
        }
      : null;

  console.error("[approvals/vote] error", {
    stage,
    ...context,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
    prisma: prismaMeta,
  });
}

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
  let approvalId: string | null = null;
  let roomCodeHint: string | null = null;
  let sessionSnapshot: { userId: string | null; email: string | null } = {
    userId: null,
    email: null,
  };

  try {
    const { id } = await ctx.params;
    approvalId = id;

    const url = new URL(req.url);
    const roomCodeInQuery = url.searchParams.get("roomCode");
    const rawBody: unknown = await req.json().catch(() => null);
    const parsedBody = VoteSchema.safeParse(rawBody);
    roomCodeHint = roomCodeInQuery ?? roomCodeFromBody(rawBody);

    let user: Awaited<ReturnType<typeof requireSessionUser>>["user"] | null = null;
    try {
      const auth = await requireSessionUser();
      user = auth.user;
      sessionSnapshot = { userId: user.id, email: user.email };
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        console.info("[approvals/vote] request", {
          approvalId,
          parsedBody: parsedBody.success ? parsedBody.data : rawBody,
          userSession: sessionSnapshot,
          headers: authHeaderSnapshot(req.headers),
          roomCode: roomCodeHint,
        });
        return jsonError(401, "UNAUTHORIZED", "Not signed in");
      }
      throw error;
    }

    console.info("[approvals/vote] request", {
      approvalId,
      parsedBody: parsedBody.success ? parsedBody.data : rawBody,
      userSession: sessionSnapshot,
      headers: authHeaderSnapshot(req.headers),
      roomCode: roomCodeHint,
    });

    if (!parsedBody.success) {
      return jsonError(
        400,
        "VALIDATION_ERROR",
        "Invalid vote payload. Expected vote: \"approve\" | \"request_change\".",
        { issues: parsedBody.error.issues }
      );
    }
    if (!user) {
      return jsonError(401, "UNAUTHORIZED", "Not signed in");
    }
    const body = parsedBody.data;

    // Load the approval and verify the user is a room member
    const approval = await prisma.approvalRequest.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        status: true,
        sessionId: true,
        session: {
          select: {
            id: true,
            roomId: true,
          },
        },
        votes: {
          select: {
            userId: true,
            vote: true,
            comment: true,
            votedAt: true,
          },
        },
      },
    });

    if (!approval) {
      return jsonError(404, "NOT_FOUND", "Approval request not found.");
    }

    const membership = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: approval.session.roomId,
          userId: user.id,
        },
      },
      select: { id: true },
    });
    if (!membership) {
      return jsonError(403, "FORBIDDEN", "You are not a member of this room.");
    }

    if (approval.status !== "pending") {
      return jsonError(409, "ALREADY_RESOLVED", "This approval gate is already resolved.");
    }

    // Cast the vote
    const { resolved, status, voteRecord } = await castVote(id, user.id, body.vote, body.comment);
    console.info("[approvals/vote] vote_persisted", {
      approvalId: id,
      requestId: voteRecord.requestId,
      userId: voteRecord.userId,
      storedRowId: voteRecord.id,
      storedVote: voteRecord.vote,
      votedAt: voteRecord.votedAt.toISOString(),
    });

    const latestApproval = await prisma.approvalRequest.findUnique({
      where: { id },
      select: {
        votes: { select: { userId: true, vote: true } },
      },
    });
    const latestVotes = latestApproval?.votes ?? [];
    const approveCount = latestVotes.filter((v) => v.vote === "approve").length;
    const changeCount = latestVotes.filter((v) => v.vote === "request_change").length;
    const memberCount = await prisma.roomMember.count({
      where: { roomId: approval.session.roomId },
    });

    await writeAuditLog(
      approval.session.roomId,
      "vote_cast",
      {
        approvalId: id,
        vote: body.vote,
        resolved,
        status,
        approveCount,
        changeCount,
        memberCount,
      },
      user.id
    );

    if (!resolved) {
      return NextResponse.json({
        ok: true,
        resolved: false,
        status: "pending",
        approveCount,
        changeCount,
        memberCount,
        message: `Vote recorded. ${approveCount}/${memberCount} approved so far.`,
      });
    }

    // Gate resolved — explicitly advance state before dispatching follow-up
    const room = await prisma.room.findUniqueOrThrow({
      where: { id: approval.session.roomId },
      select: { id: true, projectGoal: true },
    });
    const members = await prisma.roomMember.findMany({
      where: { roomId: approval.session.roomId },
      select: {
        userId: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });
    const memberIds = members.map((m) => m.userId);
    const memberNames = members.map((m) => m.user.name ?? m.user.email);
    const memberNameMap: Record<string, string> = {};
    for (const m of members) {
      memberNameMap[m.userId] = m.user.name ?? m.user.email;
    }

    if (status === "rejected") {
      const revertTo = approval.type === "SKELETON" ? "SKELETON_DRAFT" : "TASK_PROPOSALS";
      await writeAuditLog(
        approval.session.roomId,
        `gate_${approval.type.toLowerCase()}_rejected`,
        { requestId: id },
        user.id
      );
      const reverted = await advanceSession(approval.session.id, revertTo);
      await writeAuditLog(approval.session.roomId, "state_reverted", { to: revertTo }, user.id);

      const result = await dispatch({
        session: reverted as Parameters<typeof dispatch>[0]["session"],
        roomId: room.id,
        userId: user.id,
        userMessage: body.comment ?? "request_change",
        memberIds,
        memberNames,
        memberNameMap,
        projectGoal: room.projectGoal,
      });

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
        ok: true,
        resolved: true,
        status,
        agentState: result.newState ?? revertTo,
        approvalRequestId: result.approvalRequestId,
        message: "Changes requested — agent will revise.",
      });
    }

    await writeAuditLog(
      approval.session.roomId,
      `gate_${approval.type.toLowerCase()}_approved`,
      { requestId: id },
      user.id
    );

    const nextState = approval.type === "SKELETON" ? "PLANNING_MEETING" : "TRELLO_PUBLISH";
    const advanced = await advanceSession(approval.session.id, nextState);

    const result = await dispatch({
      session: advanced as Parameters<typeof dispatch>[0]["session"],
      roomId: room.id,
      userId: user.id,
      userMessage: "approve",
      memberIds,
      memberNames,
      memberNameMap,
      projectGoal: room.projectGoal,
    });

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
      ok: true,
      resolved: true,
      status,
      agentState: result.newState ?? nextState,
      approvalRequestId: result.approvalRequestId,
      message:
        approval.type === "SKELETON"
          ? "Gate approved — moving to planning meeting."
          : "Gate approved — publishing tasks to Trello.",
    });
  } catch (error) {
    logVoteError("POST", error, {
      approvalId,
      roomCode: roomCodeHint,
      session: sessionSnapshot,
    });

    if (error instanceof z.ZodError) {
      return jsonError(400, "VALIDATION_ERROR", "Invalid vote payload.", {
        issues: error.issues,
      });
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError(401, "UNAUTHORIZED", "Not signed in");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return jsonError(500, "VOTE_FAILED", "Unable to record vote right now.", {
        prismaCode: error.code,
      });
    }
    return jsonError(500, "VOTE_FAILED", "Unable to record vote.");
  }
}
