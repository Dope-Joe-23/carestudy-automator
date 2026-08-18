import { randomUUID } from "node:crypto";
import { mkdir, open, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  deleteObject,
  downloadObjectToFile,
  isR2Configured,
  R2_KEY_PREFIX,
} from "./r2";

// Uploaded clinical documents (PDF / DOCX / TXT) become each study's own
// grounding knowledge base. Files are stored on disk under data/uploads/
// with random names — the client's filename is display-only and never used
// as a path. Every format is validated by magic bytes, not by extension.
//
// When R2 is configured, the durable copy lives in the R2 bucket instead and
// the DB's storedPath holds an "r2://<objectKey>" reference; the local disk
// is then only a transient cache for the extraction engine.

// Base64-in-JSON uploads buffer the whole file on the server, so this cap
// is a memory concern, not a disk one. Configurable via MAX_UPLOAD_MB;
// defaults to 250 MB (matching the direct-to-R2 ceiling) so large ebooks
// work out of the box in development. Set it lower on memory-constrained
// deployments.
export const MAX_UPLOAD_BYTES =
  (Number(process.env.MAX_UPLOAD_MB) || 250) * 1024 * 1024;

// Direct-to-R2 uploads bypass the request body entirely, so the ceiling is
// the bucket's single-PUT limit (5 GB on R2). 250 MB comfortably covers any
// ebook or scanned textbook while still catching accidental megafiles.
export const MAX_R2_UPLOAD_BYTES = 250 * 1024 * 1024;

/** Which storage backend the app is running on right now. */
export function r2UploadMode(): "r2" | "local" {
  return isR2Configured() ? "r2" : "local";
}

export type UploadType = "pdf" | "docx" | "txt" | "epub" | "md";

export class UploadError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Project root, resolved from this bundle (dist/lib -> dist -> api-server ->
// artifacts -> root). Mirrors the resolution in draftWorker.ts.
const RAG_DIR = path.resolve(__dirname, "../../../carestudy_rag");
export const UPLOADS_DIR = path.resolve(RAG_DIR, "..", "data", "uploads");
export const STUDY_INDEX_DIR = path.resolve(RAG_DIR, "..", "data", "studies");
export const LIBRARY_DIR = path.resolve(RAG_DIR, "..", "data", "library");

// Student-portal orders: one folder per order for the student's uploaded
// materials, plus a delivery/ subfolder for the completed study.
export const ORDERS_DIR = path.resolve(RAG_DIR, "..", "data", "orders");
export const ORDER_DELIVERY_DIR = path.resolve(RAG_DIR, "..", "data", "orders");

/** Local cache for bucket objects handed to the extraction engine. */
export const R2_CACHE_DIR = path.resolve(RAG_DIR, "..", "data", "r2-cache");

const CONTROL_OK = new Set([9, 10, 12, 13]); // \t \n \f \r

/** True when the head of a buffer looks like readable text, not a binary. */
function looksLikeText(head: string): boolean {
  if (head.includes("\u0000")) return false;
  let control = 0;
  for (const ch of head) {
    const code = ch.charCodeAt(0);
    if (code < 32 && !CONTROL_OK.has(code)) control += 1;
  }
  return control / Math.max(head.length, 1) < 0.05;
}

/**
 * Identify an upload from its bytes. Returns null for anything that isn't a
 * PDF, a real .docx package, or plain text — executables, archives, office
 * spreadsheets/presentations, HTML, and SVG are all rejected.
 */
export function detectUploadType(
  buffer: Buffer,
  rawFilename: unknown = "",
): {
  type: UploadType;
  mime: string;
  ext: string;
} | null {
  if (buffer.length === 0) return null;

  // PDF: "%PDF-"
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-") {
    return { type: "pdf", mime: "application/pdf", ext: "pdf" };
  }

  // ZIP family (PK..). Word documents must reference word/; ebooks must carry
  // the EPUB container marker. Plain zips, xlsx, and pptx are refused.
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
  ) {
    const head = buffer.subarray(0, Math.min(buffer.length, 64 * 1024)).toString("latin1");
    if (head.includes("word/") || head.includes("word\\")) {
      return {
        type: "docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ext: "docx",
      };
    }
    if (head.includes("META-INF/container.xml") || head.includes("application/epub+zip")) {
      return { type: "epub", mime: "application/epub+zip", ext: "epub" };
    }
    return null; // a zip, but not a Word document or an ebook
  }

  // Everything else must be readable text (and not a disguised web payload).
  const head = buffer.subarray(0, Math.min(buffer.length, 4096)).toString("latin1");
  if (!looksLikeText(head)) return null;
  if (/^\s*<!doctype html/i.test(head) || /<html[\s>]/i.test(head) || /<\s*svg[\s>]/i.test(head)) {
    return null;
  }
  // A .md filename makes it Markdown; anything else is plain text.
  const lowerName = String(rawFilename ?? "").toLowerCase();
  if (lowerName.endsWith(".md") || lowerName.endsWith(".markdown")) {
    return { type: "md", mime: "text/markdown", ext: "md" };
  }
  return { type: "txt", mime: "text/plain", ext: "txt" };
}

/** Read only the first `bytes` of a file — enough for magic-byte checks
 *  without loading a whole multi-hundred-MB document into memory. */
export async function readFileHead(filePath: string, bytes = 64 * 1024): Promise<Buffer> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return bytesRead < bytes ? buffer.subarray(0, bytesRead) : buffer;
  } finally {
    await handle.close();
  }
}

/** Keep only a safe display name — never a path, never control characters. */
export function sanitizeFilename(raw: unknown): string {
  const base = path
    .basename(String(raw ?? "").replace(/\\/g, "/"))
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, "");
  return (base || "document").slice(0, 120);
}

export type StoredUpload = {
  filename: string;
  storedPath: string;
  type: UploadType;
  mime: string;
  size: number;
};

// ---------------------------------------------------------------------------
// R2 object references — storedPath values that point at a bucket object.
// ---------------------------------------------------------------------------

/** An object key for a study's uploaded document. */
export function studyObjectKey(studyId: number, ext: string): string {
  return `uploads/${studyId}/${randomUUID()}.${ext}`;
}

/** An object key for a personal-library source (ebook / notes / article). */
export function libraryObjectKey(ext: string): string {
  return `library/${randomUUID()}.${ext}`;
}

export function isRemoteStored(storedPath: string): boolean {
  return storedPath.startsWith(R2_KEY_PREFIX);
}

export function objectKeyOf(storedPath: string): string {
  return storedPath.slice(R2_KEY_PREFIX.length);
}

/** Where a bucket object's extraction cache lives on local disk. */
function cachePathForKey(key: string): string {
  return path.join(R2_CACHE_DIR, key.replace(/[/\\]/g, "__"));
}

/**
 * Resolve a stored reference to a local path the Python engine can read.
 * R2 objects are downloaded into a cache keyed by their object key, so
 * repeated ingests (every library edit re-ingests all sources) reuse the
 * copy instead of re-downloading from the bucket.
 */
export async function materializeStored(storedPath: string): Promise<string> {
  if (!isRemoteStored(storedPath)) return storedPath;
  const key = objectKeyOf(storedPath);
  const dest = cachePathForKey(key);
  try {
    await stat(dest);
    return dest; // cache hit
  } catch {
    // cache miss — download below
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await downloadObjectToFile(key, dest);
  return dest;
}

/**
 * Remove a stored file wherever it lives — the R2 object (and its local
 * cache copy) or a plain local-disk file. Best-effort: never throws.
 */
export async function removeStoredFile(storedPath: string): Promise<void> {
  if (isRemoteStored(storedPath)) {
    const key = objectKeyOf(storedPath);
    try {
      await deleteObject(key);
    } catch {
      // best-effort cleanup — object may already be gone
    }
    try {
      await unlink(cachePathForKey(key));
    } catch {
      // cache copy may be absent
    }
    return;
  }
  await removeUploadFile(storedPath);
}

/**
 * Validate and persist an upload for a study. Throws UploadError (with an
 * HTTP status) on rejection; never throws for I/O — callers surface those.
 */
async function storeBytes(
  dir: string,
  buffer: Buffer,
  rawFilename: unknown,
): Promise<StoredUpload> {
  const detected = detectUploadType(buffer, rawFilename);
  if (!detected) {
    throw new UploadError(
      415,
      "Unsupported file type — upload a PDF, Word (.docx), EPUB ebook, Markdown, or plain text document only.",
    );
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      413,
      `File is too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`,
    );
  }
  await mkdir(dir, { recursive: true });
  const storedPath = path.join(dir, `${randomUUID()}.${detected.ext}`);
  await writeFile(storedPath, buffer);
  return {
    filename: sanitizeFilename(rawFilename),
    storedPath,
    type: detected.type,
    mime: detected.mime,
    size: buffer.length,
  };
}

/** Validate and persist a clinical document for a study. */
export async function storeUpload(
  studyId: number,
  buffer: Buffer,
  rawFilename: unknown,
): Promise<StoredUpload> {
  return storeBytes(path.join(UPLOADS_DIR, String(studyId)), buffer, rawFilename);
}

/** Validate and persist a personal-library source (ebook / notes / article). */
export async function storeLibraryUpload(
  buffer: Buffer,
  rawFilename: unknown,
): Promise<StoredUpload> {
  return storeBytes(LIBRARY_DIR, buffer, rawFilename);
}

/** Validate and persist a document attached to a student's care-study order. */
export async function storeOrderUpload(
  orderId: number,
  buffer: Buffer,
  rawFilename: unknown,
): Promise<StoredUpload> {
  return storeBytes(path.join(ORDERS_DIR, String(orderId)), buffer, rawFilename);
}

/** Validate and persist the completed study delivered for an order. */
export async function storeOrderDelivery(
  orderId: number,
  buffer: Buffer,
  rawFilename: unknown,
): Promise<StoredUpload> {
  return storeBytes(path.join(ORDER_DELIVERY_DIR, String(orderId), "delivery"), buffer, rawFilename);
}

/** Remove an order's on-disk files (materials + delivery) — best-effort. */
export async function removeOrderArtifacts(orderId: number): Promise<void> {
  try {
    await rm(path.join(ORDERS_DIR, String(orderId)), { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

/**
 * Persist a fetched external resource. Response bodies are saved as HTML for
 * the engine's HTML loader, unless the content type says it's a PDF.
 */
export async function storeLibraryHtml(html: string): Promise<string> {
  await mkdir(LIBRARY_DIR, { recursive: true });
  const storedPath = path.join(LIBRARY_DIR, `${randomUUID()}.html`);
  await writeFile(storedPath, html, "utf8");
  return storedPath;
}

export async function storeLibraryPdf(buffer: Buffer): Promise<string> {
  await mkdir(LIBRARY_DIR, { recursive: true });
  const storedPath = path.join(LIBRARY_DIR, `${randomUUID()}.pdf`);
  await writeFile(storedPath, buffer);
  return storedPath;
}

/** Best-effort removal of an uploaded file from disk. */
export async function removeUploadFile(storedPath: string): Promise<void> {
  try {
    await unlink(storedPath);
  } catch {
    // already gone — nothing to do
  }
}

/** Remove everything a study owns on disk: uploads and its retrieval index. */
export async function removeStudyArtifacts(studyId: number): Promise<void> {
  for (const dir of [
    path.join(UPLOADS_DIR, String(studyId)),
    path.join(STUDY_INDEX_DIR, String(studyId)),
  ]) {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}
