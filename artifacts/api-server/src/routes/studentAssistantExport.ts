import { Router, type IRouter, type Request, type Response } from "express";
import { execFile } from "node:child_process";
import path from "node:path";
import { getStudyStore, type StudentChatReference } from "@workspace/db";
import { optionalStudent, requireStudent, type AuthedRequest } from "../lib/studentAuth";

const router: IRouter = Router();
const EXPORT_SCRIPT = path.resolve(__dirname, "../../../carestudy_rag/src/export_chat_docx.py");
const PREVIEW_SCRIPT = path.resolve(__dirname, "../../../carestudy_rag/src/render_student_document_preview.py");
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

function buildDocumentWorkDocx(
  title: string,
  chapters: {
    name: string;
    content: string;
    formatting?: {
      fontFamily: string;
      fontSize: number;
      lineSpacing: number;
      indent: number;
      alignment: "left" | "center" | "right" | "justify";
      bottomMargin: number;
    };
  }[],
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
    child.stdin?.end(JSON.stringify({ title, chapters }));
  });
}

function buildDocumentWorkPreview(chapterName: string, content: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      PYTHON_BIN,
      [PREVIEW_SCRIPT],
      { timeout: 60_000, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" },
      (error, stdout) => {
        if (error) {
          reject(new Error(error.message.split("\n")[0]));
          return;
        }
        try {
          const payload = JSON.parse(stdout) as { pages?: unknown };
          if (
            !Array.isArray(payload.pages) ||
            payload.pages.length < 1 ||
            payload.pages.length > 40 ||
            !payload.pages.every((page) =>
              typeof page === "string" &&
              /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(page),
            )
          ) {
            reject(new Error("The preview renderer returned invalid pages."));
            return;
          }
          resolve(payload.pages);
        } catch (error) {
          reject(error instanceof Error ? error : new Error("The preview renderer returned invalid JSON."));
        }
      },
    );
    child.stdin?.end(JSON.stringify({ chapterName, content }));
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

router.post(
  "/student/assistant/document-work/preview",
  requireStudent,
  async (req: Request, res: Response): Promise<void> => {
    const chatId = Number(req.body?.chatId);
    const workId = typeof req.body?.workId === "string" ? req.body.workId : "";
    const chapterId = typeof req.body?.chapterId === "string" ? req.body.chapterId : "";
    if (!Number.isSafeInteger(chatId) || chatId < 1 || !workId || !chapterId) {
      res.status(422).json({ error: "The document preview request is invalid." });
      return;
    }

    try {
      const student = (req as AuthedRequest).student;
      const chat = await getStudyStore().getStudentChat(chatId, student.id);
      const work = chat?.messages.find((message) => message.documentWork?.id === workId)?.documentWork;
      if (!chat || !work) {
        res.status(404).json({ error: "The document work could not be found." });
        return;
      }
      const chapter = work.chapters.find((item) => item.id === chapterId);
      if (!chapter) {
        res.status(404).json({ error: "The chapter could not be found." });
        return;
      }
      if (work.fullPaid || work.paidChapterIds.includes(chapterId)) {
        res.status(409).json({ error: "This chapter is unlocked. Refresh the document preview." });
        return;
      }

      const pages = await buildDocumentWorkPreview(chapter.name, chapter.content);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.json({ pages });
    } catch (err) {
      req.log?.error?.(
        { err, studentId: (req as AuthedRequest).student.id, chatId, workId, chapterId },
        "unpaid student document preview rendering failed",
      );
      res.status(500).json({ error: "The watermarked preview could not be rendered right now." });
    }
  },
);

router.post(
  "/student/assistant/document-work/export",
  requireStudent,
  async (req: Request, res: Response): Promise<void> => {
    const chatId = Number(req.body?.chatId);
    const workId = typeof req.body?.workId === "string" ? req.body.workId : "";
    const chapterIds = req.body?.chapterIds;
    if (
      !Number.isSafeInteger(chatId) ||
      chatId < 1 ||
      !workId ||
      (chapterIds !== undefined &&
        (!Array.isArray(chapterIds) ||
          chapterIds.length < 1 ||
          chapterIds.length > 12 ||
          !chapterIds.every((id: unknown) => typeof id === "string")))
    ) {
      res.status(422).json({ error: "The document export request is invalid." });
      return;
    }

    try {
      const student = (req as AuthedRequest).student;
      const chat = await getStudyStore().getStudentChat(chatId, student.id);
      const work = chat?.messages.find((message) => message.documentWork?.id === workId)?.documentWork;
      if (!chat || !work) {
        res.status(404).json({ error: "The document work could not be found." });
        return;
      }

      const selectedIds: string[] = chapterIds ?? work.chapters.map((chapter) => chapter.id);
      const uniqueIds = new Set(selectedIds);
      if (
        uniqueIds.size !== selectedIds.length ||
        !selectedIds.every((id) => work.chapters.some((chapter) => chapter.id === id))
      ) {
        res.status(422).json({ error: "Choose valid chapters from this document." });
        return;
      }
      const unlocked = work.fullPaid
        ? true
        : selectedIds.every((id) => work.paidChapterIds.includes(id));
      if (!unlocked) {
        res.status(403).json({ error: "Payment is required before exporting these chapters." });
        return;
      }

      const chapters = selectedIds
        .map((id) => work.chapters.find((chapter) => chapter.id === id))
        .filter((chapter): chapter is NonNullable<typeof chapter> => chapter !== undefined);
      if (chapters.length !== selectedIds.length) {
        res.status(422).json({ error: "One of the selected chapters is no longer available." });
        return;
      }
      if (chapters.reduce((total, chapter) => total + chapter.content.length, 0) > 500_000) {
        res.status(413).json({ error: "This document is too large to export in one file." });
        return;
      }
      const buffer = await buildDocumentWorkDocx(work.title, chapters);
      const filename = work.title
        .normalize("NFKD")
        .replace(/[^\w -]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 60) || "care-study";
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.docx"`);
      res.send(buffer);
    } catch (err) {
      req.log?.error?.({ err, studentId: (req as AuthedRequest).student.id }, "paid student document export failed");
      res.status(500).json({ error: "The document could not be exported right now." });
    }
  },
);

export default router;
