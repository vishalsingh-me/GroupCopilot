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
    const { room } = await requireRoomMember(body.roomCode.toUpperCase());

    const recentMessages = await prisma.message.findMany({
      where: {
        roomId: room.id,
        senderType: { in: ["user", "assistant"] }
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        senderType: true,
        content: true
      }
    });

    const history = recentMessages
      .reverse()
      .map((entry) => ({
        role: entry.senderType === "assistant" ? "assistant" : "user",
        content: entry.content
      })) as Array<{ role: "user" | "assistant"; content: string }>;

    const latestHistory = history[history.length - 1];
    if (
      !latestHistory
      || latestHistory.role !== "user"
      || latestHistory.content.trim() !== body.message
    ) {
      history.push({ role: "user", content: body.message });
    }

    const result = await generateAssistantReply({
      mode: body.mode,
      message: body.message,
      history
    });
    if (process.env.NODE_ENV !== "production") {
      console.log("[api/chat] result", {
        mockMode: result.mockMode,
        reason: result.reason ?? null,
        textLength: result.text.length,
        hasArtifacts: Boolean(result.artifacts)
      });
    }

    const assistantText = result.text.trim() || "I had trouble generating a reply. Please try rephrasing.";

    const assistantMessage = await prisma.message.create({
      data: {
        roomId: room.id,
        senderType: "assistant",
        senderUserId: null,
        content: assistantText,
        mode: body.mode,
        metadata: result.artifacts ? JSON.parse(JSON.stringify(result.artifacts)) : null
      }
    });

    return NextResponse.json({
      assistantMessage,
      artifacts: result.artifacts,
      mockMode: result.mockMode,
      mockReason: result.reason ?? null
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to generate response" }, { status: 400 });
  }
}
