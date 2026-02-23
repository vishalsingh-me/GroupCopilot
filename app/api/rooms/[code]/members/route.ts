import { NextResponse } from "next/server";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isRoomAdminRole } from "@/lib/room-admin";

function mapAuthError(error: unknown): { status: number; message: string } | null {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return { status: 401, message: "Not signed in." };
  if (message === "FORBIDDEN") return { status: 403, message: "You are not a member of this room." };
  if (message === "NOT_FOUND") return { status: 404, message: "Room not found." };
  return null;
}

/**
 * GET /api/rooms/[code]/members
 * Membership required. Returns room members for admin task assignment dropdown.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room } = await requireRoomMember(code.toUpperCase());

    const members = await prisma.roomMember.findMany({
      where: { roomId: room.id },
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
    });

    return NextResponse.json({
      members: members.map((member) => ({
        userId: member.userId,
        name: member.user.name ?? member.user.email,
        email: member.user.email,
        isAdmin: isRoomAdminRole(member.role),
      })),
    });
  } catch (error) {
    const authError = mapAuthError(error);
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: authError.status });
    }
    console.error("[rooms/members] error", error);
    return NextResponse.json({ error: "Unable to load room members." }, { status: 500 });
  }
}
