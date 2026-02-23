import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/agent/stateMachine";
import { createCard, isTrelloConfigured } from "@/lib/trello/client";
import {
  TRELLO_MVP_PUBLISH_LIST_ID,
  TRELLO_MVP_PUBLISH_LIST_NAME,
} from "@/lib/trello/config";

const CreateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  priority: z.enum(["low", "med", "high"]),
  assignedUserId: z.string().trim().min(1),
  milestoneIndex: z.number().int().min(1).max(999),
});

function isAdminRole(role?: string | null): boolean {
  return role === "owner" || role === "admin";
}

function prettyPriority(priority: "low" | "med" | "high"): string {
  if (priority === "high") return "High";
  if (priority === "med") return "Med";
  return "Low";
}

function buildDescription(args: {
  description?: string;
  assigneeName: string;
  assigneeEmail: string;
  priority: "low" | "med" | "high";
  roomCode: string;
}) {
  const lines: string[] = [];
  const trimmedDescription = args.description?.trim();
  if (trimmedDescription) {
    lines.push(trimmedDescription, "");
  }
  lines.push(`Assigned to: ${args.assigneeName} <${args.assigneeEmail}>`);
  lines.push(`Priority: ${prettyPriority(args.priority)}`);
  lines.push(`Room code: ${args.roomCode}`);
  lines.push(`Created at: ${new Date().toISOString()}`);
  return lines.join("\n");
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room, user } = await requireRoomMember(code.toUpperCase());

    const currentMember = room.members.find((member) => member.userId === user.id);
    if (!isAdminRole(currentMember?.role)) {
      return NextResponse.json(
        { error: "Only the room admin can create tasks." },
        { status: 403 }
      );
    }

    if (!isTrelloConfigured()) {
      return NextResponse.json(
        { error: "Trello is not configured on the server." },
        { status: 400 }
      );
    }

    const payload = CreateTaskSchema.parse(await req.json());
    const assigneeMembership = room.members.find(
      (member) => member.userId === payload.assignedUserId
    );
    if (!assigneeMembership) {
      return NextResponse.json({ error: "Selected assignee is not in this room." }, { status: 400 });
    }

    const assigneeUser = await prisma.user.findUnique({
      where: { id: payload.assignedUserId },
      select: { name: true, email: true },
    });
    if (!assigneeUser?.email) {
      return NextResponse.json({ error: "Assignee profile is incomplete." }, { status: 400 });
    }

    const cardName = `[M${payload.milestoneIndex}] ${payload.title}`;
    const cardDesc = buildDescription({
      description: payload.description,
      assigneeName: assigneeUser.name ?? assigneeUser.email,
      assigneeEmail: assigneeUser.email,
      priority: payload.priority,
      roomCode: room.code,
    });

    const trelloListId = room.trelloListId || TRELLO_MVP_PUBLISH_LIST_ID;
    const trelloCard = await createCard(
      trelloListId,
      cardName,
      cardDesc,
      assigneeMembership.trelloMemberId ? [assigneeMembership.trelloMemberId] : undefined
    );

    await prisma.trelloCardCache.upsert({
      where: { trelloCardId: trelloCard.id },
      update: {
        title: trelloCard.name,
        status: TRELLO_MVP_PUBLISH_LIST_NAME,
        dueDate: trelloCard.due ? new Date(trelloCard.due) : null,
        lastSyncedAt: new Date(),
      },
      create: {
        roomId: room.id,
        trelloCardId: trelloCard.id,
        title: trelloCard.name,
        status: TRELLO_MVP_PUBLISH_LIST_NAME,
        dueDate: trelloCard.due ? new Date(trelloCard.due) : null,
      },
    });

    await writeAuditLog(
      room.id,
      "manual_task_created",
      {
        trelloCardId: trelloCard.id,
        title: trelloCard.name,
        priority: payload.priority,
        assignedUserId: payload.assignedUserId,
        milestoneIndex: payload.milestoneIndex,
      },
      user.id
    );

    return NextResponse.json(
      {
        card: {
          id: trelloCard.id,
          title: trelloCard.name,
          url: trelloCard.url,
          status: TRELLO_MVP_PUBLISH_LIST_NAME,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid task payload.", issues: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "You are not a member of this room." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    console.error("[rooms/tasks][POST] error", error);
    return NextResponse.json({ error: "Unable to create Trello task." }, { status: 500 });
  }
}
