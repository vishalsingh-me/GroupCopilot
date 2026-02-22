import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireRoomMember } from "@/lib/auth-helpers";
import { generateAssistantReply, generateTextFromPrompt } from "@/lib/llm/gemini";
import type { MockReason } from "@/lib/llm/mock";
import { prisma } from "@/lib/prisma";
import {
  type ConflictResponse,
  ConflictResponseSchema,
  safeParseConflictResponse
} from "@/lib/prompts/mediator/zod";

const ChatSchema = z.object({
  roomCode: z.string().trim().min(4),
  message: z.string().trim().min(1),
  mode: z.enum(["brainstorm", "clarify", "tickets", "schedule", "conflict"])
});

type CompactHistoryItem = {
  role: "user" | "assistant";
  name: string;
  content: string;
};

type RetrievedChunk = {
  chunkId: string;
  title: string;
  text: string;
};

export async function POST(request: Request) {
  try {
    const body = ChatSchema.parse(await request.json());
    const { room } = await requireRoomMember(body.roomCode.toUpperCase());

    const recentMessages = await prisma.message.findMany({
      where: {
        roomId: room.id,
        senderType: { in: ["user", "assistant"] }
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        senderType: true,
        content: true,
        senderUser: {
          select: { name: true, email: true }
        }
      }
    });

    const history = recentMessages
      .reverse()
      .map((entry): CompactHistoryItem => ({
        role: entry.senderType === "assistant" ? "assistant" : "user",
        name: entry.senderType === "assistant"
          ? "Assistant"
          : (entry.senderUser?.name ?? entry.senderUser?.email ?? "User"),
        content: entry.content
      }));

    if (!isDuplicateLastUserMessage(history, body.message)) {
      history.push({ role: "user", name: "User", content: body.message });
    }

    const retrievedChunks = body.mode === "conflict"
      ? await loadConflictRetrievedChunks(body.message)
      : [];

    const teamMembers = body.mode === "conflict"
      ? await prisma.roomMember.findMany({
        where: { roomId: room.id },
        select: { user: { select: { name: true, email: true } } }
      })
      : [];

    const teamContext = body.mode === "conflict"
      ? {
        roomName: room.name ?? room.code,
        members: teamMembers.map((member) => member.user.name ?? member.user.email ?? "Unknown")
      }
      : undefined;

    const result = await generateAssistantReply({
      mode: body.mode,
      message: body.message,
      history,
      retrievedChunks,
      teamContext
    });

    let assistantContent = result.text.trim() || "I had trouble generating a reply. Please try rephrasing.";
    let assistantMetadata: Prisma.InputJsonValue | undefined = result.artifacts
      ? JSON.parse(JSON.stringify(result.artifacts)) as Prisma.InputJsonValue
      : undefined;
    let finalMockReason: MockReason | null = result.reason ?? null;

    if (body.mode === "conflict") {
      const resolved = await resolveConflictResponse({
        rawText: result.text,
        userMessage: body.message,
        history,
        retrievedChunks,
        roomName: room.name ?? room.code
      });
      assistantContent = JSON.stringify(resolved.payload);
      assistantMetadata = resolved.payload as Prisma.InputJsonValue;
      if (!resolved.repairUsed && resolved.fromFallback && finalMockReason === null) {
        finalMockReason = "invalid_response";
      }
      if (resolved.repairReason) {
        finalMockReason = resolved.repairReason;
      }
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[api/chat] result", {
        mode: body.mode,
        mockMode: result.mockMode,
        reason: finalMockReason,
        textLength: assistantContent.length,
        hasMetadata: Boolean(assistantMetadata)
      });
    }

    const assistantMessage = await prisma.message.create({
      data: {
        roomId: room.id,
        senderType: "assistant",
        senderUserId: null,
        content: assistantContent,
        mode: body.mode,
        metadata: assistantMetadata
      }
    });

    return NextResponse.json({
      assistantMessage,
      artifacts: result.artifacts,
      mockMode: result.mockMode,
      mockReason: finalMockReason
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to generate response" }, { status: 400 });
  }
}

function isDuplicateLastUserMessage(history: CompactHistoryItem[], message: string) {
  const latestHistory = history[history.length - 1];
  return Boolean(
    latestHistory
    && latestHistory.role === "user"
    && latestHistory.content.trim() === message.trim()
  );
}

async function loadConflictRetrievedChunks(userMessage: string): Promise<RetrievedChunk[]> {
  const guidePath = path.join(process.cwd(), "docs", "conflict-management.md");
  let markdown = "";
  try {
    markdown = await fs.readFile(guidePath, "utf8");
  } catch {
    return [];
  }

  const sections = splitGuideIntoSections(markdown);
  if (sections.length === 0) {
    return [];
  }

  const tokens = tokenize(userMessage);
  const ranked = sections
    .map((section, idx) => ({
      ...section,
      chunkId: `conflict-guide-${idx + 1}`,
      score: scoreSection(section.text, tokens)
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.chunkId.localeCompare(b.chunkId);
    });

  return ranked
    .slice(0, 6)
    .map((item) => ({
      chunkId: item.chunkId,
      title: item.title,
      text: item.text.slice(0, 1200)
    }));
}

function splitGuideIntoSections(markdown: string) {
  const rawParts = markdown.split(/\n##\s+/);
  return rawParts
    .map((part, index) => {
      if (index === 0) {
        return {
          title: "Overview",
          text: part.trim()
        };
      }
      const [heading, ...rest] = part.split("\n");
      return {
        title: heading.trim(),
        text: rest.join("\n").trim()
      };
    })
    .filter((section) => section.text.length > 0);
}

function tokenize(input: string) {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

function scoreSection(sectionText: string, tokens: string[]) {
  if (tokens.length === 0) return 1;
  const hay = sectionText.toLowerCase();
  return tokens.reduce((score, token) => score + (hay.includes(token) ? 1 : 0), 0);
}

type ResolveConflictArgs = {
  rawText: string;
  userMessage: string;
  history: CompactHistoryItem[];
  retrievedChunks: RetrievedChunk[];
  roomName: string;
};

type ResolveConflictResult = {
  payload: ConflictResponse;
  repairUsed: boolean;
  fromFallback: boolean;
  repairReason: MockReason | null;
};

async function resolveConflictResponse(args: ResolveConflictArgs): Promise<ResolveConflictResult> {
  const first = safeParseConflictResponse(args.rawText);
  if (first.ok) {
    return {
      payload: first.data,
      repairUsed: false,
      fromFallback: false,
      repairReason: null
    };
  }

  const repairPrompt = buildConflictRepairPrompt({
    invalidOutput: args.rawText,
    parseError: first.error,
    userMessage: args.userMessage,
    history: args.history
  });
  const repairResult = await generateTextFromPrompt(repairPrompt);
  if (!repairResult.mockMode) {
    const repaired = safeParseConflictResponse(repairResult.text);
    if (repaired.ok) {
      return {
        payload: repaired.data,
        repairUsed: true,
        fromFallback: false,
        repairReason: null
      };
    }
  }

  const fallback = buildDeterministicConflictFallback(args.userMessage, args.roomName, args.retrievedChunks);
  return {
    payload: fallback,
    repairUsed: true,
    fromFallback: true,
    repairReason: repairResult.reason ?? "invalid_response"
  };
}

function buildConflictRepairPrompt({
  invalidOutput,
  parseError,
  userMessage,
  history
}: {
  invalidOutput: string;
  parseError: string;
  userMessage: string;
  history: CompactHistoryItem[];
}) {
  return [
    "You are fixing invalid conflict-mediator JSON output.",
    "Task: return corrected JSON only that satisfies the conflict schema.",
    "Constraints:",
    "- mode must be conflict",
    "- include all required top-level fields",
    "- clarifying_questions max 3",
    "- tool_suggestions[*].requires_confirmation must be true",
    "- confidence between 0 and 1",
    "",
    `user_message: ${userMessage}`,
    `history: ${JSON.stringify(history.slice(-12))}`,
    "",
    "Invalid output to repair:",
    invalidOutput,
    "",
    `Validation errors: ${parseError}`,
    "",
    "Return corrected JSON only."
  ].join("\n");
}

function buildDeterministicConflictFallback(
  userMessage: string,
  roomName: string,
  retrievedChunks: RetrievedChunk[]
): ConflictResponse {
  const payload = {
    mode: "conflict",
    status: "needs_clarification",
    safety: {
      risk_level: "none",
      signals: [],
      escalation_message: ""
    },
    conflict_type: "other",
    neutral_summary:
      "I can help mediate this neutrally. I need a bit more context to avoid assumptions and suggest practical next steps.",
    permission_check: {
      asked: true,
      question: "Would you like options, a draft script, or both?",
      user_response: ""
    },
    clarifying_questions: [
      "What type of conflict is this: schedule, workload, tone, priorities, or something else?",
      "Who is involved, and what outcome do you want from this conversation?",
      "What is the main constraint right now (deadline, role ambiguity, or communication gap)?"
    ],
    options: [
      {
        id: "A",
        title: "Quick alignment pass",
        description: "Clarify the conflict type and desired outcome first, then choose a mediation option.",
        tradeoffs: "Fast start, but requires one more clarification turn.",
        when_to_use: "Best when the initial message is high-level (e.g. 'help' or 'we have conflict')."
      }
    ],
    suggested_script: {
      purpose: "Open a neutral clarification conversation",
      audience: roomName || "group",
      text:
        "I want us to align without blame. Can we quickly name the main issue, what outcome we want, and one constraint we should account for?"
    },
    micro_plan: [
      {
        step: 1,
        action: "Identify conflict type and desired outcome",
        owner: "team",
        timeframe: "now",
        done_when: "Conflict category and target outcome are explicit"
      },
      {
        step: 2,
        action: "Choose one mediation option and owner",
        owner: "owner",
        timeframe: "next message",
        done_when: "An agreed next step is documented"
      }
    ],
    tool_suggestions: [],
    follow_up: {
      next_question: "Do you want a quick options list, a draft script, or both?",
      check_in_prompt: "Check in after one cycle: did clarity and alignment improve?"
    },
    citations: retrievedChunks.slice(0, 1).map((chunk) => ({ chunkId: chunk.chunkId, title: chunk.title })),
    confidence: 0.32
  } satisfies ConflictResponse;

  const parsed = ConflictResponseSchema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }

  return {
    mode: "conflict",
    status: "needs_clarification",
    safety: { risk_level: "none", signals: [], escalation_message: "" },
    conflict_type: "other",
    neutral_summary: "I need a bit more context to facilitate this conflict neutrally.",
    permission_check: {
      asked: true,
      question: "Would you like options, a draft script, or both?",
      user_response: ""
    },
    clarifying_questions: [
      "What type of conflict is this?",
      "Who is involved and what outcome do you want?",
      "What constraint matters most right now?"
    ],
    options: [
      {
        id: "A",
        title: "Clarify context first",
        description: "Collect minimal details before recommending scripts or actions.",
        tradeoffs: "Requires one extra turn.",
        when_to_use: "Use when initial context is minimal."
      }
    ],
    suggested_script: {
      purpose: "Start a neutral conflict clarification",
      audience: "group",
      text:
        "I want us to align without blame. Can we name the issue, desired outcome, and key constraint first?"
    },
    micro_plan: [
      {
        step: 1,
        action: "Collect minimum context",
        owner: "team",
        timeframe: "now",
        done_when: "Conflict type and desired outcome are clear"
      }
    ],
    tool_suggestions: [],
    follow_up: {
      next_question: "Would you like options, a script, or both?",
      check_in_prompt: "Check in after the next discussion."
    },
    citations: [],
    confidence: 0.2
  };
}
