import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { tasks, taskAssignments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireUser, requireTeamMember } from "@/server/auth";
import { ok, handleRouteError } from "@/server/api";

const CreateTaskBody = z.object({
  title: z.string().min(1).max(300),
  description: z.string().optional(),
  dueAt: z.string().datetime().optional(),
  effortPoints: z.number().int().min(1).max(20).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  assignees: z
    .array(
      z.object({
        userId: z.string().uuid(),
        role: z.enum(["owner", "contributor"]).optional(),
        weight: z.number().optional(),
      })
    )
    .optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const user = await requireUser();
    await requireTeamMember(teamId, user.id);

    const body = CreateTaskBody.parse(await req.json());

    const [task] = await db
      .insert(tasks)
      .values({
        teamId,
        title: body.title,
        description: body.description,
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
        effortPoints: body.effortPoints ?? 1,
        priority: body.priority ?? "medium",
        createdByUserId: user.id,
      })
      .returning();

    if (body.assignees?.length) {
      await db.insert(taskAssignments).values(
        body.assignees.map((a) => ({
          taskId: task.id,
          userId: a.userId,
          assignmentRole: a.role ?? "owner",
          weight: String(a.weight ?? 1),
        }))
      );
    }

    // Trigger signals recompute asynchronously
    const { enqueueJob } = await import("@/worker/client");
    await enqueueJob("recompute_team_signals", {
      teamId,
      reason: "task_created",
    }).catch(() => {});

    return ok({ task }, 201);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const user = await requireUser();
    await requireTeamMember(teamId, user.id);

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");

    const conditions = [eq(tasks.teamId, teamId)];
    if (statusFilter) {
      conditions.push(
        eq(tasks.status, statusFilter as "todo" | "in_progress" | "done" | "blocked")
      );
    }

    const rows = await db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(tasks.createdAt);

    return ok({ tasks: rows });
  } catch (e) {
    return handleRouteError(e);
  }
}
