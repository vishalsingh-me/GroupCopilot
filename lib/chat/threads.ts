import { prisma } from "@/lib/prisma";

export const DEFAULT_MESSAGE_MODE = "brainstorm" as const;
export const DEFAULT_THREAD_TITLE = "New chat";
const LEGACY_CONVERSATION_TITLE_REGEX = /^Conversation\s+\d+$/i;

function buildDefaultThreadTitle(): string {
  return DEFAULT_THREAD_TITLE;
}

export async function getOrCreateDefaultThread(roomId: string, createdByUserId: string) {
  const existing = await prisma.conversationThread.findFirst({
    where: { roomId },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "asc" }],
  });
  if (existing) {
    return existing;
  }

  return prisma.conversationThread.create({
    data: {
      roomId,
      createdByUserId,
      title: DEFAULT_THREAD_TITLE,
      lastMessageAt: new Date(),
    },
  });
}

export async function ensureRoomThread(
  roomId: string,
  createdByUserId: string,
  threadId?: string | null
) {
  if (!threadId) {
    return getOrCreateDefaultThread(roomId, createdByUserId);
  }

  const thread = await prisma.conversationThread.findFirst({
    where: {
      id: threadId,
      roomId,
    },
  });

  if (!thread) {
    throw new Error("THREAD_NOT_FOUND");
  }

  return thread;
}

export async function createConversationThread(roomId: string, createdByUserId: string, title?: string) {
  const cleanTitle = title?.trim();
  const manualTitle = cleanTitle ? normalizeConversationTitle(cleanTitle) : "";

  return prisma.conversationThread.create({
    data: {
      roomId,
      createdByUserId,
      title: manualTitle || buildDefaultThreadTitle(),
      lastMessageAt: new Date(),
    },
  });
}

export async function touchConversationThread(threadId: string, when: Date = new Date()) {
  await prisma.conversationThread.update({
    where: { id: threadId },
    data: {
      lastMessageAt: when,
      updatedAt: when,
    },
  });
}

export function isPlaceholderThreadTitle(title: string | null | undefined): boolean {
  if (!title) return true;
  const normalized = title.trim();
  if (!normalized) return true;
  return normalized === DEFAULT_THREAD_TITLE || LEGACY_CONVERSATION_TITLE_REGEX.test(normalized);
}

export function deriveConversationTitleFromContent(content: string): string {
  const normalized = normalizeConversationTitle(content);
  if (!normalized) return DEFAULT_THREAD_TITLE;

  const fromJson = deriveTitleFromJsonPayload(normalized);
  if (fromJson) return fromJson;
  if (looksLikeJson(normalized)) return "Conflict support";

  return normalized;
}

export function deriveConversationTitleFromMessages(
  messages: Array<{ content: string }>,
  fallbackTitle?: string | null
): string {
  for (const message of messages) {
    const candidate = deriveConversationTitleFromContent(message.content);
    if (candidate !== DEFAULT_THREAD_TITLE) {
      return candidate;
    }
  }

  const fallback = normalizeConversationTitle(fallbackTitle ?? "");
  if (fallback && !isPlaceholderThreadTitle(fallback)) {
    return fallback;
  }

  return DEFAULT_THREAD_TITLE;
}

export async function maybeAssignThreadTitleFromMessage(threadId: string, messageContent: string) {
  const derivedTitle = deriveConversationTitleFromContent(messageContent);
  if (derivedTitle === DEFAULT_THREAD_TITLE) return;

  const current = await prisma.conversationThread.findUnique({
    where: { id: threadId },
    select: { id: true, title: true },
  });

  if (!current || !isPlaceholderThreadTitle(current.title)) {
    return;
  }

  await prisma.conversationThread.update({
    where: { id: threadId },
    data: { title: derivedTitle },
  });
}

function deriveTitleFromJsonPayload(value: string): string | null {
  if (!looksLikeJson(value)) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return null;

    const neutralSummary = getStringField(parsed, "neutral_summary");
    if (neutralSummary) {
      return normalizeConversationTitle(firstSentence(neutralSummary)) || "Conflict support";
    }

    const followUp = parsed.follow_up;
    if (isRecord(followUp)) {
      const nextQuestion = getStringField(followUp, "next_question");
      if (nextQuestion) {
        return normalizeConversationTitle(firstSentence(nextQuestion)) || "Conflict support";
      }
    }

    return "Conflict support";
  } catch {
    return null;
  }
}

function normalizeConversationTitle(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";

  const withoutCodeFence = collapsed
    .replace(/^```(?:json|markdown|md)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const withoutQuotes = withoutCodeFence.replace(/^[`"'“”‘’]+/, "");
  const withoutLeadingNoise = withoutQuotes.replace(/^[^A-Za-z0-9]+/, "");
  const cleaned = withoutLeadingNoise.trim();
  if (!cleaned) return "";

  return cleaned.slice(0, 120);
}

function firstSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^[^.!?\n]+[.!?]?/);
  return match ? match[0].trim() : trimmed;
}

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getStringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
