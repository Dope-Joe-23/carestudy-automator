import { API_URL } from "./apiBase";

export type StaffApplicationStatus = {
  application: { id: number; status: "pending" | "approved" | "declined"; createdAt: string; reviewedAt: string | null };
  applicant: { username: string; name: string | null; email: string | null; role: string };
};

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export function getMyStaffApplication(token: string): Promise<StaffApplicationStatus> {
  return fetch(`${API_URL}/staff-applications/me`, { headers: { Authorization: `Bearer ${token}` } })
    .then((response) => readResponse<StaffApplicationStatus>(response));
}

export async function logoutStaffApplicant(token: string): Promise<void> {
  await fetch(`${API_URL}/staff-applications/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
}

export async function submitStaffApplication(input: {
  name: string; email: string; phone?: string; experience?: string; motivation?: string;
  username: string; password: string;
}): Promise<{ token: string; application: { id: number; status: string } }> {
  const response = await fetch(`${API_URL}/staff-applications`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  return readResponse(response);
}
