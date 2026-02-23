import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  buildPlanCopilotPrompt,
  type PlanCopilotHistoryItem,
  type PlanCopilotRoomContext,
} from "@/lib/llm/prompts/planCopilot";

export type MockReason =
  | "missing_key"
  | "gemini_error"
  | "empty_response"
  | "blocked_response"
  | "invalid_response";

// Read from env so the model can be overridden without a code change.
// Default: gemini-2.5-flash. Fallback: gemini-2.5-flash-lite.
export const GEMINI_MODEL = (process.env.GEMINI_MODEL ?? "").trim() || "gemini-2.5-flash";
export const GEMINI_FALLBACK_MODELS = parseFallbackModels(process.env.GEMINI_FALLBACK_MODELS);

export function getApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || undefined;
}

function getClient() {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: GEMINI_MODEL });
}

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

export type PromptGenerationResult = {
  text: string;
  mockMode: boolean;
  reason?: MockReason;
};

export type PlanCopilotGenerateArgs = {
  message: string;
  history: PlanCopilotHistoryItem[];
  roomContext: PlanCopilotRoomContext;
  threadSummary?: string | null;
};

const isDev = process.env.NODE_ENV !== "production";
const MAX_REPLY_CHARS = 6000;

export async function generateTextFromPrompt(prompt: string): Promise<PromptGenerationResult> {
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (isDev) {
    console.log("[llm] GEMINI_API_KEY length:", apiKey.length, "empty:", apiKey.length === 0);
    console.log("[llm] model:", GEMINI_MODEL);
  }

  if (!apiKey) {
    if (isDev) {
      console.log("[llm] Gemini disabled (missing key)");
    }
    return { text: "", mockMode: true, reason: "missing_key" };
  }

  const client = new GoogleGenerativeAI(apiKey);
  const modelsToTry = getModelsToTry();
  let lastReason: MockReason = "gemini_error";

  for (let index = 0; index < modelsToTry.length; index += 1) {
    const modelName = modelsToTry[index];

    try {
      const model = client.getGenerativeModel({ model: modelName });
      const generation = await model.generateContent(prompt);
      const response = generation.response as GeminiResponseLike;

      if (response?.promptFeedback?.blockReason) {
        if (isDev) {
          console.log("[llm] Gemini blocked response", {
            model: modelName,
            blockReason: response.promptFeedback.blockReason,
          });
        }
        lastReason = "blocked_response";
        continue;
      }

      const text = extractText(response);
      if (!text) {
        const hasCandidates = Boolean(response?.candidates?.length);
        lastReason = hasCandidates ? "invalid_response" : "empty_response";
        continue;
      }

      if (isDev && index > 0) {
        console.warn("[llm] Gemini fallback model succeeded", {
          primaryModel: GEMINI_MODEL,
          selectedModel: modelName,
        });
      }
      return { text, mockMode: false };
    } catch (error) {
      const retryable = isRetryableModelError(error);
      lastReason = "gemini_error";
      if (isDev) {
        console.error("[llm] Gemini error (exception)", {
          model: modelName,
          retryable,
          meta: getGeminiErrorMeta(error),
        });
      }

      if (!retryable || index === modelsToTry.length - 1) {
        break;
      }
    }
  }

  return { text: "", mockMode: true, reason: lastReason };
}

export async function generatePlanCopilotReply(
  args: PlanCopilotGenerateArgs
): Promise<PromptGenerationResult> {
  const prompt = buildPlanCopilotPrompt({
    roomContext: args.roomContext,
    history: args.history,
    threadSummary: args.threadSummary,
    userMessage: args.message,
  });

  const generation = await generateTextFromPrompt(prompt);
  if (generation.mockMode) {
    return {
      text: "I'm having trouble reaching Gemini, try again.",
      mockMode: true,
      reason: generation.reason,
    };
  }

  return {
    text: generation.text,
    mockMode: false,
  };
}

/**
 * Generate a reply from a raw prompt string (used by the agent state machine).
 * Falls back to a provided plain response if no API key is configured.
 */
export async function generateFromPrompt(
  prompt: string,
  fallbackText: string
): Promise<{ text: string; mockMode: boolean }> {
  const result = await generateTextFromPrompt(prompt);
  if (!result.mockMode && result.text.trim()) {
    return { text: result.text, mockMode: false };
  }
  return { text: fallbackText, mockMode: true };
}

/** Classify a Gemini SDK error into a safe code for client display. Never leaks raw secrets. */
export function classifyGeminiError(error: unknown): {
  errorType: "MODEL_NOT_FOUND" | "QUOTA_EXCEEDED" | "AUTH_ERROR" | "NETWORK_ERROR" | "SDK_ERROR";
  errorMessageSafe: string;
} {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  const status = getHttpStatusFromError(error);

  if (status === 404) {
    return {
      errorType: "MODEL_NOT_FOUND",
      errorMessageSafe: `Model "${GEMINI_MODEL}" not found. Check GEMINI_MODEL env var.`,
    };
  }
  if (status === 429) {
    return { errorType: "QUOTA_EXCEEDED", errorMessageSafe: "API quota exceeded. Try again later." };
  }
  if (status === 401 || status === 403) {
    return {
      errorType: "AUTH_ERROR",
      errorMessageSafe: "API key rejected. Check GEMINI_API_KEY value.",
    };
  }
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return {
      errorType: "NETWORK_ERROR",
      errorMessageSafe: `Gemini service is temporarily unavailable (${status}). Try again.`,
    };
  }

  if (lower.includes("not found") || lower.includes("404") || lower.includes("model")) {
    return {
      errorType: "MODEL_NOT_FOUND",
      errorMessageSafe: `Model "${GEMINI_MODEL}" not found. Check GEMINI_MODEL env var.`,
    };
  }
  if (lower.includes("quota") || lower.includes("429") || lower.includes("resource_exhausted")) {
    return { errorType: "QUOTA_EXCEEDED", errorMessageSafe: "API quota exceeded. Try again later." };
  }
  if (
    lower.includes("api_key") ||
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("permission") ||
    lower.includes("invalid key")
  ) {
    return { errorType: "AUTH_ERROR", errorMessageSafe: "API key rejected. Check GEMINI_API_KEY value." };
  }
  if (
    lower.includes("network") ||
    lower.includes("enotfound") ||
    lower.includes("fetch failed") ||
    lower.includes("timeout") ||
    lower.includes("service unavailable") ||
    lower.includes("503")
  ) {
    return { errorType: "NETWORK_ERROR", errorMessageSafe: "Network error reaching Gemini API." };
  }
  return { errorType: "SDK_ERROR", errorMessageSafe: "Unexpected SDK error. Check server logs." };
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
    .flatMap((candidate) =>
      Array.isArray(candidate.content?.parts) ? candidate.content?.parts : []
    )
    .map((part) => part?.text ?? "")
    .join("\n")
    .trim();

  return fromParts.slice(0, MAX_REPLY_CHARS);
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
    apiMessage: maybeError.response?.data?.error?.message,
  };
}

function parseFallbackModels(raw: string | undefined): string[] {
  const defaults = ["gemini-2.5-flash-lite"];
  const source = raw?.trim() ? raw : defaults.join(",");
  const values = source
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

function getModelsToTry(): string[] {
  const all = [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS];
  return Array.from(new Set(all.filter(Boolean)));
}

function isRetryableModelError(error: unknown): boolean {
  const { errorType } = classifyGeminiError(error);
  return (
    errorType === "QUOTA_EXCEEDED" || errorType === "MODEL_NOT_FOUND" || errorType === "NETWORK_ERROR"
  );
}

function getHttpStatusFromError(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const maybe = error as { status?: unknown; response?: { status?: unknown } };
  const raw = maybe.status ?? maybe.response?.status;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
