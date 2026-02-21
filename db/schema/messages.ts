import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  real,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { teams } from "./teams";

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
});

export const messageReplies = pgTable(
  "message_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    parentMessageId: uuid("parent_message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    replyMessageId: uuid("reply_message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("msg_reply_uniq_idx").on(
      t.parentMessageId,
      t.replyMessageId
    ),
  })
);

export const messageSignals = pgTable("message_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  messageId: uuid("message_id")
    .notNull()
    .unique()
    .references(() => messages.id, { onDelete: "cascade" }),
  sentimentScore: real("sentiment_score"),
  negativityScore: real("negativity_score"),
  computedAt: timestamp("computed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  method: text("method").notNull().default("afinn"),
  metaJsonb: jsonb("meta_jsonb"),
});
