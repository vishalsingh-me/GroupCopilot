import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { DEFAULT_MESSAGE_MODE } from "@/lib/chat/threads";

const GroupMessageSchema = z.object({
  content: z.string().trim().min(1),
});

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room } = await requireRoomMember(code.toUpperCase());

    const messages = await prisma.message.findMany({
      where: {
        roomId: room.id,
        senderType: "user",
        metadata: {
          path: ["channel"],
          equals: "group",
        },
      },
      orderBy: { createdAt: "asc" },
      include: {
        senderUser: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      messages: messages.map((message) => ({
        id: message.id,
        role: "user",
        sender: message.senderUser?.name ?? message.senderUser?.email ?? "Member",
        content: message.content,
        metadata: message.metadata,
        createdAt: message.createdAt,
        timestamp: message.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "You are not a member of this room." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }
    console.error("[group-messages][GET] error", error);
    return NextResponse.json({ error: "Unable to load group messages." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room, user } = await requireRoomMember(code.toUpperCase());
    const payload = GroupMessageSchema.parse(await req.json());

    const message = await prisma.message.create({
      data: {
        roomId: room.id,
        senderType: "user",
        senderUserId: user.id,
        content: payload.content,
        mode: DEFAULT_MESSAGE_MODE,
        metadata: toPrismaJson({ channel: "group" }),
      },
      include: {
        senderUser: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        message: {
          id: message.id,
          role: "user",
          sender: message.senderUser?.name ?? message.senderUser?.email ?? "Member",
          content: message.content,
          metadata: message.metadata,
          createdAt: message.createdAt,
          timestamp: message.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid payload.", issues: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "You are not a member of this room." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }
    console.error("[group-messages][POST] error", error);
    return NextResponse.json({ error: "Unable to send group message." }, { status: 500 });
  }
}

