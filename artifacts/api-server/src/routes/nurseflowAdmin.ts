import { Router, type IRouter, type Request, type Response } from "express";
import { readNurseFlowContent, readNurseFlowStarterQuestions, saveNurseFlowContent, type NurseFlowQuestion } from "../lib/nurseflowContent";

/**
 * A card as it arrives from an import payload. `reviewStatus` is read only so a
 * typo is reported — its value is never honoured, because every import lands as
 * a draft. `reviewedBy`/`reviewedAt` are deliberately not part of this shape:
 * approval is a studio action, not a claim a payload can assert about itself.
 */
type ImportedQuestion = {
  id?: unknown;
  topic?: unknown;
  level?: unknown;
  title?: unknown;
  question?: unknown;
  options?: unknown;
  correctOptionIndex?: unknown;
  rationale?: unknown;
  sourceTitle?: unknown;
  sourceUrl?: unknown;
  learningObjective?: unknown;
  visualBrief?: unknown;
  reviewStatus?: unknown;
};

type ImportIssue = { row: number; field: string; message: string };
const nurseFlowAdminRouter: IRouter = Router();

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function validateQuestion(item: ImportedQuestion, row: number): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const requireText = (field: keyof ImportedQuestion, label = field) => {
    if (!text(item[field])) issues.push({ row, field, message: `${label} is required.` });
  };
  ["id", "topic", "level", "title", "question", "rationale", "sourceTitle", "sourceUrl", "learningObjective", "visualBrief"].forEach((field) => requireText(field as keyof ImportedQuestion));
  if (!Array.isArray(item.options) || item.options.length !== 4 || item.options.some((option) => !text(option))) {
    issues.push({ row, field: "options", message: "Exactly four non-empty answer options are required." });
  }
  if (!Number.isInteger(item.correctOptionIndex) || Number(item.correctOptionIndex) < 0 || Number(item.correctOptionIndex) > 3) {
    issues.push({ row, field: "correctOptionIndex", message: "Must be an option index from 0 to 3." });
  }
  try { new URL(text(item.sourceUrl)); } catch { issues.push({ row, field: "sourceUrl", message: "Must be a valid absolute source URL." }); }
  // Checked for typos only. The value is discarded on import: a card reaches
  // learners through the studio review action, never through a payload.
  const status = text(item.reviewStatus) || "draft";
  if (!["draft", "in_review", "approved", "retired"].includes(status)) {
    issues.push({ row, field: "reviewStatus", message: "Use draft, in_review, approved, or retired." });
  }
  return issues;
}

function normalizeQuestion(item: ImportedQuestion): NurseFlowQuestion {
  const now = new Date().toISOString();
  return {
    id: text(item.id), topic: text(item.topic), level: text(item.level), title: text(item.title),
    question: text(item.question), options: (item.options as string[]).map(text),
    correctOptionIndex: Number(item.correctOptionIndex), rationale: text(item.rationale),
    sourceTitle: text(item.sourceTitle), sourceUrl: text(item.sourceUrl), learningObjective: text(item.learningObjective),
    visualBrief: text(item.visualBrief),
    // Hard-coded: an import can never self-certify as approved. Reviewer fields
    // are left unset so a later approval stamps a real name and date.
    reviewStatus: "draft",
    createdAt: now, updatedAt: now,
  };
}

/**
 * Pre-import validation endpoint; it writes nothing. Imports land as drafts and
 * only PATCH /nurseflow/questions/:id/review can publish, after a
 * clinical/editorial review. Mounted behind requireAdmin in routes/index.ts.
 */
nurseFlowAdminRouter.post("/nurseflow/questions/validate", (req: Request, res: Response) => {
  const questions = req.body?.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    res.status(400).json({ error: "Provide a non-empty JSON { questions: [...] } payload." });
    return;
  }
  if (questions.length > 250) {
    res.status(400).json({ error: "Validate no more than 250 questions at a time." });
    return;
  }
  const issues = questions.flatMap((question, i) => validateQuestion(question as ImportedQuestion, i + 1));
  res.json({ valid: issues.length === 0, received: questions.length, issues });
});

nurseFlowAdminRouter.get("/nurseflow/questions", async (req: Request, res: Response) => {
  try { res.json(await readNurseFlowContent()); }
  catch (error) { req.log?.error({ error }, "NurseFlow content read failed"); res.status(503).json({ error: "Question bank storage is unavailable." }); }
});

/**
 * The repository's starter batch, shaped as an import payload so the Studio
 * can drop it straight into the editor. It is never written to the store:
 * the admin still validates and imports it like any other batch.
 */
nurseFlowAdminRouter.get("/nurseflow/questions/starter", async (req: Request, res: Response) => {
  try { res.json({ questions: await readNurseFlowStarterQuestions() }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      res.status(404).json({ error: "No starter file on the server (data/nurseflow/starter-questions.json)." });
      return;
    }
    req.log?.error({ error }, "NurseFlow starter read failed");
    res.status(503).json({ error: "The starter file could not be read." });
  }
});

/**
 * Import appends cards as drafts. Any `reviewStatus` in the payload is
 * validated for typos but ignored, so this endpoint cannot publish: the only
 * path into the public feed stays PATCH /nurseflow/questions/:id/review.
 */
nurseFlowAdminRouter.post("/nurseflow/questions/import", async (req: Request, res: Response) => {
  const questions = req.body?.questions;
  if (!Array.isArray(questions) || questions.length === 0 || questions.length > 250) { res.status(400).json({ error: "Provide 1 to 250 questions." }); return; }
  const issues = questions.flatMap((question, i) => validateQuestion(question as ImportedQuestion, i + 1));
  if (issues.length) { res.status(422).json({ valid: false, issues }); return; }
  try {
    const current = await readNurseFlowContent();
    const existing = new Set(current.questions.map((question) => question.id));
    const duplicates = questions.map((q: ImportedQuestion) => text(q.id)).filter((id) => existing.has(id));
    if (duplicates.length) { res.status(409).json({ error: "Question IDs already exist.", ids: duplicates }); return; }
    const file = await saveNurseFlowContent([...current.questions, ...questions.map((question) => normalizeQuestion(question as ImportedQuestion))]);
    res.status(201).json({ imported: questions.length, total: file.questions.length });
  } catch (error) { req.log?.error({ error }, "NurseFlow content import failed"); res.status(503).json({ error: "Question bank storage is unavailable." }); }
});

nurseFlowAdminRouter.patch("/nurseflow/questions/:id/review", async (req: Request, res: Response) => {
  const status = text(req.body?.reviewStatus);
  if (!["draft", "in_review", "approved", "retired"].includes(status)) { res.status(400).json({ error: "Invalid review status." }); return; }
  try {
    const content = await readNurseFlowContent();
    const index = content.questions.findIndex((question) => question.id === req.params.id);
    if (index < 0) { res.status(404).json({ error: "Question not found." }); return; }
    const now = new Date().toISOString();
    const current = content.questions[index];
    const updated: NurseFlowQuestion = { ...current, reviewStatus: status as NurseFlowQuestion["reviewStatus"], updatedAt: now };
    if (status === "approved") { updated.reviewedBy = text(req.body?.reviewedBy) || "Studio reviewer"; updated.reviewedAt = now; }
    content.questions[index] = updated;
    await saveNurseFlowContent(content.questions);
    res.json({ question: updated });
  } catch (error) { req.log?.error({ error }, "NurseFlow review update failed"); res.status(503).json({ error: "Question bank storage is unavailable." }); }
});

export default nurseFlowAdminRouter;
