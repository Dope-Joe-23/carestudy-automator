import { Router, type IRouter, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import {
  getStudyStore,
  type StudentChatMessage,
  type StudentChatReference,
  type StudentDocumentWork,
} from "@workspace/db";
import { generateStudentAssistantImage, isStudentAssistantImageConfigured } from "../lib/nurseflowVideo";
import { optionalStudent, requireStudent, type AuthedRequest } from "../lib/studentAuth";
import { draftWorker, type DraftReference, type StudentCareStudyCadreProfile } from "../lib/draftWorker";

const router: IRouter = Router();
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_HISTORY_ITEMS = 6;
const MAX_HISTORY_MESSAGE_LENGTH = 1_500;
const MAX_HISTORY_INPUT_LENGTH = 20_000;
const MAX_CHAT_MESSAGES = 120;
const MAX_CHAT_MESSAGE_LENGTH = 20_000;
const MAX_CHAT_IMAGE_DATA_URL_LENGTH = 5_600_000;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENT_COUNT = 3;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".txt", ".md"]);
const DOCUMENT_REVIEW_INTENT =
  /\b(?:review\w*|critiqu\w*|analy[sz]\w*|check\w*|correct\w*|fix\w*|rewrit\w*|revis\w*|edit\w*|improv\w*|polish\w*|feedback|consisten\w*|contradict\w*|gaps?|missing|align\w*|compar\w*|assess\w*|evaluat\w*|audit\w*|wrong|errors?|issues?|concerns?|highlight\w*)\b/i;
const MAX_WEB_SOURCES = 5;
const PAYSTACK_BASE = "https://api.paystack.co";
const CARE_STUDY_CADRE_PROFILES: StudentCareStudyCadreProfile[] = [
  { id: "registered_general_nurse", name: "Registered General Nurse", abbreviation: "RGN", status: "available" },
  { id: "registered_midwife", name: "Registered Midwife", abbreviation: "RM", status: "in_development" },
  { id: "public_health_nurse", name: "Public Health Nurse", abbreviation: "PHN", status: "in_development" },
  { id: "mental_health_nurse", name: "Mental Health Nurse", abbreviation: "MHN", status: "in_development" },
];

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
    if (message.attachmentNames !== undefined) {
      const attachmentNames = message.attachmentNames;
      if (
        !Array.isArray(attachmentNames) ||
        attachmentNames.length > MAX_ATTACHMENT_COUNT ||
        !attachmentNames.every((name): name is string => typeof name === "string" && name.length > 0 && name.length <= 255)
      ) return null;
      normalized.attachmentNames = attachmentNames;
      totalCharacters += normalized.attachmentNames.reduce((total, name) => total + name.length, 0);
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
    if (previous?.role !== message.role || previous.content !== message.content) return message;
    return {
      ...message,
      ...(!message.imageDataUrl && previous.imageDataUrl
        ? { imageDataUrl: previous.imageDataUrl }
        : {}),
      ...(!message.documentWork && previous.documentWork
        ? { documentWork: previous.documentWork }
        : {}),
    };
  });
}

function findDocumentWork(
  messages: StudentChatMessage[],
  workId: string,
): { messageIndex: number; work: StudentDocumentWork } | null {
  const messageIndex = messages.findIndex((message) => message.documentWork?.id === workId);
  const work = messageIndex >= 0 ? messages[messageIndex].documentWork : undefined;
  return work ? { messageIndex, work } : null;
}

function hasPaidChapter(work: StudentDocumentWork, chapterId: string): boolean {
  return work.fullPaid || work.paidChapterIds.includes(chapterId);
}

function hideUnpaidChapterContent(work: StudentDocumentWork): StudentDocumentWork {
  return {
    ...work,
    chapters: work.chapters.map((chapter) =>
      hasPaidChapter(work, chapter.id) ? chapter : { ...chapter, content: "" },
    ),
  };
}

function hideUnpaidContentInMessages(messages: StudentChatMessage[]): StudentChatMessage[] {
  return messages.map((message) =>
    message.documentWork
      ? { ...message, documentWork: hideUnpaidChapterContent(message.documentWork) }
      : message,
  );
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

function decodeAttachments(
  value: unknown,
  legacyValue: unknown,
): { filename: string; content: string }[] | undefined | null {
  if (value !== undefined && legacyValue !== undefined) return null;
  const rawAttachments = value === undefined ? legacyValue : value;
  if (rawAttachments === undefined || rawAttachments === null) return undefined;
  const items = Array.isArray(rawAttachments) ? rawAttachments : [rawAttachments];
  if (items.length > MAX_ATTACHMENT_COUNT) return null;

  const attachments: { filename: string; content: string }[] = [];
  let totalBytes = 0;
  for (const item of items) {
    const attachment = decodeAttachment(item);
    if (!attachment) return null;
    totalBytes += Buffer.from(attachment.content, "base64").length;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) return null;
    attachments.push(attachment);
  }
  return attachments;
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
  optionalStudent,
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
      res.status(422).json({ error: "The conversation context is invalid. Please start a new message." });
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
    const cadreProfileId = req.body?.cadreProfileId === undefined
      ? "registered_general_nurse"
      : req.body.cadreProfileId;
    if (typeof cadreProfileId !== "string") {
      res.status(422).json({ error: "Select a valid care-study cadre." });
      return;
    }
    const cadreProfile = CARE_STUDY_CADRE_PROFILES.find((profile) => profile.id === cadreProfileId);
    if (!cadreProfile) {
      res.status(422).json({ error: "Select a valid care-study cadre." });
      return;
    }
    if (cadreProfile.status !== "available") {
      res.status(422).json({
        error: `${cadreProfile.name} review is not available yet. Choose a cadre with an approved review profile.`,
      });
      return;
    }
    const student = (req as AuthedRequest).student;
    if (!student && conversationId !== null) {
      res.status(401).json({ error: "Sign in to open and continue saved conversations." });
      return;
    }
    const attachments = decodeAttachments(req.body?.attachments, req.body?.attachment);
    if (attachments === null) {
      res.status(422).json({
        error: "Attach up to 3 PDF, DOCX, TXT, or Markdown files, no larger than 10 MB each or 20 MB combined.",
      });
      return;
    }
    const savedAttachmentNames = chatMessages
      .slice(0, -1)
      .some((chatMessage) => chatMessage.role === "user" && (
        Boolean(chatMessage.attachmentName) || Boolean(chatMessage.attachmentNames?.length)
      ));
    if (!attachments?.length && savedAttachmentNames && DOCUMENT_REVIEW_INTENT.test(message)) {
      res.status(422).json({
        error: "The files from this saved conversation are not available to analyze. Reattach them to continue the review.",
      });
      return;
    }

    try {
      const store = student ? getStudyStore() : null;
      const existing = student && conversationId !== null
        ? await store?.getStudentChat(conversationId, student.id)
        : null;
      if (conversationId !== null && !existing) {
        res.status(404).json({ error: "That conversation could not be found." });
        return;
      }
      if (req.body?.documentWorkRequest !== undefined) {
        const request = req.body.documentWorkRequest;
        if (
          !student ||
          !request ||
          typeof request !== "object" ||
          !["correction", "rewrite"].includes((request as Record<string, unknown>).type as string) ||
          (request as Record<string, unknown>).scope !== "chapters" ||
          !attachments ||
          attachments.length !== 1
        ) {
          res.status(422).json({
            error: "Sign in, attach one chapter, and choose correction or rewrite.",
          });
          return;
        }
        const workRequest = request as { type: "correction" | "rewrite"; scope: "chapters" };
        const result = await draftWorker.createStudentDocumentWork(
          message,
          attachments[0],
          workRequest.type,
          workRequest.scope,
        );
        const documentWork: StudentDocumentWork | undefined = result.work
          ? {
              ...result.work,
              id: randomBytes(16).toString("hex"),
              paidChapterIds: [],
              fullPaid: false,
              charges: [],
            }
          : undefined;
        const assistantMessage: StudentChatMessage = {
          role: "assistant",
          content: result.answer,
          ...(documentWork ? { documentWork } : {}),
        };
        const updatedMessages = mergeStoredImages(
          [...chatMessages, assistantMessage],
          existing?.messages,
        );
        const saved = existing
          ? await store?.updateStudentChat(existing.id, student.id, {
              title: chatTitle(updatedMessages),
              messages: updatedMessages,
            })
          : await store?.addStudentChat({
              studentId: student.id,
              title: chatTitle(updatedMessages),
              messages: updatedMessages,
            });
        if (!saved) {
          res.status(404).json({ error: "That conversation was deleted before the result could be saved." });
          return;
        }
        res.json({
          answer: result.answer,
          references: [],
          conversationId: saved.id,
          ...(documentWork ? { documentWork: hideUnpaidChapterContent(documentWork) } : {}),
          ...(result.conditionChangeRejected ? { conditionChangeRejected: true } : {}),
        });
        return;
      }
      const webSearch = req.body?.webSearch === true;
      const webSources = webSearch ? await searchBrave(message) : [];
      const result = await draftWorker.chatWithStudent(
        message,
        history,
        attachments,
        webSources,
        cadreProfile.id,
      );
      if (!result.answer.trim()) {
        throw new Error("The assistant returned an empty answer.");
      }
      const references: DraftReference[] = Array.isArray(result.references)
        ? result.references
        : [];
      if (!student || !store) {
        res.json({ answer: result.answer, references });
        return;
      }
      const updatedMessages = mergeStoredImages(
        [...chatMessages, { role: "assistant", content: result.answer, references }],
        existing?.messages,
      );
      const saved = existing
        ? await store.updateStudentChat(existing.id, student.id, {
            title: chatTitle(updatedMessages),
            messages: updatedMessages,
          })
        : await store.addStudentChat({
            studentId: student.id,
            title: chatTitle(updatedMessages),
            messages: updatedMessages,
          });
      if (!saved) {
        res.status(404).json({ error: "That conversation was deleted before the answer could be saved." });
        return;
      }
      res.json({ answer: result.answer, references, conversationId: saved.id });
    } catch (err) {
      req.log?.error?.({ err, studentId: student?.id }, "student assistant failed");
      const isSearchSetupError = err instanceof Error && err.message.includes("BRAVE_SEARCH_API_KEY");
      const attachmentTooLarge = err instanceof Error
        ? err.message.match(/ATTACHMENT_TOO_LARGE:\s*(.*)/)?.[1]?.trim()
        : undefined;
      const status = attachmentTooLarge ? 413 : isSearchSetupError ? 503 : 502;
      res.status(status).json({
        error: attachmentTooLarge ?? (err instanceof Error ? err.message : "Nursuit could not answer right now."),
      });
    }
  },
);

router.get("/student/assistant/tools", (_req, res) => {
  res.json({
    webSearch: Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim()),
    imageGeneration: isStudentAssistantImageConfigured(),
    careStudyCadres: CARE_STUDY_CADRE_PROFILES,
  });
});

router.post("/student/assistant/document-work/payment/initialize", requireStudent, async (req, res): Promise<void> => {
  const chatId = Number(req.body?.chatId);
  const workId = typeof req.body?.workId === "string" ? req.body.workId : "";
  const scope = req.body?.scope;
  const chapterId = typeof req.body?.chapterId === "string" ? req.body.chapterId : null;
  if (!Number.isSafeInteger(chatId) || chatId < 1 || !workId || scope !== "chapter") {
    res.status(422).json({ error: "The document payment request is invalid." });
    return;
  }
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) {
    res.status(503).json({ error: "Online payment is not available right now. Please contact support." });
    return;
  }

  const student = (req as AuthedRequest).student;
  const db = getStudyStore();
  const chat = await db.getStudentChat(chatId, student.id);
  const found = chat && findDocumentWork(chat.messages, workId);
  if (!chat || !found) {
    res.status(404).json({ error: "The document work could not be found." });
    return;
  }
  const { work, messageIndex } = found;
  if (work.charges.some((charge) => charge.status === "pending")) {
    res.status(409).json({ error: "A payment for this document is already in progress. Complete or verify it before starting another." });
    return;
  }
  if (!chapterId || !work.chapters.some((chapter) => chapter.id === chapterId)) {
    res.status(422).json({ error: "Choose a chapter in this document." });
    return;
  }
  if (hasPaidChapter(work, chapterId)) {
    res.status(409).json({ error: "This chapter has already been paid for." });
    return;
  }
  const amount = 50;

  const reference = `SW-${chatId}-${randomBytes(8).toString("hex")}`;
  const charge: StudentDocumentWork["charges"][number] = {
    reference,
    scope,
    chapterId,
    amount,
    status: "pending",
  };
  const pendingWork = { ...work, charges: [...work.charges, charge] };
  const pendingMessages = chat.messages.map((item, index) =>
    index === messageIndex ? { ...item, documentWork: pendingWork } : item,
  );
  const saved = await db.updateStudentChat(chat.id, student.id, {
    title: chat.title,
    messages: pendingMessages,
  });
  if (!saved) {
    res.status(404).json({ error: "The document work was removed before checkout could start." });
    return;
  }

  try {
    const response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: student.email,
        amount: amount * 100,
        reference,
        currency: "GHS",
        metadata: {
          chatId,
          workId,
          scope,
          chapterId,
          studentId: student.id,
          amountGhs: amount,
        },
      }),
    });
    const data = await response.json() as {
      status?: boolean;
      data?: { authorization_url?: string };
      message?: string;
    };
    if (!response.ok || !data.status || !data.data?.authorization_url) {
      throw new Error(data.message || "Paystack could not start checkout.");
    }
    res.json({
      reference,
      amount: amount * 100,
      email: student.email,
      authorization_url: data.data.authorization_url,
      work: hideUnpaidChapterContent(pendingWork),
    });
  } catch (error) {
    const failedWork = {
      ...pendingWork,
      charges: pendingWork.charges.map((item) =>
        item.reference === reference ? { ...item, status: "failed" as const } : item,
      ),
    };
    await db.updateStudentChat(chat.id, student.id, {
      title: chat.title,
      messages: pendingMessages.map((item, index) =>
        index === messageIndex ? { ...item, documentWork: failedWork } : item,
      ),
    });
    req.log?.error?.({ error, chatId, workId }, "student document payment initialization failed");
    res.status(502).json({
      error: error instanceof Error ? error.message : "Unable to start checkout.",
    });
  }
});

router.post("/student/assistant/document-work/payment/verify", requireStudent, async (req, res): Promise<void> => {
  const chatId = Number(req.body?.chatId);
  const workId = typeof req.body?.workId === "string" ? req.body.workId : "";
  const reference = typeof req.body?.reference === "string" ? req.body.reference : "";
  if (!Number.isSafeInteger(chatId) || chatId < 1 || !workId || !reference) {
    res.status(422).json({ error: "The payment verification request is invalid." });
    return;
  }
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) {
    res.status(503).json({ error: "Online payment verification is not available right now." });
    return;
  }
  const student = (req as AuthedRequest).student;
  const db = getStudyStore();
  const chat = await db.getStudentChat(chatId, student.id);
  const found = chat && findDocumentWork(chat.messages, workId);
  if (!chat || !found) {
    res.status(404).json({ error: "The document work could not be found." });
    return;
  }
  const { work, messageIndex } = found;
  const charge = work.charges.find((item) => item.reference === reference);
  if (!charge) {
    res.status(404).json({ error: "That payment reference does not belong to this document." });
    return;
  }
  if (charge.status === "verified") {
    res.json({ verified: true, work: hideUnpaidChapterContent(work) });
    return;
  }

  try {
    const response = await fetch(
      `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const result = await response.json() as {
      status?: boolean;
      message?: string;
      data?: {
        status?: string;
        amount?: number;
        reference?: string;
        currency?: string;
      };
    };
    if (!response.ok || !result.status) {
      res.status(502).json({ error: result.message || "Payment verification could not be completed." });
      return;
    }
    const transactionSucceeded = result.data?.status === "success";
    const referenceMatches = result.data?.reference === reference;
    const amountMatches = result.data?.amount === charge.amount * 100;
    const currencyMatches = result.data?.currency?.toUpperCase() === "GHS";
    const validPayment =
      transactionSucceeded &&
      referenceMatches &&
      amountMatches &&
      currencyMatches;
    if (!validPayment) {
      req.log?.warn?.(
        {
          transactionSucceeded,
          referenceMatches,
          amountMatches,
          currencyMatches,
        },
        "Paystack transaction did not match document payment",
      );
      const unresolvedWork: StudentDocumentWork = {
        ...work,
        charges: work.charges.map((item) =>
          item.reference === reference
            ? { ...item, status: transactionSucceeded ? "pending" : "failed" }
            : item,
        ),
      };
      await db.updateStudentChat(chat.id, student.id, {
        title: chat.title,
        messages: chat.messages.map((item, index) =>
          index === messageIndex ? { ...item, documentWork: unresolvedWork } : item,
        ),
      });
      res.json({
        verified: false,
        work: hideUnpaidChapterContent(unresolvedWork),
        message: transactionSucceeded
          ? "Paystack reports a successful payment, but its amount, currency, or reference did not match this chapter. The chapter remains locked; please contact support."
          : "Payment was not confirmed. Please try again.",
      });
      return;
    }

    const paidChapterIds = charge.scope === "full" || !charge.chapterId
      ? work.chapters.map((chapter) => chapter.id)
      : [...new Set([...work.paidChapterIds, charge.chapterId])];
    const verifiedWork: StudentDocumentWork = {
      ...work,
      fullPaid: work.fullPaid || charge.scope === "full",
      paidChapterIds,
      charges: work.charges.map((item) =>
        item.reference === reference ? { ...item, status: "verified" as const } : item,
      ),
    };
    const saved = await db.updateStudentChat(chat.id, student.id, {
      title: chat.title,
      messages: chat.messages.map((item, index) =>
        index === messageIndex ? { ...item, documentWork: verifiedWork } : item,
      ),
    });
    if (!saved) {
      res.status(404).json({ error: "The document work was removed during payment verification." });
      return;
    }
    res.json({ verified: true, work: hideUnpaidChapterContent(verifiedWork) });
  } catch (error) {
    req.log?.error?.({ error, chatId, workId }, "student document payment verification failed");
    res.status(502).json({ error: "Payment verification could not be completed. Please try again." });
  }
});

router.put("/student/assistant/document-work", requireStudent, async (req, res): Promise<void> => {
  const chatId = Number(req.body?.chatId);
  const workId = typeof req.body?.workId === "string" ? req.body.workId : "";
  const edits = req.body?.chapters;
  const rawFormatting = req.body?.formatting;
  const validFormatting = rawFormatting === undefined || (
    rawFormatting &&
    typeof rawFormatting === "object" &&
    ["Georgia", "Times New Roman", "Arial", "Calibri", "Garamond", "Helvetica", "Palatino", "Courier New"]
      .includes(rawFormatting.fontFamily) &&
    [10, 11, 12, 13, 14].includes(rawFormatting.fontSize) &&
    [1, 1.15, 1.5, 2].includes(rawFormatting.lineSpacing) &&
    [0, 0.25, 0.5].includes(rawFormatting.indent) &&
    ["left", "center", "right", "justify"].includes(rawFormatting.alignment) &&
    [0.5, 0.75, 1, 1.25, 1.5].includes(rawFormatting.bottomMargin)
  );
  if (
    !Number.isSafeInteger(chatId) ||
    chatId < 1 ||
    !workId ||
    !validFormatting ||
    !Array.isArray(edits) ||
    edits.length < 1 ||
    edits.length > 12 ||
    !edits.every((item) =>
      item &&
      typeof item.id === "string" &&
      typeof item.content === "string" &&
      item.content.length <= 100_000,
    )
  ) {
    res.status(422).json({ error: "The document edits are invalid." });
    return;
  }
  const student = (req as AuthedRequest).student;
  const db = getStudyStore();
  const chat = await db.getStudentChat(chatId, student.id);
  const found = chat && findDocumentWork(chat.messages, workId);
  if (!chat || !found) {
    res.status(404).json({ error: "The document work could not be found." });
    return;
  }
  const { work, messageIndex } = found;
  const editableIds = new Set(
    work.chapters.filter((chapter) => hasPaidChapter(work, chapter.id)).map((chapter) => chapter.id),
  );
  if (!edits.every((item: { id: string }) => editableIds.has(item.id))) {
    res.status(403).json({ error: "Payment is required before editing this chapter." });
    return;
  }
  const editedWork: StudentDocumentWork = {
    ...work,
    chapters: work.chapters.map((chapter) => {
      const edit = edits.find((item: { id: string }) => item.id === chapter.id);
      return edit
        ? {
            ...chapter,
            content: edit.content,
            ...(rawFormatting ? { formatting: rawFormatting } : {}),
          }
        : chapter;
    }),
  };
  const saved = await db.updateStudentChat(chat.id, student.id, {
    title: chat.title,
    messages: chat.messages.map((item, index) =>
      index === messageIndex ? { ...item, documentWork: editedWork } : item,
    ),
  });
  if (!saved) {
    res.status(404).json({ error: "The document work was removed before the edits were saved." });
    return;
  }
  res.json({ work: hideUnpaidChapterContent(editedWork) });
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
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({
      chat: {
        id: chat.id,
        title: chat.title,
        messages: hideUnpaidContentInMessages(chat.messages),
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

router.post("/student/assistant/image", optionalStudent, async (req, res): Promise<void> => {
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
  const student = (req as AuthedRequest).student;
  if (!student && conversationId !== null) {
    res.status(401).json({ error: "Sign in to open and continue saved conversations." });
    return;
  }
  const chatMessages = validateChatMessages(req.body?.messages);
  if (!chatMessages || chatMessages.at(-1)?.role !== "user" || chatMessages.at(-1)?.content !== prompt) {
    res.status(422).json({ error: "The conversation context is invalid. Please start a new message." });
    return;
  }
  try {
    const store = student ? getStudyStore() : null;
    const existing = student && conversationId !== null
      ? await store?.getStudentChat(conversationId, student.id)
      : null;
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
    if (!student || !store) {
      res.json({
        answer: updatedMessages.at(-1)?.content,
        imageDataUrl,
      });
      return;
    }
    const saved = existing
      ? await store.updateStudentChat(existing.id, student.id, {
          title: chatTitle(updatedMessages),
          messages: updatedMessages,
        })
      : await store.addStudentChat({
          studentId: student.id,
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
    req.log?.error?.({ err, studentId: student?.id }, "student image generation failed");
    const isSetupError = err instanceof Error && err.message.includes("CLOUDFLARE_API_TOKEN");
    res.status(isSetupError ? 503 : 502).json({
      error: err instanceof Error ? err.message : "Image generation failed.",
    });
  }
});

export default router;
