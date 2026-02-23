import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { generateTextFromPrompt } from "@/lib/llm/gemini";
import {
  buildAssigneeSuggestionPrompt,
  type AssigneeSuggestionMemberInput,
} from "@/lib/llm/prompts/assigneeSuggestion";
import {
  getCardsByBoard,
  isTrelloConfigured,
  type TrelloCard,
} from "@/lib/trello/client";

const SuggestSchema = z.object({
  priority: z.enum(["low", "med", "high"]),
  milestoneIndex: z.number().int().min(1).max(999),
});

type WorkloadEntry = {
  userId: string;
  name: string;
  email: string;
  trelloMemberId?: string | null;
  points: number;
  highCount: number;
};

type CachedWorkload = {
  expiresAt: number;
  members: WorkloadEntry[];
};

const ASSIGNED_EMAIL_REGEX =
  /Assigned to:\s*(?:.+?<)?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>?/i;
const ASSIGNED_NAME_REGEX = /Assigned to:\s*(.+)/i;
const PRIORITY_REGEX = /Priority:\s*(low|med|medium|high)/i;
const TRELLO_WORKLOAD_CACHE_TTL_MS = 20_000;
const GEMINI_SUGGEST_TIMEOUT_MS = 350;
const workloadCache = new Map<string, CachedWorkload>();

function isAdminRole(role?: string | null): boolean {
  return role === "owner" || role === "admin";
}

function priorityWeight(priority: "low" | "med" | "high"): number {
  if (priority === "high") return 3;
  if (priority === "med") return 2;
  return 1;
}

function parsePriority(card: TrelloCard): "low" | "med" | "high" {
  const raw = card.desc?.match(PRIORITY_REGEX)?.[1]?.toLowerCase() ?? "low";
  if (raw === "high") return "high";
  if (raw === "med" || raw === "medium") return "med";
  return "low";
}

function resolveAssigneeUserId(card: TrelloCard, members: WorkloadEntry[]): string | null {
  for (const trelloMemberId of card.idMembers ?? []) {
    const member = members.find((candidate) => candidate.trelloMemberId === trelloMemberId);
    if (member) return member.userId;
  }

  const email = card.desc?.match(ASSIGNED_EMAIL_REGEX)?.[1]?.toLowerCase();
  if (email) {
    const member = members.find((candidate) => candidate.email.toLowerCase() === email);
    if (member) return member.userId;
  }

  const name = card.desc?.match(ASSIGNED_NAME_REGEX)?.[1]?.trim().toLowerCase();
  if (name) {
    const member = members.find((candidate) => candidate.name.toLowerCase() === name);
    if (member) return member.userId;
  }

  return null;
}

function computeFallbackSuggestion(
  members: WorkloadEntry[],
  priority: "low" | "med" | "high"
) {
  const add = priorityWeight(priority);
  let winner: WorkloadEntry | null = null;
  let bestRange = Number.POSITIVE_INFINITY;
  let bestCurrent = Number.POSITIVE_INFINITY;
  let bestHighCount = Number.POSITIVE_INFINITY;
  let bestUserId = "";

  for (const candidate of members) {
    const projected = members.map((member) =>
      member.userId === candidate.userId ? member.points + add : member.points
    );
    const range = Math.max(...projected) - Math.min(...projected);

    if (range < bestRange) {
      winner = candidate;
      bestRange = range;
      bestCurrent = candidate.points;
      bestHighCount = candidate.highCount;
      bestUserId = candidate.userId;
      continue;
    }

    if (range === bestRange && candidate.points < bestCurrent) {
      winner = candidate;
      bestCurrent = candidate.points;
      bestHighCount = candidate.highCount;
      bestUserId = candidate.userId;
      continue;
    }

    if (
      range === bestRange &&
      candidate.points === bestCurrent &&
      candidate.highCount < bestHighCount
    ) {
      winner = candidate;
      bestHighCount = candidate.highCount;
      bestUserId = candidate.userId;
      continue;
    }

    if (
      range === bestRange &&
      candidate.points === bestCurrent &&
      candidate.highCount === bestHighCount &&
      candidate.userId < bestUserId
    ) {
      winner = candidate;
      bestUserId = candidate.userId;
    }
  }

  return winner ?? members[0];
}

function buildRationale(members: WorkloadEntry[], selected: WorkloadEntry, priority: "low" | "med" | "high") {
  const add = priorityWeight(priority);
  const teamAverage = members.reduce((acc, member) => acc + member.points, 0) / Math.max(members.length, 1);
  const projected = selected.points + add;
  return `Suggested ${selected.name} because they have ${selected.points} points vs team average ${teamAverage.toFixed(
    1
  )}; assigning this ${priority.toUpperCase()} task balances total workload (completed + ongoing) to ${projected}.`;
}

function safeJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\{[\s\S]*\}/);
  const jsonCandidate = match ? match[0] : trimmed;
  try {
    const parsed = JSON.parse(jsonCandidate) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function maybeGeminiSuggestion(args: {
  priority: "low" | "med" | "high";
  members: WorkloadEntry[];
  fallbackSuggestionUserId: string;
}) {
  const promptMembers: AssigneeSuggestionMemberInput[] = args.members.map((member) => ({
    userId: member.userId,
    name: member.name,
    currentPoints: member.points,
    highCount: member.highCount,
  }));

  const prompt = buildAssigneeSuggestionPrompt({
    priority: args.priority,
    weight: priorityWeight(args.priority),
    members: promptMembers,
    fallbackSuggestionUserId: args.fallbackSuggestionUserId,
  });

  const generation = await generateTextFromPrompt(prompt);
  if (generation.mockMode) return null;

  const parsed = safeJsonObject(generation.text);
  if (!parsed) return null;

  const suggestedUserId = typeof parsed.suggestedUserId === "string" ? parsed.suggestedUserId : null;
  const rationale = typeof parsed.rationale === "string" ? parsed.rationale : null;
  if (!suggestedUserId || !rationale) return null;

  if (!args.members.some((member) => member.userId === suggestedUserId)) {
    return null;
  }

  return { suggestedUserId, rationale };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<T | null>([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room, user } = await requireRoomMember(code.toUpperCase());

    const membership = room.members.find((member) => member.userId === user.id);
    if (!isAdminRole(membership?.role)) {
      return NextResponse.json({ error: "Only room admins can request suggestions." }, { status: 403 });
    }

    const payload = SuggestSchema.parse(await req.json());
    const detailedRoom = await prisma.room.findUnique({
      where: { id: room.id },
      select: {
        members: {
          orderBy: { joinedAt: "asc" },
          select: {
            userId: true,
            trelloMemberId: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    const members: WorkloadEntry[] = (detailedRoom?.members ?? []).map((member) => ({
      userId: member.userId,
      name: member.user.name ?? member.user.email,
      email: member.user.email,
      trelloMemberId: member.trelloMemberId,
      points: 0,
      highCount: 0,
    }));

    if (members.length === 0) {
      return NextResponse.json({ error: "No room members found." }, { status: 400 });
    }

    if (members.length === 1) {
      const single = members[0];
      const add = priorityWeight(payload.priority);
      return NextResponse.json({
        suggestedUserId: single.userId,
        suggestedUser: {
          userId: single.userId,
          name: single.name,
          email: single.email,
        },
        rationale: `Suggested ${single.name} because they are currently the only room member.`,
        fairnessPreview: {
          before: [{ userId: single.userId, points: single.points }],
          after: [{ userId: single.userId, points: single.points + add }],
          objective: "minimize_range",
        },
      });
    }

    const cached = workloadCache.get(room.id);
    if (cached && cached.expiresAt > Date.now()) {
      for (const member of members) {
        const match = cached.members.find((cachedMember) => cachedMember.userId === member.userId);
        if (match) {
          member.points = match.points;
          member.highCount = match.highCount;
        }
      }
    } else if (room.trelloBoardId && isTrelloConfigured()) {
      const cards = await getCardsByBoard(room.trelloBoardId);

      for (const card of cards) {
        const userId = resolveAssigneeUserId(card, members);
        if (!userId) continue;

        const member = members.find((entry) => entry.userId === userId);
        if (!member) continue;

        const priority = parsePriority(card);
        member.points += priorityWeight(priority);
        if (priority === "high") member.highCount += 1;
      }

      workloadCache.set(room.id, {
        expiresAt: Date.now() + TRELLO_WORKLOAD_CACHE_TTL_MS,
        members: members.map((member) => ({
          ...member,
        })),
      });
    }

    const fallback = computeFallbackSuggestion(members, payload.priority);
    const modelSuggestion = await withTimeout(
      maybeGeminiSuggestion({
        priority: payload.priority,
        members,
        fallbackSuggestionUserId: fallback.userId,
      }),
      GEMINI_SUGGEST_TIMEOUT_MS
    );

    const suggestedUserId = modelSuggestion?.suggestedUserId ?? fallback.userId;
    const suggestedUser = members.find((member) => member.userId === suggestedUserId) ?? fallback;
    const rationale =
      modelSuggestion?.rationale ?? buildRationale(members, suggestedUser, payload.priority);

    const add = priorityWeight(payload.priority);
    const before = members.map((member) => ({
      userId: member.userId,
      points: member.points,
    }));
    const after = members.map((member) => ({
      userId: member.userId,
      points: member.userId === suggestedUserId ? member.points + add : member.points,
    }));

    return NextResponse.json({
      suggestedUserId,
      suggestedUser: {
        userId: suggestedUser.userId,
        name: suggestedUser.name,
        email: suggestedUser.email,
      },
      rationale,
      fairnessPreview: {
        before,
        after,
        objective: "minimize_range",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid suggestion payload.", issues: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "You are not a member of this room." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    console.error("[tasks/suggest-assignee][POST] error", error);
    return NextResponse.json({ error: "Unable to suggest assignee." }, { status: 500 });
  }
}
