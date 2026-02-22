import { z } from "zod";

export const ConflictResponseSchema = z.object({
  mode: z.literal("conflict"),
  status: z.enum(["needs_clarification", "facilitating", "ready_for_action", "safety_escalation"]),
  safety: z.object({
    risk_level: z.enum(["none", "high"]),
    signals: z.array(z.string()),
    escalation_message: z.string()
  }),
  conflict_type: z.string().min(1),
  neutral_summary: z.string().min(1),
  permission_check: z.object({
    asked: z.boolean(),
    question: z.string(),
    user_response: z.string()
  }),
  clarifying_questions: z.array(z.string()).max(3),
  options: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      tradeoffs: z.string().min(1),
      when_to_use: z.string().min(1)
    })
  ).max(3),
  suggested_script: z.object({
    purpose: z.string().min(1),
    audience: z.string().min(1),
    text: z.string().min(1)
  }),
  micro_plan: z.array(
    z.object({
      step: z.number().int().positive(),
      action: z.string().min(1),
      owner: z.string().min(1),
      timeframe: z.string().min(1),
      done_when: z.string().min(1)
    })
  ),
  tool_suggestions: z.array(
    z.object({
      type: z.enum(["tickets.create", "calendar.create_event", "charter.update"]),
      reason: z.string().min(1),
      payload_preview: z.record(z.unknown()),
      requires_confirmation: z.literal(true),
      confirmation_prompt: z.string().min(1)
    })
  ),
  follow_up: z.object({
    next_question: z.string().min(1),
    check_in_prompt: z.string().min(1)
  }),
  citations: z.array(
    z.object({
      chunkId: z.string().min(1),
      title: z.string().min(1)
    })
  ),
  confidence: z.number().min(0).max(1)
}).strict();

export type ConflictResponse = z.infer<typeof ConflictResponseSchema>;

type ConflictParseResult =
  | { ok: true; data: ConflictResponse }
  | { ok: false; error: string };

export function safeParseConflictResponse(text: string): ConflictParseResult {
  const candidate = extractJsonCandidate(text);
  if (!candidate) {
    return { ok: false, error: "No JSON object found in model output." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse error";
    return { ok: false, error: `Invalid JSON: ${message}` };
  }

  const result = ConflictResponseSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ")
    };
  }

  return { ok: true, data: result.data };
}

function extractJsonCandidate(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return null;
}

