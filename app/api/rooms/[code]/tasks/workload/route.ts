import { NextResponse } from "next/server";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isRoomAdminRole } from "@/lib/room-admin";
import { computeRoomCompletedWorkload } from "@/lib/tasks/workload";

function mapAuthError(error: unknown): { status: number; message: string } | null {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return { status: 401, message: "Not signed in." };
  if (message === "FORBIDDEN") return { status: 403, message: "You are not a member of this room." };
  if (message === "NOT_FOUND") return { status: 404, message: "Room not found." };
  return null;
}

/**
 * GET /api/rooms/[code]/tasks/workload
 * Membership-required workload summary for room-scoped fairness visuals.
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
        joinedAt: true,
        role: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    const { baselineStartAt, workloadMap } = await computeRoomCompletedWorkload(
      prisma,
      room.id,
      members.map((member) => ({ userId: member.userId, joinedAt: member.joinedAt }))
    );

    return NextResponse.json({
      roomCode: room.code,
      baselineStartAt: baselineStartAt ? baselineStartAt.toISOString() : null,
      members: members.map((member) => {
        const workload = workloadMap.get(member.userId);
        return {
          userId: member.userId,
          name: member.user.name ?? member.user.email,
          email: member.user.email,
          isAdmin: isRoomAdminRole(member.role),
          points: workload?.points ?? 0,
          lowCount: workload?.lowCount ?? 0,
          medCount: workload?.medCount ?? 0,
          highCount: workload?.highCount ?? 0,
          pendingPoints: workload?.pendingPoints ?? 0,
          pendingLowCount: workload?.pendingLowCount ?? 0,
          pendingMedCount: workload?.pendingMedCount ?? 0,
          pendingHighCount: workload?.pendingHighCount ?? 0,
          expectedPoints: workload?.expectedPoints ?? 0,
        };
      }),
    });
  } catch (error) {
    const authError = mapAuthError(error);
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: authError.status });
    }
    console.error("[tasks/workload] error", error);
    return NextResponse.json({ error: "Unable to load workload summary." }, { status: 500 });
  }
}
