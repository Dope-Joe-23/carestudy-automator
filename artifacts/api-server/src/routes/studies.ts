import { Router, type IRouter, type Request, type Response } from "express";
import { getStudyStore, type StudyRow, type StudyStore } from "@workspace/db";
import { removeStoredFile, removeStudyArtifacts } from "../lib/uploads";

const router: IRouter = Router();

// The store is created lazily on the first request and cached. Init failures
// (unknown DB_DRIVER, or postgres without DATABASE_URL) are cached too, so we
// only log once per server run — a running server can't pick up new env anyway.
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

/** Wrap a handler so every storage error becomes a clean 5xx JSON response. */
function asyncRoute(
  handler: (req: Request, res: Response) => Promise<void>,
) {
  return (req: Request, res: Response) => {
    handler(req, res).catch((err) => {
      req.log?.error?.({ err }, "study storage request failed");
      const message = err instanceof Error ? err.message : "Storage error";
      const storageError = message.startsWith("Study storage");
      res.status(storageError ? 503 : 500).json({ error: message });
    });
  };
}

function parseId(raw: string | string[] | undefined): number | null {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** Minimal shape check for the client workspace snapshot. */
function isValidStudyData(data: unknown): data is { chapters: unknown[] } {
  return (
    typeof data === "object" &&
    data !== null &&
    "chapters" in data &&
    Array.isArray((data as { chapters?: unknown }).chapters)
  );
}

function summarizeStudy(row: StudyRow) {
  let drafted = 0;
  let total = 0;
  const snapshot = row.data as
    | { chapters?: { sections?: { draft?: unknown }[] }[] }
    | null;
  if (snapshot && Array.isArray(snapshot.chapters)) {
    for (const chapter of snapshot.chapters) {
      if (!Array.isArray(chapter?.sections)) continue;
      for (const section of chapter.sections) {
        total += 1;
        if (typeof section?.draft === "string" && section.draft.trim()) drafted += 1;
      }
    }
  }
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    stats: { drafted, total },
  };
}

// GET /api/studies — list saved studies, most recently updated first.
router.get(
  "/studies",
  asyncRoute(async (_req, res) => {
    const rows = await studyStore().list();
    res.json(rows.map(summarizeStudy));
  }),
);

// POST /api/studies — create a study (stores the first snapshot as a version).
router.post(
  "/studies",
  asyncRoute(async (req, res) => {
    const rawName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const name = rawName || "Care study";
    if (!isValidStudyData(req.body?.data)) {
      res.status(422).json({ error: "A study payload with a chapters array is required" });
      return;
    }
    const created = await studyStore().create(name, req.body.data);
    res.status(201).json(summarizeStudy(created));
  }),
);

// GET /api/studies/:id — open a study (latest snapshot).
router.get(
  "/studies/:id",
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid study id" });
      return;
    }
    const row = await studyStore().get(id);
    if (!row) {
      res.status(404).json({ error: "Study not found" });
      return;
    }
    res.json({ ...summarizeStudy(row), data: row.data });
  }),
);

// PUT /api/studies/:id — save the current workspace (also records a version).
router.put(
  "/studies/:id",
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid study id" });
      return;
    }
    const rawName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const name = rawName || "Care study";
    if (!isValidStudyData(req.body?.data)) {
      res.status(422).json({ error: "A study payload with a chapters array is required" });
      return;
    }
    const row = await studyStore().update(id, name, req.body.data);
    if (!row) {
      res.status(404).json({ error: "Study not found" });
      return;
    }
    res.json(summarizeStudy(row));
  }),
);

// DELETE /api/studies/:id — remove a study (and its disk artifacts).
router.delete(
  "/studies/:id",
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid study id" });
      return;
    }
    const db = studyStore();
    // Grab the upload references before the rows cascade away.
    const files = await db.listFiles(id);
    const removed = await db.remove(id);
    if (!removed) {
      res.status(404).json({ error: "Study not found" });
      return;
    }
    // DB rows cascade; bucket objects + disk uploads + the study's retrieval
    // index go too.
    for (const file of files) await removeStoredFile(file.storedPath);
    await removeStudyArtifacts(id);
    res.status(204).end();
  }),
);

export default router;
