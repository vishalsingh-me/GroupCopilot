import type PgBoss from "pg-boss";
import { db } from "@/db";
import { rubricSources, rubricChunks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const TARGET_CHUNK_TOKENS = 900;
const OVERLAP_TOKENS = 150;
const CHARS_PER_TOKEN = 4; // rough estimate

export async function handleIndexRubricSource(
  jobs: PgBoss.Job<{ rubricSourceId: string }>[]
) {
  for (const job of jobs) {
    const { rubricSourceId } = job.data;
    console.log(`[index_rubric_source] Processing ${rubricSourceId}`);

    try {
      // Mark as processing
      await db
        .update(rubricSources)
        .set({ indexStatus: "processing" })
        .where(eq(rubricSources.id, rubricSourceId));

      const [source] = await db
        .select()
        .from(rubricSources)
        .where(eq(rubricSources.id, rubricSourceId))
        .limit(1);

      if (!source) throw new Error(`Rubric source ${rubricSourceId} not found`);

      // Delete existing chunks (re-index is idempotent)
      await db
        .delete(rubricChunks)
        .where(eq(rubricChunks.rubricSourceId, rubricSourceId));

      const chunks = chunkText(source.rawText);
      console.log(
        `[index_rubric_source] ${chunks.length} chunks from source ${rubricSourceId}`
      );

      // Embed in batches of 20
      const BATCH_SIZE = 20;
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);

        const embModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const embeddingRes = await embModel.batchEmbedContents({
          requests: batch.map((c) => ({
            content: { parts: [{ text: c.text }], role: "user" },
            taskType: TaskType.RETRIEVAL_DOCUMENT,
          })),
        });

        const values = batch.map((chunk, j) => ({
          teamId: source.teamId,
          rubricSourceId,
          chunkIndex: i + j,
          chunkText: chunk.text,
          tokenCount: chunk.estimatedTokens,
          embedding: embeddingRes.embeddings[j].values,
          metaJsonb: chunk.meta,
        }));

        await db.insert(rubricChunks).values(values).onConflictDoNothing();
      }

      await db
        .update(rubricSources)
        .set({ indexStatus: "done", indexedAt: new Date(), indexError: null })
        .where(eq(rubricSources.id, rubricSourceId));

      console.log(`[index_rubric_source] Done: ${rubricSourceId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[index_rubric_source] Error for ${rubricSourceId}:`, message);

      await db
        .update(rubricSources)
        .set({ indexStatus: "error", indexError: message })
        .where(eq(rubricSources.id, rubricSourceId));

      throw err; // pg-boss will retry
    }
  }
}

interface Chunk {
  text: string;
  estimatedTokens: number;
  meta: { sectionHeading?: string };
}

function chunkText(text: string): Chunk[] {
  const targetChars = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN;
  const overlapChars = OVERLAP_TOKENS * CHARS_PER_TOKEN;

  // Split on headings first, then paragraphs
  const sections = text.split(/\n(?=#{1,3}\s)/);
  const chunks: Chunk[] = [];
  let buffer = "";
  let currentHeading = "";

  for (const section of sections) {
    const headingMatch = section.match(/^(#{1,3}\s.+)\n/);
    if (headingMatch) {
      currentHeading = headingMatch[1].replace(/^#+\s*/, "").trim();
    }

    const paragraphs = section.split(/\n\n+/);

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      if ((buffer + "\n\n" + trimmed).length > targetChars && buffer.length > 0) {
        // Flush current buffer
        chunks.push({
          text: buffer.trim(),
          estimatedTokens: Math.ceil(buffer.length / CHARS_PER_TOKEN),
          meta: { sectionHeading: currentHeading || undefined },
        });

        // Overlap: keep last overlapChars of buffer
        buffer =
          buffer.length > overlapChars
            ? buffer.slice(buffer.length - overlapChars)
            : buffer;
      }

      buffer = buffer ? buffer + "\n\n" + trimmed : trimmed;
    }
  }

  if (buffer.trim()) {
    chunks.push({
      text: buffer.trim(),
      estimatedTokens: Math.ceil(buffer.length / CHARS_PER_TOKEN),
      meta: { sectionHeading: currentHeading || undefined },
    });
  }

  return chunks;
}
