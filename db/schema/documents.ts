import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { customType } from "drizzle-orm/pg-core";
import { users } from "./users";
import { teams } from "./teams";
import { docKindEnum, docEditKindEnum } from "./enums";

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

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  kind: docKindEnum("kind").notNull().default("other"),
  bodyText: text("body_text"),
  summaryText: text("summary_text"),
  docEmbedding: vector("doc_embedding", { dimensions: 1536 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const docEdits = pgTable("doc_edits", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  editorUserId: uuid("editor_user_id")
    .notNull()
    .references(() => users.id),
  editKind: docEditKindEnum("edit_kind").notNull().default("edit"),
  diffSummary: text("diff_summary"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
