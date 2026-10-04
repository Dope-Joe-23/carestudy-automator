/** Shared API origin. In development, Vite proxies the relative `/api` path. */
export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() || "/api";
