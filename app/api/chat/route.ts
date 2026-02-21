import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const { prompt, mode } = body as { prompt: string; mode: string };

  const mockResponse = {
    brainstorm:
      "Great, let's brainstorm. 1) What outcome would make this collaboration a success? 2) What constraints do you have (time, tools, team size)? 3) List three possible project directions. 4) Which one feels most achievable this week? 5) Who will validate the choice?",
    planning:
      "I can turn this into tickets. Confirm the core deliverables, then I'll propose tasks with owners, effort, and priority.",
    conflict:
      "Thanks for naming the tension. Let's clarify needs, pick a script to de-escalate, and agree on next steps.",
    general:
      "Got it. What is the primary goal for this session, and what is the biggest risk to success?"
  } as Record<string, string>;

  const content = mockResponse[mode] ?? `Thanks for sharing: ${prompt}`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ content, mock: true });
  }

  // TODO: Proxy Gemini via server-side API. Do not log prompts or responses.
  return NextResponse.json({ content, mock: true });
}
