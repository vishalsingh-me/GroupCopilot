import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoomMember } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  checkConnection,
  getBoardLists,
  getBoardMembers,
  isTrelloConfigured,
  registerWebhook,
} from "@/lib/trello/client";

const ConnectSchema = z.object({
  boardId: z.string().min(1),
  listId: z.string().min(1),
});

/**
 * GET /api/rooms/[code]/trello
 * Returns the room's current Trello connection status and available lists.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room } = await requireRoomMember(code.toUpperCase());

    if (!isTrelloConfigured()) {
      return NextResponse.json({
        configured: false,
        message: "TRELLO_API_KEY and TRELLO_TOKEN are not set.",
      });
    }

    if (!room.trelloBoardId) {
      return NextResponse.json({ configured: true, connected: false });
    }

    const [connected, lists, members] = await Promise.all([
      checkConnection(room.trelloBoardId),
      getBoardLists(room.trelloBoardId).catch(() => []),
      getBoardMembers(room.trelloBoardId).catch(() => []),
    ]);

    return NextResponse.json({
      configured: true,
      connected,
      boardId: room.trelloBoardId,
      listId: room.trelloListId,
      lists,
      members,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to check Trello status" }, { status: 400 });
  }
}

/**
 * POST /api/rooms/[code]/trello
 * Save the Trello board + list for this room and register a webhook.
 * Body: { boardId, listId }
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room } = await requireRoomMember(code.toUpperCase());

    if (!isTrelloConfigured()) {
      return NextResponse.json(
        { error: "TRELLO_API_KEY and TRELLO_TOKEN must be set before connecting a board." },
        { status: 503 }
      );
    }

    const body = ConnectSchema.parse(await req.json());

    // Verify the board is accessible and the listId belongs to it
    let boardLists;
    try {
      boardLists = await getBoardLists(body.boardId);
    } catch {
      return NextResponse.json(
        { error: "Board not found or credentials cannot access it. Double-check the board ID." },
        { status: 400 }
      );
    }

    const listIds = boardLists.map((l) => l.id);
    if (!listIds.includes(body.listId)) {
      return NextResponse.json(
        {
          error: `List ID "${body.listId}" does not belong to this board. Available lists: ${boardLists.map((l) => `${l.name} (${l.id})`).join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Register a webhook so Trello notifies us of card movements
    const baseUrl = process.env.APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? "";
    let webhookId: string | undefined;
    if (baseUrl) {
      try {
        const wh = await registerWebhook(body.boardId, `${baseUrl}/api/trello/webhook`);
        webhookId = wh.id;
      } catch (err) {
        // Webhook registration failing is non-fatal — we still save the config
        console.warn("Trello webhook registration failed:", err);
      }
    }

    await prisma.room.update({
      where: { id: room.id },
      data: { trelloBoardId: body.boardId, trelloListId: body.listId },
    });

    return NextResponse.json({
      ok: true,
      boardId: body.boardId,
      listId: body.listId,
      webhookId: webhookId ?? null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: error.issues } }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Unable to connect Trello board" }, { status: 400 });
  }
}

/**
 * DELETE /api/rooms/[code]/trello
 * Disconnect Trello from this room.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const { room } = await requireRoomMember(code.toUpperCase());
    await prisma.room.update({
      where: { id: room.id },
      data: { trelloBoardId: null, trelloListId: null },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to disconnect Trello" }, { status: 400 });
  }
}
