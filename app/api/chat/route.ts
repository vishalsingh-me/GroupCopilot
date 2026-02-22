import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoomMember } from "@/lib/auth-helpers";
import { generateAssistantReply } from "@/lib/llm/gemini";
import { prisma } from "@/lib/prisma";

const ChatSchema = z.object({
  roomCode: z.string().trim().min(4),
  message: z.string().trim().min(1),
  mode: z.enum(["brainstorm", "clarify", "tickets", "schedule", "conflict"])
});

export async function POST(request: Request) {
  try {
    const body = ChatSchema.parse(await request.json());
    const { room, user } = await requireRoomMember(body.roomCode.toUpperCase());

    const result = await generateAssistantReply({
      mode: body.mode,
      message: body.message
    });

    const assistantMessage = await prisma.message.create({
      data: {
        roomId: room.id,
        senderType: "assistant",
        senderUserId: null,
        content: result.text,
        mode: body.mode,
        metadata: result.artifacts ? JSON.parse(JSON.stringify(result.artifacts)) : null
      }
    });

    return NextResponse.json({
      assistantMessage,
      artifacts: result.artifacts,
      mockMode: result.mockMode
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to generate response" }, { status: 400 });
  }
}
