/**
 * Deterministic intent classifier for the agent dispatcher.
 *
 * Runs BEFORE calling Gemini so we never waste a round-trip on small talk.
 * Uses regex/keyword heuristics only — no LLM calls.
 */

export type Intent =
  | "SMALL_TALK"        // hi, thanks, how are you, etc.
  | "GATE_FEEDBACK"     // "change milestone 2 to…", "update task…"
  | "KICKOFF_REQUEST"   // "start planning", "begin weekly session"
  | "ACTIONABLE";       // anything else that should proceed through the FSM

// ─── Small-talk patterns ──────────────────────────────────────────────────────

const SMALL_TALK_PATTERNS: RegExp[] = [
  /^(hi|hey|hello|howdy|yo|sup|hiya)[!., ]*$/i,
  /^how (are|r) (you|u|ya)[?!., ]*$/i,
  /^what('s| is) up[?!., ]*$/i,
  /^good (morning|afternoon|evening|night)[!., ]*$/i,
  /^(thanks|thank you|thx|ty|cheers)[!., ]*$/i,
  /^(ok|okay|got it|cool|great|nice|awesome|perfect|sounds good)[!., ]*$/i,
  /^(bye|goodbye|see ya|cya|later)[!., ]*$/i,
  /^(lol|haha|hehe|😂|😄|👍|🙏)[!., ]*$/i,
  /^(yes|no|yep|nope|sure|nah)[!., ]*$/i,
  /^(hmm|hm|uh|uhh|oh|ah|ohh|ahh)[!., ]*$/i,
];

// ─── Gate-feedback patterns ───────────────────────────────────────────────────
// These signal the user wants to edit an approval payload rather than vote.

const GATE_FEEDBACK_PATTERNS: RegExp[] = [
  /\b(change|update|edit|modify|revise|rename|replace|swap)\b.*(milestone|task|outcome|item|number|\d+)/i,
  /\b(milestone|task|item)\s+\d+\s+(should|needs?)\s+to\s+be\b/i,
  /\b(remove|delete|drop)\s+(milestone|task|item|number|\d+)\b/i,
  /\binstead\s+of\b/i,
  /\bactually[,\s]+\b/i,
];

// ─── Kickoff patterns ─────────────────────────────────────────────────────────

const KICKOFF_PATTERNS: RegExp[] = [
  /\b(start|begin|kick.?off|launch|open|initiate)\s+(weekly\s+)?(planning|session|week|meeting)\b/i,
  /\blet'?s?\s+(plan|start|kick)\b/i,
  /\bnew\s+week\b/i,
];

// ─── Classifier ───────────────────────────────────────────────────────────────

export function classifyIntent(message: string): Intent {
  const trimmed = message.trim();

  if (KICKOFF_PATTERNS.some((p) => p.test(trimmed))) return "KICKOFF_REQUEST";
  if (SMALL_TALK_PATTERNS.some((p) => p.test(trimmed))) return "SMALL_TALK";
  if (GATE_FEEDBACK_PATTERNS.some((p) => p.test(trimmed))) return "GATE_FEEDBACK";
  return "ACTIONABLE";
}

// ─── Small-talk reply builder ─────────────────────────────────────────────────

/** Return a short, warm small-talk reply. Never calls an LLM. */
export function buildSmallTalkReply(
  message: string,
  hasOpenGate: boolean,
  nextActionHint: string
): string {
  const lower = message.toLowerCase().trim();

  let reply: string;
  if (/thank/i.test(lower)) {
    reply = "You're welcome! 😊";
  } else if (/bye|goodbye|later/i.test(lower)) {
    reply = "See you! Feel free to come back when you're ready to plan.";
  } else if (/good (morning|afternoon|evening)/i.test(lower)) {
    reply = `Good ${lower.includes("morning") ? "morning" : lower.includes("afternoon") ? "afternoon" : "evening"}! Ready to plan?`;
  } else if (/how (are|r) (you|u)/i.test(lower)) {
    reply = "Doing great, thanks for asking! I'm here to help your group plan effectively.";
  } else {
    reply = "Hey! 👋 Happy to chat.";
  }

  if (hasOpenGate) {
    reply += ` There's an **approval pending** — take a moment to vote when you're ready.`;
  } else if (nextActionHint) {
    reply += ` ${nextActionHint}`;
  }

  return reply;
}

/** Describe the next useful action to the user given the current agent state. */
export function nextActionHint(state: string): string {
  const hints: Record<string, string> = {
    IDLE: "Want to **start this week's planning**? Just say the word.",
    WEEKLY_KICKOFF: "We're kicking off this week's session — the skeleton will be ready shortly.",
    SKELETON_DRAFT: "I'm drafting a milestone skeleton for the group's review.",
    SKELETON_QA: "I have a clarifying question coming up for the group.",
    APPROVAL_GATE_1: "The **milestone skeleton** is waiting for everyone's vote.",
    PLANNING_MEETING: "We're collecting each member's planned contributions.",
    TASK_PROPOSALS: "I'm normalizing everyone's input into a task list.",
    APPROVAL_GATE_2: "The **task plan** is waiting for everyone's vote before publishing to Trello.",
    TRELLO_PUBLISH: "Publishing the approved tasks to Trello now.",
    MONITOR: "I'll check in if anything stalls. Chat if you need anything.",
    WEEKLY_REVIEW: "Wrapping up the week — the review is being generated.",
  };
  return hints[state] ?? "";
}
