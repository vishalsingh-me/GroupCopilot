import { pgEnum } from "drizzle-orm/pg-core";

export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "done",
  "blocked",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
]);

export const teamMemberRoleEnum = pgEnum("team_member_role", [
  "owner",
  "member",
]);

export const assignmentRoleEnum = pgEnum("assignment_role", [
  "owner",
  "contributor",
]);

export const dependencyTypeEnum = pgEnum("dependency_type", [
  "blocks",
  "related",
]);

export const alertTypeEnum = pgEnum("alert_type", [
  "workload_imbalance",
  "deadline_risk",
  "communication_risk",
  "drift",
]);

export const alertStatusEnum = pgEnum("alert_status", [
  "open",
  "resolved",
  "dismissed",
  "snoozed",
]);

export const alertSeverityEnum = pgEnum("alert_severity", [
  "low",
  "med",
  "high",
]);

export const alertFeedbackActionEnum = pgEnum("alert_feedback_action", [
  "resolve",
  "not_issue",
  "snooze",
]);

export const rubricSourceKindEnum = pgEnum("rubric_source_kind", [
  "rubric",
  "policy",
  "assignment_brief",
]);

export const rubricSourceTypeEnum = pgEnum("rubric_source_type", [
  "paste",
  "upload",
  "url",
]);

export const rubricIndexStatusEnum = pgEnum("rubric_index_status", [
  "pending",
  "processing",
  "done",
  "error",
]);

export const rubricLinkTypeEnum = pgEnum("rubric_link_type", [
  "retrieved",
  "user_pinned",
  "auto",
]);

export const artifactTypeEnum = pgEnum("artifact_type", [
  "task",
  "document",
  "message",
  "alert",
  "team_contract",
  "ask_pact_response",
]);

export const docKindEnum = pgEnum("doc_kind", [
  "assignment_brief",
  "rubric",
  "policy",
  "team_notes",
  "other",
]);

export const docEditKindEnum = pgEnum("doc_edit_kind", [
  "create",
  "edit",
  "delete",
]);
