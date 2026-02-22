import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Trello webhook receiver.
 *
 * Trello sends a HEAD request first to verify the endpoint is reachable,
 * then POST requests for each board event.
 *
 * We listen for card moves (updateCard action with listAfter) and update
 * the TrelloCardCache accordingly so the monitor phase can detect stalls.
 */

// Trello verifies the callback with a HEAD request — must return 200.
export async function HEAD() {
  return new Response(null, { status: 200 });
}

type TrelloWebhookPayload = {
  action: {
    type: string;
    data: {
      card?: { id: string; name: string; due?: string | null };
      listAfter?: { id: string; name: string };
      listBefore?: { id: string; name: string };
      board?: { id: string };
    };
  };
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TrelloWebhookPayload;
    const { action } = body;

    // Only handle card moves
    if (action.type !== "updateCard" || !action.data.listAfter) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const cardId = action.data.card?.id;
    const newStatus = action.data.listAfter.name;
    const due = action.data.card?.due ?? null;

    if (!cardId) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Update cache if we're tracking this card
    await prisma.trelloCardCache.updateMany({
      where: { trelloCardId: cardId },
      data: {
        status: newStatus,
        dueDate: due ? new Date(due) : null,
        lastSyncedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Never return 5xx to Trello — it will keep retrying and eventually disable the webhook.
    console.error("Trello webhook error:", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
