import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth-helpers";

const JoinSchema = z.object({
  code: z.string().trim().min(4).max(10)
});

export async function POST(req: Request) {
  try {
    const { user } = await requireSessionUser();
    const body = JoinSchema.parse(await req.json());
    const code = body.code.toUpperCase();

    const room = await prisma.room.findUnique({
      where: { code },
      include: { members: true }
    });
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    await prisma.roomMember.upsert({
      where: { roomId_userId: { roomId: room.id, userId: user.id } },
      update: {},
      create: { roomId: room.id, userId: user.id, role: "member" }
    });

    const updated = await prisma.room.findUnique({
      where: { id: room.id },
      include: { members: true }
    });

    return NextResponse.json({ room: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to join room" }, { status: 400 });
  }
}
