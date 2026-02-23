import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoomMember } from "@/lib/auth-helpers";
import {
  DEFAULT_MESSAGE_MODE,
  ensureRoomThread,
  touchConversationThread,
} from "@/lib/chat/threads";

const MessageCreateSchema = z.object({
  content: z.string().trim().min(1),
  threadId: z.string().trim().min(1).optional(),
});

export async function GET(
  req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room, user } = await requireRoomMember(code.toUpperCase());
    const url = new URL(req.url);
    const threadId = url.searchParams.get("threadId");
    const thread = await ensureRoomThread(room.id, user.id, threadId);

    const messages = await prisma.message.findMany({
      where: { roomId: room.id, threadId: thread.id },
      orderBy: { createdAt: "asc" },
      include: { senderUser: true }
    });

    return NextResponse.json({
      threadId: thread.id,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.senderType,
        sender:
          m.senderType === "assistant"
            ? "Assistant"
            : m.senderType === "tool"
              ? "Tool"
              : m.senderType === "system"
              ? "System"
                : (m.senderUser?.name ?? m.senderUser?.email ?? "You"),
        content: m.content,
        mode: m.mode,
        threadId: m.threadId,
        metadata: m.metadata,
        createdAt: m.createdAt,
        timestamp: m.createdAt
      }))
    });
  } catch (error) {
    if (isMissingConversationThreadTable(error)) {
      return NextResponse.json(
        {
          error:
            "Conversation threads are not available yet. Run `npx prisma migrate deploy` to apply the latest schema.",
        },
        { status: 503 }
      );
    }
    if (error instanceof Error && error.message === "THREAD_NOT_FOUND") {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    console.error(error);
    return NextResponse.json({ error: "Unable to load messages" }, { status: 400 });
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { user, room } = await requireRoomMember(code.toUpperCase());
    const body = MessageCreateSchema.parse(await req.json());
    const thread = await ensureRoomThread(room.id, user.id, body.threadId);

    const message = await prisma.message.create({
      data: {
        roomId: room.id,
        threadId: thread.id,
        senderType: "user",
        senderUserId: user.id,
        content: body.content,
        mode: DEFAULT_MESSAGE_MODE,
      }
    });
    await touchConversationThread(thread.id, message.createdAt);

    return NextResponse.json({ threadId: thread.id, message }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            issues: error.issues
          }
        },
        { status: 400 }
      );
    }
    if (isMissingConversationThreadTable(error)) {
      return NextResponse.json(
        {
          error:
            "Conversation threads are not available yet. Run `npx prisma migrate deploy` to apply the latest schema.",
        },
        { status: 503 }
      );
    }
    if (error instanceof Error && error.message === "THREAD_NOT_FOUND") {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    console.error(error);
    return NextResponse.json({ error: "Unable to save message" }, { status: 400 });
  }
}

function isMissingConversationThreadTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; meta?: { table?: string; modelName?: string } };
  return (
    maybe.code === "P2021" &&
    (maybe.meta?.table === "public.ConversationThread" ||
      maybe.meta?.modelName === "ConversationThread")
  );
}
