import { NextRequest } from "next/server";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireUser, requireTeamMember } from "@/server/auth";
import { ok, handleRouteError } from "@/server/api";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const user = await requireUser();
    await requireTeamMember(teamId, user.id);

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status") ?? "open";

    const rows = await db
      .select()
      .from(alerts)
      .where(
        and(
          eq(alerts.teamId, teamId),
          eq(
            alerts.status,
            statusFilter as "open" | "resolved" | "dismissed" | "snoozed"
          )
        )
      )
      .orderBy(desc(alerts.createdAt));

    return ok({ alerts: rows });
  } catch (e) {
    return handleRouteError(e);
  }
}
