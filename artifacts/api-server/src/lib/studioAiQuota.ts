import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { getStudyStore } from "@workspace/db";
import type { AuthedAdminRequest } from "./adminAuth";

const STUDIO_TARGET_REQUESTS_PER_PROJECT = 3;
const STUDIO_AI_MAX_IN_FLIGHT_PER_ADMIN = 2;
const STUDIO_AI_BURST_WINDOW_MS = 60_000;
const STUDIO_AI_REQUESTS_PER_WINDOW = 10;

const activeRequests = new Map<number, number>();
const recentRequests = new Map<number, number[]>();

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function respondThrottled(res: Response, retryAfterSeconds: number, message: string): false {
  res.setHeader("Retry-After", String(retryAfterSeconds));
  res.status(429).json({ error: message });
  return false;
}

function acquireStudioAiPermit(res: Response, adminId: number): boolean {
  const now = Date.now();
  const recent = (recentRequests.get(adminId) ?? [])
    .filter((timestamp) => now - timestamp < STUDIO_AI_BURST_WINDOW_MS);
  const inFlight = activeRequests.get(adminId) ?? 0;

  if (inFlight >= STUDIO_AI_MAX_IN_FLIGHT_PER_ADMIN) {
    recentRequests.set(adminId, recent);
    return respondThrottled(res, 5, "Two Studio AI requests are already in progress. Try again shortly.");
  }
  if (recent.length >= STUDIO_AI_REQUESTS_PER_WINDOW) {
    recentRequests.set(adminId, recent);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((recent[0] + STUDIO_AI_BURST_WINDOW_MS - now) / 1000),
    );
    return respondThrottled(res, retryAfterSeconds, "Studio AI request burst limit reached. Try again shortly.");
  }

  recent.push(now);
  recentRequests.set(adminId, recent);
  activeRequests.set(adminId, inFlight + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const remaining = (activeRequests.get(adminId) ?? 1) - 1;
    if (remaining > 0) activeRequests.set(adminId, remaining);
    else activeRequests.delete(adminId);
  };
  res.once("finish", release);
  res.once("close", release);
  return true;
}

function projectKeyFor(req: Request, studyId: number | null, fingerprint: unknown): string {
  if (studyId !== null) return digest(`study:${studyId}`);

  const rawProjectKey = req.body?.studioProjectKey;
  if (
    typeof rawProjectKey === "string" &&
    /^[a-zA-Z0-9._:-]{8,128}$/.test(rawProjectKey)
  ) {
    return digest(`draft:${rawProjectKey}`);
  }
  return digest(`unsaved:${JSON.stringify(fingerprint) ?? ""}`);
}

function targetKeysFor(targets: string | string[]): string[] {
  const list = [...new Set(Array.isArray(targets) ? targets : [targets])];
  if (list.length === 0 || list.some((target) => !target.trim())) {
    throw new Error("At least one Studio AI target is required.");
  }
  return list.map((target) => digest(target.trim().toLowerCase()));
}

export async function reserveStudioAiUsage(
  req: Request,
  res: Response,
  targets: string | string[],
  fingerprint: unknown,
  studyId: number | null = null,
): Promise<boolean> {
  const admin = (req as AuthedAdminRequest).admin;
  if (!admin) {
    throw new Error("Studio AI quota requires an authenticated admin.");
  }
  if (!acquireStudioAiPermit(res, admin.id)) return false;

  const reservation = await getStudyStore().reserveAiProjectUsage(
    projectKeyFor(req, studyId, fingerprint),
    targetKeysFor(targets),
    STUDIO_TARGET_REQUESTS_PER_PROJECT,
  );
  if (reservation.status === "reserved") return true;

  res.status(429).json({
    error: `This section or document has reached ${STUDIO_TARGET_REQUESTS_PER_PROJECT} AI attempts for this project. The Studio owner can reset its limit.`,
  });
  return false;
}

export async function reserveStudioAiUsageForOptionalAdmin(
  req: Request,
  res: Response,
  targets: string | string[],
  fingerprint: unknown,
  studyId: number | null = null,
): Promise<boolean> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) return true;

  const admin = await getStudyStore().getAdminByToken(token);
  if (!admin || admin.role === "applicant") return true;

  (req as AuthedAdminRequest).admin = admin;
  return reserveStudioAiUsage(req, res, targets, fingerprint, studyId);
}

export async function resetStudioAiUsage(
  req: Request,
  studyId: number | null,
  targets: string[],
): Promise<number> {
  const admin = (req as AuthedAdminRequest).admin;
  if (!admin || admin.role !== "admin") {
    throw new Error("Only the Studio owner can reset AI attempt limits.");
  }
  const projectKey = projectKeyFor(req, studyId, { targets });
  return getStudyStore().resetAiProjectUsage(projectKey, targetKeysFor(targets));
}
