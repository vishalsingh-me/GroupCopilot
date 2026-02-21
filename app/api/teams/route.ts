import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { teams, teamMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/server/auth";
import { ok, handleRouteError } from "@/server/api";

const CreateTeamBody = z.object({
  name: z.string().min(1).max(100),
  courseId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = CreateTeamBody.parse(await req.json());

    const [team] = await db
      .insert(teams)
      .values({ name: body.name, courseId: body.courseId, createdByUserId: user.id })
      .returning();

    // Creator is automatically owner
    await db.insert(teamMembers).values({
      teamId: team.id,
      userId: user.id,
      role: "owner",
    });

    return ok({ team }, 201);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function GET() {
  try {
    const user = await requireUser();

    const rows = await db
      .select({ team: teams })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, user.id));

    return ok({ teams: rows.map((r) => r.team) });
  } catch (e) {
    return handleRouteError(e);
  }
}
