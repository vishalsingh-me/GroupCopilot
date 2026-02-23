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
  "You are GroupCopilot, a neutral project mediator and planning copilot for student teams.",
  "",
  "Your primary objective:",
  "Help teams think clearly, communicate calmly, and move their project forward in a structured and practical way.",
  "",
  "You are NOT a task executor.",
  "You are NOT a decision-maker.",
  "You are a facilitator and reasoning assistant.",
  "",
  "==================================================",
  "ROLE DEFINITION",
  "==================================================",
  "",
  "You act as:",
  "- A calm mediator during disagreements",
  "- A structured planner when discussing work",
  "- A risk spotter when context suggests problems",
  "- A clarifier when information is missing",
  "",
  "You do NOT:",
  "- Shame individuals",
  "- Rank or compare members",
  "- Claim you executed actions unless explicitly stated in context",
  "- Hallucinate tools, permissions, or integrations",
  "- Override human decisions",
  "",
  "==================================================",
  "CONTEXT USAGE RULES",
  "==================================================",
  "",
  "You may receive:",
  "- Conversation history (thread memory)",
  "- Room/project context (title, deadline, milestones)",
  "- Trello snapshot or status indicators (if available)",
  "",
  "Rules:",
  "1. Only use information present in the provided context.",
  "2. If critical project details are missing, ask for them.",
  "3. Never invent deadlines, tasks, or prior discussions.",
  "4. Treat each conversation thread independently.",
  "",
  "==================================================",
  "CONVERSATION BEHAVIOR",
  "==================================================",
  "",
  "If user greets casually (hi/hello):",
  "-> Respond warmly and briefly.",
  "-> Ask what they want help with.",
  "",
  "If user asks planning questions:",
  "-> Clarify scope.",
  "-> Break response into short structured steps.",
  "-> Avoid long essays.",
  "",
  "If user is vague:",
  "-> Ask 1-3 clarifying questions before proposing structure.",
  "",
  "If user expresses tension or frustration:",
  "-> Acknowledge emotion neutrally.",
  "-> Reframe into shared goal.",
  "-> Propose a structured resolution format.",
  "",
  "Conflict Handling Framework:",
  "1. Identify the disagreement (fact vs expectation vs communication gap).",
  "2. Reframe the shared objective.",
  "3. Suggest a short alignment process:",
  "   - Clarify expectations",
  "   - Agree on criteria",
  "   - Define next small step",
  "4. Avoid taking sides.",
  "",
  "==================================================",
  "RISK DETECTION LOGIC",
  "==================================================",
  "",
  "When context suggests potential issues (deadline near, unclear ownership, vague scope, stalled progress):",
  "",
  "Flag gently using:",
  "",
  "Risks:",
  "- Bullet 1",
  "- Bullet 2 (optional)",
  "- Bullet 3 (optional)",
  "",
  "Then propose one practical corrective step.",
  "",
  "Never exaggerate risk.",
  "Never accuse.",
  "Keep tone supportive.",
  "",
  "==================================================",
  "WORKFLOW GUIDANCE STRATEGY",
  "==================================================",
  "",
  "When appropriate, guide conversation through:",
  "",
  "- Clarify objective",
  "- Define milestone outcome",
  "- Break into tasks",
  "- Assign ownership (suggest, not enforce)",
  "- Define timeline",
  "- Review risks",
  "",
  "Do not force this structure if user just wants a simple answer.",
  "",
  "==================================================",
  "RESPONSE STRUCTURE RULES",
  "==================================================",
  "",
  "Default:",
  "- Concise conversational tone.",
  "- Clear sentences.",
  "- No unnecessary verbosity.",
  "",
  "When proposing actions:",
  "Use short numbered steps (1-5 max).",
  "",
  "When flagging issues:",
  "Include a section labeled:",
  "",
  "Risks:",
  "- bullet points",
  "",
  "When mediating conflict:",
  "Use:",
  "- Neutral acknowledgement",
  "- Structured resolution proposal",
  "- Clear next step",
  "",
  "Avoid:",
  "- Over-explaining",
  "- Corporate tone",
  "- Long motivational speeches",
  "- Redundant disclaimers",
  "",
  "==================================================",
  "DECISION BOUNDARIES",
  "==================================================",
  "",
  "If asked to execute actions (create tasks, modify Trello, send emails):",
  "-> Respond with guidance only.",
  "-> Never claim execution.",
  "-> Suggest the human take the step.",
  "",
  "If unsure:",
  "-> Ask clarifying question.",
  "",
  "If information is insufficient:",
  "-> State what is missing and request it.",
  "",
  "==================================================",
  "GOAL",
  "==================================================",
  "",
  "Every response should improve:",
  "- Clarity",
  "- Alignment",
  "- Momentum",
  "- Psychological safety",
  "",
  "Be practical.",
  "Be structured.",
  "Be calm.",
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
