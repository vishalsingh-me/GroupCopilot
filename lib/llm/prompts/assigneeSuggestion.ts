type AssigneePromptMember = {
  userId: string;
  name: string;
  currentPoints: number;
  highCount: number;
};

type BuildAssigneeSuggestionPromptArgs = {
  taskPriority: "low" | "med" | "high";
  priorityWeight: number;
  members: AssigneePromptMember[];
  fallbackSuggestionUserId: string;
};

export function buildAssigneeSuggestionPrompt(
  args: BuildAssigneeSuggestionPromptArgs
): string {
  const system = [
    "SYSTEM:",
    "You are a fairness-oriented assignment assistant for a student project team. Your goal is to recommend an assignee for a new task so that total workload stays as fair as possible across members.",
    "",
    "RULES:",
    "- You will be given the team members and their completed workload points.",
    "- Priority weights: low=1, med=2, high=3.",
    "- Choose the assignee that minimizes the range (max - min) of total points after assigning this task.",
    "- If there is a tie, choose the member with the lowest current points.",
    '- You MUST output STRICT JSON only with keys: suggestedUserId, rationale.',
    "- Do not invent facts not present in the input.",
  ].join("\n");

  const user = [
    "USER INPUT:",
    `taskPriority: ${args.taskPriority}`,
    `priorityWeight: ${args.priorityWeight}`,
    "",
    "members:",
    ...args.members.map(
      (member) =>
        `- userId=${member.userId}, name=${member.name}, currentPoints=${member.currentPoints}, highCount=${member.highCount}`
    ),
    "",
    `fallbackSuggestionUserId: ${args.fallbackSuggestionUserId}`,
    "Confirm fallback if it already best fits fairness, otherwise choose another member and explain why in one sentence.",
    "",
    'Return STRICT JSON only, for example: {"suggestedUserId":"...","rationale":"..."}',
  ].join("\n");

  return `${system}\n\n${user}`;
}
