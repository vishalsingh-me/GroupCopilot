import type PgBoss from "pg-boss";
import { db } from "@/db";
import { messages, messageSignals } from "@/db/schema";
import { eq } from "drizzle-orm";
import Sentiment from "sentiment";

const analyzer = new Sentiment();

export async function handleComputeMessageSignal(
  jobs: PgBoss.Job<{ messageId: string }>[]
) {
  for (const job of jobs) {
    const { messageId } = job.data;

    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!message) return;

    const result = analyzer.analyze(message.body);

    // Normalize sentiment to [0,1]: AFINN range is roughly -50..+50
    const sentimentScore = Math.max(
      0,
      Math.min(1, (result.comparative + 5) / 10)
    );

    // Negativity score: how negative (0=neutral/positive, 1=very negative)
    const negativityScore = Math.max(
      0,
      Math.min(1, (-result.comparative + 0) / 5)
    );

    await db
      .insert(messageSignals)
      .values({
        teamId: message.teamId,
        messageId,
        sentimentScore,
        negativityScore,
        method: "afinn",
        metaJsonb: {
          score: result.score,
          comparative: result.comparative,
          positive: result.positive,
          negative: result.negative,
        },
      })
      .onConflictDoUpdate({
        target: messageSignals.messageId,
        set: {
          sentimentScore,
          negativityScore,
          computedAt: new Date(),
          metaJsonb: {
            score: result.score,
            comparative: result.comparative,
          },
        },
      });

    // Trigger signals recompute after sentiment update
    const { enqueueJob } = await import("@/worker/client");
    await enqueueJob(
      "recompute_team_signals",
      { teamId: message.teamId, reason: "message_signal" },
      { singletonKey: `signals_${message.teamId}`, singletonSeconds: 30 }
    ).catch(() => {});
  }
}
