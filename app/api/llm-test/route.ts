import { NextResponse } from "next/server";
import { generatePlanCopilotReply } from "@/lib/llm/gemini";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = await generatePlanCopilotReply({
      message: "We need help deciding an MVP for a student collaboration app.",
      history: [{ role: "user", content: "Hey" }],
      roomContext: {
        roomCode: "DEV",
        roomName: "Development Room",
        members: ["Alex", "Sam"],
        trelloBoardUrl: null,
        projectPlan: null,
        recentCards: [],
      },
    });

    const textPreview = result.text.slice(0, 80);
    if (result.mockMode) {
      return NextResponse.json({
        ok: false,
        mockMode: true,
        reason: result.reason ?? "unknown",
        textPreview
      });
    }

    return NextResponse.json({
      ok: true,
      mockMode: false,
      textPreview
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        ok: false,
        mockMode: true,
        reason: "route_error",
        message
      },
      { status: 500 }
    );
  }
}
