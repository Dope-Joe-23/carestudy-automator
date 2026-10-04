import { randomBytes } from "node:crypto";
import { nurseflowPath } from "./nurseflowPaths";
import { nurseflowJsonKey, readStoredText, writeStoredText } from "./nurseflowStore";

export type NurseFlowAccess = {
  id: string;
  attempts: number;
  correct: number;
  paidUntil: string | null;
  createdAt: string;
  updatedAt: string;
};
export type NurseFlowPayment = {
  reference: string;
  visitorId: string;
  email: string;
  amount: number;
  days: number;
  status: "pending" | "verified";
  createdAt: string;
  verifiedAt?: string;
};
type AccessFile = {
  schemaVersion: 1;
  records: Record<string, NurseFlowAccess>;
  payments: Record<string, NurseFlowPayment>;
};

const accessPath = () => nurseflowPath(process.env.NURSEFLOW_ACCESS_PATH, "access.json");
const ACCESS_OBJECT = "access.json";
const emptyState = (): AccessFile => ({ schemaVersion: 1, records: {}, payments: {} });

// Anonymous trial counters + payment records. Held in the durable store (R2
// when configured, else the local disk cache) alongside the other NurseFlow
// stores, so they are no longer tied to the single persistent disk.
//
// The store is write-heavy: every answered trial question is a recordAttempt.
// Writing it on every change would mean one bucket PUT per question, so the
// state is kept in memory for the life of the process and persisted on a short
// debounce — many rapid attempts collapse into a single write. Payment writes
// are flushed immediately because a webhook may read them back at any moment.
const FLUSH_DELAY_MS = 1_500;

let state: AccessFile | null = null;
let loadPromise: Promise<AccessFile> | null = null;
let dirty = false;
let flushTimer: NodeJS.Timeout | null = null;
// Serialises flushes so two writes can never interleave or race the rename.
let writeChain: Promise<void> = Promise.resolve();

async function readFileState(): Promise<AccessFile> {
  const text = await readStoredText(accessPath(), nurseflowJsonKey(ACCESS_OBJECT));
  if (text === null) return emptyState();
  const value = JSON.parse(text) as AccessFile;
  return value.records ? { ...value, payments: value.payments ?? {} } : emptyState();
}

async function writeFileState(snapshot: AccessFile): Promise<void> {
  await writeStoredText(accessPath(), nurseflowJsonKey(ACCESS_OBJECT), JSON.stringify(snapshot, null, 2));
}

/** Load the store once; later callers share the same in-memory object. */
async function loadState(): Promise<AccessFile> {
  if (state) return state;
  if (!loadPromise) {
    loadPromise = readFileState().then((loaded) => {
      state = loaded;
      return loaded;
    });
  }
  return loadPromise;
}

/** Persist the current state now, serialised behind any in-flight write. */
async function flushNow(): Promise<void> {
  if (!dirty || !state) return;
  dirty = false;
  const snapshot = state;
  const next = writeChain.then(() => writeFileState(snapshot));
  writeChain = next.catch(() => {
    // Swallowed for the serialisation chain; the real error is handled below.
  });
  try {
    await next;
  } catch (error) {
    dirty = true; // a later attempt will retry the write
    console.error("[nurseflow] access store flush failed", error);
  }
}

/** Mark the store dirty and schedule a batched flush. */
function scheduleFlush(): void {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushNow();
  }, FLUSH_DELAY_MS);
  flushTimer.unref?.();
}

/**
 * Apply an operation to the shared state. Writes are debounced unless
 * `immediate` is set, which is used for payment-critical changes.
 */
async function mutate<T>(
  operation: (state: AccessFile) => T | Promise<T>,
  immediate = false,
): Promise<T> {
  const current = await loadState();
  const result = await operation(current);
  if (immediate) {
    dirty = true;
    await flushNow();
  } else {
    scheduleFlush();
  }
  return result;
}

/** Force any pending changes out to disk/bucket (best-effort, e.g. on shutdown). */
export async function flushAccessStore(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushNow();
}

// Flush debounced trial counters on a clean process exit (Render redeploys send
// beforeExit). Payment writes are already flushed immediately.
process.once("beforeExit", () => {
  void flushAccessStore();
});

function newAccess(id: string): NurseFlowAccess {
  const now = new Date().toISOString();
  return { id, attempts: 0, correct: 0, paidUntil: null, createdAt: now, updatedAt: now };
}

function hasPaidAccess(record: NurseFlowAccess): boolean {
  return record.paidUntil === null ? false : new Date(record.paidUntil).getTime() > Date.now();
}

export function createVisitorId(): string {
  return randomBytes(24).toString("base64url");
}

// Practice is open: every approved card is answerable, so the old
// 10-question trial cap and its remaining count are gone. Counters are still
// reported for display, and paid entitlements are unaffected.
export function publicAccess(record: NurseFlowAccess) {
  const paid = hasPaidAccess(record);
  return {
    trialLimit: null,
    attemptsUsed: record.attempts,
    attemptsRemaining: null,
    hasAccess: true,
    paidUntil: paid ? record.paidUntil : null,
  };
}

export async function getAccess(id: string) {
  return mutate((state) => {
    const record = state.records[id] ?? newAccess(id);
    state.records[id] = record;
    return publicAccess(record);
  });
}

export async function recordAttempt(id: string, correct: boolean) {
  return mutate((state) => {
    const record = state.records[id] ?? newAccess(id);
    record.attempts += 1;
    if (correct) record.correct += 1;
    record.updatedAt = new Date().toISOString();
    state.records[id] = record;
    return { accepted: true, access: publicAccess(record) };
  });
}

export async function grantPaidAccess(id: string, days: number) {
  return mutate((state) => {
    const record = state.records[id] ?? newAccess(id);
    const start =
      hasPaidAccess(record) && record.paidUntil ? new Date(record.paidUntil).getTime() : Date.now();
    record.paidUntil = new Date(start + days * 86_400_000).toISOString();
    record.updatedAt = new Date().toISOString();
    state.records[id] = record;
    return publicAccess(record);
  }, true);
}

export async function createPendingPayment(
  visitorId: string,
  email: string,
  amount: number,
  days: number,
) {
  return mutate((state) => {
    const reference = `NF-${randomBytes(12).toString("hex")}`;
    const payment: NurseFlowPayment = {
      reference,
      visitorId,
      email,
      amount,
      days,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    state.payments[reference] = payment;
    return payment;
  }, true);
}

export async function getPayment(reference: string) {
  const current = await loadState();
  return current.payments[reference] ?? null;
}

export async function confirmPayment(reference: string) {
  return mutate((state) => {
    const payment = state.payments[reference];
    if (!payment) return null;
    const access = state.records[payment.visitorId] ?? newAccess(payment.visitorId);
    if (payment.status === "verified") return publicAccess(access);
    const start =
      hasPaidAccess(access) && access.paidUntil ? new Date(access.paidUntil).getTime() : Date.now();
    access.paidUntil = new Date(start + payment.days * 86_400_000).toISOString();
    access.updatedAt = new Date().toISOString();
    state.records[access.id] = access;
    payment.status = "verified";
    payment.verifiedAt = new Date().toISOString();
    return publicAccess(access);
  }, true);
}
