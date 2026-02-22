import { NextResponse } from "next/server";

export async function GET() {
  const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  const mcpServerUrl = (process.env.MCP_SERVER_URL ?? "").trim();
  const mockLLM = geminiKey.length === 0;
  const mockTools = mcpServerUrl.length === 0;
  return NextResponse.json({ mockLLM, mockTools });
}
