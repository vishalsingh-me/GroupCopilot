import {
  pgTable,
  uuid,
  text,
  timestamp,
  real,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { teams } from "./teams";
import {
  alertTypeEnum,
  alertStatusEnum,
  alertSeverityEnum,
  alertFeedbackActionEnum,
} from "./enums";

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    type: alertTypeEnum("type").notNull(),
    status: alertStatusEnum("status").notNull().default("open"),
    score: real("score").notNull().default(0),
    severity: alertSeverityEnum("severity").notNull().default("low"),
    confidence: real("confidence").notNull().default(0),
    evidenceJsonb: jsonb("evidence_jsonb"),
    dedupeKey: text("dedupe_key").notNull(),
    snoozeUntil: timestamp("snooze_until", { withTimezone: true }),
    cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => ({
    teamStatusIdx: index("alerts_team_status_idx").on(
      t.teamId,
      t.status,
      t.createdAt
    ),
    teamTypeIdx: index("alerts_team_type_idx").on(
      t.teamId,
      t.type,
      t.updatedAt
    ),
    // One alert per (team, type, dedupeKey) — open/closed distinction enforced at application layer
    dedupeIdx: uniqueIndex("alerts_dedupe_idx").on(
      t.teamId,
      t.type,
      t.dedupeKey
    ),
  })
);

export const alertFeedback = pgTable("alert_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  alertId: uuid("alert_id")
    .notNull()
    .references(() => alerts.id, { onDelete: "cascade" }),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  action: alertFeedbackActionEnum("action").notNull(),
  reason: text("reason"),
  whatChanged: text("what_changed"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
