import type PgBoss from "pg-boss";
import { db } from "@/db";
import { alerts, teamSignals, teamThresholds } from "@/db/schema";
import { eq, and } from "drizzle-orm";

type AlertType =
  | "workload_imbalance"
  | "deadline_risk"
  | "communication_risk"
  | "drift";

const SIGNAL_TO_ALERT_TYPE: Record<string, AlertType> = {
  workloadImbalance: "workload_imbalance",
  deadlineRisk: "deadline_risk",
  communicationRisk: "communication_risk",
  drift: "drift",
};

const MATERIAL_INCREASE_THRESHOLD = 0.15;

export async function handleEvaluateAlerts(
  jobs: PgBoss.Job<{ teamId: string }>[]
) {
  const seen = new Set<string>();
  for (const job of jobs) {
    const { teamId } = job.data;
    if (seen.has(teamId)) continue;
    seen.add(teamId);

    try {
      await evaluateTeamAlerts(teamId);
    } catch (err) {
      console.error(`[evaluate_alerts] Error for team ${teamId}:`, err);
      throw err;
    }
  }
}

async function evaluateTeamAlerts(teamId: string) {
  const [signals] = await db
    .select()
    .from(teamSignals)
    .where(eq(teamSignals.teamId, teamId))
    .limit(1);

  if (!signals) return;

  const now = new Date();
  const signalValues: Record<string, number> = {
    workloadImbalance: parseFloat(signals.workloadImbalance),
    deadlineRisk: parseFloat(signals.deadlineRisk),
    communicationRisk: parseFloat(signals.communicationRisk),
    drift: parseFloat(signals.drift),
  };

  for (const [signalKey, score] of Object.entries(signalValues)) {
    const alertType = SIGNAL_TO_ALERT_TYPE[signalKey];
    if (!alertType) continue;

    const [threshold] = await db
      .select()
      .from(teamThresholds)
      .where(
        and(
          eq(teamThresholds.teamId, teamId),
          eq(teamThresholds.alertType, alertType)
        )
      )
      .limit(1);

    const thresholdLow = parseFloat(threshold?.thresholdLow ?? "0.3");
    const thresholdMed = parseFloat(threshold?.thresholdMed ?? "0.55");
    const thresholdHigh = parseFloat(threshold?.thresholdHigh ?? "0.75");

    if (score < thresholdLow) {
      // Below threshold — ensure no open alert
      await closeAlertIfOpen(teamId, alertType, "resolved");
      continue;
    }

    const severity =
      score >= thresholdHigh
        ? "high"
        : score >= thresholdMed
          ? "med"
          : "low";

    // Check existing open alert
    const [existingAlert] = await db
      .select()
      .from(alerts)
      .where(
        and(
          eq(alerts.teamId, teamId),
          eq(alerts.type, alertType),
          eq(alerts.status, "open")
        )
      )
      .limit(1);

    const evidence = buildEvidence(signalKey, signals);

    if (existingAlert) {
      const prevScore = existingAlert.score;
      const materialIncrease = score - prevScore >= MATERIAL_INCREASE_THRESHOLD;

      // Check cooldown/snooze (material increase bypasses)
      if (!materialIncrease) {
        if (existingAlert.snoozeUntil && existingAlert.snoozeUntil > now) continue;
      }

      // Update existing alert
      await db
        .update(alerts)
        .set({
          score,
          severity,
          confidence: computeConfidence(signalKey, signals),
          evidenceJsonb: evidence,
          updatedAt: now,
          // If snoozed but material increase, re-open
          ...(materialIncrease && existingAlert.status === "snoozed"
            ? { status: "open", snoozeUntil: null }
            : {}),
        })
        .where(eq(alerts.id, existingAlert.id));
    } else {
      // Check cooldown
      const [recentlyClosed] = await db
        .select()
        .from(alerts)
        .where(
          and(
            eq(alerts.teamId, teamId),
            eq(alerts.type, alertType)
          )
        )
        .orderBy(alerts.updatedAt)
        .limit(1);

      if (
        recentlyClosed?.cooldownUntil &&
        recentlyClosed.cooldownUntil > now
      ) {
        // In cooldown — only create if material increase vs. closed score
        const closedScore = recentlyClosed.score;
        if (score - closedScore < MATERIAL_INCREASE_THRESHOLD) continue;
      }

      const dedupeKey = `${alertType}_${teamId}`;
      await db.insert(alerts).values({
        teamId,
        type: alertType,
        status: "open",
        score,
        severity,
        confidence: computeConfidence(signalKey, signals),
        evidenceJsonb: evidence,
        dedupeKey,
      });

      console.log(
        `[evaluate_alerts] Created alert: team=${teamId} type=${alertType} severity=${severity} score=${score.toFixed(2)}`
      );
    }
  }
}

async function closeAlertIfOpen(
  teamId: string,
  alertType: AlertType,
  status: "resolved"
) {
  await db
    .update(alerts)
    .set({ status, closedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(alerts.teamId, teamId),
        eq(alerts.type, alertType),
        eq(alerts.status, "open")
      )
    );
}

function buildEvidence(
  signalKey: string,
  signals: typeof teamSignals.$inferSelect
): Record<string, unknown> {
  const metrics = signals.supportingMetricsJsonb as Record<string, unknown> | null;
  const data = (metrics?.[signalKey === 'workloadImbalance' ? 'workload' :
    signalKey === 'deadlineRisk' ? 'deadline' :
    signalKey === 'communicationRisk' ? 'comm' : 'drift'] ?? {}) as Record<string, unknown>;

  return {
    factors: [
      {
        kind: signalKey,
        label: formatSignalLabel(signalKey),
        value: parseFloat(
          signals[signalKey as keyof typeof signals] as string ?? "0"
        ),
        entityRefs: [],
      },
    ],
    metrics: data,
    explanations: [
      `${formatSignalLabel(signalKey)} score: ${(parseFloat(
        signals[signalKey as keyof typeof signals] as string ?? "0"
      ) * 100).toFixed(0)}%`,
    ],
  };
}

function formatSignalLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function computeConfidence(
  signalKey: string,
  signals: typeof teamSignals.$inferSelect
): number {
  const metrics = signals.supportingMetricsJsonb as Record<string, unknown> | null;
  if (signalKey === "communicationRisk") {
    const commData = metrics?.comm as { confidence?: number } | null;
    return commData?.confidence ?? 0.5;
  }
  return 0.7; // default confidence for non-comm signals
}
