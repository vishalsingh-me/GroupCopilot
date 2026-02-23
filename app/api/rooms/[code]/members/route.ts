import { NextResponse } from "next/server";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

function isAdminRole(role?: string | null): boolean {
  return role === "owner" || role === "admin";
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room, user } = await requireRoomMember(code.toUpperCase());

    const detailedRoom = await prisma.room.findUnique({
      where: { id: room.id },
      select: {
        members: {
          orderBy: { joinedAt: "asc" },
          select: {
            userId: true,
            role: true,
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

    const currentMember = room.members.find((member) => member.userId === user.id);
    if (!detailedRoom) {
      return NextResponse.json({ members: [], isAdmin: isAdminRole(currentMember?.role) });
    }

    return NextResponse.json({
      members: detailedRoom.members.map((member) => ({
        userId: member.userId,
        name: member.user.name ?? member.user.email,
        email: member.user.email,
        isAdmin: isAdminRole(member.role),
      })),
      isAdmin: isAdminRole(currentMember?.role),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "You are not a member of this room." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    console.error("[rooms/members][GET] error", error);
    return NextResponse.json({ error: "Unable to load room members." }, { status: 500 });
  }
}
