import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const roomCode = code.toUpperCase();
    const { user } = await requireSessionUser();

    const room = await prisma.room.findUnique({
      where: { code: roomCode },
      select: { id: true, code: true, name: true }
    });

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const membership = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: user.id
        }
      },
      select: { id: true }
    });

    if (!membership) {
      return NextResponse.json({ error: "You are not a member of this room" }, { status: 403 });
    }

    await prisma.roomMember.delete({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: user.id
        }
      }
    });

    return NextResponse.json({
      ok: true,
      roomCode: room.code,
      message: `You left room ${room.name ?? room.code}.`
    });
  } catch (error) {
    if ((error as Error)?.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    console.error("[rooms/leave] error", error);
    return NextResponse.json({ error: "Unable to leave room" }, { status: 500 });
  }
}
