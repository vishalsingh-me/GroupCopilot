import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  primaryKey,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { teamMemberRoleEnum } from "./enums";
import { customType } from "drizzle-orm/pg-core";

// vector type for goal embeddings
const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value.slice(1, -1).split(",").map(Number);
  },
});

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  courseId: text("course_id"),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const teamInviteTokens = pgTable("team_invite_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  maxUses: integer("max_uses"),
  useCount: integer("use_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: teamMemberRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.teamId, t.userId] }),
  })
);

export const teamContracts = pgTable("team_contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  // wizard fields
  goalsText: text("goals_text"),
  availabilityJsonb: jsonb("availability_jsonb"),
  commsPrefsJsonb: jsonb("comms_prefs_jsonb"),
  rolesJsonb: jsonb("roles_jsonb"),
  escalationJsonb: jsonb("escalation_jsonb"),
  // generated
  generatedContractText: text("generated_contract_text"),
  goalEmbedding: vector("goal_embedding", { dimensions: 1536 }),
  modelMetaJsonb: jsonb("model_meta_jsonb"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const teamThresholds = pgTable(
  "team_thresholds",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    alertType: text("alert_type").notNull(),
    thresholdLow: text("threshold_low").notNull().default("0.3"),
    thresholdMed: text("threshold_med").notNull().default("0.55"),
    thresholdHigh: text("threshold_high").notNull().default("0.75"),
    cooldownDays: integer("cooldown_days").notNull().default(3),
    snoozeDefaultHours: integer("snooze_default_hours").notNull().default(48),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.teamId, t.alertType] }),
  })
);

export const teamSignals = pgTable("team_signals", {
  teamId: uuid("team_id")
    .primaryKey()
    .references(() => teams.id, { onDelete: "cascade" }),
  computedAt: timestamp("computed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  workloadImbalance: text("workload_imbalance").notNull().default("0"),
  deadlineRisk: text("deadline_risk").notNull().default("0"),
  communicationRisk: text("communication_risk").notNull().default("0"),
  drift: text("drift").notNull().default("0"),
  supportingMetricsJsonb: jsonb("supporting_metrics_jsonb"),
  evidencePreviewJsonb: jsonb("evidence_preview_jsonb"),
});
