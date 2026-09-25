import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { nurseflowPath } from "./nurseflowPaths";

const TRIAL_LIMIT = 10;
export type NurseFlowAccess = { id: string; attempts: number; correct: number; paidUntil: string | null; createdAt: string; updatedAt: string };
export type NurseFlowPayment = { reference: string; visitorId: string; email: string; amount: number; days: number; status: "pending" | "verified"; createdAt: string; verifiedAt?: string };
type AccessFile = { schemaVersion: 1; records: Record<string, NurseFlowAccess>; payments: Record<string, NurseFlowPayment> };
let writeQueue: Promise<unknown> = Promise.resolve();
const accessPath = () => nurseflowPath(process.env.NURSEFLOW_ACCESS_PATH, "access.json");

async function readFileState(): Promise<AccessFile> {
  try { const value = JSON.parse(await readFile(accessPath(), "utf8")) as AccessFile; return value.records ? { ...value, payments: value.payments ?? {} } : { schemaVersion: 1, records: {}, payments: {} }; }
  catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: 1, records: {}, payments: {} }; throw error; }
}
async function writeFileState(state: AccessFile) {
  const target = accessPath(); await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.tmp`; await writeFile(temporary, JSON.stringify(state, null, 2), "utf8"); await rename(temporary, target);
}
async function mutate<T>(operation: (state: AccessFile) => T | Promise<T>): Promise<T> {
  const previous = writeQueue;
  let release!: () => void;
  writeQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { const state = await readFileState(); const result = await operation(state); await writeFileState(state); return result; }
  finally { release(); }
}
function newAccess(id: string): NurseFlowAccess { const now = new Date().toISOString(); return { id, attempts: 0, correct: 0, paidUntil: null, createdAt: now, updatedAt: now }; }
function hasPaidAccess(record: NurseFlowAccess) { return record.paidUntil === null ? false : new Date(record.paidUntil).getTime() > Date.now(); }
export function createVisitorId() { return randomBytes(24).toString("base64url"); }
export function publicAccess(record: NurseFlowAccess) { const paid = hasPaidAccess(record); return { trialLimit: TRIAL_LIMIT, attemptsUsed: record.attempts, attemptsRemaining: paid ? null : Math.max(0, TRIAL_LIMIT - record.attempts), hasAccess: paid || record.attempts < TRIAL_LIMIT, paidUntil: paid ? record.paidUntil : null }; }
export async function getAccess(id: string) { return mutate((state) => { const record = state.records[id] ?? newAccess(id); state.records[id] = record; return publicAccess(record); }); }
export async function recordAttempt(id: string, correct: boolean) { return mutate((state) => { const record = state.records[id] ?? newAccess(id); if (!hasPaidAccess(record) && record.attempts >= TRIAL_LIMIT) { state.records[id] = record; return { accepted: false, access: publicAccess(record) }; } record.attempts += 1; if (correct) record.correct += 1; record.updatedAt = new Date().toISOString(); state.records[id] = record; return { accepted: true, access: publicAccess(record) }; }); }
export async function grantPaidAccess(id: string, days: number) { return mutate((state) => { const record = state.records[id] ?? newAccess(id); const start = hasPaidAccess(record) && record.paidUntil ? new Date(record.paidUntil).getTime() : Date.now(); record.paidUntil = new Date(start + days * 86_400_000).toISOString(); record.updatedAt = new Date().toISOString(); state.records[id] = record; return publicAccess(record); }); }
export async function createPendingPayment(visitorId: string, email: string, amount: number, days: number) { return mutate((state) => { const reference = `NF-${randomBytes(12).toString("hex")}`; const payment: NurseFlowPayment = { reference, visitorId, email, amount, days, status: "pending", createdAt: new Date().toISOString() }; state.payments[reference] = payment; return payment; }); }
export async function getPayment(reference: string) { const state = await readFileState(); return state.payments[reference] ?? null; }
export async function confirmPayment(reference: string) { return mutate((state) => { const payment = state.payments[reference]; if (!payment) return null; const access = state.records[payment.visitorId] ?? newAccess(payment.visitorId); if (payment.status === "verified") return publicAccess(access); const start = hasPaidAccess(access) && access.paidUntil ? new Date(access.paidUntil).getTime() : Date.now(); access.paidUntil = new Date(start + payment.days * 86_400_000).toISOString(); access.updatedAt = new Date().toISOString(); state.records[access.id] = access; payment.status = "verified"; payment.verifiedAt = new Date().toISOString(); return publicAccess(access); }); }
