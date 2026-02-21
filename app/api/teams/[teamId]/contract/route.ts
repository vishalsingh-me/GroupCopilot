import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { teamContracts } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireUser, requireTeamMember } from "@/server/auth";
import { ok, handleRouteError } from "@/server/api";

const ContractBody = z.object({
  goalsText: z.string().optional(),
  availabilityJsonb: z.record(z.unknown()).optional(),
  commsPrefsJsonb: z.record(z.unknown()).optional(),
  rolesJsonb: z.record(z.unknown()).optional(),
  escalationJsonb: z.record(z.unknown()).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const user = await requireUser();
    await requireTeamMember(teamId, user.id);

    const [contract] = await db
      .select()
      .from(teamContracts)
      .where(eq(teamContracts.teamId, teamId))
      .orderBy(desc(teamContracts.version))
      .limit(1);

    return ok({ contract: contract ?? null });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const user = await requireUser();
    await requireTeamMember(teamId, user.id);

    const body = ContractBody.parse(await req.json());

    // Find latest version
    const [latest] = await db
      .select({ version: teamContracts.version })
      .from(teamContracts)
      .where(eq(teamContracts.teamId, teamId))
      .orderBy(desc(teamContracts.version))
      .limit(1);

    const nextVersion = (latest?.version ?? 0) + 1;

    const [contract] = await db
      .insert(teamContracts)
      .values({
        teamId,
        version: nextVersion,
        goalsText: body.goalsText,
        availabilityJsonb: body.availabilityJsonb,
        commsPrefsJsonb: body.commsPrefsJsonb,
        rolesJsonb: body.rolesJsonb,
        escalationJsonb: body.escalationJsonb,
      })
      .returning();

    // Enqueue goal embedding computation (non-blocking)
    if (body.goalsText) {
      const { enqueueJob } = await import("@/worker/client");
      await enqueueJob("compute_goal_embedding", { contractId: contract.id }).catch(
        () => {} // don't fail if worker queue is down
      );
    }

    return ok({ contract }, 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
