export type ConflictType =
  | "schedule_communication"
  | "workload_fairness"
  | "interpersonal_tone"
  | "goals_priorities"
  | "decision_process"
  | "role_ambiguity"
  | "other";

export function inferConflictType(text: string): ConflictType {
  const normalized = text.toLowerCase();

  if (containsAny(normalized, ["timezone", "time zone", "availability", "calendar", "schedule", "standup", "async", "meeting", "check-in"])) {
    return "schedule_communication";
  }
  if (containsAny(normalized, ["workload", "unfair", "imbalance", "pulling weight", "doing most", "carrying", "not contributing", "only show up", "show up near"])) {
    return "workload_fairness";
  }
  if (containsAny(normalized, ["dismissed", "tone", "rude", "condescend", "sarcast", "naive", "interrupt", "respect", "attacked", "blame"])) {
    return "interpersonal_tone";
  }
  if (containsAny(normalized, ["priority", "priorities", "goal", "direction", "scope", "mvp", "requirements", "feature"])) {
    return "goals_priorities";
  }
  if (containsAny(normalized, ["decision", "tie", "vote", "deadlock", "stuck", "going in circles", "can't decide", "cannot decide"])) {
    return "decision_process";
  }
  if (containsAny(normalized, ["role", "responsibility", "responsibilities", "who owns", "ownership unclear", "no one owns", "nobody owns", "assumes someone else", "accountable"])) {
    return "role_ambiguity";
  }

  return "other";
}

export function looksLikeConflictMessage(text: string): boolean {
  const normalized = text.toLowerCase();
  const highSignal = containsAny(normalized, [
    "conflict",
    "argument",
    "arguing",
    "disagree",
    "disagreement",
    "tension",
    "resent",
    "unfair",
    "not fair",
    "doing most",
    "pulling weight",
    "carrying",
    "not contributing",
    "only show up",
    "show up near",
    "no one owns",
    "nobody owns",
    "who owns",
    "ownership unclear",
    "assumes someone else",
    "falls through",
    "going in circles",
    "scope creep",
    "scope keeps changing",
    "rude",
    "dismiss",
    "ignored",
    "blame",
    "deadlock",
    "stuck",
    "talk over",
    "interrupt",
    "tone",
    "respect",
  ]);

  // If there's no high-signal conflict language, avoid routing normal planning questions.
  if (!highSignal) return false;

  // Many conflicts reference teammates or group dynamics.
  const hasGroupContext = containsAny(normalized, [
    "we",
    "team",
    "teammate",
    "teammates",
    "group",
    "they",
    "he",
    "she",
    "everyone",
    "others",
    "someone else",
    "someone",
    "no one",
    "nobody",
  ]);
  if (hasGroupContext) return true;

  // If the user explicitly asks for mediation/help resolving a conflict, treat as conflict.
  return containsAny(normalized, ["mediate", "mediation", "resolve this", "help us resolve", "handle this"]);
}

function containsAny(source: string, needles: string[]): boolean {
  return needles.some((needle) => source.includes(needle));
}
