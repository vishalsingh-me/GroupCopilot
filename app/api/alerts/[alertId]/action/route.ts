import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { alerts, alertFeedback, teamThresholds } from "@/db/schema";
import { eq, and, gte, count } from "drizzle-orm";
import { requireUser, requireTeamMember } from "@/server/auth";
import { ok, err, handleRouteError } from "@/server/api";

const ActionBody = z.object({
  action: z.enum(["resolve", "not_issue", "snooze"]),
  snoozeUntil: z.string().datetime().optional(),
  reason: z.string().max(500).optional(),
  whatChanged: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ alertId: string }> }
) {
  try {
    const { alertId } = await params;
    const user = await requireUser();
    const body = ActionBody.parse(await req.json());

    const [alert] = await db
      .select()
      .from(alerts)
      .where(eq(alerts.id, alertId))
      .limit(1);

    if (!alert) return err("NOT_FOUND", "Alert not found", 404);

    await requireTeamMember(alert.teamId, user.id);

    const now = new Date();

    // Record feedback first
    await db.insert(alertFeedback).values({
      alertId,
      teamId: alert.teamId,
      userId: user.id,
      action: body.action,
      reason: body.reason,
      whatChanged: body.whatChanged,
    });

    let updatedAlert;

    if (body.action === "resolve") {
      // Set cooldown: suppress re-triggering for cooldown_days
      const [threshold] = await db
        .select()
        .from(teamThresholds)
        .where(
          and(
            eq(teamThresholds.teamId, alert.teamId),
            eq(teamThresholds.alertType, alert.type)
          )
        )
        .limit(1);

      const cooldownDays = threshold?.cooldownDays ?? 3;
      const cooldownUntil = new Date(
        now.getTime() + cooldownDays * 24 * 60 * 60 * 1000
      );

      [updatedAlert] = await db
        .update(alerts)
        .set({
          status: "resolved",
          closedAt: now,
          cooldownUntil,
          updatedAt: now,
        })
        .where(eq(alerts.id, alertId))
        .returning();
    } else if (body.action === "snooze") {
      const [threshold] = await db
        .select()
        .from(teamThresholds)
        .where(
          and(
            eq(teamThresholds.teamId, alert.teamId),
            eq(teamThresholds.alertType, alert.type)
          )
        )
        .limit(1);

      const snoozeHours = threshold?.snoozeDefaultHours ?? 48;
      const snoozeUntil = body.snoozeUntil
        ? new Date(body.snoozeUntil)
        : new Date(now.getTime() + snoozeHours * 60 * 60 * 1000);

      [updatedAlert] = await db
        .update(alerts)
        .set({ status: "snoozed", snoozeUntil, updatedAt: now })
        .where(eq(alerts.id, alertId))
        .returning();
    } else {
      // not_issue: dismiss
      [updatedAlert] = await db
        .update(alerts)
        .set({ status: "dismissed", closedAt: now, updatedAt: now })
        .where(eq(alerts.id, alertId))
        .returning();

      // Check if 3+ dismissals in 7 days → adapt thresholds
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const [{ cnt }] = await db
        .select({ cnt: count() })
        .from(alertFeedback)
        .where(
          and(
            eq(alertFeedback.teamId, alert.teamId),
            eq(alertFeedback.action, "not_issue"),
            gte(alertFeedback.createdAt, sevenDaysAgo)
          )
        );

      if (Number(cnt) >= 3) {
        await adaptThresholds(alert.teamId, alert.type);
      }
    }

    return ok({ alert: updatedAlert });
  } catch (e) {
    return handleRouteError(e);
  }
}

/** Increase thresholds by 15% after repeated dismissals (bounded, order preserved) */
async function adaptThresholds(teamId: string, alertType: string) {
  const [existing] = await db
    .select()
    .from(teamThresholds)
    .where(
      and(
        eq(teamThresholds.teamId, teamId),
        eq(teamThresholds.alertType, alertType)
      )
    )
    .limit(1);

  const low = Math.min(
    parseFloat(existing?.thresholdLow ?? "0.3") * 1.15,
    0.9
  );
  const med = Math.min(
    parseFloat(existing?.thresholdMed ?? "0.55") * 1.15,
    0.95
  );
  const high = Math.min(
    parseFloat(existing?.thresholdHigh ?? "0.75") * 1.15,
    0.99
  );

  // Ensure ordering: low < med < high
  const finalLow = Math.min(low, med - 0.05, high - 0.1);
  const finalMed = Math.min(med, high - 0.05);

  if (existing) {
    await db
      .update(teamThresholds)
      .set({
        thresholdLow: String(finalLow.toFixed(4)),
        thresholdMed: String(finalMed.toFixed(4)),
        thresholdHigh: String(high.toFixed(4)),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(teamThresholds.teamId, teamId),
          eq(teamThresholds.alertType, alertType)
        )
      );
  } else {
    await db.insert(teamThresholds).values({
      teamId,
      alertType,
      thresholdLow: String(finalLow.toFixed(4)),
      thresholdMed: String(finalMed.toFixed(4)),
      thresholdHigh: String(high.toFixed(4)),
    });
  }
}
