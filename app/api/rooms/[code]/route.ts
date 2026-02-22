import { NextResponse } from "next/server";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room } = await requireRoomMember(code.toUpperCase());
    const detailed = await prisma.room.findUnique({
      where: { id: room.id },
      select: {
        id: true,
        code: true,
        name: true,
        trelloBoardId: true,
        members: {
          select: {
            role: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true
              }
            }
          }
        }
      }
    });

    return NextResponse.json({
      room: detailed
        ? {
          id: detailed.id,
          code: detailed.code,
          name: detailed.name,
          trelloBoardId: detailed.trelloBoardId,
          trelloBoardUrl: detailed.trelloBoardId
            ? `https://trello.com/b/${detailed.trelloBoardId}`
            : null,
          members: detailed.members.map((m) => ({
            id: m.user.id,
            name: m.user.name ?? m.user.email,
            email: m.user.email,
            role: m.role ?? undefined,
            image: m.user.image ?? undefined
          }))
        }
        : null
    });
  } catch (error) {
    console.error(error);
    const message =
      (error as Error)?.message === "FORBIDDEN"
        ? "Forbidden"
        : (error as Error)?.message === "NOT_FOUND"
          ? "Not found"
          : "Error";
    const status =
      message === "Forbidden" ? 403 : message === "Not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
