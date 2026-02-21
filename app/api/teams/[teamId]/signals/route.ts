import { NextRequest } from "next/server";
import { db } from "@/db";
import { teamSignals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, requireTeamMember } from "@/server/auth";
import { ok, handleRouteError } from "@/server/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const user = await requireUser();
    await requireTeamMember(teamId, user.id);

    const [signals] = await db
      .select()
      .from(teamSignals)
      .where(eq(teamSignals.teamId, teamId))
      .limit(1);

    return ok({ teamSignals: signals ?? null });
  } catch (e) {
    return handleRouteError(e);
  }
}
