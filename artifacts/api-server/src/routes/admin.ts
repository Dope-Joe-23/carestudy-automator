import { Router, type IRouter, type Request, type Response } from "express";
import { getStudyStore, type StudyStore } from "@workspace/db";
import {
  createAuthToken,
  ensureBootstrapAdmin,
  requireAdmin,
  type AuthedAdminRequest,
} from "../lib/adminAuth";
import { verifyPassword } from "../lib/studentAuth";

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
      req.log?.error?.({ err }, "admin request failed");
      res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
    });
  };
}

function publicAdmin(admin: { id: number; username: string; name: string | null }) {
  return { id: admin.id, username: admin.username, name: admin.name };
}

// POST /api/admin/login — username + password → admin session token.
// The first-ever login bootstraps the account from ADMIN_USERNAME /
// ADMIN_PASSWORD env vars when none exists yet.
router.post(
  "/admin/login",
  asyncRoute(async (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!username || !password) {
      res.status(400).json({ error: "Enter your username and password." });
      return;
    }
    const db = studyStore();
    // Lazy bootstrap: creates the env-configured account on first login if
    // no admin exists yet. Cheap (one SELECT) once an admin exists.
    const bootstrap = await ensureBootstrapAdmin().catch(() => null);
    const admin = (await db.getAdminByUsername(username)) ?? bootstrap;
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      // Same message for unknown user and wrong password — don't leak which.
      res.status(401).json({ error: "Incorrect username or password." });
      return;
    }
    const token = createAuthToken();
    await db.createAdminSession(admin.id, token);
    res.json({ token, admin: publicAdmin(admin) });
  }),
);

// POST /api/admin/logout — destroy the current admin session.
router.post(
  "/admin/logout",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    await studyStore().removeAdminSession(token);
    res.status(204).end();
  }),
);

// GET /api/admin/me — who am I? (used to restore a session on page load).
router.get(
  "/admin/me",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const admin = (req as AuthedAdminRequest).admin;
    res.json({ admin: publicAdmin(admin) });
  }),
);

export default router;
