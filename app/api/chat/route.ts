import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getOrCreateSession, getOpenApproval, writeAuditLog } from "@/lib/agent/stateMachine";
import { dispatch } from "@/lib/agent/dispatcher";
import { classifyIntent, buildSmallTalkReply, nextActionHint } from "@/lib/agent/intentRouter";

const ChatSchema = z.object({
  roomCode: z.string().trim().min(4),
  message: z.string().trim().min(1),
  mode: z.enum(["brainstorm", "clarify", "tickets", "schedule", "conflict"]),
});

export async function POST(request: Request) {
  try {
    const body = ChatSchema.parse(await request.json());
    const { room, user } = await requireRoomMember(body.roomCode.toUpperCase());

    // Persist the user message first
    await prisma.message.create({
      data: {
        roomId: room.id,
        senderType: "user",
        senderUserId: user.id,
        content: body.message,
        mode: body.mode,
      },
    });

    // Load room detail and build member context
    const roomDetail = await prisma.room.findUniqueOrThrow({
      where: { id: room.id },
      select: {
        id: true,
        projectGoal: true,
        members: {
          select: {
            userId: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    const memberIds = roomDetail.members.map((m) => m.userId);
    const memberNameMap: Record<string, string> = {};
    const memberNames: string[] = [];
    for (const m of roomDetail.members) {
      const name = m.user.name ?? m.user.email;
      memberNameMap[m.userId] = name;
      memberNames.push(name);
    }

    const session = await getOrCreateSession(room.id);
    const openApproval = await getOpenApproval(session.id);

    // ── Intent routing (deterministic, no LLM) ───────────────────────────────
    const intent = classifyIntent(body.message);

    if (intent === "SMALL_TALK") {
      const hint = nextActionHint(session.state);
      const replyText = buildSmallTalkReply(body.message, Boolean(openApproval), hint);

      await writeAuditLog(room.id, "small_talk_intercepted", {
        message: body.message.slice(0, 120),
        state: session.state,
      }, user.id);

      const assistantMessage = await prisma.message.create({
        data: {
          roomId: room.id,
          senderType: "assistant",
          senderUserId: null,
          content: replyText,
          mode: body.mode,
          metadata: { agentState: session.state, routed: "small_talk" },
        },
      });

      return NextResponse.json({
        assistantMessage,
        agentState: session.state,
        mockMode: false,
      });
    }

    if (intent === "GATE_FEEDBACK" && openApproval) {
      const replyText =
        `Got it — I've noted your suggestion. The gate is still open for voting. ` +
        `To request a revision, click **Request Changes** and include your edit in the comment.`;

      await writeAuditLog(room.id, "gate_edit_requested", {
        message: body.message.slice(0, 200),
        approvalId: openApproval.id,
      }, user.id);

      const assistantMessage = await prisma.message.create({
        data: {
          roomId: room.id,
          senderType: "assistant",
          senderUserId: null,
          content: replyText,
          mode: body.mode,
          metadata: {
            agentState: session.state,
            routed: "gate_feedback",
            approvalRequestId: openApproval.id,
          },
        },
      });

      return NextResponse.json({
        assistantMessage,
        agentState: session.state,
        approvalRequestId: openApproval.id,
        mockMode: false,
      });
    }

    // ── Normal FSM dispatch ───────────────────────────────────────────────────
    const result = await dispatch({
      session,
      roomId: room.id,
      userId: user.id,
      userMessage: body.message,
      memberIds,
      memberNames,
      memberNameMap,
      projectGoal: roomDetail.projectGoal,
    });

    if (isDev) {
      console.log("[api/chat] result", {
        mockMode: result.mockMode,
        newState: result.newState ?? null,
        textLength: result.text.length,
      });
    }

    const assistantText = result.text.trim() || "I had trouble generating a reply. Please try rephrasing.";

    const assistantMessage = await prisma.message.create({
      data: {
        roomId: room.id,
        senderType: "assistant",
        senderUserId: null,
        content: assistantText,
        mode: body.mode,
        metadata: result.approvalRequestId
          ? { approvalRequestId: result.approvalRequestId, agentState: result.newState }
          : result.newState
          ? { agentState: result.newState }
          : undefined,
      },
    });

    return NextResponse.json({
      assistantMessage,
      agentState: result.newState,
      approvalRequestId: result.approvalRequestId,
      mockMode: result.mockMode,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", issues: error.issues } },
        { status: 400 }
      );
    }
    console.error("[chat] Unhandled error:", error);
    return NextResponse.json({ error: "Unable to generate response" }, { status: 500 });
  }
}

const isDev = process.env.NODE_ENV !== "production";
