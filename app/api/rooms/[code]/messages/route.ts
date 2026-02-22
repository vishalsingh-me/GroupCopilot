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
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
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
        sender: m.senderUser?.name ?? m.senderUser?.email ?? "System",
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
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
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
    console.error(error);
    return NextResponse.json({ error: "Unable to save message" }, { status: 400 });
  }
}
