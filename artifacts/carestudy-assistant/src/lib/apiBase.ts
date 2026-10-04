/** Shared API origin. In development, Vite proxies the relative `/api` path. */
export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() || "/api";

/** Resolve API paths returned by the backend against its configured origin. */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;

  const base = API_URL.replace(/\/+$/, "");
  const route = path.replace(/^\/+/, "");
  const relativeRoute =
    base.endsWith("/api") && route.startsWith("api/")
      ? route.slice("api/".length)
      : route;

  return `${base}/${relativeRoute}`;
}
