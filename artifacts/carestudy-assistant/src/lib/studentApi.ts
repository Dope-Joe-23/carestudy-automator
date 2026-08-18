/**
 * API client for the student portal (accounts + care-study orders).
 *
 * The portal is a separate surface from the studio: students sign in with a
 * bearer token (kept in localStorage) and only ever see their own orders.
 * Same base URL convention as lib/api.ts (VITE_API_URL or the dev proxy).
 */

import { getAdminToken } from "./adminAuth";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

const TOKEN_KEY = "carestudy_student_token";

export function getStudentToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStudentToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable — the session just won't persist across reloads
  }
}

export type Student = {
  id: number;
  name: string;
  email: string;
  college: string;
  program: string;
  year: string | null;
  createdAt: string;
};

/** "submitted" | "in_production" | "ready" | "cancelled". */
export type OrderStatus = "submitted" | "in_production" | "ready" | "cancelled";

export type OrderDelivery = { filename: string; size: number };

export type Order = {
  id: number;
  title: string;
  diagnosis: string | null;
  college: string;
  program: string;
  notes: string | null;
  status: OrderStatus;
  note: string | null;
  /** The studio study created from this order (null until produced). */
  producedStudyId: number | null;
  delivery: OrderDelivery | null;
  /** "none" | "pending" | "ready" | "error" — viva question bank lifecycle. */
  vivaStatus: "none" | "pending" | "ready" | "error";
  vivaError: string | null;
  vivaUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VivaQuestion = {
  category: string;
  question: string;
  guidance: string;
  tip: string;
};

export type VivaBank = {
  status: "none" | "pending" | "ready" | "error";
  questions: VivaQuestion[];
  error: string | null;
  updatedAt: string | null;
  /** Whether the bank can be generated yet (order delivered + produced). */
  canGenerate: boolean;
};

export type OrderFile = {
  id: number;
  kind: "guidelines" | "clinical" | "reference";
  filename: string;
  size: number;
  createdAt: string;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStudentToken();
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    const error = new Error(body?.error ?? `Request failed (${response.status})`);
    if (response.status === 401) (error as { isUnauthorized?: boolean }).isUnauthorized = true;
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function registerStudent(input: {
  name: string;
  email: string;
  password: string;
  college: string;
  program: string;
  year?: string;
}): Promise<{ token: string; student: Student }> {
  return requestJson("/students/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function loginStudent(email: string, password: string): Promise<{ token: string; student: Student }> {
  return requestJson("/students/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function fetchMe(): Promise<{ student: Student }> {
  return requestJson("/students/me");
}

export async function logoutStudent(): Promise<void> {
  try {
    await requestJson("/students/logout", { method: "POST" });
  } finally {
    setStudentToken(null);
  }
}

// ---------------------------------------------------------------------------
// Orders (student-facing)
// ---------------------------------------------------------------------------

export type OrderFileInput = {
  kind: "guidelines" | "clinical" | "reference";
  filename: string;
  content: string; // base64
};

export function placeOrder(input: {
  title: string;
  diagnosis?: string;
  college: string;
  program: string;
  notes?: string;
  files: OrderFileInput[];
}): Promise<{ order: Order; files: OrderFile[] }> {
  return requestJson("/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listOrders(): Promise<{ orders: (Order & { fileCount: number })[] }> {
  return requestJson("/orders");
}

export function getOrder(id: number): Promise<{ order: Order; files: OrderFile[] }> {
  return requestJson(`/orders/${id}`);
}

/** The viva question bank for one order (owner only). */
export function getVivaBank(id: number): Promise<VivaBank> {
  return requestJson(`/orders/${id}/viva`);
}

/** Generate (or fetch the cached) viva question bank for an order. Pass
 *  force=true to rebuild it from the study's latest content. */
export function generateVivaBank(
  id: number,
  force = false,
): Promise<{ status: "ready" | "error"; questions?: VivaQuestion[]; error?: string }> {
  return requestJson(`/orders/${id}/viva/generate`, {
    method: "POST",
    body: JSON.stringify({ force }),
  });
}

/** Download the completed study once the order is ready. */
export async function downloadOrderStudy(order: Order): Promise<void> {
  const token = getStudentToken();
  if (!token) throw new Error("You must be signed in to download your study.");
  const response = await fetch(`${API_URL}/orders/${order.id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Download failed (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = order.delivery?.filename ?? "care-study.docx";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Studio order bin (admin auth — behind requireAdmin on the server)
// ---------------------------------------------------------------------------

export type StudioOrder = Order & {
  fileCount: number;
  student: { id: number; name: string; email: string } | null;
};

/** Studio API calls use the admin bearer token, not the student token. */
function studioHeaders(): Record<string, string> {
  const token = getAdminToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function studioRequestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: studioHeaders(),
    ...init,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function listStudioOrders(): Promise<{ orders: StudioOrder[] }> {
  return studioRequestJson("/studio/orders");
}

export function getStudioOrder(id: number): Promise<{ order: StudioOrder; files: OrderFile[] }> {
  return studioRequestJson(`/studio/orders/${id}`);
}

/** Turn an order into a studio study: creates the study, attaches the order's
 *  materials as clinical documents, and builds the retrieval index. */
export function produceOrder(id: number): Promise<{ study: { id: number }; produced: boolean }> {
  return studioRequestJson(`/studio/orders/${id}/produce`, { method: "POST" });
}

export function setOrderStatus(
  id: number,
  status: OrderStatus,
  note?: string,
): Promise<{ order: Order }> {
  return studioRequestJson(`/studio/orders/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, note: note || null }),
  });
}

export function attachOrderDelivery(
  id: number,
  filename: string,
  content: string,
): Promise<{ order: Order }> {
  return studioRequestJson(`/studio/orders/${id}/delivery`, {
    method: "POST",
    body: JSON.stringify({ filename, content }),
  });
}

/** Read a File as base64 (the same helper the studio uses for uploads). */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result.slice(reader.result.indexOf(",") + 1));
      } else {
        reject(new Error("Could not read the file."));
      }
    };
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}
