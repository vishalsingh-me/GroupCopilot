import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { messages, messageReplies, users } from "@/db/schema";
import { eq, and, desc, lt } from "drizzle-orm";
import { requireUser, requireTeamMember } from "@/server/auth";
import { ok, handleRouteError } from "@/server/api";

const SendMessageBody = z.object({
  body: z.string().min(1).max(4000),
  replyToMessageId: z.string().uuid().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const user = await requireUser();
    await requireTeamMember(teamId, user.id);

    const body = SendMessageBody.parse(await req.json());

    const [message] = await db
      .insert(messages)
      .values({
        teamId,
        authorUserId: user.id,
        body: body.body,
      })
      .returning();

    if (body.replyToMessageId) {
      await db.insert(messageReplies).values({
        teamId,
        parentMessageId: body.replyToMessageId,
        replyMessageId: message.id,
      });
    }

    // Async: compute sentiment + trigger signals
    const { enqueueJob } = await import("@/worker/client");
    await enqueueJob("compute_message_signal", { messageId: message.id }).catch(
      () => {}
    );

    return ok({ message }, 201);
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
    const cursor = searchParams.get("cursor"); // ISO timestamp for pagination
    const limit = 50;

    const conditions = [eq(messages.teamId, teamId)];
    if (cursor) {
      conditions.push(lt(messages.createdAt, new Date(cursor)));
    }

    const rows = await db
      .select({
        message: messages,
        authorDisplayName: users.displayName,
      })
      .from(messages)
      .innerJoin(users, eq(messages.authorUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(limit + 1); // fetch one extra to determine if there's a next page

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse(); // chronological order

    const nextCursor = hasMore
      ? page[0]?.message.createdAt.toISOString()
      : null;

    return ok({
      messages: page.map((r) => ({
        ...r.message,
        authorDisplayName: r.authorDisplayName,
      })),
      nextCursor,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
