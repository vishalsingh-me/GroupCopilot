import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { teamInviteTokens, teamMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireUser } from "@/server/auth";
import { ok, err, handleRouteError } from "@/server/api";

const JoinBody = z.object({ token: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { token } = JoinBody.parse(await req.json());

    const [invite] = await db
      .select()
      .from(teamInviteTokens)
      .where(eq(teamInviteTokens.token, token))
      .limit(1);

    if (!invite) return err("NOT_FOUND", "Invite token not found", 404);

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return err("EXPIRED", "Invite token has expired", 410);
    }
    if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
      return err("USED_UP", "Invite token has reached max uses", 410);
    }

    // Check if already a member
    const [existing] = await db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, invite.teamId),
          eq(teamMembers.userId, user.id)
        )
      )
      .limit(1);

    if (existing) {
      return ok({ teamMember: existing, alreadyMember: true });
    }

    const [teamMember] = await db
      .insert(teamMembers)
      .values({
        teamId: invite.teamId,
        userId: user.id,
        role: "member",
        invitedByUserId: invite.createdByUserId,
      })
      .returning();

    // Increment use count
    await db
      .update(teamInviteTokens)
      .set({ useCount: invite.useCount + 1 })
      .where(eq(teamInviteTokens.id, invite.id));

    return ok({ teamMember, alreadyMember: false }, 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
