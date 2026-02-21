import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { tasks, taskDependencies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, requireTeamMember } from "@/server/auth";
import { ok, err, handleRouteError } from "@/server/api";

const DependencyBody = z.object({
  blockingTaskId: z.string().uuid(),
  dependencyType: z.enum(["blocks", "related"]).optional(),
  weight: z.number().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId: blockedTaskId } = await params;
    const user = await requireUser();
    const body = DependencyBody.parse(await req.json());

    if (body.blockingTaskId === blockedTaskId) {
      return err("INVALID", "A task cannot depend on itself", 400);
    }

    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, blockedTaskId))
      .limit(1);

    if (!task) return err("NOT_FOUND", "Task not found", 404);

    await requireTeamMember(task.teamId, user.id);

    const [dep] = await db
      .insert(taskDependencies)
      .values({
        teamId: task.teamId,
        blockingTaskId: body.blockingTaskId,
        blockedTaskId,
        dependencyType: body.dependencyType ?? "blocks",
        weight: String(body.weight ?? 1),
      })
      .onConflictDoNothing()
      .returning();

    const { enqueueJob } = await import("@/worker/client");
    await enqueueJob("recompute_team_signals", {
      teamId: task.teamId,
      reason: "dependency_added",
    }).catch(() => {});

    return ok({ dependency: dep ?? null }, 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
