export type AssigneeSuggestionMemberInput = {
  userId: string;
  name: string;
  currentPoints: number;
  highCount: number;
};

export function buildAssigneeSuggestionPrompt(args: {
  priority: "low" | "med" | "high";
  weight: number;
  members: AssigneeSuggestionMemberInput[];
  fallbackSuggestionUserId: string;
}) {
  return [
    "SYSTEM:",
    "You are a fairness-oriented assignment assistant for a student project team.",
    "Your goal is to recommend an assignee for a new task so that total workload stays as fair as possible across members.",
    "",
    "RULES:",
    "- You will be given team members and their completed workload points.",
    "- Priority weights: low=1, med=2, high=3.",
    "- Choose the assignee that minimizes the range (max - min) of total points after assigning this task.",
    "- If there is a tie, choose the member with the lowest current points.",
    "- Output STRICT JSON only with keys: suggestedUserId, rationale.",
    "- Do not invent facts not present in the input.",
    "",
    "USER INPUT:",
    `taskPriority: ${args.priority}`,
    `taskPriorityWeight: ${args.weight}`,
    `fallbackSuggestionUserId: ${args.fallbackSuggestionUserId}`,
    "members:",
    JSON.stringify(args.members, null, 2),
    "",
    "Return JSON now.",
  ].join("\n");
}
