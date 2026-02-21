import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { teamContracts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireUser, requireTeamMember } from "@/server/auth";
import { ok, err, handleRouteError } from "@/server/api";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const GenerateBody = z.object({ version: z.number().int().positive() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const user = await requireUser();
    await requireTeamMember(teamId, user.id);

    const { version } = GenerateBody.parse(await req.json());

    const [contract] = await db
      .select()
      .from(teamContracts)
      .where(
        and(eq(teamContracts.teamId, teamId), eq(teamContracts.version, version))
      )
      .limit(1);

    if (!contract) return err("NOT_FOUND", "Contract version not found", 404);

    const prompt = buildContractPrompt(contract);

    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-preview",
      systemInstruction:
        "You are a neutral facilitator helping student teams write a group project charter. " +
        "Write a clear, professional team contract in plain language. " +
        "Be specific, neutral, and constructive. " +
        "Output a markdown-formatted contract.",
    });

    const result = await model.generateContent(prompt);
    const generatedContractText = result.response.text();

    await db
      .update(teamContracts)
      .set({
        generatedContractText,
        modelMetaJsonb: {
          model: "gemini-3-pro-preview",
          generatedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(teamContracts.id, contract.id));

    return ok({
      generatedContractText,
      highlights: extractHighlights(generatedContractText),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

function buildContractPrompt(contract: {
  goalsText?: string | null;
  availabilityJsonb?: unknown;
  commsPrefsJsonb?: unknown;
  rolesJsonb?: unknown;
  escalationJsonb?: unknown;
}): string {
  return `
Generate a team charter based on these wizard responses:

**Goals:** ${contract.goalsText ?? "Not specified"}
**Availability:** ${JSON.stringify(contract.availabilityJsonb ?? {})}
**Communication preferences:** ${JSON.stringify(contract.commsPrefsJsonb ?? {})}
**Roles:** ${JSON.stringify(contract.rolesJsonb ?? {})}
**Escalation process:** ${JSON.stringify(contract.escalationJsonb ?? {})}

Write a concise team contract covering: goals, roles & responsibilities,
availability & meeting schedule, communication norms, and conflict resolution process.
`.trim();
}

function extractHighlights(text: string): string[] {
  // Extract section headings as highlights
  return text
    .split("\n")
    .filter((line) => line.startsWith("## ") || line.startsWith("# "))
    .map((line) => line.replace(/^#+\s*/, ""))
    .slice(0, 5);
}
