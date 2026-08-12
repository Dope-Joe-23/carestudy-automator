import { Router, type IRouter, type Request, type Response } from "express";
import { getStudyStore, type StudyFileRow, type StudyStore } from "@workspace/db";
import { draftWorker } from "../lib/draftWorker";
import {
  removeStudyArtifacts,
  removeUploadFile,
  storeUpload,
  UploadError,
} from "../lib/uploads";

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

// POST /api/studies/:id/files — validate, store, and index an uploaded
// clinical document. Body: { filename, content } where content is base64.
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
      const rows = await db.listFiles(studyId);
      const paths = rows.map((r) => r.storedPath);
      const { files: results } = await draftWorker.ingest(studyId, paths);
      const byPath = new Map(results.map((r) => [r.path, r]));
      for (const file of rows) {
        const result = byPath.get(file.storedPath);
        if (!result) continue;
        const status = result.error ? "error" : "ready";
        await db.setFileStatus(file.id, status, result.error ?? null);
      }
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

// DELETE /api/studies/:id/files/:fileId — remove an upload (disk + row) and
// rebuild the study index without it.
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
    await removeUploadFile(row.storedPath);
    await db.removeFile(fileId);

    try {
      const remaining = await db.listFiles(studyId);
      await draftWorker.ingest(studyId, remaining.map((r) => r.storedPath));
    } catch (err) {
      req.log?.error?.({ err }, "re-index after file delete failed");
    }
    res.status(204).end();
  }),
);

export default router;
