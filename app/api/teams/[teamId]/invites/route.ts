import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { teamInviteTokens } from "@/db/schema";
import { generateToken } from "@/server/auth";
import { requireUser, requireTeamMember } from "@/server/auth";
import { ok, handleRouteError } from "@/server/api";

const CreateInviteBody = z.object({
  expiresInHours: z.number().positive().optional(),
  maxUses: z.number().positive().int().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const user = await requireUser();
    await requireTeamMember(teamId, user.id);

    const body = CreateInviteBody.parse(await req.json());

    const token = generateToken();
    const expiresAt = body.expiresInHours
      ? new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000)
      : null;

    await db.insert(teamInviteTokens).values({
      teamId,
      token,
      createdByUserId: user.id,
      expiresAt: expiresAt ?? undefined,
      maxUses: body.maxUses,
    });

    const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
    const inviteUrl = `${baseUrl}/join?token=${token}`;

    return ok({ inviteUrl, token }, 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
