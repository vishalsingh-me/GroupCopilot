import { NextResponse } from "next/server";

// Google Calendar integration is retired in favour of Trello.
export async function POST() {
  return NextResponse.json(
    { error: "Calendar integration is retired. Use Trello for task management." },
    { status: 410 }
  );
}
