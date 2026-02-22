import { NextResponse } from "next/server";

export async function GET() {
  const mockLLM = !process.env.GEMINI_API_KEY;
  const mockTools = !process.env.MCP_SERVER_URL;
  return NextResponse.json({ mockLLM, mockTools });
}
