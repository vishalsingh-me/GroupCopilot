import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Mode } from "@/lib/types";
import { z } from "zod";
import {
  generateMockReply,
  type GenerateResult,
  type MeetingProposal,
  type MockReason,
  type TicketSuggestion
} from "./mock";

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

// Read from env so the model can be overridden without a code change.
// Default: gemini-3.0-flash (widely available on free keys)
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.0-flash";

export function getApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || undefined;
}

function getClient() {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: GEMINI_MODEL });
}

type GenerateArgs = {
  mode: Mode;
  message: string;
  history?: HistoryMessage[];
};

const isDev = process.env.NODE_ENV !== "production";
const MAX_REPLY_CHARS = 6000;

const ticketSuggestionSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  suggestedOwnerName: z.string().trim().min(1).optional(),
  priority: z.enum(["low", "med", "high"]),
  effort: z.enum(["S", "M", "L"]),
  status: z.enum(["todo", "doing", "done"]).optional().default("todo")
});

const ticketsEnvelopeSchema = z.object({
  mode: z.literal("tickets").optional(),
  tickets: z.array(ticketSuggestionSchema).min(1),
  followUpQuestions: z.array(z.string().trim().min(1)).optional()
});

const slotSchema = z.object({
  start: z.string().trim().min(1),
  end: z.string().trim().min(1),
  timezone: z.string().trim().min(1).optional()
});

const scheduleEnvelopeSchema = z.object({
  mode: z.literal("schedule").optional(),
  title: z.string().trim().min(1).optional(),
  slots: z.array(slotSchema).min(1),
  questions: z.array(z.string().trim().min(1)).optional()
});

type GeminiResponseLike = {
  text?: () => string;
  promptFeedback?: {
    blockReason?: string;
  };
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

export async function generateAssistantReply(args: GenerateArgs): Promise<GenerateResult> {
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (isDev) {
    console.log("[llm] GEMINI_API_KEY length:", apiKey.length, "empty:", apiKey.length === 0);
    console.log("[llm] model:", GEMINI_MODEL);
  }

  if (!apiKey) {
    return fallback(args, "missing_key", "Gemini disabled (missing key)");
  }

  try {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({ model: GEMINI_MODEL });
    const prompt = buildPrompt(args.mode, args.message, args.history ?? []);
    const generation = await model.generateContent(prompt);
    const response = generation.response as GeminiResponseLike;

    if (response?.promptFeedback?.blockReason) {
      return fallback(args, "blocked_response", "Gemini blocked response by prompt feedback");
    }

    const text = extractText(response);
    const artifacts = extractArtifacts(args.mode, text);
    if (!text && !artifacts) {
      const hasCandidates = Boolean(response?.candidates?.length);
      return fallback(
        args,
        hasCandidates ? "invalid_response" : "empty_response",
        "Gemini returned no usable text/artifacts"
      );
    }

    const finalText = normalizeFinalText(text, args.mode, artifacts);
    if (isDev) {
      console.log("[llm] Gemini success", {
        mockMode: false,
        hasText: finalText.length > 0,
        hasArtifacts: Boolean(artifacts),
        candidateCount: response?.candidates?.length ?? 0
      });
    }

    return { text: finalText, artifacts, mockMode: false };
  } catch (error) {
    if (isDev) {
      console.error("[llm] Gemini error (exception) -> mock", getGeminiErrorMeta(error));
    }
    return generateMockReply({ ...args, reason: "gemini_error" });
  }
}

/**
 * Generate a reply from a raw prompt string (used by the agent state machine).
 * Falls back to a plain echo if no API key is configured.
 */
export async function generateFromPrompt(
  prompt: string,
  fallbackText: string
): Promise<{ text: string; mockMode: boolean }> {
  const model = getClient();
  if (!model) return { text: fallbackText, mockMode: true };

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text()?.trim() ?? fallbackText;
    return { text, mockMode: false };
  } catch (error) {
    console.error("Gemini error:", error);
    return { text: fallbackText, mockMode: true };
  }
}

/** Classify a Gemini SDK error into a safe code for client display. Never leaks raw secrets. */
export function classifyGeminiError(error: unknown): {
  errorType: "MODEL_NOT_FOUND" | "QUOTA_EXCEEDED" | "AUTH_ERROR" | "NETWORK_ERROR" | "SDK_ERROR";
  errorMessageSafe: string;
} {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  if (lower.includes("not found") || lower.includes("404") || lower.includes("model")) {
    return { errorType: "MODEL_NOT_FOUND", errorMessageSafe: `Model "${GEMINI_MODEL}" not found. Check GEMINI_MODEL env var.` };
  }
  if (lower.includes("quota") || lower.includes("429") || lower.includes("resource_exhausted")) {
    return { errorType: "QUOTA_EXCEEDED", errorMessageSafe: "API quota exceeded. Try again later." };
  }
  if (lower.includes("api_key") || lower.includes("401") || lower.includes("403") || lower.includes("permission") || lower.includes("invalid key")) {
    return { errorType: "AUTH_ERROR", errorMessageSafe: "API key rejected. Check GEMINI_API_KEY value." };
  }
  if (lower.includes("network") || lower.includes("enotfound") || lower.includes("fetch failed") || lower.includes("timeout")) {
    return { errorType: "NETWORK_ERROR", errorMessageSafe: "Network error reaching Gemini API." };
  }
  return { errorType: "SDK_ERROR", errorMessageSafe: "Unexpected SDK error. Check server logs." };
}

function fallback(args: GenerateArgs, reason: MockReason, message: string): Promise<GenerateResult> {
  if (isDev) {
    console.log(`[llm] ${message} -> mock`, { reason });
  }
  return generateMockReply({ ...args, reason });
}

function buildPrompt(mode: Mode, message: string, history: HistoryMessage[]) {
  const modeGuidance: Record<Mode, string> = {
    brainstorm: "Brainstorm mode: ask one relevant next question at a time and move the idea forward.",
    clarify: "Clarify mode: gather constraints, deadlines, and success criteria before proposing actions.",
    tickets: "Tickets mode: propose practical implementation tasks with clear priority and effort.",
    schedule: "Schedule mode: propose realistic slots and ask only the key missing detail.",
    conflict: "Conflict mode: keep a calm tone and provide script-based, neutral guidance."
  };

  const conversation = history.length === 0
    ? "No prior messages."
    : history
      .slice(-20)
      .map((entry) => `${entry.role === "user" ? "User" : "Assistant"}: ${entry.content}`)
      .join("\n");

  const shortUserMessage = isShortUserMessage(message);
  const brainstormRule = mode === "brainstorm"
    ? shortUserMessage
      ? "If the latest user message is short (e.g. hey/ok/yeah), ask a setup question about topic and goal."
      : "Ask the single best follow-up question based on the conversation. Do not ask a fixed list."
    : "";

  const structuredOutputs = [
    "If mode is tickets and you propose tasks, include a JSON block using:",
    '{ "mode":"tickets", "tickets":[{ "title":"", "description":"", "suggestedOwnerName":"", "priority":"low|med|high", "effort":"S|M|L", "status":"todo|doing|done" }], "followUpQuestions":[] }',
    "If mode is schedule and you propose slots, include a JSON block using:",
    '{ "mode":"schedule", "title":"", "slots":[{ "start":"ISO", "end":"ISO", "timezone":"UTC" }], "questions":[] }'
  ].join("\n");

  return [
    "You are Group Copilot, a concise facilitator for team collaboration.",
    "Rules:",
    "- Be concise and practical.",
    "- Do not repeat the same questions from recent assistant turns.",
    "- Ask the single most useful next question when information is missing.",
    "- If enough information exists, summarize and propose the next best step.",
    modeGuidance[mode],
    mode === "brainstorm" ? "Do not repeat the same three questions in consecutive replies." : "",
    brainstormRule,
    structuredOutputs,
    "Conversation so far:",
    conversation,
    `Latest user message: ${message}`,
    "Write the next assistant reply."
  ]
    .filter(Boolean)
    .join("\n");
}

function extractText(response: GeminiResponseLike) {
  let text = "";
  if (response && typeof response.text === "function") {
    try {
      text = response.text();
    } catch {
      text = "";
    }
  }

  if (text.trim()) {
    return text.trim().slice(0, MAX_REPLY_CHARS);
  }

  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  const fromParts = candidates
    .flatMap((candidate) => (Array.isArray(candidate.content?.parts) ? candidate.content?.parts : []))
    .map((part) => part?.text ?? "")
    .join("\n")
    .trim();

  return fromParts.slice(0, MAX_REPLY_CHARS);
}

function extractArtifacts(mode: Mode, text: string): GenerateResult["artifacts"] | undefined {
  if (!text.trim()) {
    return undefined;
  }

  const jsonBlocks = extractJsonBlocks(text);
  if (jsonBlocks.length === 0) {
    return undefined;
  }

  if (mode === "tickets") {
    for (const payload of jsonBlocks) {
      const parsed = ticketsEnvelopeSchema.safeParse(normalizeTicketsPayload(payload));
      if (parsed.success) {
        return {
          tickets: parsed.data.tickets as TicketSuggestion[]
        };
      }
    }
  }

  if (mode === "schedule") {
    for (const payload of jsonBlocks) {
      const parsed = scheduleEnvelopeSchema.safeParse(normalizeSchedulePayload(payload));
      if (parsed.success) {
        const title = parsed.data.title ?? "Proposed meeting";
        return {
          meetingProposals: parsed.data.slots.map((slot): MeetingProposal => ({
            title,
            start: slot.start,
            end: slot.end,
            timezone: slot.timezone
          }))
        };
      }
    }
  }

  return undefined;
}

function extractJsonBlocks(text: string): unknown[] {
  const items: unknown[] = [];
  const fencedMatches = text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  for (const match of fencedMatches) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    const parsed = safeJsonParse(raw);
    if (parsed !== undefined) {
      items.push(parsed);
    }
  }

  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const parsed = safeJsonParse(trimmed);
    if (parsed !== undefined) {
      items.push(parsed);
    }
  }

  return items;
}

function safeJsonParse(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function normalizeTicketsPayload(payload: unknown) {
  if (Array.isArray(payload)) {
    return { mode: "tickets", tickets: payload };
  }
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  const item = payload as Record<string, unknown>;
  if (Array.isArray(item.tickets)) {
    return item;
  }
  if (item.artifacts && typeof item.artifacts === "object" && Array.isArray((item.artifacts as Record<string, unknown>).tickets)) {
    return {
      mode: "tickets",
      tickets: (item.artifacts as Record<string, unknown>).tickets,
      followUpQuestions: item.followUpQuestions
    };
  }
  return item;
}

function normalizeSchedulePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  const item = payload as Record<string, unknown>;

  if (Array.isArray(item.slots)) {
    return item;
  }

  if (Array.isArray(item.meetingProposals)) {
    return {
      mode: "schedule",
      title: item.title,
      slots: item.meetingProposals,
      questions: item.questions
    };
  }

  if (item.artifacts && typeof item.artifacts === "object") {
    const artifacts = item.artifacts as Record<string, unknown>;
    if (Array.isArray(artifacts.meetingProposals)) {
      return {
        mode: "schedule",
        title: item.title,
        slots: artifacts.meetingProposals,
        questions: item.questions
      };
    }
  }

  return item;
}

function normalizeFinalText(
  text: string,
  mode: Mode,
  artifacts: GenerateResult["artifacts"]
) {
  const clean = stripJsonBlocks(text).trim();
  if (clean) {
    return clean.slice(0, MAX_REPLY_CHARS);
  }

  if (mode === "tickets" && artifacts?.tickets?.length) {
    return "I drafted ticket suggestions based on your latest context.";
  }
  if (mode === "schedule" && artifacts?.meetingProposals?.length) {
    return "I proposed meeting slots based on your latest context.";
  }

  return "I reviewed the context and can refine this further with one more detail.";
}

function stripJsonBlocks(text: string) {
  return text.replace(/```(?:json)?\s*[\s\S]*?```/gi, "").trim();
}

function isShortUserMessage(message: string) {
  const normalized = message.trim().toLowerCase();
  if (normalized.length <= 3) {
    return true;
  }

  return [
    "ok",
    "okay",
    "k",
    "kk",
    "yes",
    "yeah",
    "yep",
    "sure",
    "hey",
    "hi",
    "hello"
  ].includes(normalized);
}

function getGeminiErrorMeta(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: "Unknown error type", raw: String(error) };
  }

  const maybeError = error as Error & {
    status?: number;
    code?: number | string;
    response?: {
      status?: number;
      statusText?: string;
      data?: { error?: { message?: string } };
    };
  };

  return {
    name: maybeError.name,
    message: maybeError.message,
    status: maybeError.status ?? maybeError.response?.status,
    code: maybeError.code,
    statusText: maybeError.response?.statusText,
    apiMessage: maybeError.response?.data?.error?.message
  };
}
