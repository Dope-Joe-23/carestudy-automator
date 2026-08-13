import { Router, type IRouter } from "express";
import { draftWorker } from "../lib/draftWorker";

const router: IRouter = Router();

router.post("/sections/draft", async (req, res) => {
  const heading =
    typeof req.body?.heading === "string" ? req.body.heading.trim() : "";
  const notes =
    typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
  const tabular = req.body?.tabular === true;
  const kind = req.body?.kind === "chapter_intro" ? "chapter_intro" : "section";
  const rawStudyId = req.body?.studyId;
  const studyId =
    Number.isInteger(rawStudyId) && (rawStudyId as number) > 0 ? (rawStudyId as number) : null;
  const rawColumns = req.body?.rowColumns;
  const rowColumns = Array.isArray(rawColumns)
    ? rawColumns.filter((column): column is string => typeof column === "string").slice(0, 12)
    : [];

  if (!heading || !notes) {
    res
      .status(422)
      .json({ error: "heading and notes are required and must be non-empty" });
    return;
  }

  try {
    const result = await draftWorker.draft(heading, notes, tabular, kind, studyId, rowColumns);
    res.json(result);
  } catch (err) {
    req.log?.error?.({ err }, "draft generation failed");
    res.status(500).json({
      error: "Drafting failed",
      detail: err instanceof Error ? err.message : "Unknown engine error",
    });
  }
});

export default router;
