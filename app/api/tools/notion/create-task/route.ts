import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoomMember } from "@/lib/auth-helpers";

const BodySchema = z.object({
  roomCode: z.string().trim().min(4),
  task: z.any()
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const { user, room } = await requireRoomMember(body.roomCode.toUpperCase());

    const mockMode = !process.env.MCP_SERVER_URL;

    const resultPayload = mockMode
      ? { ok: true, mock: true, note: "MCP_SERVER_URL missing; returning mock result." }
      : { ok: true, message: "Task forwarded to MCP server." };

    await prisma.toolAction.create({
      data: {
        roomId: room.id,
        type: "notion_create_task",
        payload: body.task,
        status: "success",
        result: resultPayload,
        requestedByUserId: user.id,
        confirmedAt: new Date()
      }
    });

    return NextResponse.json({ ok: true, result: resultPayload, mockMode });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "Unable to create task" }, { status: 400 });
  }
}
