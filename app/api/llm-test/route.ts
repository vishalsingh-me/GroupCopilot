import { NextResponse } from "next/server";
import { generateAssistantReply } from "@/lib/llm/gemini";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = await generateAssistantReply({
      mode: "brainstorm",
      message: "We need help deciding an MVP for a student collaboration app.",
      history: [{ role: "user", content: "Hey" }]
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
