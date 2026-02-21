import "server-only";
import { db } from "@/db";
import {
  teamSignals,
  alerts,
  rubricChunks,
  rubricLinks,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

export interface AskPactResponse {
  interventionText: string;
  actions: string[];
  evidenceBullets: string[];
  citations: Array<{ rubricChunkId: string; snippet: string }>;
  confidence: number;
  limits: string[];
}

export async function buildIntervention(
  teamId: string,
  opts: { question?: string; context?: string }
): Promise<AskPactResponse> {
  // 1. Fetch graph snapshot
  const [signals] = await db
    .select()
    .from(teamSignals)
    .where(eq(teamSignals.teamId, teamId))
    .limit(1);

  const openAlerts = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.teamId, teamId), eq(alerts.status, "open")))
    .orderBy(desc(alerts.score))
    .limit(5);

  // 2. Build query for RAG retrieval
  const queryText = buildQueryText(signals, openAlerts, opts.question);

  // 3. Retrieve rubric chunks via cosine similarity
  const chunks = await retrieveRelevantChunks(teamId, queryText);

  // 4. Build prompt + call LLM
  const graphSnapshot = buildGraphSnapshot(signals, openAlerts);
  const chunksContext = formatChunks(chunks);

  const systemPrompt = `You are GroupCoPilot, a neutral AI collaboration facilitator for student project teams.
Your job is to generate supportive, non-accusatory check-ins grounded strictly in evidence.

RULES (non-negotiable):
- Output ONLY valid JSON matching the schema below.
- Base claims ONLY on: (a) the graph snapshot provided, (b) the rubric chunks provided.
- Cite rubric chunks using ONLY the chunk IDs given — never invent IDs.
- Never accuse, blame, or single out individuals. Language must be neutral and invitational.
- If evidence is insufficient, list it in "limits" — never guess or hallucinate.
- "interventionText" must be a check-in question or neutral observation, not a directive.

OUTPUT SCHEMA:
{
  "interventionText": "string — neutral check-in or observation",
  "actions": ["string — concrete, team-level next step"],
  "evidenceBullets": ["string — specific claim with entity/metric reference"],
  "citations": [{"rubricChunkId": "uuid", "snippet": "short quote from chunk"}],
  "confidence": 0.0-1.0,
  "limits": ["string — what evidence is missing or uncertain"]
}`;

  const userPrompt = `GRAPH SNAPSHOT:
${graphSnapshot}

RUBRIC/POLICY CHUNKS:
${chunksContext}

USER QUESTION (optional): ${opts.question ?? "Generate a proactive check-in based on current team state."}

Generate the JSON intervention response.`;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-preview",
      systemInstruction: systemPrompt,
      generationConfig: { responseMimeType: "application/json" },
    });

    const result = await model.generateContent(userPrompt);
    const raw = result.response.text();
    const parsed = parseInterventionResponse(raw, chunks);

    // Store rubric citations
    if (parsed.citations.length > 0) {
      const { v4: uuidv4 } = await import("uuid");
      const askPactId = uuidv4(); // ephemeral artifact ID for this response
      await db
        .insert(rubricLinks)
        .values(
          parsed.citations.map((c) => ({
            teamId,
            artifactType: "ask_pact_response" as const,
            artifactId: askPactId,
            rubricChunkId: c.rubricChunkId,
            linkType: "retrieved" as const,
          }))
        )
        .onConflictDoNothing();
    }

    return parsed;
  } catch {
    // Graceful degradation: return limited response
    return {
      interventionText:
        "I wasn't able to generate a grounded intervention right now. Please try again.",
      actions: [],
      evidenceBullets: [],
      citations: [],
      confidence: 0,
      limits: [
        "LLM generation failed",
        "No rubric chunks retrieved" +
          (chunks.length === 0 ? " — upload rubric documents first" : ""),
      ],
    };
  }
}

async function retrieveRelevantChunks(
  teamId: string,
  queryText: string,
  topK = 8
): Promise<Array<{ id: string; chunkText: string; rubricSourceId: string }>> {
  if (!process.env.GEMINI_API_KEY) return [];

  try {
    const embModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const embeddingRes = await embModel.embedContent({
      content: { parts: [{ text: queryText }], role: "user" },
      taskType: TaskType.RETRIEVAL_QUERY,
    } as Parameters<typeof embModel.embedContent>[0]);
    const queryVec = embeddingRes.embedding.values;
    const vecStr = `[${queryVec.join(",")}]`;

    // Raw SQL for cosine similarity — Drizzle doesn't support pgvector ops natively
    const rows = await db.execute(
      sql`
        SELECT id, chunk_text, rubric_source_id,
               1 - (embedding <=> ${vecStr}::vector) AS similarity
        FROM rubric_chunks
        WHERE team_id = ${teamId}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vecStr}::vector
        LIMIT ${topK}
      `
    );

    return (rows.rows as Array<{
      id: string;
      chunk_text: string;
      rubric_source_id: string;
    }>).map((r) => ({
      id: r.id,
      chunkText: r.chunk_text,
      rubricSourceId: r.rubric_source_id,
    }));
  } catch {
    return [];
  }
}

function buildGraphSnapshot(
  signals: typeof teamSignals.$inferSelect | undefined,
  openAlerts: (typeof alerts.$inferSelect)[]
): string {
  if (!signals) {
    return "No signal data available yet. Team may not have tasks or messages.";
  }

  const lines = [
    `Workload imbalance: ${(parseFloat(signals.workloadImbalance) * 100).toFixed(0)}%`,
    `Deadline risk: ${(parseFloat(signals.deadlineRisk) * 100).toFixed(0)}%`,
    `Communication risk: ${(parseFloat(signals.communicationRisk) * 100).toFixed(0)}%`,
    `Goal drift: ${(parseFloat(signals.drift) * 100).toFixed(0)}%`,
    `Computed at: ${signals.computedAt.toISOString()}`,
  ];

  if (openAlerts.length > 0) {
    lines.push("\nOpen alerts:");
    for (const alert of openAlerts) {
      lines.push(
        `  - [${alert.type}] severity=${alert.severity} score=${alert.score.toFixed(2)} confidence=${alert.confidence.toFixed(2)}`
      );
    }
  }

  if (signals.evidencePreviewJsonb) {
    lines.push(`\nEvidence preview: ${JSON.stringify(signals.evidencePreviewJsonb)}`);
  }

  return lines.join("\n");
}

function buildQueryText(
  signals: typeof teamSignals.$inferSelect | undefined,
  openAlerts: (typeof alerts.$inferSelect)[],
  question?: string
): string {
  const parts: string[] = [];
  if (question) parts.push(question);
  if (openAlerts.length > 0) {
    parts.push(openAlerts.map((a) => a.type).join(", "));
  }
  if (signals) {
    const maxSignal = Math.max(
      parseFloat(signals.workloadImbalance),
      parseFloat(signals.deadlineRisk),
      parseFloat(signals.communicationRisk),
      parseFloat(signals.drift)
    );
    if (maxSignal > 0.4) parts.push("team collaboration risk management");
  }
  parts.push("student group project expectations rubric");
  return parts.join(". ");
}

function formatChunks(
  chunks: Array<{ id: string; chunkText: string; rubricSourceId: string }>
): string {
  if (chunks.length === 0) return "No rubric/policy documents have been indexed yet.";
  return chunks
    .map(
      (c, i) =>
        `[CHUNK ${i + 1}] ID: ${c.id}\n${c.chunkText.slice(0, 600)}${c.chunkText.length > 600 ? "..." : ""}`
    )
    .join("\n\n---\n\n");
}

function parseInterventionResponse(
  raw: string,
  availableChunks: Array<{ id: string; chunkText: string }>
): AskPactResponse {
  try {
    const parsed = JSON.parse(raw);
    const validChunkIds = new Set(availableChunks.map((c) => c.id));

    // Filter citations to only those from provided chunks (anti-hallucination)
    const citations = (parsed.citations ?? [])
      .filter((c: { rubricChunkId: string }) => validChunkIds.has(c.rubricChunkId))
      .slice(0, 5);

    return {
      interventionText: String(parsed.interventionText ?? ""),
      actions: (parsed.actions ?? []).slice(0, 5).map(String),
      evidenceBullets: (parsed.evidenceBullets ?? []).slice(0, 6).map(String),
      citations,
      confidence: Math.min(1, Math.max(0, parseFloat(parsed.confidence ?? 0))),
      limits: (parsed.limits ?? []).slice(0, 5).map(String),
    };
  } catch {
    return {
      interventionText: raw.slice(0, 300),
      actions: [],
      evidenceBullets: [],
      citations: [],
      confidence: 0,
      limits: ["Failed to parse LLM response as JSON"],
    };
  }
}
