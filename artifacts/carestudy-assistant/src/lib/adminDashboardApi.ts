/**
 * Admin dashboard API client — stats, staff management, and invite links.
 *
 * Uses the same auth pattern as lib/adminAuth.ts (bearer token from localStorage).
 */

import { getAdminToken } from "./adminAuth";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || "/api";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAdminToken();
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
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DashboardStats = {
  orders: {
    total: number;
    submitted: number;
    inProduction: number;
    ready: number;
    cancelled: number;
  };
  revenue: {
    total: number; // pesewas
    fullStudyPayments: number;
    chapterPayments: number;
    paidOrderCount: number;
  };
  students: {
    total: number;
  };
  staff: {
    total: number;
    admins: number;
    staffOnly: number;
    pendingInvites: number;
    usedInvites: number;
  };
  recentOrders: {
    id: number;
    title: string;
    status: string;
    paymentStatus: string;
    createdAt: string;
  }[];
};

export type StaffMember = {
  id: number;
  username: string;
  name: string | null;
  role: string;
  email: string | null;
  invitedBy: number | null;
  createdAt: string;
};

export type StaffInvite = {
  id: number;
  token: string;
  label: string | null;
  createdBy: string;
  usedAt: string | null;
  usedBy: string | null;
  createdAt: string;
  registrationUrl: string;
};

export type StudentRecord = {
  id: number;
  name: string;
  username: string;
  email: string;
  college: string;
  program: string;
  year: string | null;
  orderCount: number;
  readyOrders: number;
  paidOrders: number;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/** Fetch dashboard stats. */
export function getDashboardStats(): Promise<DashboardStats> {
  return requestJson("/admin/dashboard");
}

/** List all staff members. */
export function listStaff(): Promise<{ staff: StaffMember[] }> {
  return requestJson("/admin/staff");
}

/** Update a staff member's role or details. */
export function updateStaff(
  id: number,
  fields: { role?: string; name?: string; email?: string },
): Promise<{ staff: StaffMember }> {
  return requestJson(`/admin/staff/${id}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

/** Generate a new staff invite link. */
export function createInvite(
  label?: string,
): Promise<{ invite: StaffInvite }> {
  return requestJson("/admin/invites", {
    method: "POST",
    body: JSON.stringify({ label: label || null }),
  });
}

/** List all invite links. */
export function listInvites(): Promise<{ invites: StaffInvite[] }> {
  return requestJson("/admin/invites");
}

/** List all students with order counts. */
export function listStudents(): Promise<{ students: StudentRecord[] }> {
  return requestJson("/admin/students");
}

/** Validate an invite token (public — no auth needed). */
export function validateInvite(
  token: string,
): Promise<{ valid: boolean; label: string | null }> {
  return requestJson(`/admin/invites/${encodeURIComponent(token)}`);
}

/** Register a new staff member via invite link (public). */
export function registerStaff(input: {
  inviteToken: string;
  username: string;
  password: string;
  name?: string;
  email?: string;
}): Promise<{ token: string; admin: { id: number; username: string; name: string | null; role: string } }> {
  return requestJson("/admin/staff/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
