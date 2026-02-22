import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoomMember } from "@/lib/auth-helpers";

const UpdateSchema = z.object({
  status: z.enum(["todo", "doing", "done"]).optional(),
  ownerUserId: z.string().optional()
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const existing = await prisma.ticket.findUnique({
      where: { id: params.id },
      include: { room: true }
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await requireRoomMember(existing.room.code);
    const body = UpdateSchema.parse(await req.json());
    const ticket = await prisma.ticket.update({
      where: { id: params.id },
      data: {
        status: body.status,
        ownerUserId: body.ownerUserId
      }
    });
    return NextResponse.json({ ticket });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update ticket" }, { status: 400 });
  }
}
