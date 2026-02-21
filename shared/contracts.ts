/**
 * shared/contracts.ts
 *
 * Single source of truth for API request/response shapes.
 * Person A builds UI against these types (using USE_MOCKS toggle).
 * Person B implements endpoints that return exactly these shapes.
 *
 * NEVER import server-only code here — this file is used by both
 * client components and server route handlers.
 */

// ── Primitives ───────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface Team {
  id: string;
  name: string;
  courseId: string | null;
  createdByUserId: string;
  createdAt: string; // ISO
}

export interface TeamMember {
  teamId: string;
  userId: string;
  role: "owner" | "member";
  joinedAt: string;
  invitedByUserId: string | null;
}

export interface TeamContract {
  id: string;
  teamId: string;
  version: number;
  goalsText: string | null;
  availabilityJsonb: Record<string, unknown> | null;
  commsPrefsJsonb: Record<string, unknown> | null;
  rolesJsonb: Record<string, unknown> | null;
  escalationJsonb: Record<string, unknown> | null;
  generatedContractText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  teamId: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done" | "blocked";
  priority: "low" | "medium" | "high";
  effortPoints: number;
  dueAt: string | null; // ISO
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  teamId: string;
  authorUserId: string;
  authorDisplayName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
}

// ── Evidence & Alert shapes (stable for UI rendering) ────────────────────────

export interface EvidenceFactor {
  kind: string;
  label: string;
  value: number;
  entityRefs: Array<{ entityType: string; id: string; note?: string }>;
}

export interface AlertEvidence {
  factors: EvidenceFactor[];
  metrics: Record<string, unknown>;
  timeWindow?: { start: string; end: string };
  explanations: string[];
}

export interface Alert {
  id: string;
  teamId: string;
  type: "workload_imbalance" | "deadline_risk" | "communication_risk" | "drift";
  status: "open" | "resolved" | "dismissed" | "snoozed";
  score: number;         // 0–1
  severity: "low" | "med" | "high";
  confidence: number;   // 0–1
  evidenceJsonb: AlertEvidence | null;
  dedupeKey: string;
  snoozeUntil: string | null;
  cooldownUntil: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface TeamSignals {
  teamId: string;
  computedAt: string;
  workloadImbalance: number;  // 0–1
  deadlineRisk: number;       // 0–1
  communicationRisk: number;  // 0–1
  drift: number;              // 0–1
  supportingMetricsJsonb: Record<string, unknown> | null;
  evidencePreviewJsonb: Record<string, unknown> | null;
}

// ── Ask Pact response (Appendix A2) ─────────────────────────────────────────

export interface AskPactCitation {
  rubricChunkId: string;
  snippet: string;
}

export interface AskPactResponse {
  interventionText: string;
  actions: string[];
  evidenceBullets: string[];
  citations: AskPactCitation[];
  confidence: number;
  limits: string[];
}

// ── Rubric / RAG ─────────────────────────────────────────────────────────────

export interface RubricSource {
  id: string;
  kind: "rubric" | "policy" | "assignment_brief";
  sourceType: "paste" | "upload" | "url";
  filename: string | null;
  indexStatus: "pending" | "processing" | "done" | "error";
  indexError: string | null;
  createdAt: string;
  indexedAt: string | null;
}

// ── Standard error ───────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ── Request bodies ───────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  displayName: string;
}

export interface CreateTeamRequest {
  name: string;
  courseId?: string;
}

export interface CreateInviteRequest {
  expiresInHours?: number;
  maxUses?: number;
}

export interface JoinTeamRequest {
  token: string;
}

export interface UpdateContractRequest {
  goalsText?: string;
  availabilityJsonb?: Record<string, unknown>;
  commsPrefsJsonb?: Record<string, unknown>;
  rolesJsonb?: Record<string, unknown>;
  escalationJsonb?: Record<string, unknown>;
}

export interface GenerateContractRequest {
  version: number;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  dueAt?: string;        // ISO datetime
  effortPoints?: number;
  priority?: "low" | "medium" | "high";
  assignees?: Array<{
    userId: string;
    role?: "owner" | "contributor";
    weight?: number;
  }>;
}

export interface PatchTaskRequest {
  title?: string;
  description?: string;
  status?: "todo" | "in_progress" | "done" | "blocked";
  priority?: "low" | "medium" | "high";
  dueAt?: string | null;
  effortPoints?: number;
}

export interface AddDependencyRequest {
  blockingTaskId: string;
  dependencyType?: "blocks" | "related";
  weight?: number;
}

export interface SendMessageRequest {
  body: string;
  replyToMessageId?: string;
}

export interface AlertActionRequest {
  action: "resolve" | "not_issue" | "snooze";
  snoozeUntil?: string;  // ISO datetime
  reason?: string;
  whatChanged?: string;
}

export interface AskPactRequest {
  question?: string;
  context?: string;
}

// ── Response wrappers ────────────────────────────────────────────────────────

export type LoginResponse = { user: User };
export type MeResponse = { user: User };
export type CreateTeamResponse = { team: Team };
export type ListTeamsResponse = { teams: Team[] };
export type CreateInviteResponse = { inviteUrl: string; token: string };
export type JoinTeamResponse = { teamMember: TeamMember; alreadyMember: boolean };
export type GetContractResponse = { contract: TeamContract | null };
export type UpdateContractResponse = { contract: TeamContract };
export type GenerateContractResponse = {
  generatedContractText: string;
  highlights: string[];
};
export type CreateTaskResponse = { task: Task };
export type ListTasksResponse = { tasks: Task[] };
export type PatchTaskResponse = { task: Task };
export type SendMessageResponse = { message: Message };
export type ListMessagesResponse = { messages: Message[]; nextCursor: string | null };
export type GetSignalsResponse = { teamSignals: TeamSignals | null };
export type ListAlertsResponse = { alerts: Alert[] };
export type AlertActionResponse = { alert: Alert };
export type ListRubricSourcesResponse = { rubricSources: RubricSource[] };
export type CreateRubricSourceResponse = {
  rubricSourceId: string;
  indexStatus: string;
};
