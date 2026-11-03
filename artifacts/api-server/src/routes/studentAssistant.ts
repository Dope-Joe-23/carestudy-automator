import { Router, type IRouter, type Request, type Response } from "express";
import { getStudyStore, type StudentChatMessage, type StudentChatReference } from "@workspace/db";
import { generateStudentAssistantImage, isStudentAssistantImageConfigured } from "../lib/nurseflowVideo";
import { requireStudent, type AuthedRequest } from "../lib/studentAuth";
import { draftWorker, type DraftReference } from "../lib/draftWorker";

const router: IRouter = Router();
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_HISTORY_ITEMS = 6;
const MAX_HISTORY_MESSAGE_LENGTH = 1_500;
const MAX_HISTORY_INPUT_LENGTH = 20_000;
const MAX_CHAT_MESSAGES = 120;
const MAX_CHAT_MESSAGE_LENGTH = 20_000;
const MAX_CHAT_IMAGE_DATA_URL_LENGTH = 5_600_000;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".txt", ".md"]);
const MAX_WEB_SOURCES = 5;

type ChatMessage = { role: "user" | "assistant"; content: string };
type WebSource = { title: string; url: string; snippet: string; date: string };

function getStudentId(req: Request): number {
  return (req as AuthedRequest).student.id;
}

function normalizeReferences(value: unknown): StudentChatReference[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) return null;
  const references: StudentChatReference[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const ref = item as Record<string, unknown>;
    if (
      typeof ref.label !== "string" ||
      typeof ref.inText !== "string" ||
      (ref.url !== undefined && ref.url !== null && typeof ref.url !== "string")
    ) return null;
    references.push({
      label: ref.label.slice(0, 500),
      inText: ref.inText.slice(0, 200),
      url: typeof ref.url === "string" ? ref.url.slice(0, 2_000) : null,
    });
  }
  return references;
}

function validateChatMessages(value: unknown): StudentChatMessage[] | null {
  if (!Array.isArray(value) || value.length > MAX_CHAT_MESSAGES) return null;
  const messages: StudentChatMessage[] = [];
  let totalCharacters = 0;
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      !["user", "assistant"].includes((item as ChatMessage).role) ||
      typeof (item as ChatMessage).content !== "string" ||
      (item as ChatMessage).content.length > MAX_CHAT_MESSAGE_LENGTH
    ) return null;
    const message = item as Record<string, unknown>;
    totalCharacters += (message.content as string).length;
    if (totalCharacters > 100_000) return null;
    const references = normalizeReferences(message.references);
    if (!references) return null;
    totalCharacters += references.reduce(
      (total, reference) => total + reference.label.length + reference.inText.length + (reference.url?.length ?? 0),
      0,
    );
    if (totalCharacters > 100_000) return null;
    const normalized: StudentChatMessage = {
      role: message.role as ChatMessage["role"],
      content: message.content as string,
    };
    if (message.attachmentName !== undefined) {
      if (typeof message.attachmentName !== "string" || message.attachmentName.length > 255) return null;
      normalized.attachmentName = message.attachmentName;
      totalCharacters += message.attachmentName.length;
      if (totalCharacters > 100_000) return null;
    }
    if (references.length) normalized.references = references;
    if (message.imageDataUrl !== undefined) {
      if (
        typeof message.imageDataUrl !== "string" ||
        message.imageDataUrl.length > MAX_CHAT_IMAGE_DATA_URL_LENGTH ||
        !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(message.imageDataUrl)
      ) return null;
      normalized.imageDataUrl = message.imageDataUrl;
      totalCharacters += message.imageDataUrl.length;
      if (totalCharacters > 6_000_000) return null;
    }
    messages.push(normalized);
  }
  return messages;
}

function chatTitle(messages: StudentChatMessage[]): string {
  const firstQuestion = messages.find((message) => message.role === "user")?.content.trim();
  if (!firstQuestion) return "New conversation";
  const singleLine = firstQuestion.replace(/\s+/g, " ");
  return singleLine.length > 80 ? `${singleLine.slice(0, 77)}...` : singleLine;
}

function mergeStoredImages(
  messages: StudentChatMessage[],
  existing: StudentChatMessage[] = [],
): StudentChatMessage[] {
  return messages.map((message, index) => {
    const previous = existing[index];
    if (
      !message.imageDataUrl &&
      previous?.role === message.role &&
      previous.content === message.content &&
      previous.imageDataUrl
    ) {
      return { ...message, imageDataUrl: previous.imageDataUrl };
    }
    return message;
  });
}

async function searchBrave(query: string): Promise<WebSource[]> {
  const token = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!token) {
    throw new Error("Web search is not configured. Set BRAVE_SEARCH_API_KEY on the API server.");
  }
  let response: globalThis.Response;
  try {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(MAX_WEB_SOURCES));
    url.searchParams.set("search_lang", "en");
    url.searchParams.set("text_decorations", "false");
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": token,
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    throw new Error(error instanceof Error ? `Web search failed: ${error.message}` : "Web search failed.");
  }
  if (!response.ok) {
    throw new Error(`Brave Search returned HTTP ${response.status}. Please try again later.`);
  }
  const payload = await response.json() as {
    web?: { results?: Array<{ title?: unknown; url?: unknown; description?: unknown; page_age?: unknown }> };
  };
  return (payload.web?.results ?? [])
    .map((result): WebSource | null => {
      if (
        typeof result.title !== "string" ||
        typeof result.url !== "string" ||
        typeof result.description !== "string"
      ) return null;
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(result.url);
      } catch {
        return null;
      }
      if (!["http:", "https:"].includes(parsedUrl.protocol)) return null;
      return {
        title: result.title.slice(0, 300),
        url: parsedUrl.toString(),
        snippet: result.description.slice(0, 2_000),
        date: typeof result.page_age === "string" ? result.page_age.slice(0, 100) : "",
      };
    })
    .filter((source): source is WebSource => source !== null)
    .slice(0, MAX_WEB_SOURCES);
}

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
      (item as ChatMessage).content.length > MAX_HISTORY_INPUT_LENGTH
    ) {
      return null;
    }
    messages.push({
      role: (item as ChatMessage).role,
      content: (item as ChatMessage).content.slice(-MAX_HISTORY_MESSAGE_LENGTH),
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
    const chatMessages = validateChatMessages(req.body?.messages);
    if (!chatMessages || chatMessages.at(-1)?.role !== "user" || chatMessages.at(-1)?.content !== message) {
      res.status(422).json({ error: "The conversation could not be saved. Please start a new message." });
      return;
    }
    const rawChatId = req.body?.conversationId;
    const conversationId = rawChatId === undefined || rawChatId === null
      ? null
      : Number.isSafeInteger(rawChatId) && rawChatId > 0
        ? rawChatId as number
        : NaN;
    if (Number.isNaN(conversationId)) {
      res.status(422).json({ error: "The conversation id is invalid." });
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
      const studentId = getStudentId(req);
      const store = getStudyStore();
      const existing = conversationId === null
        ? null
        : await store.getStudentChat(conversationId, studentId);
      if (conversationId !== null && !existing) {
        res.status(404).json({ error: "That conversation could not be found." });
        return;
      }
      const webSearch = req.body?.webSearch === true;
      const webSources = webSearch ? await searchBrave(message) : [];
      const result = await draftWorker.chatWithStudent(message, history, attachment, webSources);
      if (!result.answer.trim()) {
        throw new Error("The assistant returned an empty answer.");
      }
      const references: DraftReference[] = Array.isArray(result.references)
        ? result.references
        : [];
      const updatedMessages = mergeStoredImages(
        [...chatMessages, { role: "assistant", content: result.answer, references }],
        existing?.messages,
      );
      const saved = existing
        ? await store.updateStudentChat(existing.id, studentId, {
            title: chatTitle(updatedMessages),
            messages: updatedMessages,
          })
        : await store.addStudentChat({
            studentId,
            title: chatTitle(updatedMessages),
            messages: updatedMessages,
          });
      if (!saved) {
        res.status(404).json({ error: "That conversation was deleted before the answer could be saved." });
        return;
      }
      res.json({ answer: result.answer, references, conversationId: saved.id });
    } catch (err) {
      req.log?.error?.({ err, studentId: getStudentId(req) }, "student assistant failed");
      const isSearchSetupError = err instanceof Error && err.message.includes("BRAVE_SEARCH_API_KEY");
      const status = isSearchSetupError ? 503 : 502;
      res.status(status).json({
        error: err instanceof Error ? err.message : "NurseAid could not answer right now.",
      });
    }
  },
);

router.get("/student/assistant/tools", requireStudent, (_req, res) => {
  res.json({
    webSearch: Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim()),
    imageGeneration: isStudentAssistantImageConfigured(),
  });
});

router.get("/student/chats", requireStudent, async (req, res): Promise<void> => {
  try {
    const chats = await getStudyStore().listStudentChats(getStudentId(req));
    res.json({
      chats: chats.map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt })),
    });
  } catch (err) {
    req.log?.error?.({ err, studentId: getStudentId(req) }, "student chat list failed");
    res.status(503).json({ error: "Chat history is unavailable right now." });
  }
});

router.get("/student/chats/:chatId", requireStudent, async (req, res): Promise<void> => {
  const id = Number(req.params.chatId);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(422).json({ error: "The conversation id is invalid." });
    return;
  }
  try {
    const chat = await getStudyStore().getStudentChat(id, getStudentId(req));
    if (!chat) {
      res.status(404).json({ error: "That conversation could not be found." });
      return;
    }
    res.json({
      chat: {
        id: chat.id,
        title: chat.title,
        messages: chat.messages,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      },
    });
  } catch (err) {
    req.log?.error?.({ err, studentId: getStudentId(req) }, "student chat load failed");
    res.status(503).json({ error: "That conversation could not be loaded right now." });
  }
});

router.delete("/student/chats/:chatId", requireStudent, async (req, res): Promise<void> => {
  const id = Number(req.params.chatId);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(422).json({ error: "The conversation id is invalid." });
    return;
  }
  try {
    const removed = await getStudyStore().removeStudentChat(id, getStudentId(req));
    if (!removed) {
      res.status(404).json({ error: "That conversation could not be found." });
      return;
    }
    res.status(204).end();
  } catch (err) {
    req.log?.error?.({ err, studentId: getStudentId(req) }, "student chat delete failed");
    res.status(503).json({ error: "That conversation could not be deleted right now." });
  }
});

router.post("/student/assistant/image", requireStudent, async (req, res): Promise<void> => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt || prompt.length > 2_000) {
    res.status(422).json({ error: "Enter an image prompt of up to 2,000 characters." });
    return;
  }
  const conversationId = req.body?.conversationId === undefined || req.body?.conversationId === null
    ? null
    : Number.isSafeInteger(req.body.conversationId) && req.body.conversationId > 0
      ? req.body.conversationId as number
      : NaN;
  if (Number.isNaN(conversationId)) {
    res.status(422).json({ error: "The conversation id is invalid." });
    return;
  }
  const chatMessages = validateChatMessages(req.body?.messages);
  if (!chatMessages || chatMessages.at(-1)?.role !== "user" || chatMessages.at(-1)?.content !== prompt) {
    res.status(422).json({ error: "The conversation could not be saved. Please start a new message." });
    return;
  }
  try {
    const studentId = getStudentId(req);
    const store = getStudyStore();
    const existing = conversationId === null
      ? null
      : await store.getStudentChat(conversationId, studentId);
    if (conversationId !== null && !existing) {
      res.status(404).json({ error: "That conversation could not be found." });
      return;
    }
    const image = await generateStudentAssistantImage(prompt);
    const imageDataUrl = `data:${image.mimeType};base64,${image.bytes.toString("base64")}`;
    const updatedMessages = mergeStoredImages(
      [
        ...chatMessages,
        {
          role: "assistant",
          content: "Generated an educational illustration. Review it for accuracy before using it.",
          imageDataUrl,
        },
      ],
      existing?.messages,
    );
    const saved = existing
      ? await store.updateStudentChat(existing.id, studentId, {
          title: chatTitle(updatedMessages),
          messages: updatedMessages,
        })
      : await store.addStudentChat({
          studentId,
          title: chatTitle(updatedMessages),
          messages: updatedMessages,
        });
    if (!saved) {
      res.status(404).json({ error: "That conversation was deleted before the image could be saved." });
      return;
    }
    res.json({
      conversationId: saved.id,
      answer: updatedMessages.at(-1)?.content,
      imageDataUrl,
    });
  } catch (err) {
    req.log?.error?.({ err, studentId: getStudentId(req) }, "student image generation failed");
    const isSetupError = err instanceof Error && err.message.includes("CLOUDFLARE_API_TOKEN");
    res.status(isSetupError ? 503 : 502).json({
      error: err instanceof Error ? err.message : "Image generation failed.",
    });
  }
});

export default router;
