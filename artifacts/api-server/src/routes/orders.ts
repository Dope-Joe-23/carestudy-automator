import { Router, type IRouter, type Request, type Response } from "express";
import {
  getStudyStore,
  ORDER_STATUSES,
  type OrderFileKind,
  type OrderStatus,
  type StudyStore,
} from "@workspace/db";
import {
  detectUploadType,
  removeOrderArtifacts,
  storeOrderDelivery,
  storeOrderUpload,
  UploadError,
} from "../lib/uploads";
import { indexStudyFiles } from "./uploads";
import { requireStudent, type AuthedRequest } from "../lib/studentAuth";
import { draftWorker, type VivaQuestion } from "../lib/draftWorker";

// Two routers from one file: the student-facing half (orders the signed-in
// student places, plus the viva preparation) and the studio half (the order
// bin + produce flow, mounted behind requireAdmin in routes/index.ts).
const studentRouter: IRouter = Router();
const studioRouter: IRouter = Router();

// Same lazy store + error-wrapping pattern as routes/studies.ts.
let store: StudyStore | null = null;
let storageUnavailable: string | null = null;

function studyStore(): StudyStore {
  if (storageUnavailable) throw new Error(storageUnavailable);
  if (store) return store;
  try {
    store = getStudyStore();
    return store;
  } catch (err) {
    storageUnavailable = `Study storage failed to initialize: ${
      err instanceof Error ? err.message : "unknown error"
    }`;
    throw new Error(storageUnavailable);
  }
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    handler(req, res).catch((err) => {
      req.log?.error?.({ err }, "order request failed");
      const status = err instanceof UploadError ? err.status : 500;
      const message =
        err instanceof Error ? err.message : "Unexpected order error";
      res.status(status).json({ error: message });
    });
  };
}

function parseId(raw: string | string[] | undefined): number | null {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strOrNull(value: unknown): string | null {
  const trimmed = str(value);
  return trimmed ? trimmed : null;
}

const FILE_KINDS: OrderFileKind[] = ["guidelines", "clinical", "reference", "correction"];
const MAX_ORDER_FILES = 10;

/** Decode the client's base64 payload; null when it isn't valid base64. */
function decodeBase64(raw: unknown): Buffer | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const buf = Buffer.from(raw, "base64");
    // Round-trip so garbage like "not base64!!" can't slip through as empty.
    if (buf.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) return null;
    return buf;
  } catch {
    return null;
  }
}

/** The order shape the student portal receives (never exposes disk paths). */
function publicOrder(order: {
  id: number;
  title: string;
  diagnosis: string | null;
  college: string;
  program: string;
  notes: string | null;
  correctionScope: string | null;
  correctionText: string | null;
  status: string;
  note: string | null;
  producedStudyId: number | null;
  deliveryFilename: string | null;
  deliverySize: number | null;
  vivaStatus: string;
  vivaError: string | null;
  vivaUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: order.id,
    title: order.title,
    diagnosis: order.diagnosis,
    college: order.college,
    program: order.program,
    notes: order.notes,
    correctionScope: order.correctionScope,
    correctionText: order.correctionText,
    status: order.status,
    note: order.note,
    producedStudyId: order.producedStudyId,
    delivery:
      order.deliveryFilename && order.deliverySize !== null
        ? { filename: order.deliveryFilename, size: order.deliverySize }
        : null,
    vivaStatus: order.vivaStatus,
    vivaError: order.vivaError,
    vivaUpdatedAt: order.vivaUpdatedAt ? order.vivaUpdatedAt.toISOString() : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

/** Parse the stored viva bank JSON into the questions array (or []). */
function parseVivaBank(bankJson: string | null): VivaQuestion[] {
  if (!bankJson) return [];
  try {
    const parsed = JSON.parse(bankJson);
    const questions = parsed?.questions;
    if (!Array.isArray(questions)) return [];
    return questions
      .filter(
        (q: unknown) =>
          typeof q === "object" &&
          q !== null &&
          typeof (q as VivaQuestion).question === "string",
      )
      .map((q) => ({
        ...(q as VivaQuestion),
        guidance: normalizeGuidance((q as VivaQuestion).guidance),
      })) as VivaQuestion[];
  } catch {
    return [];
  }
}

/**
 * Turn a list-shaped guidance string ("['A', 'B']") into bullet lines.
 *
 * Models render the outline as a Python literal (single quotes, possibly
 * with apostrophes like "B's") more often than valid JSON, so this accepts
 * both: try JSON first, then tokenize the Python list form.
 */
function normalizeGuidance(value: string): string {
  const stripped = value.trim();
  if (!(stripped.startsWith("[") && stripped.endsWith("]"))) return value;

  let items: unknown = null;
  try {
    items = JSON.parse(stripped);
  } catch {
    items = parsePythonListLiteral(stripped);
  }
  if (!Array.isArray(items) || items.length === 0) return value;
  const lines = items
    .map((item) => String(item).trim())
    .filter((line) => line.length > 0)
    .map((line) => `\u2022 ${line}`);
  return lines.length > 0 ? lines.join("\n") : value;
}

/** Split a Python-style list literal ("['a', 'b']") into its string items. */
function parsePythonListLiteral(raw: string): string[] | null {
  const inner = raw.slice(1, -1).trim();
  if (!inner) return [];
  const items: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (quote) {
      if (char === "\\") {
        current += char + (inner[i + 1] ?? "");
        i += 1;
      } else if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === ",") {
      items.push(current.trim());
      current = "";
    } else if (!/\s/.test(char)) {
      // Bare tokens (numbers, unquoted words) — collect them.
      current += char;
    }
  }
  if (quote) return null; // unterminated string — not a clean literal
  const last = current.trim();
  if (last) items.push(last);
  return items;
}

// ---------------------------------------------------------------------------
// Student routes (bearer-token auth, scoped to the signed-in student)
// ---------------------------------------------------------------------------

// POST /api/orders — place an order with your project information + materials.
// Body: { title, diagnosis?, college, program, notes?, files?: [{ kind,
// filename, content(base64) }] }.
studentRouter.post(
  "/orders",
  requireStudent,
  asyncRoute(async (req, res) => {
    const student = (req as AuthedRequest).student;
    const title = str(req.body?.title);
    const diagnosis = strOrNull(req.body?.diagnosis);
    const college = str(req.body?.college);
    const program = str(req.body?.program);
    const notes = strOrNull(req.body?.notes);
    const correctionScope = req.body?.correctionScope === "chapter" || req.body?.correctionScope === "full"
      ? req.body.correctionScope
      : null;

    if (!title || title.length < 4) {
      res.status(400).json({ error: "Please give your project a title." });
      return;
    }
    if (!college) {
      res.status(400).json({ error: "Please enter your nursing college or school." });
      return;
    }
    if (!program) {
      res.status(400).json({ error: "Please enter your programme (e.g. RGN, RM, BSc Nursing)." });
      return;
    }

    const rawFiles = Array.isArray(req.body?.files) ? req.body.files : [];
    if (rawFiles.length > MAX_ORDER_FILES) {
      res.status(400).json({ error: `You can attach at most ${MAX_ORDER_FILES} documents.` });
      return;
    }

    // Validate every file's payload up front (kind + magic bytes + size) so a
    // bad document can never leave a half-registered order behind.
    const staged: { kind: OrderFileKind; filename: string; content: Buffer }[] = [];
    for (const raw of rawFiles) {
      const rawKind = typeof raw?.kind === "string" ? raw.kind : "";
      if (!(FILE_KINDS as string[]).includes(rawKind)) {
        res.status(400).json({ error: "Each file needs a valid kind (guidelines, clinical, reference, or correction)." });
        return;
      }
      const kind = rawKind as OrderFileKind;
      const filename = typeof raw?.filename === "string" ? raw.filename : "";
      const content = decodeBase64(raw?.content);
      if (!content) {
        res.status(400).json({ error: "One of the uploaded documents could not be read — please try again." });
        return;
      }
      if (!detectUploadType(content, filename)) {
        res.status(415).json({
          error: "Unsupported file type — upload a PDF, Word (.docx), EPUB ebook, Markdown, or plain text document only.",
        });
        return;
      }
      staged.push({ kind, filename, content });
    }
    if (correctionScope && staged.filter((file) => file.kind === "correction").length !== 1) {
      res.status(400).json({ error: "A correction order needs exactly one uploaded study or chapter." });
      return;
    }
    let correctionText: string | null = null;
    if (correctionScope) {
      const correction = staged.find((file) => file.kind === "correction");
      if (correction) {
        const temporary = await storeOrderUpload(0, correction.content, correction.filename);
        try {
          correctionText = (await draftWorker.extract(temporary.storedPath)).text.trim() || null;
        } finally {
          await removeOrderArtifacts(0);
        }
        if (!correctionText) {
          res.status(422).json({ error: "The uploaded document has no readable text. Please upload an editable text document or a text-based PDF." });
          return;
        }
      }
    }

    const db = studyStore();
    const order = await db.addOrder({
      studentId: student.id,
      title,
      diagnosis,
      college,
      program,
      notes,
      correctionScope,
      correctionText,
    });

    const files = [];
    try {
      for (const file of staged) {
        const stored = await storeOrderUpload(order.id, file.content, file.filename);
        files.push(
          await db.addOrderFile({
            orderId: order.id,
            kind: file.kind,
            filename: stored.filename,
            storedPath: stored.storedPath,
            mime: stored.mime,
            size: stored.size,
          }),
        );
      }
    } catch (err) {
      // Disk failure mid-upload — clean up what we wrote and report cleanly.
      req.log?.error?.({ err }, "order file storage failed");
      await removeOrderArtifacts(order.id);
      throw new UploadError(500, "Your documents could not be saved — please try again.");
    }

    res.status(201).json({
      order: publicOrder(order),
      files: files.map((file) => ({
        id: file.id,
        kind: file.kind,
        filename: file.filename,
        size: file.size,
        createdAt: file.createdAt.toISOString(),
      })),
    });
  }),
);

// GET /api/orders — the student's own orders, newest first.
studentRouter.get(
  "/orders",
  requireStudent,
  asyncRoute(async (req, res) => {
    const student = (req as AuthedRequest).student;
    const db = studyStore();
    const orders = await db.listOrders(student.id);
    const withFiles = await Promise.all(
      orders.map(async (order) => {
        const orderFiles = await db.listOrderFiles(order.id);
        return { ...publicOrder(order), fileCount: orderFiles.length };
      }),
    );
    res.json({ orders: withFiles });
  }),
);

// GET /api/orders/:id — one order with its materials (owner only).
studentRouter.get(
  "/orders/:id",
  requireStudent,
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }
    const student = (req as AuthedRequest).student;
    const db = studyStore();
    const order = await db.getOrder(id);
    if (!order || order.studentId !== student.id) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    const files = await db.listOrderFiles(id);
    res.json({
      order: publicOrder(order),
      files: files.map((file) => ({
        id: file.id,
        kind: file.kind,
        filename: file.filename,
        size: file.size,
        createdAt: file.createdAt.toISOString(),
      })),
    });
  }),
);

// GET /api/orders/:id/viva — the viva question bank for a completed study
// (owner only). Lightweight: status flags always come back; the questions
// themselves only when a bank has been generated.
studentRouter.get(
  "/orders/:id/viva",
  requireStudent,
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }
    const student = (req as AuthedRequest).student;
    const db = studyStore();
    const order = await db.getOrder(id);
    if (!order || order.studentId !== student.id) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    const questions = parseVivaBank(order.vivaBank);
    res.json({
      status: order.vivaStatus,
      questions: order.vivaStatus === "ready" ? questions : [],
      error: order.vivaError,
      updatedAt: order.vivaUpdatedAt ? order.vivaUpdatedAt.toISOString() : null,
      canGenerate: order.status === "ready" && order.producedStudyId !== null,
    });
  }),
);

// POST /api/orders/:id/viva/generate — build the question bank from the
// delivered study (owner only, once the study is ready). One model call;
// the result is cached on the order so re-visits are instant. Pass
// { force: true } to rebuild the bank from the study's latest content
// (e.g. after the studio revises chapters).
studentRouter.post(
  "/orders/:id/viva/generate",
  requireStudent,
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }
    const student = (req as AuthedRequest).student;
    const db = studyStore();
    const order = await db.getOrder(id);
    if (!order || order.studentId !== student.id) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const force = req.body?.force === true;
    if (order.vivaStatus === "ready" && order.vivaBank && !force) {
      res.json({ status: "ready", questions: parseVivaBank(order.vivaBank) });
      return;
    }
    if (order.status !== "ready" || !order.producedStudyId) {
      res.status(409).json({
        error: "The Viva Preparation Programme opens once your completed study is ready.",
      });
      return;
    }

    const study = await db.get(order.producedStudyId);
    const snapshot = (study?.data ?? {}) as { title?: unknown; chapters?: unknown };
    const chapters = Array.isArray(snapshot.chapters) ? snapshot.chapters : [];
    if (!study || chapters.length === 0) {
      const message =
        "The study is still being prepared in the studio — the question bank can be built once its chapters are saved. Please try again shortly.";
      await db.setOrderViva(id, { status: "error", error: message });
      res.status(409).json({ status: "error", error: message });
      return;
    }

    try {
      const bank = await draftWorker.vivaBank(
        (snapshot.title ?? {}) as Record<string, unknown>,
        chapters,
      );
      await db.setOrderViva(id, {
        status: "ready",
        bankJson: JSON.stringify(bank),
      });
      res.json({ status: "ready", questions: bank.questions });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "The question bank could not be generated.";
      req.log?.error?.({ err }, "viva question bank generation failed");
      await db.setOrderViva(id, { status: "error", error: message });
      res.status(502).json({ status: "error", error: message });
    }
  }),
);

// GET /api/orders/:id/download — the completed study (owner only, once ready).
studentRouter.get(
  "/orders/:id/download",
  requireStudent,
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }
    const student = (req as AuthedRequest).student;
    const db = studyStore();
    const order = await db.getOrder(id);
    if (!order || order.studentId !== student.id) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (order.status !== "ready" || !order.deliveryPath || !order.deliveryFilename) {
      res.status(409).json({ error: "Your completed study is not ready for download yet." });
      return;
    }
    res.download(order.deliveryPath, order.deliveryFilename);
  }),
);

// ---------------------------------------------------------------------------
// Studio routes (order bin) — mounted behind requireAdmin in routes/index.ts.
// The order bin UI is the studio's inbox for incoming orders.
// ---------------------------------------------------------------------------

// GET /api/studio/orders/:id — one order with its attached materials (studio).
studioRouter.get(
  "/studio/orders/:id",
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }
    const db = studyStore();
    const order = await db.getOrder(id);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    const files = await db.listOrderFiles(id);
    res.json({
      order: publicOrder(order),
      files: files.map((file) => ({
        id: file.id,
        kind: file.kind,
        filename: file.filename,
        size: file.size,
        createdAt: file.createdAt.toISOString(),
      })),
    });
  }),
);

// POST /api/studio/orders/:id/produce — turn an order into a studio study.
// Creates a study named after the order, registers every attached document as
// a clinical upload of that study (so the drafting engine is grounded on the
// student's own materials), builds the retrieval index, and marks the order
// as in production. Producing twice returns the same study instead of
// duplicating it.
studioRouter.post(
  "/studio/orders/:id/produce",
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }
    const db = studyStore();
    const order = await db.getOrder(id);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // Already produced — return the existing study (idempotent).
    if (order.producedStudyId) {
      res.json({ study: { id: order.producedStudyId }, produced: false });
      return;
    }

    const student = await db.getStudent(order.studentId);
    // For correction orders, place the extracted text in the first section.
    let chapters: Array<{ name: string; intro: string; introReferences: Array<unknown>; sections: Array<{ id: string; notes: string; draft: string; references: Array<unknown>; data: Record<string, string>; rowData: Array<{ cells: string[] }> }> }> = [];
    if (order.correctionText && order.correctionScope) {
      chapters = [{ name: "Assessment", intro: "", introReferences: [], sections: [{ id: "1.1", notes: "", draft: order.correctionText, references: [], data: {}, rowData: [] }] }];
    }

    const study = await db.create(order.title, {
      title: {
        patientName: "",
        diagnosis: order.diagnosis ?? "",
        studentName: student?.name ?? "",
        indexNumber: "",
        collegeName: order.college,
        collegeLocation: "",
        year: student?.year ?? String(new Date().getFullYear()),
      },
      chapters,
    });

    // Register the student's materials as the study's clinical documents, so
    // every draft is grounded on them. Order files and study files share the
    // same storage layout (disk path or r2:// reference).
    const files = await db.listOrderFiles(id);
    for (const file of files) {
      await db.addFile({
        studyId: study.id,
        filename: file.filename,
        storedPath: file.storedPath,
        mime: file.mime,
        size: file.size,
        status: "indexing",
      });
    }

    try {
      await indexStudyFiles(study.id);
    } catch (err) {
      req.log?.error?.({ err }, "order material indexing failed");
    }

    await db.setOrderProduced(
      id,
      study.id,
      "The study was created from your order — your materials are attached and ready.",
    );
    res.status(201).json({ study: { id: study.id }, produced: true });
  }),
);

// GET /api/studio/orders — every order with the student's name/email.
studioRouter.get(
  "/studio/orders",
  asyncRoute(async (_req, res) => {
    const db = studyStore();
    const orders = await db.listAllOrders();
    const students = new Map(
      (await Promise.all(
        [...new Set(orders.map((order) => order.studentId))].map((id) => db.getStudent(id)),
      )).flatMap((s) => (s ? [[s.id, s]] : [])),
    );
    const withStudents = await Promise.all(
      orders.map(async (order) => {
        const student = students.get(order.studentId);
        const files = await db.listOrderFiles(order.id);
        return {
          ...publicOrder(order),
          fileCount: files.length,
          student: student
            ? { id: student.id, name: student.name, email: student.email }
            : null,
        };
      }),
    );
    res.json({ orders: withStudents });
  }),
);

// PATCH /api/studio/orders/:id — advance the status (and optionally set a note
// the student will see on their dashboard).
studioRouter.patch(
  "/studio/orders/:id",
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }
    const rawStatus = str(req.body?.status) as OrderStatus;
    if (!ORDER_STATUSES.includes(rawStatus)) {
      res.status(400).json({ error: "Invalid order status." });
      return;
    }
    const note = strOrNull(req.body?.note);
    const updated = await studyStore().updateOrderStatus(id, rawStatus, note);
    if (!updated) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json({ order: publicOrder(updated) });
  }),
);

// POST /api/studio/orders/:id/delivery — attach the completed study and mark
// the order ready. Body: { filename, content(base64) }.
studioRouter.post(
  "/studio/orders/:id/delivery",
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }
    const content = decodeBase64(req.body?.content);
    if (!content) {
      res.status(400).json({ error: "A base64 file payload is required" });
      return;
    }
    const db = studyStore();
    const order = await db.getOrder(id);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    const stored = await storeOrderDelivery(id, content, req.body?.filename);
    const updated = await db.setOrderDelivery(id, {
      filename: stored.filename,
      storedPath: stored.storedPath,
      size: stored.size,
    });
    res.json({ order: publicOrder(updated ?? order) });
  }),
);

export { studentRouter, studioRouter };
export default studentRouter;
