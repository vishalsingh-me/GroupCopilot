import { NextResponse } from "next/server";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  getCardsByBoard,
  getListNameMap,
  isTrelloConfigured,
  type TrelloCard,
} from "@/lib/trello/client";

type WorkloadBucket = {
  low: number;
  med: number;
  high: number;
};

type WorkloadRow = {
  userId: string;
  name: string;
  email: string;
  completedPoints: number;
  pendingPoints: number;
  completed: WorkloadBucket;
  pending: WorkloadBucket;
};

const ASSIGNED_EMAIL_REGEX =
  /Assigned to:\s*(?:.+?<)?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>?/i;
const ASSIGNED_NAME_REGEX = /Assigned to:\s*(.+)/i;
const PRIORITY_REGEX = /Priority:\s*(low|med|medium|high)/i;
const DONE_STATUS_REGEX = /(done|complete|completed)/i;

function priorityFromCard(card: TrelloCard): "low" | "med" | "high" {
  const match = card.desc?.match(PRIORITY_REGEX)?.[1]?.toLowerCase() ?? "low";
  if (match === "high") return "high";
  if (match === "med" || match === "medium") return "med";
  return "low";
}

function priorityPoints(priority: "low" | "med" | "high"): number {
  if (priority === "high") return 3;
  if (priority === "med") return 2;
  return 1;
}

function emptyBucket(): WorkloadBucket {
  return { low: 0, med: 0, high: 0 };
}

function addBucket(bucket: WorkloadBucket, priority: "low" | "med" | "high") {
  bucket[priority] += 1;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room } = await requireRoomMember(code.toUpperCase());
    const memberRows: WorkloadRow[] = room.members.map((member) => ({
      userId: member.userId,
      name: member.userId,
      email: "",
      completedPoints: 0,
      pendingPoints: 0,
      completed: emptyBucket(),
      pending: emptyBucket(),
    }));

    const byUserId = new Map(memberRows.map((row) => [row.userId, row]));

    const normalizedMembers = room.members.map((member) => ({
      userId: member.userId,
      name: member.userId,
      email: "",
    }));

    // Enhance names/emails from room users.
    // `requireRoomMember` does not include user profile fields, so fetch just what we need.
    const detailedRoom = await prisma.room.findUnique({
      where: { id: room.id },
      select: {
        members: {
          orderBy: { joinedAt: "asc" },
          select: {
            userId: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (detailedRoom) {
      for (const member of detailedRoom.members) {
        const row = byUserId.get(member.userId);
        if (!row) continue;
        row.name = member.user.name ?? member.user.email;
        row.email = member.user.email;

        const normalized = normalizedMembers.find((m) => m.userId === member.userId);
        if (normalized) {
          normalized.name = row.name;
          normalized.email = row.email;
        }
      }
    }

    if (!room.trelloBoardId || !isTrelloConfigured()) {
      return NextResponse.json({ members: memberRows, source: "fallback" });
    }

    const [cards, listNameMap] = await Promise.all([
      getCardsByBoard(room.trelloBoardId),
      getListNameMap(room.trelloBoardId),
    ]);

    for (const card of cards) {
      const assignedEmail = card.desc?.match(ASSIGNED_EMAIL_REGEX)?.[1]?.toLowerCase();
      let assignee = assignedEmail
        ? normalizedMembers.find((member) => member.email.toLowerCase() === assignedEmail)
        : undefined;

      if (!assignee) {
        const assignedName = card.desc?.match(ASSIGNED_NAME_REGEX)?.[1]?.trim().toLowerCase();
        if (assignedName) {
          assignee = normalizedMembers.find((member) => member.name.toLowerCase() === assignedName);
        }
      }

      if (!assignee) continue;
      const row = byUserId.get(assignee.userId);
      if (!row) continue;

      const priority = priorityFromCard(card);
      const points = priorityPoints(priority);
      const listName = listNameMap[card.idList] ?? "";
      const isDone = DONE_STATUS_REGEX.test(listName);

      if (isDone) {
        row.completedPoints += points;
        addBucket(row.completed, priority);
      } else {
        row.pendingPoints += points;
        addBucket(row.pending, priority);
      }
    }

    return NextResponse.json({ members: memberRows, source: "live" });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "You are not a member of this room." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    console.error("[rooms/tasks/workload][GET] error", error);
    return NextResponse.json({ error: "Unable to load workload." }, { status: 500 });
  }
}
