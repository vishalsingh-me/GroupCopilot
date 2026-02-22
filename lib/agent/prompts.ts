import type { SessionData, TaskProposal } from "./stateMachine";

// ─── Shared context builder ───────────────────────────────────────────────────

type RoomContext = {
  projectGoal?: string | null;
  memberNames: string[];
  weekNumber: number;
};

function header(ctx: RoomContext): string {
  return [
    `You are GroupCopilot, a responsible AI facilitator for a student project group.`,
    `Project goal: ${ctx.projectGoal ?? "not yet defined"}.`,
    `Team members this week: ${ctx.memberNames.join(", ")}.`,
    `Current week: ${ctx.weekNumber}.`,
    ``,
    `Tone rules:`,
    `- Be concise, warm, and neutral. Never judge individuals.`,
    `- Always explain WHY you are making a suggestion (transparent reasoning).`,
    `- Never take any action without explicit group approval.`,
  ].join("\n");
}

// ─── WEEKLY_KICKOFF ───────────────────────────────────────────────────────────

export function kickoffPrompt(ctx: RoomContext, priorReview?: string): string {
  return [
    header(ctx),
    ``,
    `Task: Open the weekly planning session for week ${ctx.weekNumber}.`,
    ``,
    priorReview
      ? `Last week's review summary:\n${priorReview}\n`
      : `This appears to be the first week — no prior review available.\n`,
    `Write a short (2–3 sentence) opening message that:`,
    `1. Welcomes the group to the new week.`,
    `2. Briefly references any unfinished items from last week (if available).`,
    `3. Signals that you will now draft a milestone skeleton for their approval.`,
    ``,
    `Output: plain paragraph, no markdown headers.`,
  ].join("\n");
}

// ─── SKELETON_DRAFT ───────────────────────────────────────────────────────────

export function skeletonDraftPrompt(
  ctx: RoomContext,
  recentMessages: string[]
): string {
  return [
    header(ctx),
    ``,
    `Task: Propose a weekly milestone skeleton (2–4 bullet outcomes) for week ${ctx.weekNumber}.`,
    ``,
    `Recent conversation context (last 10 messages):`,
    recentMessages.map((m, i) => `${i + 1}. ${m}`).join("\n"),
    ``,
    `Rules:`,
    `- Each milestone is a concrete, measurable outcome, not a vague activity.`,
    `- Prefer outcomes the whole team contributes to over individual assignments.`,
    `- Include a brief reasoning line for each (prefix with "Because: ").`,
    `- Do NOT assign tasks to specific people yet.`,
    ``,
    `Output format (JSON only, no prose):`,
    `{ "milestones": [{ "outcome": "...", "reasoning": "..." }] }`,
  ].join("\n");
}

// ─── SKELETON_QA ─────────────────────────────────────────────────────────────

export function skeletonQAPrompt(
  ctx: RoomContext,
  skeleton: string[],
  priorAnswers: Record<string, string>
): string {
  const answeredCount = Object.keys(priorAnswers).length;
  return [
    header(ctx),
    ``,
    `Task: Ask ONE clarifying question to help refine the milestone skeleton.`,
    ``,
    `Current skeleton:`,
    skeleton.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    ``,
    answeredCount > 0
      ? `Questions already asked and answered:\n${Object.entries(priorAnswers)
          .map(([q, a]) => `Q: ${q}\nA: ${a}`)
          .join("\n\n")}\n`
      : `No questions asked yet.\n`,
    `Rules:`,
    `- Ask only ONE question at a time, directed at the whole group.`,
    `- Focus on the most ambiguous or risky milestone.`,
    `- If ${answeredCount} >= 2, output { "done": true } to signal QA is complete.`,
    ``,
    `Output format (JSON only):`,
    `{ "question": "..." }  OR  { "done": true }`,
  ].join("\n");
}

// ─── PLANNING_MEETING — contribution collection ───────────────────────────────

export function contributionRequestPrompt(
  ctx: RoomContext,
  skeleton: string[],
  targetMemberName: string,
  alreadyCollected: string[]
): string {
  return [
    header(ctx),
    ``,
    `Task: Ask ${targetMemberName} for their next-step contribution this week.`,
    ``,
    `Approved skeleton:`,
    skeleton.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    ``,
    alreadyCollected.length > 0
      ? `Contributions already collected from: ${alreadyCollected.join(", ")}.`
      : `${targetMemberName} is the first to contribute.`,
    ``,
    `Write a one-sentence, direct question to ${targetMemberName} asking what specific`,
    `task or subtask they plan to tackle this week in service of the milestones above.`,
    ``,
    `Output: plain sentence only, no markdown.`,
  ].join("\n");
}

// ─── TASK_PROPOSALS — normalization ──────────────────────────────────────────

export function taskNormalizationPrompt(
  ctx: RoomContext,
  skeleton: string[],
  contributions: Record<string, string>,
  memberNameMap: Record<string, string> // userId → displayName
): string {
  const contribLines = Object.entries(contributions)
    .map(([uid, text]) => `- ${memberNameMap[uid] ?? uid} (userId: ${uid}): "${text}"`)
    .join("\n");

  return [
    header(ctx),
    ``,
    `Task: Convert the raw member contributions into a clean, deduplicated task proposal list.`,
    ``,
    `Approved skeleton:`,
    skeleton.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    ``,
    `Raw contributions:`,
    contribLines,
    ``,
    `Rules:`,
    `- Merge duplicate or overlapping contributions into ONE task.`,
    `- Title: ≤8 words, action-oriented (start with a verb).`,
    `- Description: 1–2 specific, measurable sentences.`,
    `- acceptanceCriteria: 1–3 bullet strings defining "done". Required.`,
    `- dependencies: titles of tasks this depends on (empty array if none).`,
    `- suggestedOwnerName: contributor's name (null if merged from multiple).`,
    `- suggestedOwnerUserId: contributor's userId as given (null if merged).`,
    `- effort: "S" (few hours), "M" (half-day), "L" (full day+).`,
    `- due: null unless deadline is obvious from context.`,
    `- Do NOT invent tasks beyond what was contributed.`,
    `- Use neutral, non-judgmental language.`,
    ``,
    `Output: valid JSON ONLY — no prose, no markdown fences, no trailing commas.`,
    `{ "tasks": [{ "title": "...", "description": "...", "acceptanceCriteria": ["..."], "dependencies": [], "suggestedOwnerUserId": "...|null", "suggestedOwnerName": "...|null", "due": null, "effort": "S|M|L" }] }`,
  ].join("\n");
}

/** Prompt to fix malformed JSON from a first LLM attempt. */
export function fixJsonPrompt(brokenText: string): string {
  return [
    `The text below should be valid JSON with a "tasks" array but it is malformed or has extra prose.`,
    `Return ONLY corrected JSON — no explanation, no markdown, no trailing commas.`,
    ``,
    brokenText.slice(0, 3000),
  ].join("\n");
}

// ─── APPROVAL_GATE messages ───────────────────────────────────────────────────

export function gate1Message(skeleton: string[]): string {
  return [
    `Here's the **milestone skeleton** I've drafted for this week:`,
    ``,
    skeleton.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    ``,
    `Does this look right? If you'd like to edit any milestone, reply with your changes.`,
    `When the group is happy, click **Approve** to move to the planning meeting.`,
  ].join("\n");
}

export function gate2Message(proposals: TaskProposal[]): string {
  const lines = proposals.map((t, i) => {
    const owner = t.suggestedOwnerName ? ` _(suggested owner: ${t.suggestedOwnerName})_` : "";
    return `${i + 1}. **${t.title}**${owner}\n   ${t.description}`;
  });
  return [
    `Here's the **task plan** ready to publish to Trello:`,
    ``,
    lines.join("\n\n"),
    ``,
    `Review the list — you can suggest edits in the chat.`,
    `When everyone is satisfied, click **Approve** to publish these cards to Trello.`,
  ].join("\n");
}

// ─── WEEKLY_REVIEW ────────────────────────────────────────────────────────────

export function weeklyReviewPrompt(
  ctx: RoomContext,
  publishedTasks: string[],
  stalledTasks: string[],
  completedTasks: string[]
): string {
  return [
    header(ctx),
    ``,
    `Task: Write a concise weekly review summary for week ${ctx.weekNumber}.`,
    ``,
    `Published tasks: ${publishedTasks.length > 0 ? publishedTasks.join(", ") : "none"}.`,
    `Completed tasks: ${completedTasks.length > 0 ? completedTasks.join(", ") : "none"}.`,
    `Stalled tasks (no movement): ${stalledTasks.length > 0 ? stalledTasks.join(", ") : "none"}.`,
    ``,
    `Rules:`,
    `- Celebrate progress with specific examples.`,
    `- Mention stalled tasks neutrally without blaming individuals.`,
    `- End with one forward-looking sentence about next week.`,
    `- 3–5 sentences total.`,
    ``,
    `Output: plain paragraphs only, no markdown headers.`,
  ].join("\n");
}
