import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoomMember } from "@/lib/auth-helpers";

const CreateTicketSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  priority: z.enum(["low", "med", "high"]),
  effort: z.enum(["S", "M", "L"]),
  suggestedOwnerUserId: z.string().optional(),
  ownerUserId: z.string().optional()
});

export async function GET(
  _req: Request,
  { params }: { params: { code: string } }
) {
  try {
    const { room } = await requireRoomMember(params.code.toUpperCase());
    const tickets = await prisma.ticket.findMany({
      where: { roomId: room.id },
      orderBy: { createdAt: "desc" }
    });
    return NextResponse.json({ tickets });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load tickets" }, { status: 400 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { code: string } }
) {
  try {
    const { room } = await requireRoomMember(params.code.toUpperCase());
    const body = CreateTicketSchema.parse(await req.json());

    const ticket = await prisma.ticket.create({
      data: {
        roomId: room.id,
        title: body.title,
        description: body.description,
        priority: body.priority,
        effort: body.effort,
        suggestedOwnerUserId: body.suggestedOwnerUserId,
        ownerUserId: body.ownerUserId,
        status: "todo"
      }
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create ticket" }, { status: 400 });
  }
}
