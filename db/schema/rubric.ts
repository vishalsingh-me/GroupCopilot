import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { customType } from "drizzle-orm/pg-core";
import { users } from "./users";
import { teams } from "./teams";
import {
  rubricSourceKindEnum,
  rubricSourceTypeEnum,
  rubricIndexStatusEnum,
  rubricLinkTypeEnum,
  artifactTypeEnum,
} from "./enums";

// Shared vector custom type for rubric embeddings
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

export const rubricSources = pgTable("rubric_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  kind: rubricSourceKindEnum("kind").notNull().default("rubric"),
  sourceType: rubricSourceTypeEnum("source_type").notNull().default("paste"),
  filename: text("filename"),
  mimeType: text("mime_type"),
  rawText: text("raw_text").notNull(),
  indexStatus: rubricIndexStatusEnum("index_status")
    .notNull()
    .default("pending"),
  indexError: text("index_error"),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  indexedAt: timestamp("indexed_at", { withTimezone: true }),
});

export const rubricChunks = pgTable(
  "rubric_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    rubricSourceId: uuid("rubric_source_id")
      .notNull()
      .references(() => rubricSources.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    chunkText: text("chunk_text").notNull(),
    tokenCount: integer("token_count").notNull().default(0),
    // vector stored; HNSW index created via raw SQL migration
    embedding: vector("embedding", { dimensions: 1536 }),
    metaJsonb: jsonb("meta_jsonb"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("rubric_chunks_src_idx_uniq").on(
      t.rubricSourceId,
      t.chunkIndex
    ),
    teamIdx: index("rubric_chunks_team_idx").on(t.teamId),
  })
);

export const rubricLinks = pgTable(
  "rubric_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    artifactType: artifactTypeEnum("artifact_type").notNull(),
    // polymorphic; no FK — references any artifact table
    artifactId: uuid("artifact_id").notNull(),
    rubricChunkId: uuid("rubric_chunk_id")
      .notNull()
      .references(() => rubricChunks.id, { onDelete: "cascade" }),
    linkType: rubricLinkTypeEnum("link_type").notNull().default("retrieved"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    artifactIdx: index("rubric_links_artifact_idx").on(
      t.artifactType,
      t.artifactId
    ),
    chunkIdx: index("rubric_links_chunk_idx").on(t.rubricChunkId),
  })
);
