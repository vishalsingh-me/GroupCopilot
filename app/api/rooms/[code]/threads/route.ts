import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  createConversationThread,
  getOrCreateDefaultThread,
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
    });

    return NextResponse.json({
      threads: threads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        lastMessageAt: thread.lastMessageAt,
        summary: thread.summary,
        summaryUpdatedAt: thread.summaryUpdatedAt,
      })),
    });
  } catch (error) {
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
