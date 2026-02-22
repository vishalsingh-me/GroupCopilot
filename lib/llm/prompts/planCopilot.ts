export type PlanCopilotHistoryItem = {
  role: "user" | "assistant";
  name?: string;
  content: string;
};

export type PlanCopilotRoomContext = {
  roomCode: string;
  roomName?: string | null;
  members: string[];
  trelloBoardUrl?: string | null;
  projectPlan:
    | {
        title: string;
        description: string;
        deadlineAt: string;
        cadence: "daily" | "weekly" | "monthly";
        milestones: Array<{ index: number; title: string; dueAt: string }>;
      }
    | null;
  recentCards?: Array<{
    title: string;
    status: string;
    dueDate?: string | null;
  }>;
};

type BuildPlanCopilotPromptArgs = {
  roomContext: PlanCopilotRoomContext;
  threadSummary?: string | null;
  history: PlanCopilotHistoryItem[];
  userMessage: string;
};

const SYSTEM_PROMPT = [
  "You are GroupCopilot, a neutral project mediator for student teams.",
  "Behavior rules:",
  "- Be concise, practical, and calm.",
  "- If user says hi/hello, greet and ask what they want help with.",
  "- Ask clarifying questions when project info is missing.",
  "- If tension appears, stay neutral and suggest a structured resolution approach.",
  "- Flag risks gently (deadline, vague scope, unassigned work).",
  "- Never shame or rank people.",
  "- Do not claim actions were executed unless explicitly present in provided context.",
  "- Do not hallucinate tools, permissions, or integrations.",
  "Output style:",
  "- Normal conversational text by default.",
  "- When proposing actions, use short numbered steps.",
  "- When flagging issues, include a 'Risks' section with 1-3 bullets.",
].join("\n");

function serializeRoomContext(context: PlanCopilotRoomContext): string {
  const planBlock = context.projectPlan
    ? [
        `Project plan title: ${context.projectPlan.title}`,
        `Project plan description: ${context.projectPlan.description}`,
        `Project deadline: ${context.projectPlan.deadlineAt}`,
        `Project cadence: ${context.projectPlan.cadence}`,
        "Milestones:",
        context.projectPlan.milestones.length > 0
          ? context.projectPlan.milestones
              .map((m) => `- [${m.index}] ${m.title} (due ${m.dueAt})`)
              .join("\n")
          : "- None",
      ].join("\n")
    : "Project plan not set yet.";

  const cardsBlock =
    context.recentCards && context.recentCards.length > 0
      ? context.recentCards
          .map((card) => `- ${card.title} [${card.status}]${card.dueDate ? ` (due ${card.dueDate})` : ""}`)
          .join("\n")
      : "No recent Trello card snapshot available.";

  return [
    `Room code: ${context.roomCode}`,
    `Room name: ${context.roomName ?? "Untitled room"}`,
    `Members: ${context.members.length > 0 ? context.members.join(", ") : "No members found"}`,
    `Trello board URL: ${context.trelloBoardUrl ?? "Not connected"}`,
    "",
    planBlock,
    "",
    "Recent Trello cards:",
    cardsBlock,
  ].join("\n");
}

function serializeHistory(history: PlanCopilotHistoryItem[]): string {
  if (history.length === 0) {
    return "No prior messages in this conversation.";
  }

  return history
    .slice(-15)
    .map((item) => {
      const speaker =
        item.role === "assistant"
          ? "Assistant"
          : item.name?.trim()
            ? `User(${item.name})`
            : "User";
      return `${speaker}: ${item.content}`;
    })
    .join("\n");
}

export function buildPlanCopilotPrompt({
  roomContext,
  threadSummary,
  history,
  userMessage,
}: BuildPlanCopilotPromptArgs): string {
  return [
    "SYSTEM:",
    SYSTEM_PROMPT,
    "",
    "ROOM_CONTEXT:",
    serializeRoomContext(roomContext),
    "",
    "THREAD_SUMMARY:",
    threadSummary?.trim() ? threadSummary : "No summary yet.",
    "",
    "RECENT_HISTORY:",
    serializeHistory(history),
    "",
    `LATEST_USER_MESSAGE: ${userMessage}`,
    "",
    "Write the next assistant reply.",
  ].join("\n");
}
