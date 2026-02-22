import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isRoomAdminRole } from "@/lib/room-admin";
import { generateTextFromPrompt } from "@/lib/llm/gemini";
import { buildAssigneeSuggestionPrompt } from "@/lib/llm/prompts/assigneeSuggestion";
import {
  computeRoomCompletedWorkload,
  WORKLOAD_PRIORITY_WEIGHTS,
  type WorkloadSummary,
} from "@/lib/tasks/workload";

const SuggestAssigneeSchema = z.object({
  priority: z.enum(["low", "med", "high"]),
  milestoneIndex: z.coerce.number().int().min(1).max(100),
});

type Member = {
  userId: string;
  name: string;
  email: string;
  isAdmin: boolean;
};

type Suggestion = {
  suggestedUserId: string;
  rationale: string;
};

function mapAuthError(error: unknown): { status: number; message: string } | null {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return { status: 401, message: "Not signed in." };
  if (message === "FORBIDDEN") return { status: 403, message: "You are not a member of this room." };
  if (message === "NOT_FOUND") return { status: 404, message: "Room not found." };
  return null;
}

function parseSuggestionJson(raw: string): Suggestion | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const cleaned = trimmed
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as {
      suggestedUserId?: unknown;
      rationale?: unknown;
    };
    if (
      typeof parsed.suggestedUserId === "string" &&
      parsed.suggestedUserId.trim().length > 0 &&
      typeof parsed.rationale === "string" &&
      parsed.rationale.trim().length > 0
    ) {
      return {
        suggestedUserId: parsed.suggestedUserId.trim(),
        rationale: parsed.rationale.trim(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function computeWorkloadRange(values: number[]): number {
  if (values.length === 0) return 0;
  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i += 1) {
    const value = values[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return max - min;
}

function computeFallbackSuggestion(
  members: Member[],
  workloadMap: Map<string, WorkloadSummary>,
  taskWeight: number
) {
  const allZero = members.every((member) => (workloadMap.get(member.userId)?.points ?? 0) === 0);

  const scored = members.map((member) => {
    const current = workloadMap.get(member.userId) ?? {
      userId: member.userId,
      points: 0,
      highCount: 0,
      lowCount: 0,
      medCount: 0,
    };

    const afterPoints = members.map((candidate) => {
      const base = workloadMap.get(candidate.userId)?.points ?? 0;
      return candidate.userId === member.userId ? base + taskWeight : base;
    });

    return {
      member,
      currentPoints: current.points,
      highCount: current.highCount,
      rangeAfter: computeWorkloadRange(afterPoints),
      nonAdminBonus: allZero && !member.isAdmin ? 0 : 1,
    };
  });

  scored.sort((a, b) => {
    if (a.rangeAfter !== b.rangeAfter) return a.rangeAfter - b.rangeAfter;
    if (a.currentPoints !== b.currentPoints) return a.currentPoints - b.currentPoints;
    if (a.highCount !== b.highCount) return a.highCount - b.highCount;
    if (a.nonAdminBonus !== b.nonAdminBonus) return a.nonAdminBonus - b.nonAdminBonus;
    return a.member.userId.localeCompare(b.member.userId);
  });

  return scored[0]?.member.userId ?? members[0]?.userId ?? "";
}

async function askGeminiWithTimeout(prompt: string, timeoutMs = 220): Promise<string | null> {
  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });
  const responsePromise = generateTextFromPrompt(prompt)
    .then((result) => {
      if (result.mockMode || !result.text.trim()) return null;
      return result.text;
    })
    .catch(() => null);

  return Promise.race([responsePromise, timeoutPromise]);
}

function buildFairnessPreview(
  members: Member[],
  workloadMap: Map<string, WorkloadSummary>,
  suggestedUserId: string,
  taskWeight: number
) {
  const before = members.map((member) => ({
    userId: member.userId,
    points: workloadMap.get(member.userId)?.points ?? 0,
  }));
  const after = members.map((member) => ({
    userId: member.userId,
    points:
      (workloadMap.get(member.userId)?.points ?? 0) +
      (member.userId === suggestedUserId ? taskWeight : 0),
  }));
  return { before, after, objective: "minimize_range" as const };
}

/**
 * POST /api/rooms/[code]/tasks/suggest-assignee
 * Admin-only assignee suggestion using deterministic fairness fallback + optional Gemini.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room, user } = await requireRoomMember(code.toUpperCase());
    const membership = room.members.find((member) => member.userId === user.id);
    if (!isRoomAdminRole(membership?.role)) {
      return NextResponse.json(
        { error: "Only the room admin can request assignee suggestions." },
        { status: 403 }
      );
    }

    const body = SuggestAssigneeSchema.parse(await req.json());
    const taskWeight = WORKLOAD_PRIORITY_WEIGHTS[body.priority];

    const members = await prisma.roomMember.findMany({
      where: { roomId: room.id },
      orderBy: { joinedAt: "asc" },
      select: {
        userId: true,
        joinedAt: true,
        role: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    const normalizedMembers: Member[] = members.map((member) => ({
      userId: member.userId,
      name: member.user.name ?? member.user.email,
      email: member.user.email,
      isAdmin: isRoomAdminRole(member.role),
    }));

    if (normalizedMembers.length === 0) {
      return NextResponse.json({ error: "No room members available." }, { status: 400 });
    }
    const { workloadMap } = await computeRoomCompletedWorkload(
      prisma,
      room.id,
      members.map((member) => ({ userId: member.userId, joinedAt: member.joinedAt }))
    );

    const fallbackSuggestionUserId = computeFallbackSuggestion(
      normalizedMembers,
      workloadMap,
      taskWeight
    );
    const fallbackMember =
      normalizedMembers.find((member) => member.userId === fallbackSuggestionUserId) ??
      normalizedMembers[0];

    let suggestedUserId = fallbackMember.userId;
    let rationale =
      "Used deterministic fairness fallback to minimize post-assignment workload range.";

    const prompt = buildAssigneeSuggestionPrompt({
      taskPriority: body.priority,
      priorityWeight: taskWeight,
      members: normalizedMembers.map((member) => ({
        userId: member.userId,
        name: member.name,
        currentPoints: workloadMap.get(member.userId)?.points ?? 0,
        highCount: workloadMap.get(member.userId)?.highCount ?? 0,
      })),
      fallbackSuggestionUserId,
    });

    const geminiRaw = await askGeminiWithTimeout(prompt);
    if (geminiRaw) {
      const parsed = parseSuggestionJson(geminiRaw);
      if (parsed && normalizedMembers.some((member) => member.userId === parsed.suggestedUserId)) {
        suggestedUserId = parsed.suggestedUserId;
        rationale = parsed.rationale;
      }
    }

    const suggestedUser =
      normalizedMembers.find((member) => member.userId === suggestedUserId) ?? fallbackMember;

    return NextResponse.json({
      suggestedUserId: suggestedUser.userId,
      suggestedUser: {
        userId: suggestedUser.userId,
        name: suggestedUser.name,
        email: suggestedUser.email,
      },
      rationale,
      fairnessPreview: buildFairnessPreview(
        normalizedMembers,
        workloadMap,
        suggestedUser.userId,
        taskWeight
      ),
      milestoneIndex: body.milestoneIndex,
      priority: body.priority,
    });
  } catch (error) {
    const authError = mapAuthError(error);
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: authError.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid suggestion payload.", issues: error.issues },
        { status: 400 }
      );
    }

    console.error("[tasks/suggest-assignee] error", error);
    return NextResponse.json({ error: "Unable to suggest assignee." }, { status: 500 });
  }
}
