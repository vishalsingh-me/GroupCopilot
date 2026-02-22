import { NextResponse } from "next/server";

// Ticket updates now go through Trello. This endpoint is retired.
const GONE = { error: "Ticket updates are managed in Trello. Use /api/trello/* endpoints." };

export async function PATCH() {
  return NextResponse.json(GONE, { status: 410 });
}
