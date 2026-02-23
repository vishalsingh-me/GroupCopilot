import type { PrismaClient } from "@prisma/client";

export const WORKLOAD_PRIORITY_WEIGHTS: Record<"low" | "med" | "high", number> = {
  low: 1,
  med: 2,
  high: 3,
};

const DONE_STATUSES = new Set(["done", "complete", "completed", "closed"]);

export type WorkloadMemberInput = {
  userId: string;
  joinedAt: Date;
};

export type WorkloadSummary = {
  userId: string;
  points: number; // completed points
  lowCount: number; // completed low count
  medCount: number; // completed med count
  highCount: number; // completed high count
  pendingPoints: number;
  pendingLowCount: number;
  pendingMedCount: number;
  pendingHighCount: number;
  expectedPoints: number; // completed + pending
};

export function normalizePriority(input: unknown): "low" | "med" | "high" | null {
  if (input === "low" || input === "med" || input === "high") return input;
  return null;
}

export async function computeRoomCompletedWorkload(
  client: PrismaClient,
  roomId: string,
  members: WorkloadMemberInput[]
) {
  const workloadMap = new Map<string, WorkloadSummary>();
  members.forEach((member) => {
    workloadMap.set(member.userId, {
      userId: member.userId,
      points: 0,
      lowCount: 0,
      medCount: 0,
      highCount: 0,
      pendingPoints: 0,
      pendingLowCount: 0,
      pendingMedCount: 0,
      pendingHighCount: 0,
      expectedPoints: 0,
    });
  });

  if (members.length === 0) {
    return {
      baselineStartAt: null as Date | null,
      workloadMap,
    };
  }

  // Reset fairness baseline when latest member joins.
  const baselineStartAt = members.reduce((latest, member) => {
    return member.joinedAt > latest ? member.joinedAt : latest;
  }, members[0].joinedAt);

  const doneCards = await client.trelloCardCache.findMany({
    where: { roomId },
    select: {
      trelloCardId: true,
      status: true,
    },
  });
  const cardStatusMap = new Map(
    doneCards.map((card) => [card.trelloCardId, card.status.trim().toLowerCase()])
  );
  const completedCardIds = new Set(
    doneCards
      .filter((card) => DONE_STATUSES.has(card.status.trim().toLowerCase()))
      .map((card) => card.trelloCardId)
  );

  const auditLogs = await client.auditLog.findMany({
    where: {
      roomId,
      type: "manual_task_created",
      createdAt: { gte: baselineStartAt },
    },
    orderBy: { createdAt: "desc" },
    select: {
      payload: true,
    },
  });

  const cardMeta = new Map<string, { assignedUserId: string; priority: "low" | "med" | "high" }>();
  for (const log of auditLogs) {
    const payload = log.payload as Record<string, unknown> | null;
    const trelloCardId = typeof payload?.trelloCardId === "string" ? payload.trelloCardId : null;
    const assignedUserId =
      typeof payload?.assignedUserId === "string" ? payload.assignedUserId : null;
    const priority = normalizePriority(payload?.priority);
    if (!trelloCardId || !assignedUserId || !priority) continue;
    if (!cardMeta.has(trelloCardId)) {
      cardMeta.set(trelloCardId, { assignedUserId, priority });
    }
  }

  for (const [cardId, meta] of cardMeta.entries()) {
    const workload = workloadMap.get(meta.assignedUserId);
    if (!workload) continue;
    const weight = WORKLOAD_PRIORITY_WEIGHTS[meta.priority];
    const cardStatus = cardStatusMap.get(cardId);
    const isCompleted = cardStatus ? DONE_STATUSES.has(cardStatus) : completedCardIds.has(cardId);

    if (isCompleted) {
      workload.points += weight;
      if (meta.priority === "high") workload.highCount += 1;
      if (meta.priority === "med") workload.medCount += 1;
      if (meta.priority === "low") workload.lowCount += 1;
      continue;
    }

    workload.pendingPoints += weight;
    if (meta.priority === "high") workload.pendingHighCount += 1;
    if (meta.priority === "med") workload.pendingMedCount += 1;
    if (meta.priority === "low") workload.pendingLowCount += 1;
  }

  for (const workload of workloadMap.values()) {
    workload.expectedPoints = workload.points + workload.pendingPoints;
  }

  return {
    baselineStartAt,
    workloadMap,
  };
}
