-- Enable pgvector extension (must run before vector columns are used)
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint

CREATE TYPE "public"."alert_feedback_action" AS ENUM('resolve', 'not_issue', 'snooze');--> statement-breakpoint
CREATE TYPE "public"."alert_severity" AS ENUM('low', 'med', 'high');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('open', 'resolved', 'dismissed', 'snoozed');--> statement-breakpoint
CREATE TYPE "public"."alert_type" AS ENUM('workload_imbalance', 'deadline_risk', 'communication_risk', 'drift');--> statement-breakpoint
CREATE TYPE "public"."artifact_type" AS ENUM('task', 'document', 'message', 'alert', 'team_contract', 'ask_pact_response');--> statement-breakpoint
CREATE TYPE "public"."assignment_role" AS ENUM('owner', 'contributor');--> statement-breakpoint
CREATE TYPE "public"."dependency_type" AS ENUM('blocks', 'related');--> statement-breakpoint
CREATE TYPE "public"."doc_edit_kind" AS ENUM('create', 'edit', 'delete');--> statement-breakpoint
CREATE TYPE "public"."doc_kind" AS ENUM('assignment_brief', 'rubric', 'policy', 'team_notes', 'other');--> statement-breakpoint
CREATE TYPE "public"."rubric_index_status" AS ENUM('pending', 'processing', 'done', 'error');--> statement-breakpoint
CREATE TYPE "public"."rubric_link_type" AS ENUM('retrieved', 'user_pinned', 'auto');--> statement-breakpoint
CREATE TYPE "public"."rubric_source_kind" AS ENUM('rubric', 'policy', 'assignment_brief');--> statement-breakpoint
CREATE TYPE "public"."rubric_source_type" AS ENUM('paste', 'upload', 'url');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'done', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."team_member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "team_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"goals_text" text,
	"availability_jsonb" jsonb,
	"comms_prefs_jsonb" jsonb,
	"roles_jsonb" jsonb,
	"escalation_jsonb" jsonb,
	"generated_contract_text" text,
	"goal_embedding" vector(1536),
	"model_meta_jsonb" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_invite_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_invite_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "team_member_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_by_user_id" uuid,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "team_signals" (
	"team_id" uuid PRIMARY KEY NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workload_imbalance" text DEFAULT '0' NOT NULL,
	"deadline_risk" text DEFAULT '0' NOT NULL,
	"communication_risk" text DEFAULT '0' NOT NULL,
	"drift" text DEFAULT '0' NOT NULL,
	"supporting_metrics_jsonb" jsonb,
	"evidence_preview_jsonb" jsonb
);
--> statement-breakpoint
CREATE TABLE "team_thresholds" (
	"team_id" uuid NOT NULL,
	"alert_type" text NOT NULL,
	"threshold_low" text DEFAULT '0.3' NOT NULL,
	"threshold_med" text DEFAULT '0.55' NOT NULL,
	"threshold_high" text DEFAULT '0.75' NOT NULL,
	"cooldown_days" integer DEFAULT 3 NOT NULL,
	"snooze_default_hours" integer DEFAULT 48 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_thresholds_team_id_alert_type_pk" PRIMARY KEY("team_id","alert_type")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"course_id" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_assignments" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assignment_role" "assignment_role" DEFAULT 'owner' NOT NULL,
	"weight" text DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_assignments_task_id_user_id_assignment_role_pk" PRIMARY KEY("task_id","user_id","assignment_role")
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"blocking_task_id" uuid NOT NULL,
	"blocked_task_id" uuid NOT NULL,
	"dependency_type" "dependency_type" DEFAULT 'blocks' NOT NULL,
	"weight" text DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"effort_points" integer DEFAULT 1 NOT NULL,
	"due_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"task_embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"parent_message_id" uuid NOT NULL,
	"reply_message_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"sentiment_score" real,
	"negativity_score" real,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" text DEFAULT 'afinn' NOT NULL,
	"meta_jsonb" jsonb,
	CONSTRAINT "message_signals_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "doc_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"editor_user_id" uuid NOT NULL,
	"edit_kind" "doc_edit_kind" DEFAULT 'edit' NOT NULL,
	"diff_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "doc_kind" DEFAULT 'other' NOT NULL,
	"body_text" text,
	"summary_text" text,
	"doc_embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubric_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"rubric_source_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"embedding" vector(1536),
	"meta_jsonb" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubric_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"artifact_type" "artifact_type" NOT NULL,
	"artifact_id" uuid NOT NULL,
	"rubric_chunk_id" uuid NOT NULL,
	"link_type" "rubric_link_type" DEFAULT 'retrieved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubric_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"kind" "rubric_source_kind" DEFAULT 'rubric' NOT NULL,
	"source_type" "rubric_source_type" DEFAULT 'paste' NOT NULL,
	"filename" text,
	"mime_type" text,
	"raw_text" text NOT NULL,
	"index_status" "rubric_index_status" DEFAULT 'pending' NOT NULL,
	"index_error" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"indexed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "alert_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action" "alert_feedback_action" NOT NULL,
	"reason" text,
	"what_changed" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"type" "alert_type" NOT NULL,
	"status" "alert_status" DEFAULT 'open' NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"severity" "alert_severity" DEFAULT 'low' NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"evidence_jsonb" jsonb,
	"dedupe_key" text NOT NULL,
	"snooze_until" timestamp with time zone,
	"cooldown_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_contracts" ADD CONSTRAINT "team_contracts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invite_tokens" ADD CONSTRAINT "team_invite_tokens_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invite_tokens" ADD CONSTRAINT "team_invite_tokens_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_signals" ADD CONSTRAINT "team_signals_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_thresholds" ADD CONSTRAINT "team_thresholds_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_blocking_task_id_tasks_id_fk" FOREIGN KEY ("blocking_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_blocked_task_id_tasks_id_fk" FOREIGN KEY ("blocked_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_replies" ADD CONSTRAINT "message_replies_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_replies" ADD CONSTRAINT "message_replies_parent_message_id_messages_id_fk" FOREIGN KEY ("parent_message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_replies" ADD CONSTRAINT "message_replies_reply_message_id_messages_id_fk" FOREIGN KEY ("reply_message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_signals" ADD CONSTRAINT "message_signals_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_signals" ADD CONSTRAINT "message_signals_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_edits" ADD CONSTRAINT "doc_edits_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_edits" ADD CONSTRAINT "doc_edits_editor_user_id_users_id_fk" FOREIGN KEY ("editor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_chunks" ADD CONSTRAINT "rubric_chunks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_chunks" ADD CONSTRAINT "rubric_chunks_rubric_source_id_rubric_sources_id_fk" FOREIGN KEY ("rubric_source_id") REFERENCES "public"."rubric_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_links" ADD CONSTRAINT "rubric_links_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_links" ADD CONSTRAINT "rubric_links_rubric_chunk_id_rubric_chunks_id_fk" FOREIGN KEY ("rubric_chunk_id") REFERENCES "public"."rubric_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_sources" ADD CONSTRAINT "rubric_sources_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_sources" ADD CONSTRAINT "rubric_sources_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_feedback" ADD CONSTRAINT "alert_feedback_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_feedback" ADD CONSTRAINT "alert_feedback_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_feedback" ADD CONSTRAINT "alert_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_dep_uniq_idx" ON "task_dependencies" USING btree ("blocking_task_id","blocked_task_id");--> statement-breakpoint
CREATE INDEX "tasks_team_status_idx" ON "tasks" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "tasks_team_due_at_idx" ON "tasks" USING btree ("team_id","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "msg_reply_uniq_idx" ON "message_replies" USING btree ("parent_message_id","reply_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rubric_chunks_src_idx_uniq" ON "rubric_chunks" USING btree ("rubric_source_id","chunk_index");--> statement-breakpoint
CREATE INDEX "rubric_chunks_team_idx" ON "rubric_chunks" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "rubric_links_artifact_idx" ON "rubric_links" USING btree ("artifact_type","artifact_id");--> statement-breakpoint
CREATE INDEX "rubric_links_chunk_idx" ON "rubric_links" USING btree ("rubric_chunk_id");--> statement-breakpoint
CREATE INDEX "alerts_team_status_idx" ON "alerts" USING btree ("team_id","status","created_at");--> statement-breakpoint
CREATE INDEX "alerts_team_type_idx" ON "alerts" USING btree ("team_id","type","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_dedupe_idx" ON "alerts" USING btree ("team_id","type","dedupe_key");--> statement-breakpoint
-- HNSW vector similarity index for rubric chunks (cosine ops)
-- Requires pgvector 0.5+ (included in pgvector/pgvector:pg16 image)
CREATE INDEX IF NOT EXISTS "rubric_chunks_embedding_hnsw_idx" ON "rubric_chunks" USING hnsw ("embedding" vector_cosine_ops);
