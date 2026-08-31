/**
 * Admin context — provides the signed-in admin's profile to studio components.
 *
 * The AdminGate fetches the admin on mount and stores it here. Child
 * components (sidebar, header, etc.) read the admin's name, role, and
 * username without re-fetching.
 */
import { createContext, useContext } from "react";
import type { Admin } from "./adminAuth";

export type AdminContextValue = {
  admin: Admin | null;
};

export const AdminContext = createContext<AdminContextValue>({ admin: null });

export function useAdmin(): Admin | null {
  return useContext(AdminContext).admin;
}

/** Get display initials from a name or username. */
export function getInitials(admin: Admin | null): string {
  if (!admin) return "??";
  const source = admin.name || admin.username;
  const parts = source.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/** Get display name — prefer name, fall back to username. */
export function getDisplayName(admin: Admin | null): string {
  if (!admin) return "Unknown";
  return admin.name || admin.username;
}

/** Get role label — human-readable. */
export function getRoleLabel(admin: Admin | null): string {
  if (!admin) return "";
  return admin.role === "admin" ? "Administrator" : "Staff";
}
