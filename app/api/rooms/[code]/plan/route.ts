import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  computeMilestoneCount,
  generatePlannerSchedule,
  isValidTimeZone,
  type PlannerCadence,
} from "@/lib/project-planner";
import { sendPlannerCalendarEmails } from "@/lib/email/planner";

const isDev = process.env.NODE_ENV !== "production";
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

const SavePlanSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  deadlineAt: z.string().datetime(),
  cadence: z.enum(["daily", "weekly", "monthly"]),
  checkInTime: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  timezone: z.string().trim().min(1).max(100),
  milestoneTitles: z.array(z.string().trim().max(200)).optional(),
});

function isPlanAdmin(role?: string | null): boolean {
  return role === "owner" || role === "admin";
}

function isPlannerTableMissing(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2021") return false;
  const tableName = String(error.meta?.table ?? "");
  return (
    tableName.includes("ProjectPlan") ||
    tableName.includes("Milestone") ||
    tableName.includes("CheckInEvent")
  );
}

function jsonError(
  status: number,
  error: string,
  message: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      ok: false,
      error,
      message,
      ...extra,
    },
    { status, headers: NO_STORE_HEADERS }
  );
}

function mapAuthError(error: unknown): { status: number; code: string; message: string } | null {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") {
    return { status: 401, code: "UNAUTHORIZED", message: "Not signed in." };
  }
  if (message === "FORBIDDEN") {
    return { status: 403, code: "FORBIDDEN", message: "You are not a member of this room." };
  }
  if (message === "NOT_FOUND") {
    return { status: 404, code: "NOT_FOUND", message: "Room not found." };
  }
  return null;
}

type PlannerTablesStatusRow = {
  projectPlan: string | null;
  milestone: string | null;
  checkInEvent: string | null;
};

async function plannerTablesReady() {
  const [row] = await prisma.$queryRaw<PlannerTablesStatusRow[]>`
    SELECT
      to_regclass('public."ProjectPlan"')::text AS "projectPlan",
      to_regclass('public."Milestone"')::text AS "milestone",
      to_regclass('public."CheckInEvent"')::text AS "checkInEvent"
  `;
  return Boolean(row?.projectPlan && row?.milestone && row?.checkInEvent);
}

/**
 * GET /api/rooms/[code]/plan
 * Returns the current project plan for the room with milestones and check-ins.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  let code = "";
  try {
    ({ code } = await ctx.params);
    const { room } = await requireRoomMember(code.toUpperCase());
    if (!(await plannerTablesReady())) {
      return jsonError(
        503,
        "SCHEMA_NOT_READY",
        "Project planner tables are not initialized yet. Run Prisma migrations first."
      );
    }

    const plan = await prisma.projectPlan.findUnique({
      where: { roomId: room.id },
    });

    if (!plan) {
      return NextResponse.json(
        { plan: null, milestones: [], checkins: [] },
        { headers: NO_STORE_HEADERS }
      );
    }

    const [milestones, checkins] = await Promise.all([
      prisma.milestone.findMany({
        where: { planId: plan.id },
        orderBy: { index: "asc" },
      }),
      prisma.checkInEvent.findMany({
        where: { planId: plan.id },
        orderBy: { scheduledAt: "asc" },
      }),
    ]);

    return NextResponse.json(
      { plan, milestones, checkins },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (isPlannerTableMissing(error)) {
      return NextResponse.json(
        {
          plan: null,
          milestones: [],
          checkins: [],
          schemaNotReady: true,
          message: "Project planner tables are not initialized yet.",
        },
        { headers: NO_STORE_HEADERS }
      );
    }
    const authError = mapAuthError(error);
    if (authError) {
      return jsonError(authError.status, authError.code, authError.message);
    }
    console.error("[rooms/plan][GET] unexpected error", {
      code: code.toUpperCase(),
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      prisma: error instanceof Prisma.PrismaClientKnownRequestError
        ? { code: error.code, meta: error.meta, clientVersion: error.clientVersion }
        : undefined,
    });
    return jsonError(500, "INTERNAL_ERROR", "Unable to load project plan.");
  }
}

/**
 * POST /api/rooms/[code]/plan
 * Admin-only: upsert plan and regenerate milestones/check-ins deterministically.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  let code = "";
  let roomId: string | null = null;
  let userId: string | null = null;
  try {
    ({ code } = await ctx.params);
    const { room, user } = await requireRoomMember(code.toUpperCase());
    roomId = room.id;
    userId = user.id;
    if (isDev) {
      console.log("[rooms/plan][POST] request", {
        code: code.toUpperCase(),
        roomId,
        userId,
      });
    }

    const membership = room.members.find((member) => member.userId === user.id);
    if (!isPlanAdmin(membership?.role)) {
      return jsonError(
        403,
        "FORBIDDEN",
        "Only the room admin can create or edit the project plan."
      );
    }
    if (!(await plannerTablesReady())) {
      return jsonError(
        503,
        "SCHEMA_NOT_READY",
        "Project planner tables are not initialized. Run Prisma migrations first."
      );
    }

    const rawPayload = await req.json();
    if (isDev) {
      console.log("[rooms/plan][POST] payload", {
        code: code.toUpperCase(),
        roomId,
        userId,
        keys: rawPayload && typeof rawPayload === "object" ? Object.keys(rawPayload as Record<string, unknown>) : [],
      });
    }
    const payload = SavePlanSchema.parse(rawPayload);
    const now = new Date();
    const deadlineAt = new Date(payload.deadlineAt);

    if (Number.isNaN(deadlineAt.getTime())) {
      return jsonError(400, "VALIDATION_ERROR", "deadlineAt must be a valid date-time.");
    }
    if (deadlineAt.getTime() <= now.getTime()) {
      return jsonError(400, "VALIDATION_ERROR", "deadlineAt must be in the future.");
    }
    if (!isValidTimeZone(payload.timezone)) {
      return jsonError(400, "VALIDATION_ERROR", "Invalid timezone.");
    }

    const milestoneCount = computeMilestoneCount(
      payload.cadence as PlannerCadence,
      deadlineAt,
      now
    );
    if (milestoneCount.error) {
      return jsonError(400, "VALIDATION_ERROR", milestoneCount.error);
    }

    let generated;
    try {
      generated = generatePlannerSchedule({
        cadence: payload.cadence as PlannerCadence,
        deadlineAt,
        checkInTime: payload.checkInTime,
        timezone: payload.timezone,
        now,
        milestoneTitles: payload.milestoneTitles,
      });
    } catch (error) {
      return jsonError(
        400,
        "VALIDATION_ERROR",
        error instanceof Error ? error.message : "Unable to generate plan schedule."
      );
    }

    const saved = await prisma.$transaction(async (tx) => {
      const plan = await tx.projectPlan.upsert({
        where: { roomId: room.id },
        update: {
          title: payload.title,
          description: payload.description,
          deadlineAt,
          cadence: payload.cadence,
          checkInTime: payload.checkInTime,
          timezone: payload.timezone,
          createdByUserId: user.id,
        },
        create: {
          roomId: room.id,
          title: payload.title,
          description: payload.description,
          deadlineAt,
          cadence: payload.cadence,
          checkInTime: payload.checkInTime,
          timezone: payload.timezone,
          createdByUserId: user.id,
        },
      });

      await tx.checkInEvent.deleteMany({ where: { planId: plan.id } });
      await tx.milestone.deleteMany({ where: { planId: plan.id } });

      const milestones = [];
      const checkins = [];
      for (let i = 0; i < generated.milestones.length; i += 1) {
        const milestoneSpec = generated.milestones[i];
        const checkInSpec = generated.checkIns[i];

        const milestone = await tx.milestone.create({
          data: {
            roomId: room.id,
            planId: plan.id,
            index: milestoneSpec.index,
            title: milestoneSpec.title,
            startAt: milestoneSpec.startAt,
            dueAt: milestoneSpec.dueAt,
          },
        });
        milestones.push(milestone);

        const checkin = await tx.checkInEvent.create({
          data: {
            roomId: room.id,
            planId: plan.id,
            milestoneId: milestone.id,
            scheduledAt: checkInSpec.scheduledAt,
          },
        });
        checkins.push(checkin);
      }

      return { plan, milestones, checkins };
    });

    if (isDev) {
      console.log("[rooms/plan][POST] saved", {
        code: code.toUpperCase(),
        roomId,
        userId,
        planId: saved.plan.id,
        milestoneCount: saved.milestones.length,
        checkInCount: saved.checkins.length,
      });
    }

    const recipients = await prisma.roomMember.findMany({
      where: {
        roomId: room.id,
        userId: { not: user.id },
      },
      select: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    const dedupedRecipients = Array.from(
      new Map(
        recipients
          .filter((member) => Boolean(member.user.email))
          .map((member) => [member.user.email.toLowerCase(), { email: member.user.email, name: member.user.name }])
      ).values()
    );

    const emailResult = await sendPlannerCalendarEmails({
      roomCode: room.code,
      roomName: room.name,
      projectTitle: saved.plan.title,
      recipients: dedupedRecipients,
    });

    return NextResponse.json(
      {
        ok: true,
        message: "Project plan saved.",
        emailStatus: emailResult.status,
        warning: emailResult.warning,
        ...saved,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const authError = mapAuthError(error);
    if (authError) {
      if (isDev) {
        console.error("[rooms/plan][POST] auth error", {
          roomCode: code.toUpperCase(),
          roomId,
          userId,
          ...authError,
        });
      }
      return jsonError(authError.status, authError.code, authError.message);
    }

    if (isPlannerTableMissing(error)) {
      return jsonError(
        503,
        "SCHEMA_NOT_READY",
        "Project planner tables are not initialized. Run Prisma migrations first (e.g. `npx prisma migrate deploy`)."
      );
    }
    if (error instanceof z.ZodError) {
      if (isDev) {
        console.error("[rooms/plan][POST] validation error", {
          code: code.toUpperCase(),
          roomId,
          userId,
          issues: error.issues,
        });
      }
      return jsonError(
        400,
        "VALIDATION_ERROR",
        "Invalid payload.",
        { issues: error.issues }
      );
    }
    console.error("[rooms/plan][POST] unexpected error", {
      code: code.toUpperCase(),
      roomId,
      userId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      prisma: error instanceof Prisma.PrismaClientKnownRequestError
        ? { code: error.code, meta: error.meta, clientVersion: error.clientVersion }
        : undefined,
    });
    return jsonError(500, "INTERNAL_ERROR", "Unable to save project plan.");
  }
}
