import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { rubricSources } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireUser, requireTeamMember } from "@/server/auth";
import { ok, err, handleRouteError } from "@/server/api";

const ALLOWED_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const PasteBody = z.object({
  kind: z.enum(["rubric", "policy", "assignment_brief"]).optional(),
  rawText: z.string().min(10).max(100_000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const user = await requireUser();
    await requireTeamMember(teamId, user.id);

    const contentType = req.headers.get("content-type") ?? "";

    let rawText: string;
    let filename: string | undefined;
    let mimeType: string | undefined;
    let sourceType: "paste" | "upload" = "paste";
    let kind: "rubric" | "policy" | "assignment_brief" = "rubric";

    if (contentType.includes("multipart/form-data")) {
      // File upload path
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return err("INVALID", "No file provided", 400);
      if (file.size > MAX_UPLOAD_BYTES) {
        return err("TOO_LARGE", "File exceeds 10 MB limit", 413);
      }
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return err("INVALID_TYPE", "File type not supported", 415);
      }

      rawText = await extractText(file);
      filename = file.name;
      mimeType = file.type;
      sourceType = "upload";
      kind = (formData.get("kind") as typeof kind) ?? "rubric";
    } else {
      // Paste path
      const body = PasteBody.parse(await req.json());
      rawText = body.rawText;
      kind = body.kind ?? "rubric";
    }

    const [source] = await db
      .insert(rubricSources)
      .values({
        teamId,
        kind,
        sourceType,
        filename,
        mimeType,
        rawText,
        indexStatus: "pending",
        createdByUserId: user.id,
      })
      .returning();

    // Enqueue indexing job
    const { enqueueJob } = await import("@/worker/client");
    await enqueueJob("index_rubric_source", {
      rubricSourceId: source.id,
    }).catch(() => {});

    return ok(
      { rubricSourceId: source.id, indexStatus: source.indexStatus },
      201
    );
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const user = await requireUser();
    await requireTeamMember(teamId, user.id);

    const rows = await db
      .select({
        id: rubricSources.id,
        kind: rubricSources.kind,
        sourceType: rubricSources.sourceType,
        filename: rubricSources.filename,
        indexStatus: rubricSources.indexStatus,
        indexError: rubricSources.indexError,
        createdAt: rubricSources.createdAt,
        indexedAt: rubricSources.indexedAt,
      })
      .from(rubricSources)
      .where(eq(rubricSources.teamId, teamId))
      .orderBy(desc(rubricSources.createdAt));

    return ok({ rubricSources: rows });
  } catch (e) {
    return handleRouteError(e);
  }
}

async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());

  if (
    file.type === "text/plain" ||
    file.type === "text/markdown"
  ) {
    return buffer.toString("utf-8");
  }

  if (file.type === "application/pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (
    file.type ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error("Unsupported file type");
}
