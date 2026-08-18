import { Router, type IRouter, type Request, type Response } from "express";
import { getStudyStore, type StudyStore } from "@workspace/db";
import {
  createAuthToken,
  hashPassword,
  requireStudent,
  verifyPassword,
  type AuthedRequest,
} from "../lib/studentAuth";

const router: IRouter = Router();

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
      req.log?.error?.({ err }, "student account request failed");
      const message = err instanceof Error ? err.message : "Unexpected error";
      const storageError = message.startsWith("Study storage");
      res.status(storageError ? 503 : 500).json({ error: message });
    });
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strOrNull(value: unknown): string | null {
  const trimmed = str(value);
  return trimmed ? trimmed : null;
}

/** The public shape of a student — never exposes the password hash. */
function publicStudent(student: {
  id: number;
  name: string;
  email: string;
  college: string;
  program: string;
  year: string | null;
  createdAt: Date;
}) {
  return {
    id: student.id,
    name: student.name,
    email: student.email,
    college: student.college,
    program: student.program,
    year: student.year,
    createdAt: student.createdAt.toISOString(),
  };
}

// POST /api/students/register — create an account and sign the student in.
router.post(
  "/students/register",
  asyncRoute(async (req, res) => {
    const name = str(req.body?.name);
    const email = str(req.body?.email).toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const college = str(req.body?.college);
    const program = str(req.body?.program);
    const year = strOrNull(req.body?.year);

    if (!name || name.length < 2) {
      res.status(400).json({ error: "Please enter your full name." });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ error: "Please enter a valid email address." });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
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

    const db = studyStore();
    const existing = await db.getStudentByEmail(email);
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists — sign in instead." });
      return;
    }

    const student = await db.addStudent({
      name,
      email,
      passwordHash: hashPassword(password),
      college,
      program,
      year,
    });
    const token = createAuthToken();
    await db.createSession(student.id, token);
    res.status(201).json({ token, student: publicStudent(student) });
  }),
);

// POST /api/students/login — verify credentials and issue a session token.
router.post(
  "/students/login",
  asyncRoute(async (req, res) => {
    const email = str(req.body?.email).toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }

    const student = await studyStore().getStudentByEmail(email);
    if (!student || !verifyPassword(password, student.passwordHash)) {
      res.status(401).json({ error: "Incorrect email or password." });
      return;
    }

    const token = createAuthToken();
    await studyStore().createSession(student.id, token);
    res.json({ token, student: publicStudent(student) });
  }),
);

// GET /api/students/me — the signed-in student (used to restore a session).
router.get(
  "/students/me",
  requireStudent,
  asyncRoute(async (req, res) => {
    const student = (req as AuthedRequest).student;
    res.json({ student: publicStudent(student) });
  }),
);

// POST /api/students/logout — destroy the current session token.
router.post(
  "/students/logout",
  requireStudent,
  asyncRoute(async (req, res) => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    await studyStore().removeSession(token);
    res.status(204).end();
  }),
);

export default router;
