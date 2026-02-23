import { NextResponse } from "next/server";

// ToolActions are replaced by AuditLogs + Trello. These endpoints are retired.
const GONE = { error: "Tool actions are superseded by the audit log. Use /api/audit/* endpoints." };

export async function GET() {
  return NextResponse.json(GONE, { status: 410 });
}

export async function POST() {
  return NextResponse.json(GONE, { status: 410 });
}
