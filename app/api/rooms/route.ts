import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth-helpers";
import { TRELLO_MVP_BOARD_ID, TRELLO_MVP_PUBLISH_LIST_ID } from "@/lib/trello/config";

const isDev = process.env.NODE_ENV !== "production";

const CreateRoomSchema = z.object({
  name: z.string().trim().max(100).optional()
});

function generateRoomCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(req: Request) {
  try {
    if (isDev) {
      const session = await getServerSession(authOptions);
      console.log("[rooms/create] auth context", {
        hasSession: Boolean(session),
        email: session?.user?.email ?? null,
        host: req.headers.get("host"),
        origin: req.headers.get("origin"),
        referer: req.headers.get("referer"),
      });
    }

    const { user } = await requireSessionUser();
    const body = CreateRoomSchema.parse(await req.json());

    let code = generateRoomCode();
    // Simple collision retry
    // eslint-disable-next-line no-constant-condition
    for (let i = 0; i < 5; i += 1) {
      const existing = await prisma.room.findUnique({
        where: { code },
        select: { id: true }
      });
      if (!existing) break;
      code = generateRoomCode();
    }

    const room = await prisma.room.create({
      data: {
        code,
        name: body.name,
        trelloBoardId: TRELLO_MVP_BOARD_ID,
        trelloListId: TRELLO_MVP_PUBLISH_LIST_ID,
        members: {
          create: {
            userId: user.id,
            role: "owner"
          }
        }
      },
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

    return NextResponse.json(
      {
        room: {
          id: room.id,
          code: room.code,
          name: room.name,
          trelloBoardId: room.trelloBoardId,
          trelloBoardUrl: room.trelloBoardId ? `https://trello.com/b/${room.trelloBoardId}` : null,
          members: room.members.map((member) => ({
            id: member.user.id,
            name: member.user.name ?? member.user.email,
            email: member.user.email,
            role: member.role ?? undefined,
            image: member.user.image ?? undefined
          }))
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[rooms/create] error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "UNAUTHORIZED", message: "Not signed in." },
        { status: 401 }
      );
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "VALIDATION_ERROR", message: "Invalid room payload.", issues: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: "Unable to create room" },
      { status: 500 }
    );
  }
}
