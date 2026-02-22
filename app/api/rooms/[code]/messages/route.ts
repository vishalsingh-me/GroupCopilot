import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoomMember } from "@/lib/auth-helpers";

const MessageCreateSchema = z.object({
  content: z.string().trim().min(1),
  mode: z.enum(["brainstorm", "clarify", "tickets", "schedule", "conflict"])
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room } = await requireRoomMember(code.toUpperCase());
    const messages = await prisma.message.findMany({
      where: { roomId: room.id },
      orderBy: { createdAt: "asc" },
      include: { senderUser: true }
    });

    return NextResponse.json({
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
        metadata: m.metadata,
        createdAt: m.createdAt,
        timestamp: m.createdAt
      }))
    });
  } catch (error) {
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

    const message = await prisma.message.create({
      data: {
        roomId: room.id,
        senderType: "user",
        senderUserId: user.id,
        content: body.content,
        mode: body.mode
      }
    });

    return NextResponse.json({ message }, { status: 201 });
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
    console.error(error);
    return NextResponse.json({ error: "Unable to save message" }, { status: 400 });
  }
}
