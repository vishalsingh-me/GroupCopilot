import type PgBoss from "pg-boss";
import { db } from "@/db";
import {
  tasks,
  taskAssignments,
  taskDependencies,
  messages,
  messageSignals,
  teamContracts,
  teamSignals,
  teamMembers,
} from "@/db/schema";
import { eq, and, gte, lt, count, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

export async function handleRecomputeSignals(
  jobs: PgBoss.Job<{ teamId: string; reason?: string }>[]
) {
  // Dedupe: if multiple jobs for same team, process once
  const seen = new Set<string>();
  for (const job of jobs) {
    const { teamId } = job.data;
    if (seen.has(teamId)) continue;
    seen.add(teamId);

    try {
      console.log(`[recompute_signals] Computing for team ${teamId} (${job.data.reason ?? ""})`);
      const signals = await computeSignals(teamId);

      await db
        .insert(teamSignals)
        .values({ teamId, ...signals })
        .onConflictDoUpdate({
          target: teamSignals.teamId,
          set: {
            ...signals,
            computedAt: new Date(),
          },
        });

      // Chain: evaluate alerts after signals update
      const { enqueueJob } = await import("@/worker/client");
      await enqueueJob("evaluate_alerts", { teamId }, {
        singletonKey: `alerts_${teamId}`,
        singletonSeconds: 60,
      }).catch(() => {});

      console.log(`[recompute_signals] Done for team ${teamId}`);
    } catch (err) {
      console.error(`[recompute_signals] Error for team ${teamId}:`, err);
      throw err;
    }
  }
}

async function computeSignals(teamId: string) {
  const now = new Date();
  const [workload, workloadEvidence] = await computeWorkloadImbalance(teamId);
  const [deadline, deadlineEvidence] = await computeDeadlineRisk(teamId, now);
  const [commRisk, commEvidence] = await computeCommunicationRisk(teamId, now);
  const [drift, driftEvidence] = await computeDrift(teamId);

  return {
    workloadImbalance: String(workload.toFixed(4)),
    deadlineRisk: String(deadline.toFixed(4)),
    communicationRisk: String(commRisk.toFixed(4)),
    drift: String(drift.toFixed(4)),
    supportingMetricsJsonb: {
      workload: workloadEvidence,
      deadline: deadlineEvidence,
      comm: commEvidence,
      drift: driftEvidence,
    },
    evidencePreviewJsonb: {
      workload: workloadEvidence?.topFactor,
      deadline: deadlineEvidence?.overdueCount,
      comm: commEvidence?.negativitySlope,
      drift: driftEvidence?.score,
    },
  };
}

// ── 8.1 Workload Imbalance ───────────────────────────────────────────────────

async function computeWorkloadImbalance(
  teamId: string
): Promise<[number, Record<string, unknown>]> {
  const members = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId));

  if (members.length < 2) return [0, { reason: "< 2 members" }];

  const openTasks = await db
    .select({
      taskId: tasks.id,
      effortPoints: tasks.effortPoints,
      userId: taskAssignments.userId,
    })
    .from(tasks)
    .innerJoin(taskAssignments, eq(taskAssignments.taskId, tasks.id))
    .where(
      and(
        eq(tasks.teamId, teamId),
        sql`${tasks.status} IN ('todo', 'in_progress', 'blocked')`
      )
    );

  // Workload = effort_points * dependency_multiplier per member
  const workloads = new Map<string, number>();
  for (const m of members) workloads.set(m.userId, 0);

  for (const t of openTasks) {
    const base = t.effortPoints ?? 1;
    // Simplified: skip dependency multiplier for now (requires extra query)
    const current = workloads.get(t.userId) ?? 0;
    workloads.set(t.userId, current + base);
  }

  const values = Array.from(workloads.values());
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return [0, { reason: "no open tasks" }];

  const variance =
    values.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / values.length;
  const cv = Math.sqrt(variance) / mean; // coefficient of variation

  // Normalize CV to [0,1]: CV of 1.0+ → score 1.0
  const score = Math.min(1, cv);

  const sorted = Array.from(workloads.entries()).sort((a, b) => b[1] - a[1]);
  return [
    score,
    {
      memberWorkloads: Object.fromEntries(workloads),
      topFactor: sorted[0] ? `user ${sorted[0][0]} has ${sorted[0][1]} effort pts` : null,
      mean,
      cv,
    },
  ];
}

// ── 8.2 Deadline Risk ────────────────────────────────────────────────────────

async function computeDeadlineRisk(
  teamId: string,
  now: Date
): Promise<[number, Record<string, unknown>]> {
  const soon48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const soon7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const allOpenTasks = await db
    .select({ id: tasks.id, dueAt: tasks.dueAt, status: tasks.status })
    .from(tasks)
    .where(
      and(
        eq(tasks.teamId, teamId),
        sql`${tasks.status} NOT IN ('done')`
      )
    );

  const overdue = allOpenTasks.filter((t) => t.dueAt && t.dueAt < now);
  const dueSoon48 = allOpenTasks.filter(
    (t) => t.dueAt && t.dueAt >= now && t.dueAt <= soon48h
  );
  const dueSoon7d = allOpenTasks.filter(
    (t) => t.dueAt && t.dueAt >= now && t.dueAt <= soon7d
  );
  const total = allOpenTasks.length;

  if (total === 0) return [0, { reason: "no open tasks with due dates" }];

  const score = Math.min(
    1,
    (overdue.length * 0.6 + dueSoon48.length * 0.3 + dueSoon7d.length * 0.1) /
      Math.max(1, total)
  );

  return [
    score,
    {
      overdueCount: overdue.length,
      dueSoon48hCount: dueSoon48.length,
      dueSoon7dCount: dueSoon7d.length,
      totalOpen: total,
    },
  ];
}

// ── 8.3 Communication Risk ───────────────────────────────────────────────────

async function computeCommunicationRisk(
  teamId: string,
  now: Date
): Promise<[number, Record<string, unknown>]> {
  const recent7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prior7d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const recentSignals = await db
    .select({ negativityScore: messageSignals.negativityScore })
    .from(messageSignals)
    .innerJoin(messages, eq(messageSignals.messageId, messages.id))
    .where(
      and(
        eq(messages.teamId, teamId),
        gte(messages.createdAt, recent7d)
      )
    );

  const priorSignals = await db
    .select({ negativityScore: messageSignals.negativityScore })
    .from(messageSignals)
    .innerJoin(messages, eq(messageSignals.messageId, messages.id))
    .where(
      and(
        eq(messages.teamId, teamId),
        gte(messages.createdAt, prior7d),
        lt(messages.createdAt, recent7d)
      )
    );

  const recentNeg =
    recentSignals.length > 0
      ? recentSignals.reduce((a, s) => a + (s.negativityScore ?? 0), 0) /
        recentSignals.length
      : 0;

  const priorNeg =
    priorSignals.length > 0
      ? priorSignals.reduce((a, s) => a + (s.negativityScore ?? 0), 0) /
        priorSignals.length
      : 0;

  // Low message volume → low confidence, moderate baseline risk
  const volumeFactor = Math.min(1, recentSignals.length / 10);
  const negativitySlope = Math.max(0, recentNeg - priorNeg);
  const silenceRisk = recentSignals.length === 0 ? 0.2 : 0;

  const score = Math.min(
    1,
    recentNeg * 0.5 + negativitySlope * 0.3 * volumeFactor + silenceRisk
  );

  return [
    score,
    {
      recentMessageCount: recentSignals.length,
      recentAvgNegativity: recentNeg,
      priorAvgNegativity: priorNeg,
      negativitySlope,
      confidence: volumeFactor,
    },
  ];
}

// ── 8.4 Drift ────────────────────────────────────────────────────────────────
// Simplified: embedding-based drift requires precomputed embeddings.
// For now, use a heuristic: tasks with no description = potential drift.
async function computeDrift(
  teamId: string
): Promise<[number, Record<string, unknown>]> {
  const [contract] = await db
    .select({ goalEmbedding: teamContracts.goalEmbedding })
    .from(teamContracts)
    .where(eq(teamContracts.teamId, teamId))
    .orderBy(desc(teamContracts.version))
    .limit(1);

  if (!contract?.goalEmbedding) {
    return [0, { reason: "no goal embedding — complete team charter first" }];
  }

  // Get open tasks with embeddings
  const openTasks = await db
    .select({ taskEmbedding: tasks.taskEmbedding, title: tasks.title })
    .from(tasks)
    .where(
      and(
        eq(tasks.teamId, teamId),
        sql`${tasks.status} NOT IN ('done')`
      )
    );

  const tasksWithEmbeddings = openTasks.filter((t) => t.taskEmbedding);

  if (tasksWithEmbeddings.length === 0) {
    return [0, { reason: "no task embeddings computed yet" }];
  }

  // Average cosine distance between task embeddings and goal embedding
  const goalVec = contract.goalEmbedding;
  let totalDistance = 0;

  for (const task of tasksWithEmbeddings) {
    const dist = cosineSimilarity(goalVec, task.taskEmbedding!);
    totalDistance += 1 - dist; // distance = 1 - similarity
  }

  const avgDistance = totalDistance / tasksWithEmbeddings.length;
  const score = Math.min(1, avgDistance);

  return [
    score,
    {
      score: avgDistance,
      tasksChecked: tasksWithEmbeddings.length,
      totalOpenTasks: openTasks.length,
    },
  ];
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}
