import type { NextFunction, Request, Response } from "express";
import { getStudyStore, type AdminRow } from "@workspace/db";
// The crypto helpers (scrypt hashing, opaque tokens) are shared with the
// student portal — same scheme, separate credential tables.
import { createAuthToken, hashPassword } from "./studentAuth";

// Studio-admin auth: the studio (studies, library, uploads, order bin,
// drafting, exports) is production surface and must not be reachable by
// visitors or students. Admins authenticate with username + password
// (scrypt-hashed, same scheme as student accounts) and get an opaque bearer
// session token stored in the admin_sessions table.

/** The request once requireAdmin() has resolved the bearer token. */
export type AuthedAdminRequest = Request & { admin: AdminRow };

/**
 * Bootstrap the first admin account from the environment.
 *
 * ADMIN_USERNAME (default "admin") and ADMIN_PASSWORD create the initial
 * account the first time it is needed (and only if none exists yet — an
 * existing account is never overwritten, so you can safely rotate the env
 * later without clobbering a changed password). Returns the admin, or null
 * when no password is configured.
 */
export async function ensureBootstrapAdmin(): Promise<AdminRow | null> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) return null;
  const db = getStudyStore();
  const username = (process.env.ADMIN_USERNAME || "admin").trim();
  const existing = await db.getAdminByUsername(username);
  if (existing) {
    // Upgrade existing bootstrap accounts that were created before the role
    // column existed (they defaulted to "staff"). The env-configured admin
    // should always be an admin.
    if (existing.role !== "admin") {
      await db.updateAdmin(existing.id, { role: "admin" });
      return { ...existing, role: "admin" };
    }
    return existing;
  }
  const name = process.env.ADMIN_NAME?.trim() || null;
  return db.addAdmin({
    username,
    passwordHash: hashPassword(password),
    name,
    role: "admin",
  });
}

/**
 * Express middleware: resolves the `Authorization: Bearer <token>` header to
 * the owning admin and attaches `req.admin`. Responds 401 when the token is
 * missing or unknown.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) {
    res.status(401).json({ error: "Sign in to the studio to continue." });
    return;
  }
  try {
    const admin = await getStudyStore().getAdminByToken(token);
    if (!admin) {
      res.status(401).json({ error: "Your studio session has expired — please sign in again." });
      return;
    }
    (req as AuthedAdminRequest).admin = admin;
    next();
  } catch (err) {
    req.log?.error?.({ err }, "admin session lookup failed");
    res.status(503).json({ error: "Storage is unavailable — please try again." });
  }
}

export { createAuthToken };
