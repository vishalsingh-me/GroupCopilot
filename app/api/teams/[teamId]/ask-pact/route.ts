import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, requireTeamMember } from "@/server/auth";
import { ok, handleRouteError } from "@/server/api";
import { buildIntervention } from "@/server/interventions";

const AskPactBody = z.object({
  question: z.string().max(1000).optional(),
  context: z.string().max(2000).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const user = await requireUser();
    await requireTeamMember(teamId, user.id);

    const body = AskPactBody.parse(await req.json());

    const result = await buildIntervention(teamId, {
      question: body.question,
      context: body.context,
    });

    return ok(result);
  } catch (e) {
    return handleRouteError(e);
  }
}
