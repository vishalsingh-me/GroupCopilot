import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isRoomAdminRole } from "@/lib/room-admin";
import { createCard, isTrelloConfigured, TrelloApiError } from "@/lib/trello/client";
import { TRELLO_MVP_PUBLISH_LIST_ID, TRELLO_MVP_PUBLISH_LIST_NAME } from "@/lib/trello/config";

const CreateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  priority: z.enum(["low", "med", "high"]),
  assignedUserId: z.string().trim().min(1),
  milestoneIndex: z.coerce.number().int().min(1).max(100),
});

function priorityLabel(priority: "low" | "med" | "high") {
  if (priority === "high") return "High";
  if (priority === "med") return "Medium";
  return "Low";
}

function mapAuthError(error: unknown): { status: number; message: string } | null {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return { status: 401, message: "Not signed in." };
  if (message === "FORBIDDEN") return { status: 403, message: "You are not a member of this room." };
  if (message === "NOT_FOUND") return { status: 404, message: "Room not found." };
  return null;
}

/**
 * POST /api/rooms/[code]/tasks
 * Admin-only manual Trello task creation.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room, user } = await requireRoomMember(code.toUpperCase());
    const membership = room.members.find((member) => member.userId === user.id);

    if (!isRoomAdminRole(membership?.role)) {
      return NextResponse.json(
        { error: "Only the room admin can create manual tasks." },
        { status: 403 }
      );
    }

    if (!isTrelloConfigured()) {
      return NextResponse.json(
        { error: "Trello is not configured. Check Trello settings." },
        { status: 503 }
      );
    }

    const body = CreateTaskSchema.parse(await req.json());

    const assignedMember = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: body.assignedUserId,
        },
      },
      select: {
        trelloMemberId: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!assignedMember) {
      return NextResponse.json(
        { error: "Assigned user must be a member of this room." },
        { status: 400 }
      );
    }

    const assigneeName = assignedMember.user.name ?? assignedMember.user.email;
    const cleanDescription = body.description?.trim();
    const listId = room.trelloListId ?? TRELLO_MVP_PUBLISH_LIST_ID;
    const cardName = `[M${body.milestoneIndex}] ${body.title}`;
    const cardDescription = [
      cleanDescription && cleanDescription.length > 0 ? cleanDescription : null,
      `Assigned to: ${assigneeName} <${assignedMember.user.email}>`,
      `Priority: ${priorityLabel(body.priority)}`,
      `Room code: ${room.code}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const card = await createCard(
      listId,
      cardName,
      cardDescription,
      assignedMember.trelloMemberId ? [assignedMember.trelloMemberId] : undefined
    );

    const cacheStatus =
      listId === TRELLO_MVP_PUBLISH_LIST_ID ? TRELLO_MVP_PUBLISH_LIST_NAME : "Configured list";

    await prisma.$transaction([
      prisma.trelloCardCache.upsert({
        where: { trelloCardId: card.id },
        update: {
          roomId: room.id,
          title: card.name,
          status: cacheStatus,
          dueDate: card.due ? new Date(card.due) : null,
          lastSyncedAt: new Date(),
        },
        create: {
          roomId: room.id,
          trelloCardId: card.id,
          title: card.name,
          status: cacheStatus,
          dueDate: card.due ? new Date(card.due) : null,
          lastSyncedAt: new Date(),
        },
      }),
      prisma.auditLog.create({
        data: {
          roomId: room.id,
          actorId: user.id,
          type: "manual_task_created",
          payload: {
            trelloCardId: card.id,
            cardName: card.name,
            cardUrl: card.url,
            assignedUserId: assignedMember.user.id,
            priority: body.priority,
            milestoneIndex: body.milestoneIndex,
          },
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      card: {
        id: card.id,
        title: card.name,
        url: card.url,
      },
    });
  } catch (error) {
    const authError = mapAuthError(error);
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: authError.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid task payload.", issues: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof TrelloApiError) {
      console.error("[rooms/tasks] Trello error", {
        code: error.code,
        httpStatus: error.httpStatus,
        message: error.message,
      });
      return NextResponse.json(
        { error: "Trello task creation failed. Check Trello connection in Settings." },
        { status: 502 }
      );
    }

    console.error("[rooms/tasks] error", error);
    return NextResponse.json({ error: "Unable to create task." }, { status: 500 });
  }
}
