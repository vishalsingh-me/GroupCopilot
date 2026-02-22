import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  createConversationThread,
  deriveConversationTitleFromMessages,
  getOrCreateDefaultThread,
  isPlaceholderThreadTitle,
} from "@/lib/chat/threads";

const CreateThreadSchema = z.object({
  title: z.string().trim().max(120).optional(),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room, user } = await requireRoomMember(code.toUpperCase());

    await getOrCreateDefaultThread(room.id, user.id);

    const threads = await prisma.conversationThread.findMany({
      where: { roomId: room.id },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      include: {
        messages: {
          where: { senderType: "user" },
          select: { content: true },
          orderBy: { createdAt: "asc" },
          take: 5,
        },
      },
    });

    const titleBackfillUpdates: Array<Promise<unknown>> = [];
    for (const thread of threads) {
      if (!isPlaceholderThreadTitle(thread.title)) continue;
      const derivedTitle = deriveConversationTitleFromMessages(thread.messages, thread.title);
      if (derivedTitle === thread.title) continue;
      titleBackfillUpdates.push(
        prisma.conversationThread.update({
          where: { id: thread.id },
          data: { title: derivedTitle },
        })
      );
    }

    if (titleBackfillUpdates.length > 0) {
      await Promise.allSettled(titleBackfillUpdates);
    }

    return NextResponse.json({
      threads: threads.map((thread) => ({
        id: thread.id,
        title: deriveConversationTitleFromMessages(thread.messages, thread.title),
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        lastMessageAt: thread.lastMessageAt,
        summary: thread.summary,
        summaryUpdatedAt: thread.summaryUpdatedAt,
      })),
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
    console.error("[rooms/threads][GET] error", error);
    return NextResponse.json({ error: "Unable to load threads" }, { status: 400 });
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room, user } = await requireRoomMember(code.toUpperCase());
    const body = CreateThreadSchema.parse(await req.json().catch(() => ({})));

    const thread = await createConversationThread(room.id, user.id, body.title);

    return NextResponse.json(
      {
        thread: {
          id: thread.id,
          title: thread.title,
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
          lastMessageAt: thread.lastMessageAt,
          summary: thread.summary,
          summaryUpdatedAt: thread.summaryUpdatedAt,
        },
      },
      { status: 201 }
    );
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid thread payload", issues: error.issues },
        { status: 400 }
      );
    }

    console.error("[rooms/threads][POST] error", error);
    return NextResponse.json({ error: "Unable to create thread" }, { status: 400 });
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
