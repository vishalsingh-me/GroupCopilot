import { AgentState, ApprovalStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { AgentState };

/** Shape of AgentSession.data at each state. */
export type SessionData = {
  skeletonDraft?: string[];         // SKELETON_DRAFT / SKELETON_QA
  skeletonQuestions?: string[];     // questions asked during SKELETON_QA
  qaAnswers?: Record<string, string>; // answers collected during SKELETON_QA
  contributionOrder?: string[];     // userIds in round-robin order (PLANNING_MEETING)
  contributions?: Record<string, string>; // userId → their next-step text
  taskProposals?: TaskProposal[];   // TASK_PROPOSALS / APPROVAL_GATE_2
  publishedCardIds?: string[];      // TRELLO_PUBLISH
  reviewSummary?: string;           // WEEKLY_REVIEW
};

export type TaskProposal = {
  title: string;
  description: string;
  acceptanceCriteria?: string[];
  dependencies?: string[];
  suggestedOwnerUserId?: string | null;
  suggestedOwnerName?: string | null;
  due?: string | null;       // "YYYY-MM-DD" or null
  effort?: "S" | "M" | "L" | null;
};

export type AgentSession = {
  id: string;
  roomId: string;
  state: AgentState;
  weekNumber: number;
  data: SessionData;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Valid Transitions ────────────────────────────────────────────────────────

const TRANSITIONS: Record<AgentState, AgentState[]> = {
  IDLE:             ["WEEKLY_KICKOFF"],
  WEEKLY_KICKOFF:   ["SKELETON_DRAFT"],
  SKELETON_DRAFT:   ["SKELETON_QA"],
  SKELETON_QA:      ["APPROVAL_GATE_1"],
  APPROVAL_GATE_1:  ["PLANNING_MEETING", "SKELETON_DRAFT"],
  PLANNING_MEETING: ["TASK_PROPOSALS"],
  TASK_PROPOSALS:   ["APPROVAL_GATE_2"],
  APPROVAL_GATE_2:  ["TRELLO_PUBLISH", "TASK_PROPOSALS"],
  TRELLO_PUBLISH:   ["MONITOR"],
  MONITOR:          ["WEEKLY_REVIEW"],
  WEEKLY_REVIEW:    ["IDLE"],
};

export function canTransition(from: AgentState, to: AgentState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Session Helpers ──────────────────────────────────────────────────────────

export function currentWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.ceil(((now.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7);
}

/** Get or create the active session for a room in the current week. */
export async function getOrCreateSession(roomId: string): Promise<AgentSession> {
  const weekNumber = currentWeekNumber();
  const existing = await prisma.agentSession.findUnique({
    where: { roomId_weekNumber: { roomId, weekNumber } },
  });
  if (existing) return existing as AgentSession;

  return prisma.agentSession.create({
    data: { roomId, weekNumber, state: "IDLE", data: {} },
  }) as unknown as AgentSession;
}

/** Advance session to the next state and merge any data updates. */
export async function advanceSession(
  sessionId: string,
  to: AgentState,
  dataPatch: Partial<SessionData> = {}
): Promise<AgentSession> {
  const session = await prisma.agentSession.findUniqueOrThrow({
    where: { id: sessionId },
  });

  if (!canTransition(session.state, to)) {
    throw new Error(`Invalid transition ${session.state} → ${to}`);
  }

  const merged = { ...(session.data as SessionData), ...dataPatch };

  return prisma.agentSession.update({
    where: { id: sessionId },
    data: { state: to, data: merged as Prisma.InputJsonValue },
  }) as unknown as AgentSession;
}

/** Patch session data without changing state (e.g. accumulating QA answers). */
export async function patchSessionData(
  sessionId: string,
  dataPatch: Partial<SessionData>
): Promise<AgentSession> {
  const session = await prisma.agentSession.findUniqueOrThrow({
    where: { id: sessionId },
  });
  const merged = { ...(session.data as SessionData), ...dataPatch };
  return prisma.agentSession.update({
    where: { id: sessionId },
    data: { data: merged as Prisma.InputJsonValue },
  }) as unknown as AgentSession;
}

// ─── Approval Gate Helpers ────────────────────────────────────────────────────

/** Open a new approval gate for a session. Returns the request id. */
export async function openApprovalGate(
  sessionId: string,
  type: "SKELETON" | "TASK_PLAN",
  payload: unknown
): Promise<string> {
  const req = await prisma.approvalRequest.create({
    data: {
      sessionId,
      type,
      payload: payload as Prisma.InputJsonValue,
      status: "pending",
    },
  });
  return req.id;
}

/** Cast a vote. Returns true if the gate resolved (all members approved). */
export async function castVote(
  requestId: string,
  userId: string,
  vote: "approve" | "request_change",
  comment?: string
): Promise<{
  resolved: boolean;
  status: ApprovalStatus;
  voteRecord: { id: string; vote: "approve" | "request_change"; requestId: string; userId: string; votedAt: Date };
}> {
  const votedAt = new Date();
  const voteRecord = await prisma.approvalVote.upsert({
    where: { requestId_userId: { requestId, userId } },
    update: { vote, comment, votedAt },
    create: { requestId, userId, vote, comment, votedAt },
    select: { id: true, vote: true, requestId: true, userId: true, votedAt: true },
  });

  // Check if all active room members have voted approve
  const request = await prisma.approvalRequest.findUniqueOrThrow({
    where: { id: requestId },
    select: {
      votes: { select: { userId: true, vote: true } },
      session: {
        select: {
          roomId: true,
        },
      },
    },
  });

  const roomMembers = await prisma.roomMember.findMany({
    where: { roomId: request.session.roomId },
    select: { userId: true },
  });

  const memberIds = roomMembers.map((m) => m.userId);
  const approveVotes = request.votes.filter((v) => v.vote === "approve").map((v) => v.userId);
  const hasChanges = request.votes.some((v) => v.vote === "request_change");

  if (hasChanges) {
    await prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: "rejected", resolvedAt: new Date(), resolvedBy: userId },
    });
    return { resolved: true, status: "rejected", voteRecord };
  }

  const allApproved = memberIds.every((id) => approveVotes.includes(id));
  if (allApproved) {
    await prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: "approved", resolvedAt: new Date(), resolvedBy: userId },
    });
    return { resolved: true, status: "approved", voteRecord };
  }

  return { resolved: false, status: "pending", voteRecord };
}

/** Get the latest open approval request for a session (or null). */
export async function getOpenApproval(sessionId: string) {
  return prisma.approvalRequest.findFirst({
    where: { sessionId, status: "pending" },
    include: { votes: true },
    orderBy: { id: "desc" },
  });
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export async function writeAuditLog(
  roomId: string,
  type: string,
  payload: unknown,
  actorId?: string
) {
  await prisma.auditLog.create({
    data: {
      roomId,
      type,
      actorId: actorId ?? null,
      payload: payload as Prisma.InputJsonValue,
    },
  });
}
