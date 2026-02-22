/**
 * Agent dispatcher — maps the current session state to the appropriate handler.
 * Each handler may advance the state machine, open/close approval gates,
 * and returns the text to send as the assistant message.
 */

import { prisma } from "@/lib/prisma";
import { generateFromPrompt } from "@/lib/llm/gemini";
import { createCard, isTrelloConfigured, TrelloApiError } from "@/lib/trello/client";
import { TRELLO_MVP_BOARD_SHORT_LINK, TRELLO_MVP_PUBLISH_LIST_ID, TRELLO_MVP_PUBLISH_LIST_NAME } from "@/lib/trello/config";
import { extractJSON, tryParseTasksJson } from "./parseUtils";
import {
  AgentSession,
  SessionData,
  TaskProposal,
  advanceSession,
  castVote,
  getOpenApproval,
  openApprovalGate,
  patchSessionData,
  writeAuditLog,
} from "./stateMachine";
import {
  kickoffPrompt,
  skeletonDraftPrompt,
  skeletonQAPrompt,
  contributionRequestPrompt,
  taskNormalizationPrompt,
  fixJsonPrompt,
  gate1Message,
  gate2Message,
  weeklyReviewPrompt,
} from "./prompts";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DispatchResult = {
  text: string;
  mockMode: boolean;
  newState?: string;
  approvalRequestId?: string;
};

type DispatchArgs = {
  session: AgentSession;
  roomId: string;
  userId: string;
  userMessage: string;
  memberNames: string[];
  memberNameMap: Record<string, string>; // userId → displayName
  memberIds: string[];
  projectGoal?: string | null;
};

// ─── Dispatcher entry point ───────────────────────────────────────────────────

export async function dispatch(args: DispatchArgs): Promise<DispatchResult> {
  const { session } = args;

  // If there's an open approval gate, try to interpret the user message as a vote
  const openApproval = await getOpenApproval(session.id);
  if (openApproval) {
    return handleApprovalResponse(args, openApproval.id, openApproval.type);
  }

  switch (session.state) {
    case "IDLE":
      return handleIdle(args);
    case "WEEKLY_KICKOFF":
      return handleKickoff(args);
    case "SKELETON_DRAFT":
      return handleSkeletonDraft(args);
    case "SKELETON_QA":
      return handleSkeletonQA(args);
    case "PLANNING_MEETING":
      return handlePlanningMeeting(args);
    case "TASK_PROPOSALS":
      return handleTaskProposals(args);
    case "TRELLO_PUBLISH":
      return handleTrelloPublish(args);
    case "MONITOR":
      return handleMonitor(args);
    case "WEEKLY_REVIEW":
      return handleWeeklyReview(args);
    default:
      return {
        text: `The group is currently in the **${session.state}** phase. Please wait for the current step to complete.`,
        mockMode: false,
      };
  }
}

// ─── State handlers ───────────────────────────────────────────────────────────

async function handleIdle(args: DispatchArgs): Promise<DispatchResult> {
  const updated = await advanceSession(args.session.id, "WEEKLY_KICKOFF");
  // Immediately chain into kickoff
  return dispatch({ ...args, session: updated });
}

async function handleKickoff(args: DispatchArgs): Promise<DispatchResult> {
  const ctx = buildCtx(args);
  const data = args.session.data as SessionData;
  const { text, mockMode } = await generateFromPrompt(
    kickoffPrompt(ctx, data.reviewSummary),
    `Welcome to week ${ctx.weekNumber}! Let's plan this week together. I'll start by drafting a milestone skeleton for your approval.`
  );
  const updated = await advanceSession(args.session.id, "SKELETON_DRAFT");
  // Immediately chain into skeleton draft
  const draftResult = await dispatch({ ...args, session: updated });
  return {
    text: `${text}\n\n---\n\n${draftResult.text}`,
    mockMode: mockMode || draftResult.mockMode,
    newState: draftResult.newState,
    approvalRequestId: draftResult.approvalRequestId,
  };
}

async function handleSkeletonDraft(args: DispatchArgs): Promise<DispatchResult> {
  const ctx = buildCtx(args);
  const recentMessages = await getRecentMessageTexts(args.roomId, 10);

  const { text, mockMode } = await generateFromPrompt(
    skeletonDraftPrompt(ctx, recentMessages),
    JSON.stringify({
      milestones: [
        { outcome: "Complete the project scaffold", reasoning: "Because a working foundation unblocks all other work" },
        { outcome: "Define the core data model", reasoning: "Because schema decisions affect every other component" },
      ],
    })
  );

  let milestones: string[];
  try {
    const parsed = JSON.parse(extractJSON(text));
    milestones = parsed.milestones.map(
      (m: { outcome: string; reasoning: string }) => `${m.outcome} — _${m.reasoning}_`
    );
  } catch {
    milestones = [text];
  }

  await patchSessionData(args.session.id, { skeletonDraft: milestones });

  // Advance to QA, then open approval gate
  const afterQA = await advanceSession(args.session.id, "SKELETON_QA", { skeletonDraft: milestones });
  const qaResult = await dispatch({ ...args, session: afterQA });

  if (qaResult.approvalRequestId) {
    // QA is done, gate 1 is open
    return {
      text: `${gate1Message(milestones)}\n\n${qaResult.text}`,
      mockMode,
      newState: "APPROVAL_GATE_1",
      approvalRequestId: qaResult.approvalRequestId,
    };
  }

  return {
    text: `${gate1Message(milestones)}\n\n${qaResult.text}`,
    mockMode: mockMode || qaResult.mockMode,
    newState: "SKELETON_QA",
  };
}

async function handleSkeletonQA(args: DispatchArgs): Promise<DispatchResult> {
  const ctx = buildCtx(args);
  const data = args.session.data as SessionData;
  const skeleton = data.skeletonDraft ?? [];
  const priorAnswers = data.qaAnswers ?? {};
  const priorQuestions = data.skeletonQuestions ?? [];

  const pendingQuestion = [...priorQuestions].reverse().find((question) => !priorAnswers[question]);
  const trimmedMessage = args.userMessage.trim();
  const nextAnswers =
    pendingQuestion && trimmedMessage.length > 0
      ? { ...priorAnswers, [pendingQuestion]: trimmedMessage }
      : priorAnswers;

  if (nextAnswers !== priorAnswers) {
    await patchSessionData(args.session.id, { qaAnswers: nextAnswers });
  }

  const { text, mockMode } = await generateFromPrompt(
    skeletonQAPrompt(ctx, skeleton, nextAnswers),
    JSON.stringify({ done: true })
  );

  try {
    const parsed = JSON.parse(extractJSON(text));
    if (parsed.done) {
      // QA complete — open approval gate 1
      const requestId = await openApprovalGate(args.session.id, "SKELETON", { milestones: skeleton });
      await advanceSession(args.session.id, "APPROVAL_GATE_1");
      await writeAuditLog(args.roomId, "gate_1_opened", { milestones: skeleton });
      return {
        text: "I've gathered enough context. Ready for the group's approval on the skeleton above.",
        mockMode,
        newState: "APPROVAL_GATE_1",
        approvalRequestId: requestId,
      };
    }
    if (parsed.question) {
      if (!priorQuestions.includes(parsed.question)) {
        await patchSessionData(args.session.id, {
          skeletonQuestions: [...priorQuestions, parsed.question],
          qaAnswers: nextAnswers,
        });
      }
      return { text: parsed.question, mockMode, newState: "SKELETON_QA" };
    }
  } catch {
    // If parse fails, treat as a question
  }

  return { text, mockMode, newState: "SKELETON_QA" };
}

async function handleApprovalResponse(
  args: DispatchArgs,
  requestId: string,
  type: string
): Promise<DispatchResult> {
  const lower = args.userMessage.toLowerCase();
  const isApprove =
    lower.includes("approve") ||
    lower.includes("looks good") ||
    lower.includes("lgtm") ||
    lower.includes("yes") ||
    lower.includes("✓") ||
    lower.includes("👍");

  const vote = isApprove ? "approve" : "request_change";
  const { resolved, status } = await castVote(requestId, args.userId, vote, args.userMessage);

  if (!resolved) {
    const approveCount = (await prisma.approvalVote.count({ where: { requestId, vote: "approve" } }));
    return {
      text: `Vote recorded (${vote.replace("_", " ")}). Waiting for other members. ${approveCount}/${args.memberIds.length} approved so far.`,
      mockMode: false,
    };
  }

  if (status === "rejected") {
    await writeAuditLog(args.roomId, `gate_${type.toLowerCase()}_rejected`, { requestId }, args.userId);
    // Revert to the draft state so the agent can revise
    const revertTo = type === "SKELETON" ? "SKELETON_DRAFT" as const : "TASK_PROPOSALS" as const;
    const reverted = await advanceSession(args.session.id, revertTo);
    await writeAuditLog(args.roomId, "state_reverted", { to: revertTo }, args.userId);
    return {
      text: `Got it — I'll revise based on the feedback. Let me draft a new version...\n\n`,
      mockMode: false,
      newState: revertTo,
    };
  }

  // Approved — advance past the gate
  await writeAuditLog(args.roomId, `gate_${type.toLowerCase()}_approved`, { requestId }, args.userId);

  if (type === "SKELETON") {
    const data = args.session.data as SessionData;
    const updated = await advanceSession(args.session.id, "PLANNING_MEETING");
    const planResult = await dispatch({ ...args, session: updated });
    return {
      text: `Skeleton approved! Moving to the planning meeting.\n\n${planResult.text}`,
      mockMode: false,
      newState: "PLANNING_MEETING",
    };
  }

  if (type === "TASK_PLAN") {
    const updated = await advanceSession(args.session.id, "TRELLO_PUBLISH");
    const publishResult = await dispatch({ ...args, session: updated });
    return {
      text: `Task plan approved! Publishing to Trello now.\n\n${publishResult.text}`,
      mockMode: publishResult.mockMode,
      newState: publishResult.newState,
    };
  }

  return { text: "Approval recorded.", mockMode: false };
}

async function handlePlanningMeeting(args: DispatchArgs): Promise<DispatchResult> {
  const ctx = buildCtx(args);
  const data = args.session.data as SessionData;
  const skeleton = data.skeletonDraft ?? [];
  const contributions = data.contributions ?? {};
  const order = data.contributionOrder ?? args.memberIds;

  // Save contribution order if first time
  if (!data.contributionOrder) {
    await patchSessionData(args.session.id, { contributionOrder: order });
  }

  // Record the user's contribution (if they haven't given one yet)
  if (!contributions[args.userId] && args.userMessage.length > 3) {
    const updated = { ...contributions, [args.userId]: args.userMessage };
    await patchSessionData(args.session.id, { contributions: updated });

    // Check if all members have contributed
    const allContributed = order.every((id) => updated[id]);
    if (allContributed) {
      const nextSession = await advanceSession(args.session.id, "TASK_PROPOSALS", { contributions: updated });
      return dispatch({ ...args, session: nextSession });
    }

    // Ask the next member
    const nextMemberId = order.find((id) => !updated[id]);
    const nextName = nextMemberId ? (args.memberNameMap[nextMemberId] ?? "the next member") : "someone";
    const { text, mockMode } = await generateFromPrompt(
      contributionRequestPrompt(ctx, skeleton, nextName, Object.values(args.memberNameMap).filter((n) => updated[Object.keys(args.memberNameMap).find((k) => args.memberNameMap[k] === n) ?? ""])),
      `Thanks! Now, ${nextName} — what specific task or subtask do you plan to tackle this week?`
    );
    return { text, mockMode, newState: "PLANNING_MEETING" };
  }

  // First member hasn't contributed yet — prompt them
  const firstPending = order.find((id) => !contributions[id]);
  const firstName = firstPending ? (args.memberNameMap[firstPending] ?? "someone") : "the group";
  const alreadyDone = Object.keys(contributions).map((id) => args.memberNameMap[id] ?? id);
  const { text, mockMode } = await generateFromPrompt(
    contributionRequestPrompt(ctx, skeleton, firstName, alreadyDone),
    `Let's hear from ${firstName} first — what specific task do you plan to tackle this week?`
  );
  return { text, mockMode, newState: "PLANNING_MEETING" };
}

async function handleTaskProposals(args: DispatchArgs): Promise<DispatchResult> {
  const ctx = buildCtx(args);
  const data = args.session.data as SessionData;
  const contributions = data.contributions ?? {};
  const skeleton = data.skeletonDraft ?? [];

  const fallbackJson = JSON.stringify({
    tasks: Object.entries(contributions).map(([uid, contribution]) => ({
      title: contribution.slice(0, 40),
      description: contribution,
      acceptanceCriteria: [],
      dependencies: [],
      suggestedOwnerUserId: uid,
      suggestedOwnerName: args.memberNameMap[uid] ?? null,
      due: null,
      effort: "M",
    })),
  });

  const { text: rawText, mockMode } = await generateFromPrompt(
    taskNormalizationPrompt(ctx, skeleton, contributions, args.memberNameMap),
    fallbackJson
  );

  // Attempt 1: parse the LLM response directly
  let proposals: TaskProposal[] | null = tryParseTasksJson(rawText);

  // Attempt 2: ask the model to fix the JSON if it was malformed
  if (!proposals && !mockMode) {
    console.warn("[dispatcher] Task JSON parse failed on attempt 1 — retrying with fix prompt");
    await writeAuditLog(args.roomId, "task_json_parse_retry", { attempt: 2 });
    const { text: fixedText } = await generateFromPrompt(fixJsonPrompt(rawText), fallbackJson);
    proposals = tryParseTasksJson(fixedText);
  }

  // Attempt 3: safe fallback — do NOT open Gate 2, surface a plain-text summary instead
  if (!proposals) {
    console.error("[dispatcher] Task JSON parse failed after retry — using safe fallback");
    await writeAuditLog(args.roomId, "task_json_parse_failed", { rawText: rawText.slice(0, 500) });
    const summary = Object.entries(contributions)
      .map(([uid, c]) => `- **${args.memberNameMap[uid] ?? uid}**: ${c}`)
      .join("\n");
    return {
      text:
        `I had trouble formatting the task proposals into a structured list. ` +
        `Here's a summary of what everyone contributed:\n\n${summary}\n\n` +
        `Please review and let me know if you'd like me to try again.`,
      mockMode: true,
      newState: "TASK_PROPOSALS",
    };
  }

  await patchSessionData(args.session.id, { taskProposals: proposals });
  const requestId = await openApprovalGate(args.session.id, "TASK_PLAN", { tasks: proposals });
  await advanceSession(args.session.id, "APPROVAL_GATE_2", { taskProposals: proposals });
  await writeAuditLog(args.roomId, "gate_2_opened", { taskCount: proposals.length });

  return {
    text: gate2Message(proposals),
    mockMode,
    newState: "APPROVAL_GATE_2",
    approvalRequestId: requestId,
  };
}



async function handleTrelloPublish(args: DispatchArgs): Promise<DispatchResult> {
  const FAILURE_TEXT = "Trello publish failed — check Trello connection in Settings.";
  const data = args.session.data as SessionData;
  const proposals = data.taskProposals ?? [];
  const alreadyPublished = (data.publishedCardIds ?? []).filter(Boolean);

  if (proposals.length === 0) {
    // Nothing to publish — advance to monitor
    const updated = await advanceSession(args.session.id, "MONITOR");
    return dispatch({ ...args, session: updated });
  }

  if (alreadyPublished.length > 0) {
    await writeAuditLog(args.roomId, "trello_publish_duplicate_attempt", {
      cardIds: alreadyPublished,
      weekNumber: args.session.weekNumber,
    });
    await advanceSession(args.session.id, "MONITOR", { publishedCardIds: alreadyPublished });
    return {
      text:
        "Tasks were already published to Trello for this cycle. " +
        "Skipping duplicate publish and moving to monitor.",
      mockMode: false,
      newState: "MONITOR",
    };
  }

  if (!isTrelloConfigured()) {
    await advanceSession(args.session.id, "MONITOR", { publishedCardIds: [] });
    await writeAuditLog(args.roomId, "trello_publish_failed", { reason: "TRELLO_NOT_CONFIGURED" });
    return {
      text: FAILURE_TEXT,
      mockMode: true,
      newState: "MONITOR",
    };
  }

  // Build a Trello member ID map from RoomMember.trelloMemberId
  const members = await prisma.roomMember.findMany({ where: { roomId: args.roomId } });
  const trelloMemberMap: Record<string, string> = {};
  for (const m of members) {
    if (m.trelloMemberId) trelloMemberMap[m.userId] = m.trelloMemberId;
  }

  const approvedAtIso = new Date().toISOString();

  // Publish each task as a Trello card
  const publishedCardIds: string[] = [];
  const lines: string[] = [];
  const failed: Array<{ title: string; error: ReturnType<typeof safeTrelloError> }> = [];

  for (const proposal of proposals) {
    try {
      const mappedMemberId = proposal.suggestedOwnerUserId
        ? trelloMemberMap[proposal.suggestedOwnerUserId]
        : undefined;
      const idMembers = mappedMemberId ? [mappedMemberId] : undefined;
      const due = normalizeDueDate(proposal.due);
      const card = await createCard(
        TRELLO_MVP_PUBLISH_LIST_ID,
        proposal.title,
        formatCardDescription(proposal, approvedAtIso),
        idMembers,
        due ?? undefined
      );

      // Cache the card locally
      await prisma.trelloCardCache.upsert({
        where: { trelloCardId: card.id },
        update: {
          title: card.name,
          status: TRELLO_MVP_PUBLISH_LIST_NAME,
          dueDate: card.due ? new Date(card.due) : null,
          lastSyncedAt: new Date(),
        },
        create: {
          roomId: args.roomId,
          trelloCardId: card.id,
          title: card.name,
          status: TRELLO_MVP_PUBLISH_LIST_NAME,
          dueDate: card.due ? new Date(card.due) : null,
        },
      });

      publishedCardIds.push(card.id);
      lines.push(`✓ **${proposal.title}**${proposal.suggestedOwnerName ? ` → ${proposal.suggestedOwnerName}` : ""}`);
    } catch (error) {
      const safeError = safeTrelloError(error);
      console.error(`Failed to create Trello card for "${proposal.title}":`, error);
      failed.push({ title: proposal.title, error: safeError });
      lines.push(`✗ **${proposal.title}** (failed)`);
    }
  }

  await advanceSession(args.session.id, "MONITOR", { publishedCardIds });

  if (failed.length > 0) {
    await writeAuditLog(args.roomId, "trello_publish_failed", {
      reason: "CARD_CREATE_FAILED",
      boardShortLink: TRELLO_MVP_BOARD_SHORT_LINK,
      listId: TRELLO_MVP_PUBLISH_LIST_ID,
      publishedCount: publishedCardIds.length,
      failed,
      weekNumber: args.session.weekNumber,
    });
    return {
      text:
        `${FAILURE_TEXT}\n\n` +
        `Published ${publishedCardIds.length}/${proposals.length} card(s) to **${TRELLO_MVP_PUBLISH_LIST_NAME}**.\n\n` +
        `${lines.join("\n")}`,
      mockMode: true,
      newState: "MONITOR",
    };
  }

  await writeAuditLog(args.roomId, "trello_cards_published", {
    boardShortLink: TRELLO_MVP_BOARD_SHORT_LINK,
    listId: TRELLO_MVP_PUBLISH_LIST_ID,
    listName: TRELLO_MVP_PUBLISH_LIST_NAME,
    count: publishedCardIds.length,
    cardIds: publishedCardIds,
    weekNumber: args.session.weekNumber,
  });

  return {
    text:
      `Published ${publishedCardIds.length}/${proposals.length} cards to Trello list **${TRELLO_MVP_PUBLISH_LIST_NAME}**:\n\n` +
      `${lines.join("\n")}\n\n` +
      `I'll check in throughout the week if anything stalls.`,
    mockMode: false,
    newState: "MONITOR",
  };
}

async function handleMonitor(args: DispatchArgs): Promise<DispatchResult> {
  // Read Trello cache for stalled cards
  const stalled = await prisma.trelloCardCache.findMany({
    where: {
      roomId: args.roomId,
      status: { notIn: ["Done", "Complete", "Completed"] },
      lastSyncedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  if (stalled.length === 0) {
    return {
      text: "All tasks appear to be moving. No stalled cards detected this week. I'll generate the weekly review.",
      mockMode: false,
      newState: "MONITOR",
    };
  }

  const stalledTitles = stalled.map((c) => `**${c.title}**`).join(", ");
  return {
    text: `Heads up — ${stalled.length} task(s) haven't moved in over a week: ${stalledTitles}. Does anyone want to update their status or reassign them?`,
    mockMode: false,
    newState: "MONITOR",
  };
}

async function handleWeeklyReview(args: DispatchArgs): Promise<DispatchResult> {
  const ctx = buildCtx(args);
  const allCards = await prisma.trelloCardCache.findMany({ where: { roomId: args.roomId } });
  const completed = allCards.filter((c) => ["Done", "Complete", "Completed"].includes(c.status)).map((c) => c.title);
  const stalled = allCards
    .filter((c) => !["Done", "Complete", "Completed"].includes(c.status) && c.lastSyncedAt < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    .map((c) => c.title);
  const published = allCards.map((c) => c.title);

  const { text, mockMode } = await generateFromPrompt(
    weeklyReviewPrompt(ctx, published, stalled, completed),
    `Week ${ctx.weekNumber} complete. The team made progress on ${completed.length} tasks. See you next week!`
  );

  await patchSessionData(args.session.id, { reviewSummary: text });
  await advanceSession(args.session.id, "IDLE");
  await writeAuditLog(args.roomId, "weekly_review_completed", { weekNumber: ctx.weekNumber });

  return { text, mockMode, newState: "IDLE" };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function buildCtx(args: DispatchArgs) {
  return {
    projectGoal: args.projectGoal,
    memberNames: args.memberNames,
    weekNumber: args.session.weekNumber,
  };
}

async function getRecentMessageTexts(roomId: string, limit: number): Promise<string[]> {
  const messages = await prisma.message.findMany({
    where: { roomId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { senderUser: true },
  });
  return messages
    .reverse()
    .map((m) => `${m.senderUser?.name ?? m.senderType}: ${m.content}`);
}

function safeTrelloError(error: unknown): { code: string; httpStatus?: number; message: string } {
  if (error instanceof TrelloApiError) {
    return {
      code: error.code,
      httpStatus: error.httpStatus,
      message: error.message.slice(0, 220),
    };
  }
  if (error instanceof Error) {
    return {
      code: "UNKNOWN",
      message: error.message.slice(0, 220),
    };
  }
  return {
    code: "UNKNOWN",
    message: String(error).slice(0, 220),
  };
}

function normalizeDueDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function formatCardDescription(proposal: TaskProposal, approvedAtIso: string): string {
  const lines: string[] = [];
  lines.push(proposal.description?.trim() || "No additional description provided.");
  lines.push("");

  const acceptanceCriteria = proposal.acceptanceCriteria?.filter(Boolean) ?? [];
  lines.push("Acceptance criteria:");
  if (acceptanceCriteria.length === 0) {
    lines.push("- None specified");
  } else {
    for (const criterion of acceptanceCriteria) lines.push(`- ${criterion}`);
  }
  lines.push("");

  const dependencies = proposal.dependencies?.filter(Boolean) ?? [];
  lines.push("Dependencies:");
  if (dependencies.length === 0) {
    lines.push("- None");
  } else {
    for (const dependency of dependencies) lines.push(`- ${dependency}`);
  }
  lines.push("");

  lines.push(`Suggested owner: ${proposal.suggestedOwnerName ?? "Unassigned"}`);
  lines.push(`Effort: ${proposal.effort ?? "Not specified"}`);
  lines.push(`Approved by Gate 2 at: ${approvedAtIso}`);

  return lines.join("\n").trim();
}
