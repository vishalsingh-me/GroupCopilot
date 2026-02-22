import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoomMember } from "@/lib/auth-helpers";

const CreateActionSchema = z.object({
  type: z.enum(["notion_create_task", "calendar_create_event"]),
  payload: z.any(),
  status: z.enum(["pending", "success", "error"]).optional(),
  result: z.any().optional(),
  confirmedAt: z.string().datetime().optional()
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const { room } = await requireRoomMember(code.toUpperCase());
    const actions = await prisma.toolAction.findMany({
      where: { roomId: room.id },
      orderBy: { createdAt: "desc" }
    });
    return NextResponse.json({ actions });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load tool actions" }, { status: 400 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const { user, room } = await requireRoomMember(code.toUpperCase());
    const body = CreateActionSchema.parse(await req.json());

    const action = await prisma.toolAction.create({
      data: {
        roomId: room.id,
        type: body.type,
        payload: body.payload,
        status: body.status ?? "pending",
        result: body.result ?? null,
        requestedByUserId: user.id,
        confirmedAt: body.confirmedAt ? new Date(body.confirmedAt) : null
      }
    });

    return NextResponse.json({ action }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to log tool action" }, { status: 400 });
  }
}
