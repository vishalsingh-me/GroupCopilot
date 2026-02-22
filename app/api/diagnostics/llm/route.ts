/**
 * GET /api/diagnostics/llm
 *
 * Fires a real single-token ping to Gemini and returns structured diagnostics.
 * Safe to call from the browser — never leaks secrets.
 *
 * Response shape:
 * {
 *   hasApiKey: boolean
 *   model: string
 *   status: "ok" | "mock" | "error"
 *   latencyMs: number | null
 *   errorType: "MISSING_KEY" | "MODEL_NOT_FOUND" | "QUOTA_EXCEEDED" | "AUTH_ERROR" | "NETWORK_ERROR" | "SDK_ERROR" | null
 *   errorMessageSafe: string | null
 * }
 */

import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_MODEL, getApiKey, classifyGeminiError } from "@/lib/llm/gemini";

export async function GET() {
  const apiKey = getApiKey();
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const expectedReply = `pong-${nonce}`;

  if (!apiKey) {
    return NextResponse.json({
      hasApiKey: false,
      model: GEMINI_MODEL,
      status: "mock",
      latencyMs: null,
      errorType: "MISSING_KEY",
      errorMessageSafe: "GEMINI_API_KEY is not set. Add it to .env.local and restart the dev server.",
    });
  }

  const client = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: GEMINI_MODEL });

  const t0 = Date.now();
  try {
    const result = await client.generateContent({
      contents: [{ role: "user", parts: [{ text: `Reply with exactly: ${expectedReply}` }] }],
      generationConfig: { maxOutputTokens: 5, temperature: 0 },
    });

    const text = result.response.text().trim();
    const latencyMs = Date.now() - t0;

    // Accept "pong" or any short response — the point is that the API returned
    if (text.length === 0) {
      return NextResponse.json({
        hasApiKey: true,
        model: GEMINI_MODEL,
        status: "error",
        latencyMs,
        errorType: "SDK_ERROR",
        errorMessageSafe: "Gemini returned an empty response.",
      });
    }

    return NextResponse.json({
      hasApiKey: true,
      model: GEMINI_MODEL,
      status: "ok",
      latencyMs,
      errorType: null,
      errorMessageSafe: null,
      responsePreview: text.slice(0, 50),
      expectedReply,
    });
  } catch (error) {
    const latencyMs = Date.now() - t0;
    // Log full error server-side; send only safe classification to client
    console.error("[diagnostics/llm] Gemini ping failed:", error);
    const { errorType, errorMessageSafe } = classifyGeminiError(error);
    return NextResponse.json({
      hasApiKey: true,
      model: GEMINI_MODEL,
      status: "error",
      latencyMs,
      errorType,
      errorMessageSafe,
    });
  }
}
