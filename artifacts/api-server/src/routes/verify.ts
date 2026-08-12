import { lookup } from "node:dns/promises";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Reference verification
//
// "Valid" has two halves:
//   1. Structure — every source has the fields a real citation needs.
//   2. Reality — the source actually exists and is reachable. Wikipedia
//      sources are checked against the MediaWiki API (resolves redirects and
//      returns the canonical article URL); everything else gets a HEAD/GET
//      reachability probe.
// The engine never fabricates citations, but links can rot, titles can be
// mistyped, and students can hand-edit drafts — so this endpoint lets the
// app check sources on demand, right before submission.
// ---------------------------------------------------------------------------

const MAX_REFERENCES = 100;
const CHECK_TIMEOUT_MS = 10_000;
const USER_AGENT = "carestudy-assistant/1.0 (local citation verification)";

type SourceStatus = "ok" | "not_found" | "unreachable" | "invalid" | "no_url";

type SourceCheckResult = {
  label: string;
  inText: string | null;
  url: string | null;
  status: SourceStatus;
  resolvedUrl: string | null;
  note: string | null;
};

function normalizeReference(raw: unknown): { label: string; inText: string | null; url: string | null } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const entry = raw as { label?: unknown; inText?: unknown; url?: unknown };
  const label = typeof entry.label === "string" ? entry.label.trim() : "";
  const inText = typeof entry.inText === "string" && entry.inText.trim() ? entry.inText.trim() : null;
  const url = typeof entry.url === "string" && entry.url.trim() ? entry.url.trim() : null;
  if (!label && !inText && !url) return null;
  return { label, inText, url };
}

// ---------------------------------------------------------------------------
// SSRF guard — the server fetches client-supplied URLs, so never probe
// loopback, private, or link-local addresses (localhost, 10.x, 172.16/12,
// 192.168.x, 169.254.x, ::1, ULA/link-local IPv6, .local/.internal hosts).
// ---------------------------------------------------------------------------

export function isPrivateAddress(address: string): boolean {
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 127 ||
      (a === 169 && b === 254) ||
      a === 0
    );
  }
  const lower = address.toLowerCase();
  return (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80") ||
    lower.startsWith("::ffff:127.") ||
    lower.startsWith("::ffff:10.") ||
    lower.startsWith("::ffff:192.168.")
  );
}

/** True when a hostname is a known-internal name or resolves to a private IP. */
export async function hostIsBlocked(hostname: string): Promise<boolean> {
  const clean = hostname.replace(/\.$/, "").toLowerCase();
  if (
    clean === "localhost" ||
    clean.endsWith(".local") ||
    clean.endsWith(".internal") ||
    clean.endsWith(".localhost")
  ) {
    return true;
  }
  try {
    const addresses = await lookup(clean, { all: true });
    return addresses.some(({ address }) => isPrivateAddress(address));
  } catch {
    // DNS failure — the probe will report it as unreachable upstream.
    return false;
  }
}

/** Extract `en` from en.wikipedia.org / www.wikipedia.org / en.m.wikipedia.org. */
function wikipediaLanguage(host: string): string | null {
  const normalized = host.replace(/^www\./i, "").replace(/^m\./i, "");
  const match = /^(?:([a-z-]+)\.)?wikipedia\.org$/i.exec(normalized);
  if (!match) return null;
  return match[1] ? match[1].toLowerCase() : "en";
}

/**
 * Resolve a Wikipedia article title through the MediaWiki API.
 *
 * "unreachable" means we could not perform the check (timeout, network error,
 * API outage) — deliberately distinct from "not_found" so a slow network never
 * makes a real source look dead.
 */
async function checkWikipediaPage(lang: string, title: string): Promise<{
  status: "ok" | "not_found" | "unreachable";
  canonical?: string;
  note?: string;
}> {
  const apiUrl =
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2` +
    `&redirects=1&titles=${encodeURIComponent(title)}`;
  let response: Response;
  try {
    response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
    });
  } catch (err) {
    return { status: "unreachable", note: err instanceof Error ? err.message : "Wikipedia API unreachable" };
  }
  if (!response.ok) {
    return { status: "unreachable", note: `Wikipedia API responded with HTTP ${response.status}` };
  }
  const data = (await response.json().catch(() => null)) as
    | { query?: { pages?: { missing?: boolean; invalid?: boolean; title?: string }[] } }
    | null;
  const page = data?.query?.pages?.[0];
  if (!page) return { status: "not_found", note: "Wikipedia API returned no page for this title" };
  if (page.invalid) return { status: "not_found", note: "Not a valid Wikipedia article title" };
  if (page.missing) return { status: "not_found", note: "No Wikipedia article with this exact title" };
  const canonicalTitle = page.title ?? title;
  return {
    status: "ok",
    canonical: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(canonicalTitle.replace(/ /g, "_"))}`,
  };
}

/** Reachability probe for a non-Wikipedia URL (HEAD, falling back to GET). */
async function probeUrl(rawUrl: string): Promise<{ status: SourceStatus; resolvedUrl: string | null; note: string | null }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { status: "invalid", resolvedUrl: null, note: "Not a well-formed URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { status: "invalid", resolvedUrl: null, note: "Only http(s) URLs can be verified" };
  }

  const attempt = async (method: "HEAD" | "GET") => {
    const response = await fetch(parsed, {
      method,
      redirect: "follow",
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
    });
    return response;
  };

  try {
    let response = await attempt("HEAD");
    if (response.ok) return { status: "ok", resolvedUrl: response.url, note: null };
    if (response.status === 404) return { status: "not_found", resolvedUrl: null, note: "HTTP 404" };
    // 405/403/5xx on HEAD — many sites block HEAD; retry with GET.
    response = await attempt("GET");
    if (response.ok) return { status: "ok", resolvedUrl: response.url, note: null };
    if (response.status === 404) return { status: "not_found", resolvedUrl: null, note: "HTTP 404" };
    return { status: "unreachable", resolvedUrl: null, note: `HTTP ${response.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return { status: "unreachable", resolvedUrl: null, note: message };
  }
}

/** Verify one reference end to end. */
async function verifySource(reference: {
  label: string;
  inText: string | null;
  url: string | null;
}): Promise<SourceCheckResult> {
  const base: SourceCheckResult = {
    label: reference.label,
    inText: reference.inText,
    url: reference.url,
    status: "no_url",
    resolvedUrl: null,
    note: null,
  };

  if (!reference.url) {
    return { ...base, status: "no_url", note: "No URL attached to this source" };
  }

  let parsed: URL;
  try {
    parsed = new URL(reference.url);
  } catch {
    return { ...base, status: "invalid", note: "Not a well-formed URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ...base, status: "invalid", note: "Only http(s) URLs can be verified" };
  }

  const lang = wikipediaLanguage(parsed.hostname);
  if (lang) {
    // Wikipedia URLs are verified against the fixed wikipedia.org API host, so
    // the SSRF guard does not apply here.
    const pathMatch = /\/wiki\/(.+)$/.exec(parsed.pathname);
    if (!pathMatch) {
      return { ...base, status: "invalid", note: "Wikipedia URL should look like …/wiki/Article_title" };
    }
    const title = decodeURIComponent(pathMatch[1].replace(/\/+$/, "")).replace(/_/g, " ");
    const page = await checkWikipediaPage(lang, title);
    return {
      ...base,
      status: page.status,
      resolvedUrl: page.canonical ?? null,
      note: page.note ?? (page.status === "ok" ? "Article exists" : null),
    };
  }

  if (await hostIsBlocked(parsed.hostname)) {
    return { ...base, status: "invalid", note: "Local or private addresses cannot be verified" };
  }

  const probe = await probeUrl(reference.url);
  return { ...base, ...probe };
}

router.post("/references/verify", async (req, res) => {
  try {
    const raw = req.body?.references;
    if (!Array.isArray(raw)) {
      res.status(422).json({ error: "A references array is required" });
      return;
    }
    if (raw.length === 0) {
      res.status(422).json({ error: "At least one reference is required" });
      return;
    }
    if (raw.length > MAX_REFERENCES) {
      res.status(422).json({ error: `Too many references — check at most ${MAX_REFERENCES} at once` });
      return;
    }

    const references = raw
      .map(normalizeReference)
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    if (references.length === 0) {
      res.status(422).json({ error: "No valid references were provided" });
      return;
    }

    const results: SourceCheckResult[] = [];
    // Check sequentially with a small delay — polite to external hosts and the
    // Wikipedia API, and avoids hammering them with a wall of parallel requests.
    for (const reference of references) {
      results.push(await verifySource(reference));
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    const summary: Record<SourceStatus, number> = {
      ok: 0,
      not_found: 0,
      unreachable: 0,
      invalid: 0,
      no_url: 0,
    };
    for (const result of results) summary[result.status] += 1;

    res.json({ results, summary, checkedAt: new Date().toISOString() });
  } catch (err) {
    req.log?.error?.({ err }, "reference verification failed");
    res.status(500).json({ error: "Verification failed" });
  }
});

export default router;
