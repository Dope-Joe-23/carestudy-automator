/**
 * API client for the drafting backend (the Express API server, which runs the
 * Python RAG + Claude engine).
 *
 * In dev the Vite dev server proxies `/api` to the API server, so calls are
 * relative. Set VITE_API_URL to point elsewhere (e.g. a deployed backend).
 */

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

// Slightly above the API server's 120s child-process timeout, so the client
// gives up last and reports a clear error instead of spinning forever.
const REQUEST_TIMEOUT_MS = 130_000;

export async function requestDraft(heading: string, notes: string): Promise<string> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}/sections/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ heading, notes }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(body?.error ?? `Drafting request failed (${response.status})`);
    }

    const data = (await response.json()) as { draft: string };
    return data.draft;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Drafting timed out — the engine took too long. Please try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
