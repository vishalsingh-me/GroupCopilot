/**
 * Lightweight job enqueueing client for use from API routes.
 * Does NOT import the full worker — keeps the Next.js bundle lean.
 */
import PgBoss from "pg-boss";

let boss: PgBoss | null = null;

async function getBoss(): Promise<PgBoss> {
  if (!boss) {
    boss = new PgBoss({
      connectionString: process.env.DATABASE_URL!,
      max: 3,
    });
    await boss.start();
  }
  return boss;
}

export async function enqueueJob(
  name: string,
  data: Record<string, unknown>,
  opts?: PgBoss.SendOptions
): Promise<string | null> {
  const b = await getBoss();
  return b.send(name, data, opts ?? {});
}
