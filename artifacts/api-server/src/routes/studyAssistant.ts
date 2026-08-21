import { Router, type IRouter } from "express";
import { draftWorker } from "../lib/draftWorker";

const router: IRouter = Router();
const MAX_STUDY_BYTES = 180_000;

/**
 * Study-wide editorial assistant. The client sends its current unsaved
 * workspace snapshot so the response always reflects what is on screen.
 */
router.post("/study-assistant", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const study = req.body?.study;
  if (!message) {
    res.status(422).json({ error: "A question or editing instruction is required." });
    return;
  }
  if (!study || typeof study !== "object" || !Array.isArray(study.chapters)) {
    res.status(422).json({ error: "A complete study snapshot is required." });
    return;
  }
  if (Buffer.byteLength(JSON.stringify(study), "utf8") > MAX_STUDY_BYTES) {
    res.status(413).json({
      error: "This study is too large for a single AI review. Ask about a chapter or section instead.",
    });
    return;
  }

  try {
    const answer = await draftWorker.assistStudy(study, message);
    res.json({ answer });
  } catch (err) {
    req.log?.error?.({ err }, "study assistant failed");
    res.status(500).json({
      error: "Study review failed",
      detail: err instanceof Error ? err.message : "Unknown AI engine error",
    });
  }
});

export default router;
