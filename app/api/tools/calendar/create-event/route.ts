import { NextResponse } from "next/server";

export async function POST() {
  const mcpUrl = process.env.MCP_SERVER_URL;
  if (!mcpUrl) {
    return NextResponse.json({ ok: true, mock: true });
  }

  // TODO: Proxy MCP calendar create-event call.
  return NextResponse.json({ ok: true, mock: true });
}
