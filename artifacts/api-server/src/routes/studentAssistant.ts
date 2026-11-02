import { Router, type IRouter, type Request, type Response } from "express";
import { requireStudent } from "../lib/studentAuth";
import { draftWorker, type DraftReference } from "../lib/draftWorker";

const router: IRouter = Router();
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_HISTORY_ITEMS = 6;
const MAX_HISTORY_MESSAGE_LENGTH = 1_500;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".txt", ".md"]);

type ChatMessage = { role: "user" | "assistant"; content: string };

function decodeAttachment(
  value: unknown,
): { filename: string; content: string } | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object") return null;

  const raw = value as { filename?: unknown; content?: unknown };
  if (typeof raw.filename !== "string" || typeof raw.content !== "string") return null;
  const filename = raw.filename.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (!filename || filename.length > 255 || !ALLOWED_EXTENSIONS.has(extension)) return null;
  if (!raw.content || raw.content.length > Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 4) {
    return null;
  }

  const bytes = Buffer.from(raw.content, "base64");
  if (
    bytes.length === 0 ||
    bytes.length > MAX_ATTACHMENT_BYTES ||
    bytes.toString("base64").replace(/=+$/, "") !== raw.content.replace(/=+$/, "")
  ) {
    return null;
  }
  return { filename, content: raw.content };
}

function validateHistory(value: unknown): ChatMessage[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_HISTORY_ITEMS) return null;
  const messages: ChatMessage[] = [];
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      !["user", "assistant"].includes((item as ChatMessage).role) ||
      typeof (item as ChatMessage).content !== "string" ||
      (item as ChatMessage).content.length > MAX_HISTORY_MESSAGE_LENGTH
    ) {
      return null;
    }
    messages.push({
      role: (item as ChatMessage).role,
      content: (item as ChatMessage).content,
    });
  }
  return messages;
}

router.post(
  "/student/assistant",
  requireStudent,
  async (req: Request, res: Response): Promise<void> => {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      res.status(422).json({
        error: `Enter a question of up to ${MAX_MESSAGE_LENGTH} characters.`,
      });
      return;
    }

    const history = validateHistory(req.body?.history);
    if (!history) {
      res.status(422).json({ error: "The conversation context is invalid. Please start a new message." });
      return;
    }
    const attachment = decodeAttachment(req.body?.attachment);
    if (attachment === null) {
      res.status(422).json({
        error: "Attach a PDF, DOCX, TXT, or Markdown file no larger than 10 MB.",
      });
      return;
    }

    try {
      const result = await draftWorker.chatWithStudent(message, history, attachment);
      if (!result.answer.trim()) {
        throw new Error("The assistant returned an empty answer.");
      }
      const references: DraftReference[] = Array.isArray(result.references)
        ? result.references
        : [];
      res.json({ answer: result.answer, references });
    } catch (err) {
      req.log?.error?.({ err, studentId: (req as Request & { student?: { id: number } }).student?.id }, "student assistant failed");
      res.status(502).json({
        error: err instanceof Error ? err.message : "NurseAid could not answer right now.",
      });
    }
  },
);

export default router;
