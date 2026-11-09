import { Router, type IRouter, type Request, type Response } from "express";
import { execFile } from "node:child_process";
import path from "node:path";
import type { StudentChatReference } from "@workspace/db";
import { optionalStudent } from "../lib/studentAuth";

const router: IRouter = Router();
const EXPORT_SCRIPT = path.resolve(__dirname, "../../../carestudy_rag/src/export_chat_docx.py");
const PYTHON_BIN = process.env.PYTHON_BIN || "python";

function buildChatDocx(
  title: string,
  answer: string,
  references: StudentChatReference[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      PYTHON_BIN,
      [EXPORT_SCRIPT],
      { timeout: 60_000, maxBuffer: 32 * 1024 * 1024, encoding: "buffer" },
      (error, stdout) => {
        if (error) {
          reject(new Error(error.message.split("\n")[0]));
          return;
        }
        resolve(stdout);
      },
    );
    child.stdin?.end(JSON.stringify({ title, answer, references }));
  });
}

router.post(
  "/student/assistant/export/docx",
  optionalStudent,
  async (req: Request, res: Response): Promise<void> => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const answer = typeof req.body?.answer === "string" ? req.body.answer : "";
    if (!title || title.length > 120 || !answer.trim() || answer.length > 50_000) {
      res.status(422).json({ error: "Provide a title and an answer of up to 50,000 characters." });
      return;
    }
    const rawReferences = req.body?.references;
    if (rawReferences !== undefined && (!Array.isArray(rawReferences) || rawReferences.length > 30)) {
      res.status(422).json({ error: "The reference list is invalid." });
      return;
    }
    const references: StudentChatReference[] = [];
    for (const value of rawReferences ?? []) {
      if (!value || typeof value !== "object") {
        res.status(422).json({ error: "The reference list is invalid." });
        return;
      }
      const reference = value as Record<string, unknown>;
      if (
        typeof reference.label !== "string" ||
        typeof reference.inText !== "string" ||
        (reference.url !== undefined && reference.url !== null && typeof reference.url !== "string")
      ) {
        res.status(422).json({ error: "The reference list is invalid." });
        return;
      }
      let url: string | null = null;
      if (typeof reference.url === "string") {
        try {
          const parsedUrl = new URL(reference.url);
          if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Unsupported protocol");
          url = parsedUrl.toString();
        } catch {
          res.status(422).json({ error: "A reference URL is invalid." });
          return;
        }
      }
      references.push({
        label: reference.label.slice(0, 500),
        inText: reference.inText.slice(0, 200),
        url,
      });
    }

    try {
      const buffer = await buildChatDocx(title, answer, references);
      const filename = title
        .normalize("NFKD")
        .replace(/[^\w -]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 60) || "nursuit-answer";
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.docx"`);
      res.send(buffer);
    } catch (err) {
      req.log?.error?.({ err }, "student assistant Word export failed");
      res.status(500).json({
        error: "Word export failed. Confirm the Python engine and python-docx are available.",
      });
    }
  },
);

export default router;
