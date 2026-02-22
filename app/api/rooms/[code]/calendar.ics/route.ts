import { Prisma } from "@prisma/client";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

type PlannerTableRow = {
  projectPlan: string | null;
};

async function plannerTablesReady() {
  const [row] = await prisma.$queryRaw<PlannerTableRow[]>`
    SELECT to_regclass('public."ProjectPlan"')::text AS "projectPlan"
  `;
  return Boolean(row?.projectPlan);
}

function toICSDate(date: Date): string {
  const iso = date.toISOString();
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * GET /api/rooms/[code]/calendar.ics
 * Download check-in events as an ICS file.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room } = await requireRoomMember(code.toUpperCase());
    if (!(await plannerTablesReady())) {
      return new Response(
        "Project planner tables are not initialized. Run Prisma migrations first.",
        { status: 503 }
      );
    }

    const plan = await prisma.projectPlan.findUnique({
      where: { roomId: room.id },
      select: {
        id: true,
        title: true,
        description: true,
      },
    });

    if (!plan) {
      return new Response("No project plan found for this room.", { status: 404 });
    }

    const [milestones, checkins] = await Promise.all([
      prisma.milestone.findMany({
        where: { planId: plan.id },
        select: { id: true, index: true, title: true, dueAt: true },
      }),
      prisma.checkInEvent.findMany({
        where: { planId: plan.id },
        orderBy: { scheduledAt: "asc" },
        select: { id: true, milestoneId: true, scheduledAt: true },
      }),
    ]);

    const milestoneById = new Map(milestones.map((milestone) => [milestone.id, milestone]));
    const dtstamp = toICSDate(new Date());

    const events = checkins
      .map((checkin) => {
        const milestone = milestoneById.get(checkin.milestoneId);
        if (!milestone) return null;

        const start = checkin.scheduledAt;
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        const summary = `${plan.title} — ${milestone.title} Check-in`;
        const description = `${plan.description}\nMilestone ${milestone.index}: ${milestone.title}\nMilestone due: ${milestone.dueAt.toISOString()}\nRoom: ${room.code}`;

        return [
          "BEGIN:VEVENT",
          `UID:${checkin.id}@groupcopilot`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART:${toICSDate(start)}`,
          `DTEND:${toICSDate(end)}`,
          `SUMMARY:${escapeICS(summary)}`,
          `DESCRIPTION:${escapeICS(description)}`,
          "END:VEVENT",
        ].join("\r\n");
      })
      .filter(Boolean)
      .join("\r\n");

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//GroupCopilot//Project Planner//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      events,
      "END:VCALENDAR",
      "",
    ].join("\r\n");

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${room.code.toLowerCase()}-checkins.ics\"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      return new Response(
        "Project planner tables are not initialized. Run Prisma migrations first.",
        { status: 503 }
      );
    }
    console.error(error);
    return new Response("Unable to generate calendar export.", { status: 400 });
  }
}
