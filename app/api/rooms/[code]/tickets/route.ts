import { NextResponse } from "next/server";

// Tickets are now managed in Trello. These endpoints are retired.
const GONE = { error: "Tickets are managed in Trello. Use /api/trello/* endpoints." };

export async function GET() {
  return NextResponse.json(GONE, { status: 410 });
}

export async function POST() {
  return NextResponse.json(GONE, { status: 410 });
}
