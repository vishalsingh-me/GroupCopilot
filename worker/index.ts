/**
 * Background worker entry point.
 * Run with: npm run worker  (or npm run dev:worker for watch mode)
 */
import "dotenv/config";
import PgBoss from "pg-boss";
import { handleIndexRubricSource } from "./jobs/index-rubric-source";
import { handleRecomputeSignals } from "./jobs/recompute-signals";
import { handleEvaluateAlerts } from "./jobs/evaluate-alerts";
import { handleComputeMessageSignal } from "./jobs/compute-message-signal";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required for worker");
  process.exit(1);
}

async function main() {
  console.log("[worker] Starting pg-boss...");

  const boss = new PgBoss({
    connectionString: DATABASE_URL,
    max: parseInt(process.env.WORKER_CONCURRENCY ?? "5"),
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
  });

  boss.on("error", (err) => console.error("[worker] pg-boss error:", err));

  await boss.start();
  console.log("[worker] pg-boss started.");

  // Register job handlers
  await boss.work("index_rubric_source", handleIndexRubricSource);
  await boss.work("recompute_team_signals", handleRecomputeSignals);
  await boss.work("evaluate_alerts", handleEvaluateAlerts);
  await boss.work("compute_message_signal", handleComputeMessageSignal);

  // Optional: nightly full recompute for all teams
  await boss.schedule(
    "nightly_recompute",
    "0 2 * * *", // 2 AM UTC
    {},
    { tz: "UTC" }
  );
  await boss.work("nightly_recompute", async () => {
    const { db } = await import("../db");
    const { teams } = await import("../db/schema");
    const allTeams = await db.select({ id: teams.id }).from(teams);
    for (const team of allTeams) {
      await boss.send("recompute_team_signals", {
        teamId: team.id,
        reason: "nightly",
      });
    }
    console.log(`[worker] Queued nightly recompute for ${allTeams.length} teams`);
  });

  console.log("[worker] All jobs registered. Worker is running.");

  // Graceful shutdown
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, async () => {
      console.log(`[worker] ${signal} received, stopping...`);
      await boss.stop();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
