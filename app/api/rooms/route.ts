import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth-helpers";
import { TRELLO_MVP_BOARD_ID, TRELLO_MVP_PUBLISH_LIST_ID } from "@/lib/trello/config";

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
    console.error(error);
    return NextResponse.json({ error: "Unable to create room" }, { status: 400 });
  }
}
