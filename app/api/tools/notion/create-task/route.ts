import { NextResponse } from "next/server";

// Notion integration is retired in favour of Trello.
export async function POST() {
  return NextResponse.json(
    { error: "Notion integration is retired. Use Trello for task management." },
    { status: 410 }
  );
}
