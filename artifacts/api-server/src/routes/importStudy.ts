import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Router, type IRouter } from "express";
import { draftWorker } from "../lib/draftWorker";
import { reserveStudioAiUsageForOptionalAdmin } from "../lib/studioAiQuota";
import { detectUploadType, MAX_UPLOAD_BYTES } from "../lib/uploads";

const router: IRouter = Router();
export const studioImportRouter: IRouter = Router();
const MAX_TEXT_BYTES = 180_000;
const MAX_IMPORT_FILE_BYTES = Math.min(MAX_UPLOAD_BYTES, 25 * 1024 * 1024);

/**
 * Parse a pasted or uploaded care study document into structured chapters.
 * The client sends the raw text; the Python AI engine returns a JSON object
 * with chapters/sections that the frontend distributes into the study scaffold.
 */
router.post("/import-study", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    res.status(422).json({ error: "Document text is required for import." });
    return;
  }
  if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) {
    res.status(413).json({
      error: "The document is too large for import. Try pasting a shorter section.",
    });
    return;
  }

  try {
    const rawStudyId = req.body?.studyId;
    const studyId = Number.isSafeInteger(rawStudyId) && rawStudyId > 0
      ? rawStudyId as number
      : null;
    if (!await reserveStudioAiUsageForOptionalAdmin(
      req,
      res,
      `import:${text}`,
      { text },
      studyId,
    )) return;
    const result = await draftWorker.importStudy(text);
    res.json(result);
  } catch (err) {
    req.log?.error?.({ err }, "import study failed");
    res.status(500).json({
      error: "Document import failed",
      detail: err instanceof Error ? err.message : "Unknown import engine error",
    });
  }
});

/**
 * Enhanced import: parses the document and extracts section IDs, field values,
 * and draft text. The frontend uses this to populate both form fields and
 * the draft preview — making the imported content look polished and drafted.
 */
router.post("/import-study-fields", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    res.status(422).json({ error: "Document text is required for import." });
    return;
  }
  if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) {
    res.status(413).json({
      error: "The document is too large for import. Try pasting a shorter section.",
    });
    return;
  }

  try {
    const rawStudyId = req.body?.studyId;
    const studyId = Number.isSafeInteger(rawStudyId) && rawStudyId > 0
      ? rawStudyId as number
      : null;
    if (!await reserveStudioAiUsageForOptionalAdmin(
      req,
      res,
      `import:${text}`,
      { text },
      studyId,
    )) return;
    const result = await draftWorker.importStudyWithFields(text);
    res.json(result);
  } catch (err) {
    req.log?.error?.({ err }, "import study with fields failed");
    res.status(500).json({
      error: "Document import failed",
      detail: err instanceof Error ? err.message : "Unknown import engine error",
    });
  }
});

studioImportRouter.post("/studio/import-study-file", async (req, res) => {
  const filename = typeof req.body?.filename === "string" ? req.body.filename : "";
  const encoded = typeof req.body?.fileBase64 === "string" ? req.body.fileBase64 : "";
  if (!filename.trim() || !encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    res.status(422).json({ error: "A filename and valid base64 document are required." });
    return;
  }

  const file = Buffer.from(encoded, "base64");
  if (file.toString("base64") !== encoded) {
    res.status(422).json({ error: "The uploaded document encoding is invalid." });
    return;
  }
  if (file.length > MAX_IMPORT_FILE_BYTES) {
    res.status(413).json({
      error: `The document is too large to import. The maximum size is ${Math.floor(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB.`,
    });
    return;
  }

  const detected = detectUploadType(file, filename);
  if (!detected || !["docx", "pdf", "txt", "md"].includes(detected.type)) {
    res.status(415).json({
      error: "Upload a Word (.docx), PDF, Markdown, or plain-text care study.",
    });
    return;
  }

  let temporaryDirectory: string | null = null;
  try {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), "carestudy-import-"));
    const temporaryFile = path.join(temporaryDirectory, `study.${detected.ext}`);
    await writeFile(temporaryFile, file, { flag: "wx" });
    const extracted = await draftWorker.extract(temporaryFile);
    await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = null;

    const text = extracted.text.trim();
    if (!text) {
      res.status(422).json({ error: "The document has no readable text to import." });
      return;
    }
    if (text.length > MAX_TEXT_BYTES) {
      res.status(413).json({
        error: "The document contains too much text to import. Try uploading a shorter document.",
      });
      return;
    }
    if (!await reserveStudioAiUsageForOptionalAdmin(
      req,
      res,
      `import:${text}`,
      { text },
      null,
    )) return;

    const result = await draftWorker.importStudyWithFields(text);
    res.json(result);
  } catch (err) {
    if (temporaryDirectory) {
      try {
        await rm(temporaryDirectory, { recursive: true, force: true });
      } catch (cleanupError) {
        req.log?.error?.({ err: cleanupError }, "temporary study import file cleanup failed");
      }
    }
    req.log?.error?.({ err }, "study file import failed");
    res.status(500).json({
      error: "Document import failed",
      detail: err instanceof Error ? err.message : "Unknown import engine error",
    });
  }
});

export default router;

