import type { TaskProposal } from "./stateMachine";

/** Extract the first JSON object or array from a string that may contain prose or markdown fences. */
export function extractJSON(text: string): string {
  // Strip markdown code fences first
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  return match ? match[0] : text;
}

/** Parse a tasks JSON blob. Returns null on any failure. */
export function tryParseTasksJson(text: string): TaskProposal[] | null {
  try {
    const parsed = JSON.parse(extractJSON(text));
    if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) return null;
    for (const t of parsed.tasks) {
      if (typeof t.title !== "string" || typeof t.description !== "string") return null;
    }
    return parsed.tasks as TaskProposal[];
  } catch {
    return null;
  }
}
