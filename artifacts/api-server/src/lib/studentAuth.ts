import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { getStudyStore, type StudentRow } from "@workspace/db";

// Student-portal auth: password hashing with Node's built-in scrypt (no
// external crypto dependency) and opaque bearer session tokens stored in the
// database. Passwords are never stored in plaintext and never leave this file
// except as a "salt:hash" string.

const KEY_LENGTH = 64;
// maxmem must exceed 128 * N * r (32 MiB at these params) or OpenSSL rejects
// the call with "memory limit exceeded".
const SCRYPT_OPTIONS = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

/** scrypt hash as "salt:hash" (hex). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS).toString("hex");
  return `${salt}:${hash}`;
}

/** Constant-time check of a plaintext password against a stored hash. */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/** A fresh opaque session token (64 hex chars). */
export function createAuthToken(): string {
  return randomBytes(32).toString("hex");
}

/** The request once requireStudent() has resolved the bearer token. */
export type AuthedRequest = Request & { student: StudentRow };

/**
 * Express middleware: resolves the `Authorization: Bearer <token>` header to
 * the owning student and attaches `req.student`. Responds 401 when the token
 * is missing or unknown.
 */
export async function requireStudent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) {
    res.status(401).json({ error: "You must be signed in to do that." });
    return;
  }
  try {
    const student = await getStudyStore().getStudentByToken(token);
    if (!student) {
      res.status(401).json({ error: "Your session has expired — please sign in again." });
      return;
    }
    (req as AuthedRequest).student = student;
    next();
  } catch (err) {
    req.log?.error?.({ err }, "session lookup failed");
    res.status(503).json({ error: "Storage is unavailable — please try again." });
  }
}
