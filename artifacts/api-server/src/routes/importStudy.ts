import { Router, type IRouter } from "express";
import { draftWorker } from "../lib/draftWorker";

const router: IRouter = Router();
const MAX_TEXT_BYTES = 180_000;

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

export default router;

