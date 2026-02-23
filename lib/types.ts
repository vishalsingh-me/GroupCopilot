export type Profile = { name: string; role?: string; };

export type MessageRole = "assistant" | "user" | "system" | "tool";

export type Message = {
  id: string;
  role: MessageRole;
  sender: string;
  content: string;
  mode?: string;
  threadId?: string | null;
  metadata?: unknown;
  createdAt: string;
  timestamp?: string;
};

export type ConversationThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  summary?: string | null;
  summaryUpdatedAt?: string | null;
};

export type RoomMember = {
  id: string;
  name: string;
  email?: string;
  role?: string | null;
  image?: string | null;
};

export type Room = {
  id: string;
  name?: string | null;
  code: string;
  trelloBoardId?: string | null;
  trelloBoardShortLink?: string | null;
  trelloBoardUrl?: string | null;
  members: RoomMember[];
};

// ─── Agent types ──────────────────────────────────────────────────────────────

export type AgentState =
  | "IDLE"
  | "WEEKLY_KICKOFF"
  | "SKELETON_DRAFT"
  | "SKELETON_QA"
  | "APPROVAL_GATE_1"
  | "PLANNING_MEETING"
  | "TASK_PROPOSALS"
  | "APPROVAL_GATE_2"
  | "TRELLO_PUBLISH"
  | "MONITOR"
  | "WEEKLY_REVIEW";

export const AGENT_STATE_LABELS: Record<AgentState, string> = {
  IDLE: "Ready to plan",
  WEEKLY_KICKOFF: "Starting weekly session",
  SKELETON_DRAFT: "Drafting milestone skeleton",
  SKELETON_QA: "Clarifying questions",
  APPROVAL_GATE_1: "Awaiting skeleton approval",
  PLANNING_MEETING: "Collecting contributions",
  TASK_PROPOSALS: "Normalizing tasks",
  APPROVAL_GATE_2: "Awaiting task plan approval",
  TRELLO_PUBLISH: "Publishing to Trello",
  MONITOR: "Monitoring progress",
  WEEKLY_REVIEW: "Generating weekly review",
};

export type TaskProposal = {
  title: string;
  description: string;
  suggestedOwnerUserId?: string | null;
  suggestedOwnerName?: string | null;
};

export type AgentSessionData = {
  id: string;
  state: AgentState;
  weekNumber: number;
  data: {
    skeletonDraft?: string[];
    taskProposals?: TaskProposal[];
    reviewSummary?: string;
  };
};

export type ApprovalVoteChoice = "approve" | "request_change";

export type ApprovalGateData = {
  id: string;
  type: "SKELETON" | "TASK_PLAN";
  payload: unknown;
  status: "pending" | "approved" | "rejected";
  votes: Array<{ userId: string; vote: ApprovalVoteChoice; comment?: string }>;
  approveCount: number;
  changeCount: number;
  memberCount: number;
  userVote: ApprovalVoteChoice | null;
};

// ─── Trello types ─────────────────────────────────────────────────────────────

export type TrelloCard = {
  id: string;
  title: string;
  description: string;
  status: string;
  dueDate?: string | null;
  url?: string;
  idMembers?: string[];
};

// ─── Audit log ────────────────────────────────────────────────────────────────

export type AuditLogEntry = {
  id: string;
  type: string;
  actor?: { id: string; name?: string | null; email: string; image?: string | null } | null;
  payload: unknown;
  createdAt: string;
};
