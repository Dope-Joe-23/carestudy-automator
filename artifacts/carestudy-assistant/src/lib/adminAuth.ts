/**
 * Client-side studio-admin auth.
 *
 * The studio (studies, library, uploads, order bin) is behind an admin login;
 * the signed-in admin's bearer token is attached to every studio API call in
 * lib/api.ts. When a call comes back 401 (missing/expired session), api.ts
 * fires `carestudy:admin-unauthorized` so the AdminGate flips back to the
 * login screen instead of letting the studio error out mid-work.
 */

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

const TOKEN_KEY = "carestudy_admin_token";

export function getAdminToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable — the session just won't persist across reloads
  }
}

export type Admin = {
  id: number;
  username: string;
  name: string | null;
};

/** Fire the "session expired" signal so the AdminGate shows the login screen. */
export function notifyAdminUnauthorized(): void {
  window.dispatchEvent(new CustomEvent("carestudy:admin-unauthorized"));
}

export async function adminLogin(
  username: string,
  password: string,
): Promise<{ token: string; admin: Admin }> {
  const response = await fetch(`${API_URL}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Sign-in failed (${response.status})`);
  }
  return (await response.json()) as { token: string; admin: Admin };
}

/** Destroy the admin session server-side, then drop the local token. */
export async function adminLogout(): Promise<void> {
  const token = getAdminToken();
  try {
    if (token) {
      await fetch(`${API_URL}/admin/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } finally {
    setAdminToken(null);
  }
}

/** Restore a session on page load; throws when the token is no longer valid. */
export async function fetchAdminMe(): Promise<{ admin: Admin }> {
  const token = getAdminToken();
  if (!token) throw new Error("No admin session");
  const response = await fetch(`${API_URL}/admin/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    setAdminToken(null);
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Session check failed (${response.status})`);
  }
  return (await response.json()) as { admin: Admin };
}
