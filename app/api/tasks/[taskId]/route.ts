import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { tasks, teamMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireUser, requireTeamMember } from "@/server/auth";
import { ok, err, handleRouteError } from "@/server/api";

const PatchTaskBody = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done", "blocked"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  effortPoints: z.number().int().min(1).max(20).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const user = await requireUser();
    const body = PatchTaskBody.parse(await req.json());

    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) return err("NOT_FOUND", "Task not found", 404);

    await requireTeamMember(task.teamId, user.id);

    const [updated] = await db
      .update(tasks)
      .set({
        ...body,
        dueAt: body.dueAt === null ? null : body.dueAt ? new Date(body.dueAt) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
      .returning();

    const { enqueueJob } = await import("@/worker/client");
    await enqueueJob("recompute_team_signals", {
      teamId: task.teamId,
      reason: "task_updated",
    }).catch(() => {});

    return ok({ task: updated });
  } catch (e) {
    return handleRouteError(e);
  }
}
