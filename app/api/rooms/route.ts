import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth-helpers";

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
      const existing = await prisma.room.findUnique({ where: { code } });
      if (!existing) break;
      code = generateRoomCode();
    }

    const room = await prisma.room.create({
      data: {
        code,
        name: body.name,
        members: {
          create: {
            userId: user.id,
            role: "owner"
          }
        }
      },
      include: { members: true }
    });

    return NextResponse.json({ room }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create room" }, { status: 400 });
  }
}
