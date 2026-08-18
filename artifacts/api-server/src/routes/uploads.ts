import { Router, type IRouter, type Request, type Response } from "express";
import path from "node:path";
import { getStudyStore, type StudyFileRow, type StudyStore } from "@workspace/db";
import { draftWorker } from "../lib/draftWorker";
import {
  detectUploadType,
  materializeStored,
  MAX_R2_UPLOAD_BYTES,
  readFileHead,
  removeStoredFile,
  r2UploadMode,
  sanitizeFilename,
  storeUpload,
  studyObjectKey,
  UploadError,
} from "../lib/uploads";
import { createPresignedPutUrl, headObject, R2_KEY_PREFIX } from "../lib/r2";

const router: IRouter = Router();

// Same lazy store + error-wrapping pattern as routes/studies.ts.
let store: StudyStore | null = null;
let storageUnavailable: string | null = null;

function studyStore(): StudyStore {
  if (storageUnavailable) throw new Error(storageUnavailable);
  if (store) return store;
  try {
    store = getStudyStore();
    return store;
  } catch (err) {
    storageUnavailable = `Study storage failed to initialize: ${
      err instanceof Error ? err.message : "unknown error"
    }`;
    throw new Error(storageUnavailable);
  }
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    handler(req, res).catch((err) => {
      req.log?.error?.({ err }, "upload request failed");
      const status = err instanceof UploadError ? err.status : 500;
      const message =
        err instanceof Error ? err.message : "Unexpected upload error";
      res.status(status).json({ error: message });
    });
  };
}

function parseId(raw: string | string[] | undefined): number | null {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** Decode the client's base64 payload; null when it isn't valid base64. */
function decodeBase64(raw: unknown): Buffer | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const buf = Buffer.from(raw, "base64");
    // Round-trip so garbage like "not base64!!" can't slip through as empty.
    if (buf.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) return null;
    return buf;
  } catch {
    return null;
  }
}

/** Public shape sent to the client (never exposes the on-disk path). */
function publicFile(row: StudyFileRow) {
  return {
    id: row.id,
    filename: row.filename,
    kind: row.kind,
    mime: row.mime,
    size: row.size,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

/** A safe object-key extension derived from the display filename. */
function extFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace(/^\./, "");
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "bin";
}

/**
 * Extract text from every upload (materializing R2 objects to the local
 * cache first) and rebuild the study's retrieval index. Marks each file
 * ready/error from the per-file results.
 */
export async function indexStudyFiles(studyId: number): Promise<void> {
  const db = studyStore();
  const rows = await db.listFiles(studyId);
  const materialized = await Promise.all(
    rows.map(async (row) => ({ row, local: await materializeStored(row.storedPath) })),
  );
  const { files: results } = await draftWorker.ingest(
    studyId,
    materialized.map((m) => m.local),
  );
  const byPath = new Map(results.map((r) => [r.path, r]));
  for (const { row, local } of materialized) {
    const result = byPath.get(local);
    if (!result) continue;
    const status = result.error ? "error" : "ready";
    await db.setFileStatus(row.id, status, result.error ?? null);
  }
}

// GET /api/uploads/config — which storage backend is active, so the client
// knows whether to upload directly to the bucket or fall back to base64 JSON.
router.get(
  "/uploads/config",
  asyncRoute(async (_req, res) => {
    res.json({ mode: r2UploadMode() });
  }),
);

// POST /api/studies/:id/files/presign — hand the client a direct-to-bucket
// upload URL so large files never pass through the API server's request body.
router.post(
  "/studies/:id/files/presign",
  asyncRoute(async (req, res) => {
    const studyId = parseId(req.params.id);
    if (!studyId) {
      res.status(400).json({ error: "Invalid study id" });
      return;
    }
    if (!(await studyStore().get(studyId))) {
      res.status(404).json({ error: "Study not found" });
      return;
    }
    if (r2UploadMode() !== "r2") {
      res.status(501).json({
        error: "Direct uploads are not enabled on this server — R2 storage is not configured.",
      });
      return;
    }
    const filename = sanitizeFilename(req.body?.filename);
    const size = Number(req.body?.size);
    if (!Number.isFinite(size) || size <= 0) {
      res.status(400).json({ error: "A valid file size is required" });
      return;
    }
    if (size > MAX_R2_UPLOAD_BYTES) {
      res.status(413).json({
        error: `File is too large (max ${Math.round(MAX_R2_UPLOAD_BYTES / 1024 / 1024)} MB).`,
      });
      return;
    }
    const contentType =
      typeof req.body?.contentType === "string" && req.body.contentType
        ? req.body.contentType
        : "application/octet-stream";
    const objectKey = studyObjectKey(studyId, extFromFilename(filename));
    const uploadUrl = await createPresignedPutUrl(objectKey, contentType);
    res.json({ uploadUrl, objectKey, expiresIn: 15 * 60, mode: "r2" });
  }),
);

// POST /api/studies/:id/files/complete — the browser has PUT the bytes to the
// bucket; verify, register, and index the upload.
router.post(
  "/studies/:id/files/complete",
  asyncRoute(async (req, res) => {
    const studyId = parseId(req.params.id);
    if (!studyId) {
      res.status(400).json({ error: "Invalid study id" });
      return;
    }
    if (!(await studyStore().get(studyId))) {
      res.status(404).json({ error: "Study not found" });
      return;
    }
    const objectKey = typeof req.body?.objectKey === "string" ? req.body.objectKey : "";
    const filename = sanitizeFilename(req.body?.filename);
    // Object keys are scoped per study so one upload can't attach to another's.
    if (!objectKey || !objectKey.startsWith(`uploads/${studyId}/`)) {
      res.status(400).json({ error: "Invalid upload reference" });
      return;
    }
    const storedPath = R2_KEY_PREFIX + objectKey;
    const { exists, size } = await headObject(objectKey);
    if (!exists) {
      res.status(404).json({
        error: "The file was not found in storage — please upload it again.",
      });
      return;
    }
    if (size !== null && size > MAX_R2_UPLOAD_BYTES) {
      await removeStoredFile(storedPath);
      res.status(413).json({
        error: `File is too large (max ${Math.round(MAX_R2_UPLOAD_BYTES / 1024 / 1024)} MB).`,
      });
      return;
    }

    // Validate by magic bytes (not extension) before registering the upload.
    const local = await materializeStored(storedPath);
    const head = await readFileHead(local);
    const detected = detectUploadType(head, filename);
    if (!detected) {
      await removeStoredFile(storedPath);
      throw new UploadError(
        415,
        "Unsupported file type — upload a PDF, Word (.docx), EPUB ebook, Markdown, or plain text document only.",
      );
    }

    const db = studyStore();
    const row = await db.addFile({
      studyId,
      filename,
      storedPath,
      mime: detected.mime,
      size: size ?? head.length,
      status: "indexing",
    });

    try {
      await indexStudyFiles(studyId);
    } catch (err) {
      req.log?.error?.({ err }, "document indexing failed");
      await db.setFileStatus(
        row.id,
        "error",
        "Indexing failed — the document was stored but could not be processed.",
      );
    }

    const updated = await db.getFile(row.id);
    res.status(201).json({ file: updated ? publicFile(updated) : publicFile(row) });
  }),
);

// POST /api/studies/:id/files — validate, store, and index an uploaded
// clinical document. Body: { filename, content } where content is base64.
// Used when R2 is not configured (local-disk fallback); with R2 active the
// client uploads directly to the bucket instead (presign + complete).
router.post(
  "/studies/:id/files",
  asyncRoute(async (req, res) => {
    const studyId = parseId(req.params.id);
    if (!studyId) {
      res.status(400).json({ error: "Invalid study id" });
      return;
    }
    const existing = await studyStore().get(studyId);
    if (!existing) {
      res.status(404).json({ error: "Study not found" });
      return;
    }

    const content = decodeBase64(req.body?.content);
    if (!content) {
      res.status(400).json({ error: "A base64 file payload is required" });
      return;
    }

    const stored = await storeUpload(studyId, content, req.body?.filename);
    const db = studyStore();
    const row = await db.addFile({
      studyId,
      filename: stored.filename,
      storedPath: stored.storedPath,
      mime: stored.mime,
      size: stored.size,
      status: "indexing",
    });

    // Extract text from every upload and rebuild the study's retrieval index.
    try {
      await indexStudyFiles(studyId);
    } catch (err) {
      req.log?.error?.({ err }, "document indexing failed");
      await db.setFileStatus(row.id, "error", "Indexing failed — the document was stored but could not be processed.");
    }

    const updated = await db.getFile(row.id);
    res.status(201).json({ file: updated ? publicFile(updated) : publicFile(row) });
  }),
);

// GET /api/studies/:id/files — the study's uploaded documents.
router.get(
  "/studies/:id/files",
  asyncRoute(async (req, res) => {
    const studyId = parseId(req.params.id);
    if (!studyId) {
      res.status(400).json({ error: "Invalid study id" });
      return;
    }
    const existing = await studyStore().get(studyId);
    if (!existing) {
      res.status(404).json({ error: "Study not found" });
      return;
    }
    const rows = await studyStore().listFiles(studyId);
    res.json({ files: rows.map(publicFile) });
  }),
);

// DELETE /api/studies/:id/files/:fileId — remove an upload (bucket/disk + row)
// and rebuild the study index without it.
router.delete(
  "/studies/:id/files/:fileId",
  asyncRoute(async (req, res) => {
    const studyId = parseId(req.params.id);
    const fileId = parseId(req.params.fileId);
    if (!studyId || !fileId) {
      res.status(400).json({ error: "Invalid study or file id" });
      return;
    }
    const db = studyStore();
    const row = await db.getFile(fileId);
    if (!row || row.studyId !== studyId) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    await removeStoredFile(row.storedPath);
    await db.removeFile(fileId);

    try {
      await indexStudyFiles(studyId);
    } catch (err) {
      req.log?.error?.({ err }, "re-index after file delete failed");
    }
    res.status(204).end();
  }),
);

export default router;
