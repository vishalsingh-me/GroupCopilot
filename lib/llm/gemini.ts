import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Mode } from "@prisma/client";
import { generateMockReply, GenerateResult } from "./mock";

type GenerateArgs = {
  mode: Mode;
  message: string;
};

export async function generateAssistantReply(args: GenerateArgs): Promise<GenerateResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return generateMockReply(args);
  }

  try {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });
    const prompt = buildPrompt(args.mode, args.message);
    const result = await model.generateContent(prompt);
    const text = result.response.text() ?? "I had trouble generating a reply.";
    return { text, mockMode: false };
  } catch (error) {
    console.error("Gemini error, falling back to mock:", error);
    return generateMockReply(args);
  }
}

function buildPrompt(mode: Mode, message: string) {
  const prefixByMode: Record<Mode, string> = {
    brainstorm: "You are a facilitative brainstorming assistant.",
    clarify: "You help clarify constraints before planning.",
    tickets: "You generate concise engineering tickets.",
    schedule: "You propose meeting slots and ask clarifying questions.",
    conflict: "You provide calm, script-based conflict guidance."
  };
  return `${prefixByMode[mode]}\nUser message: ${message}\nRespond briefly and helpfully.`;
}
