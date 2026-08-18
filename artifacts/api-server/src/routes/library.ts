import { Router, type IRouter, type Request, type Response } from "express";
import path from "node:path";
import { getStudyStore, type LibrarySourceRow, type StudyStore } from "@workspace/db";
import { draftWorker } from "../lib/draftWorker";
import {
  detectUploadType,
  LIBRARY_DIR,
  libraryObjectKey,
  materializeStored,
  MAX_R2_UPLOAD_BYTES,
  readFileHead,
  removeStoredFile,
  r2UploadMode,
  sanitizeFilename,
  storeLibraryHtml,
  storeLibraryPdf,
  storeLibraryUpload,
  UploadError,
} from "../lib/uploads";
import { createPresignedPutUrl, headObject, R2_KEY_PREFIX } from "../lib/r2";
import { hostIsBlocked } from "./verify";

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
      req.log?.error?.({ err }, "library request failed");
      const status = err instanceof UploadError ? err.status : 500;
      const message = err instanceof Error ? err.message : "Unexpected library error";
      res.status(status).json({ error: message });
    });
  };
}

function parseId(raw: string | string[] | undefined): number | null {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

const LIBRARY_KINDS = new Set(["ebook", "notes", "article", "url"]);

/** Infer the source kind from a filename when the client didn't specify one. */
function inferKind(filename: string, fallback: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".epub")) return "ebook";
  if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt")) {
    return "notes";
  }
  return fallback === "ebook" || fallback === "notes" ? fallback : "article";
}

function humanizeFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base || filename;
}

/**
 * Build {label, inText, url} for a library source — mirrors the citation
 * styles the Python engine uses, so library citations read exactly like the
 * bundled ones: "(Jarvis, 2020)", "(Potter & Perry, 2021)", "(WHO, 2024)".
 */
export function buildCitation(
  meta: {
    title?: string | null;
    author?: string | null;
    year?: string | null;
    venue?: string | null;
    citeKey?: string | null;
    url?: string | null;
  },
  fallbackTitle: string,
): { label: string; inText: string; url: string | null } {
  const title = meta.title?.trim() || humanizeFilename(fallbackTitle);
  const url = meta.url?.trim() || "";
  const year = meta.year?.trim() || "";
  const venue = meta.venue?.trim() || "";
  const citeKey = meta.citeKey?.trim() || "";
  const author = meta.author?.trim() || "";

  let inText: string;
  let label: string;
  if (citeKey || author || venue) {
    const name = citeKey || author || title;
    inText = `(${name}${year ? `, ${year}` : ""})`;
    label =
      (author ? `${author}.` : "") +
      (year ? ` (${year}).` : "") +
      ` ${title}.` +
      (venue ? ` ${venue.replace(/\.+$/, "")}.` : "");
  } else {
    inText = `(${title})`;
    label = `${title}. Personal reference library.`;
  }
  if (url && !label.includes(`Retrieved from ${url}`)) {
    label += ` Retrieved from ${url}`;
  }
  return { label, inText, url: url || null };
}

/** The ingest payload for every library source (skip rows with no file).
 *  R2-backed sources are materialized to the local cache first so the Python
 *  extraction engine (which reads from disk) can open them. */
async function ingestAllSources() {
  const rows = await studyStore().listLibrary();
  const materialized = await Promise.all(
    rows
      .filter((row) => row.storedPath)
      .map(async (row) => ({ row, local: await materializeStored(row.storedPath) })),
  );
  const sources = materialized.map(({ row, local }) => ({
    path: local,
    citation: buildCitation(
      {
        title: row.title,
        author: row.author,
        year: row.year,
        venue: row.venue,
        citeKey: row.citeKey,
        url: row.url,
      },
      row.filename,
    ),
  }));
  const { files: results } = await draftWorker.libraryIngest(sources);
  const byPath = new Map(results.map((r) => [r.path, r]));
  for (const { row, local } of materialized) {
    const result = byPath.get(local);
    if (!result) continue;
    const status = result.error ? "error" : "ready";
    await studyStore().setLibrarySourceStatus(row.id, status, result.error ?? null);
  }
}

const USER_AGENT = "carestudy-assistant/1.0 (personal reference library)";
const FETCH_TIMEOUT_MS = 25_000;
const FETCH_MAX_BYTES = 8 * 1024 * 1024;

/** Fetch an external resource. Throws UploadError with a status on failure. */
async function fetchExternal(url: string): Promise<{ storedPath: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UploadError(400, "That URL is not valid.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UploadError(400, "Only http(s) URLs can be fetched.");
  }
  if (await hostIsBlocked(parsed.hostname)) {
    throw new UploadError(400, "Local or private addresses cannot be fetched.");
  }

  const response = await fetch(parsed, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new UploadError(502, `The link responded with HTTP ${response.status}.`);
  }
  // The initial hostname passed the guard above, but a redirect may have
  // landed on a loopback/private address — refuse to store that content.
  const finalHost = new URL(response.url).hostname;
  if (await hostIsBlocked(finalHost)) {
    throw new UploadError(400, "The link redirects to a local or private address; it was not stored.");
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/pdf")) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > FETCH_MAX_BYTES) {
      throw new UploadError(413, "That PDF is too large to fetch (max 8 MB).");
    }
    return { storedPath: await storeLibraryPdf(buffer) };
  }
  const text = await response.text();
  if (text.length > FETCH_MAX_BYTES) {
    throw new UploadError(413, "That page is too large to fetch (max 8 MB).");
  }
  return { storedPath: await storeLibraryHtml(text) };
}

/** A safe object-key extension derived from the display filename. */
function extFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace(/^\./, "");
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "bin";
}

function publicSource(row: LibrarySourceRow) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    author: row.author,
    year: row.year,
    venue: row.venue,
    citeKey: row.citeKey,
    url: row.url,
    filename: row.filename,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// POST /api/library/sources/presign — hand the client a direct-to-bucket
// upload URL for a library file (ebook / notes / article), so large files
// never pass through the API server's request body.
router.post(
  "/library/sources/presign",
  asyncRoute(async (req, res) => {
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
    const objectKey = libraryObjectKey(extFromFilename(filename));
    const uploadUrl = await createPresignedPutUrl(objectKey, contentType);
    res.json({ uploadUrl, objectKey, expiresIn: 15 * 60, mode: "r2" });
  }),
);

// POST /api/library/sources/complete — the browser has PUT the bytes to the
// bucket; verify, register, and index the library source.
router.post(
  "/library/sources/complete",
  asyncRoute(async (req, res) => {
    const objectKey = typeof req.body?.objectKey === "string" ? req.body.objectKey : "";
    if (!objectKey || !objectKey.startsWith("library/")) {
      res.status(400).json({ error: "Invalid upload reference" });
      return;
    }
    const filename = sanitizeFilename(req.body?.filename);
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

    // Validate by magic bytes (not extension) before registering the source.
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

    const kindRaw = str(req.body?.kind);
    const kind = kindRaw && LIBRARY_KINDS.has(kindRaw) ? kindRaw : null;
    const effectiveKind = kind ?? inferKind(filename, "article");
    const row = await studyStore().addLibrarySource({
      kind: effectiveKind,
      title: str(req.body?.title) ?? humanizeFilename(filename),
      filename,
      storedPath,
      status: "indexing",
      url: str(req.body?.url),
      author: str(req.body?.author),
      year: str(req.body?.year),
      venue: str(req.body?.venue),
      citeKey: str(req.body?.citeKey),
    });

    try {
      await ingestAllSources();
    } catch (err) {
      req.log?.error?.({ err }, "library indexing failed");
      await studyStore().setLibrarySourceStatus(
        row.id,
        "error",
        "Indexing failed — the source was saved but could not be processed.",
      );
    }

    const updated = await studyStore().getLibrarySource(row.id);
    res.status(201).json({ source: updated ? publicSource(updated) : publicSource(row) });
  }),
);

// POST /api/library/sources — add an ebook/notes/article (base64 file) or an
// external resource (url). Citation metadata is optional; it can be edited
// later via PATCH.
router.post(
  "/library/sources",
  asyncRoute(async (req, res) => {
    const kindRaw = str(req.body?.kind);
    const kind = kindRaw && LIBRARY_KINDS.has(kindRaw) ? kindRaw : null;
    const url = str(req.body?.url);
    const filename = str(req.body?.filename) ?? "document";

    let storedPath = "";
    let effectiveKind = kind ?? "article";
    let fallbackTitle = filename;

    if (url) {
      effectiveKind = "url";
      fallbackTitle = (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return url;
        }
      })();
      try {
        ({ storedPath } = await fetchExternal(url));
      } catch (err) {
        // Register the citation even when the fetch failed — the URL stays
        // listed and verifiable; the row is marked error with the reason.
        const message = err instanceof Error ? err.message : "Could not fetch the link";
        const row = await studyStore().addLibrarySource({
          kind: "url",
          title: str(req.body?.title) ?? fallbackTitle,
          filename: fallbackTitle,
          storedPath: "",
          status: "error",
          error: message,
          url,
          author: str(req.body?.author),
          year: str(req.body?.year),
          venue: str(req.body?.venue),
          citeKey: str(req.body?.citeKey),
        });
        res.status(201).json({ source: publicSource(row) });
        return;
      }
    } else {
      const raw = str(req.body?.content);
      if (!raw) {
        res.status(400).json({ error: "Provide either file content (base64) or a url" });
        return;
      }
      let buffer: Buffer;
      try {
        buffer = Buffer.from(raw, "base64");
        if (buffer.length === 0) throw new Error("empty");
      } catch {
        res.status(400).json({ error: "The file payload is not valid base64" });
        return;
      }
      const stored = await storeLibraryUpload(buffer, filename);
      storedPath = stored.storedPath;
      effectiveKind = kind ?? inferKind(stored.filename, effectiveKind);
      fallbackTitle = stored.filename;
    }

    const row = await studyStore().addLibrarySource({
      kind: effectiveKind,
      title: str(req.body?.title) ?? humanizeFilename(fallbackTitle),
      filename: fallbackTitle,
      storedPath,
      status: "indexing",
      url: url ?? str(req.body?.url),
      author: str(req.body?.author),
      year: str(req.body?.year),
      venue: str(req.body?.venue),
      citeKey: str(req.body?.citeKey),
    });

    try {
      await ingestAllSources();
    } catch (err) {
      req.log?.error?.({ err }, "library indexing failed");
      await studyStore().setLibrarySourceStatus(
        row.id,
        "error",
        "Indexing failed — the source was saved but could not be processed.",
      );
    }

    const updated = await studyStore().getLibrarySource(row.id);
    res.status(201).json({ source: updated ? publicSource(updated) : publicSource(row) });
  }),
);

// GET /api/library/sources — the whole personal reference library.
router.get(
  "/library/sources",
  asyncRoute(async (_req, res) => {
    const rows = await studyStore().listLibrary();
    res.json({ sources: rows.map(publicSource) });
  }),
);

// PATCH /api/library/sources/:id — edit citation metadata, then re-index.
router.patch(
  "/library/sources/:id",
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid source id" });
      return;
    }
    const db = studyStore();
    const existing = await db.getLibrarySource(id);
    if (!existing) {
      res.status(404).json({ error: "Source not found" });
      return;
    }
    const updated = await db.updateLibrarySource(id, {
      title: str(req.body?.title) ?? existing.title,
      author: str(req.body?.author) ?? existing.author,
      year: str(req.body?.year) ?? existing.year,
      venue: str(req.body?.venue) ?? existing.venue,
      citeKey: str(req.body?.citeKey) ?? existing.citeKey,
      url: str(req.body?.url) ?? existing.url,
    });
    if (updated?.storedPath) {
      try {
        await ingestAllSources();
      } catch (err) {
        req.log?.error?.({ err }, "library re-index after citation edit failed");
        // Keep the divergence visible instead of silently stale: the row keeps
        // its edited citation but is flagged so the UI shows the failure.
        await studyStore().setLibrarySourceStatus(
          id,
          "error",
          "Re-indexing failed after the citation edit.",
        );
      }
    }
    const final = await db.getLibrarySource(id);
    res.json({ source: final ? publicSource(final) : publicSource(updated!) });
  }),
);

// DELETE /api/library/sources/:id — remove a source (file + row) and re-index.
router.delete(
  "/library/sources/:id",
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid source id" });
      return;
    }
    const db = studyStore();
    const row = await db.getLibrarySource(id);
    if (!row) {
      res.status(404).json({ error: "Source not found" });
      return;
    }
    if (row.storedPath) await removeStoredFile(row.storedPath);
    await db.removeLibrarySource(id);
    try {
      await ingestAllSources();
    } catch (err) {
      req.log?.error?.({ err }, "library re-index after source delete failed");
    }
    res.status(204).end();
  }),
);

export { LIBRARY_DIR };
export default router;
