import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_MESSAGE_MODE,
  ensureRoomThread,
  touchConversationThread,
} from "@/lib/chat/threads";
import { generatePlanCopilotReply } from "@/lib/llm/gemini";
import type {
  PlanCopilotHistoryItem,
  PlanCopilotRoomContext,
} from "@/lib/llm/prompts/planCopilot";

const ChatSchema = z.object({
  roomCode: z.string().trim().min(4),
  message: z.string().trim().min(1),
  threadId: z.string().trim().min(1).optional(),
});

const SAFE_GEMINI_FAILURE_MESSAGE = "I'm having trouble reaching Gemini, try again.";

export async function POST(request: Request) {
  try {
    const body = ChatSchema.parse(await request.json());
    const { room, user } = await requireRoomMember(body.roomCode.toUpperCase());
    const thread = await ensureRoomThread(room.id, user.id, body.threadId);

    const [historyMessages, roomContext] = await Promise.all([
      prisma.message.findMany({
        where: { roomId: room.id, threadId: thread.id },
        orderBy: { createdAt: "desc" },
        take: 40,
        include: {
          senderUser: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      }),
      buildRoomContext(room.id, room.code),
    ]);

    const userMessage = await prisma.message.create({
      data: {
        roomId: room.id,
        threadId: thread.id,
        senderType: "user",
        senderUserId: user.id,
        content: body.message,
        mode: DEFAULT_MESSAGE_MODE,
      },
    });
    await touchConversationThread(thread.id, userMessage.createdAt);

    let llmResult;
    try {
      llmResult = await generatePlanCopilotReply({
        message: body.message,
        history: mapHistoryForPrompt(historyMessages),
        roomContext,
        threadSummary: thread.summary,
      });
    } catch (error) {
      console.error("[chat] Gemini call failed", error);
      llmResult = {
        text: SAFE_GEMINI_FAILURE_MESSAGE,
        mockMode: true,
      };
    }

    const assistantText = llmResult.text.trim() || SAFE_GEMINI_FAILURE_MESSAGE;
    const assistantMessage = await prisma.message.create({
      data: {
        roomId: room.id,
        threadId: thread.id,
        senderType: "assistant",
        senderUserId: null,
        content: assistantText,
        mode: DEFAULT_MESSAGE_MODE,
      },
    });
    await touchConversationThread(thread.id, assistantMessage.createdAt);
    await maybeRefreshThreadSummary(room.id, thread.id);

    return NextResponse.json({
      assistantMessage,
      threadId: thread.id,
      mockMode: llmResult.mockMode,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", issues: error.issues } },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message === "THREAD_NOT_FOUND") {
      return NextResponse.json(
        { error: "Conversation not found in this room." },
        { status: 404 }
      );
    }

    console.error("[chat] Unhandled error:", error);
    return NextResponse.json({ error: "Unable to generate response" }, { status: 500 });
  }
}

async function buildRoomContext(roomId: string, roomCode: string): Promise<PlanCopilotRoomContext> {
  const [roomDetail, recentCards] = await Promise.all([
    prisma.room.findUnique({
      where: { id: roomId },
      select: {
        code: true,
        name: true,
        trelloBoardId: true,
        trelloBoardShortLink: true,
        members: {
          select: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        projectPlan: {
          select: {
            title: true,
            description: true,
            deadlineAt: true,
            cadence: true,
            milestones: {
              select: {
                index: true,
                title: true,
                dueAt: true,
              },
              orderBy: {
                index: "asc",
              },
            },
          },
        },
      },
    }),
    prisma.trelloCardCache.findMany({
      where: { roomId },
      orderBy: { lastSyncedAt: "desc" },
      take: 5,
      select: {
        title: true,
        status: true,
        dueDate: true,
      },
    }),
  ]);

  const trelloBoardUrl = roomDetail?.trelloBoardShortLink
    ? `https://trello.com/b/${roomDetail.trelloBoardShortLink}`
    : roomDetail?.trelloBoardId
      ? `https://trello.com/b/${roomDetail.trelloBoardId}`
      : null;

  return {
    roomCode: roomDetail?.code ?? roomCode,
    roomName: roomDetail?.name ?? null,
    members:
      roomDetail?.members.map((member) => member.user.name ?? member.user.email).filter(Boolean) ??
      [],
    trelloBoardUrl,
    projectPlan: roomDetail?.projectPlan
      ? {
          title: roomDetail.projectPlan.title,
          description: roomDetail.projectPlan.description,
          deadlineAt: roomDetail.projectPlan.deadlineAt.toISOString(),
          cadence: roomDetail.projectPlan.cadence,
          milestones: roomDetail.projectPlan.milestones.map((milestone) => ({
            index: milestone.index,
            title: milestone.title,
            dueAt: milestone.dueAt.toISOString(),
          })),
        }
      : null,
    recentCards: recentCards.map((card) => ({
      title: card.title,
      status: card.status,
      dueDate: card.dueDate?.toISOString() ?? null,
    })),
  };
}

function mapHistoryForPrompt(
  messages: Array<{
    senderType: "user" | "assistant" | "system" | "tool";
    content: string;
    senderUser: { name: string | null; email: string } | null;
  }>
): PlanCopilotHistoryItem[] {
  return messages
    .slice()
    .reverse()
    .filter(
      (message) => message.senderType === "user" || message.senderType === "assistant"
    )
    .map((message) => ({
      role: message.senderType === "assistant" ? "assistant" : "user",
      name: message.senderUser?.name ?? message.senderUser?.email ?? undefined,
      content: message.content,
    }));
}

async function maybeRefreshThreadSummary(roomId: string, threadId: string) {
  const userMessageCount = await prisma.message.count({
    where: {
      roomId,
      threadId,
      senderType: "user",
    },
  });

  if (userMessageCount === 0 || userMessageCount % 10 !== 0) {
    return;
  }

  const recent = await prisma.message.findMany({
    where: {
      roomId,
      threadId,
      senderType: { in: ["user", "assistant"] },
    },
    orderBy: { createdAt: "desc" },
    take: 24,
  });

  if (recent.length === 0) {
    return;
  }

  const summary = buildHeuristicSummary(recent.reverse());
  await prisma.conversationThread.update({
    where: { id: threadId },
    data: {
      summary,
      summaryUpdatedAt: new Date(),
    },
  });
}

function buildHeuristicSummary(
  messages: Array<{
    senderType: "user" | "assistant" | "system" | "tool";
    content: string;
  }>
): string {
  const userPoints = messages
    .filter((message) => message.senderType === "user")
    .slice(-6)
    .map((message) => `- ${trimForSummary(message.content)}`);

  const assistantPoints = messages
    .filter((message) => message.senderType === "assistant")
    .slice(-4)
    .map((message) => `- ${trimForSummary(message.content)}`);

  return [
    "Recent user requests:",
    userPoints.length > 0 ? userPoints.join("\n") : "- None",
    "",
    "Recent assistant guidance:",
    assistantPoints.length > 0 ? assistantPoints.join("\n") : "- None",
  ].join("\n");
}

function trimForSummary(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 180) {
    return cleaned;
  }
  return `${cleaned.slice(0, 177)}...`;
}
