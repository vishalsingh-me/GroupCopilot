import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { user } = await requireSessionUser();

    const memberships = await prisma.roomMember.findMany({
      where: { userId: user.id },
      orderBy: { joinedAt: "desc" },
      select: {
        role: true,
        joinedAt: true,
        room: {
          select: {
            id: true,
            code: true,
            name: true,
            trelloBoardId: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json({
      rooms: memberships.map((membership) => ({
        id: membership.room.id,
        code: membership.room.code,
        name: membership.room.name,
        trelloBoardId: membership.room.trelloBoardId,
        trelloBoardUrl: membership.room.trelloBoardId
          ? `https://trello.com/b/${membership.room.trelloBoardId}`
          : null,
        role: membership.role,
        joinedAt: membership.joinedAt,
        createdAt: membership.room.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    console.error("[rooms/mine][GET] error", error);
    return NextResponse.json({ error: "Unable to load rooms." }, { status: 500 });
  }
}

