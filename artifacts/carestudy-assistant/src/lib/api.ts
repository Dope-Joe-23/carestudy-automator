/**
 * API client for the drafting backend (the Express API server, which runs the
 * Python RAG + Claude engine).
 *
 * In dev the Vite dev server proxies `/api` to the API server, so calls are
 * relative. Set VITE_API_URL to point elsewhere (e.g. a deployed backend).
 */

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

// Slightly above the API server's 300s child-process timeout, so the client
// gives up last and reports a clear error instead of spinning forever.
const REQUEST_TIMEOUT_MS = 320_000;

// The studio is behind an admin login — every studio API call carries the
// admin's bearer token. When a call comes back 401 (session missing/expired)
// the AdminGate is told to show the login screen again.
import { getAdminToken, notifyAdminUnauthorized } from "./adminAuth";

/** JSON headers with the studio admin's bearer token when signed in. */
function apiHeaders(): Record<string, string> {
  const token = getAdminToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Surface a 401 as a session-expiry signal so the studio shows the login screen. */
function signalIfUnauthorized(response: Response): void {
  if (response.status === 401) notifyAdminUnauthorized();
}

/** A citable source a draft was grounded on (from the reference library). */
export type DraftReference = {
  label: string;
  inText: string;
  url?: string | null;
};

export async function requestDraft(
  heading: string,
  notes: string,
  tabular = false,
  kind: "section" | "chapter_intro" = "section",
  studyId: number | null = null,
  rowColumns: string[] = [],
): Promise<{ draft: string; references: DraftReference[] }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}/sections/draft`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ heading, notes, tabular, kind, studyId, rowColumns }),
      signal: controller.signal,
    });

    if (!response.ok) {
      signalIfUnauthorized(response);
      const body = (await response.json().catch(() => null)) as
        | { error?: string; detail?: string }
        | null;
      throw new Error(
        body?.detail ?? body?.error ?? `Drafting request failed (${response.status})`,
      );
    }

    const data = (await response.json()) as {
      draft: string;
      references?: DraftReference[];
    };
    // A "successful" response with no text (free-tier models occasionally
    // return an empty completion) must never look like a real draft — treat it
    // as a failure so the UI surfaces a retryable error instead of silently
    // storing an empty draft.
    if (!data.draft || !data.draft.trim()) {
      throw new Error('The drafting engine returned an empty response — please try again.');
    }
    return { draft: data.draft, references: Array.isArray(data.references) ? data.references : [] };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Drafting timed out — the engine took too long. Please try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export type ExportField = { label: string; value: string };

export type ExportSection = {
  id: string;
  heading: string;
  draft: string;
  references?: DraftReference[];
  fields: ExportField[];
  rows?: {
    title: string;
    columns: string[];
    data: string[][];
  };
};

export type ExportChapter = {
  name: string;
  sections: ExportSection[];
  /** Unnumbered preliminary pages (preface/acknowledgement/introduction). */
  isFrontMatter?: boolean;
  /** Optional chapter introduction, rendered under the chapter heading. */
  intro?: string;
  /** Sources cited by the chapter introduction. */
  introReferences?: DraftReference[];
};

/**
 * How much of the study to render in the exported Word document:
 * - full: title page + table of contents + all chapters
 * - chapter: a single chapter with a compact header (no TOC)
 * - section: a single section with a compact header
 */
export type ExportScope =
  | { type: 'full' }
  | { type: 'chapter'; chapterIndex: number }
  | { type: 'section'; chapterIndex: number; sectionIndex: number };

/**
 * Word export formatting — mirrors the Theme object in
 * carestudy_rag/src/export_docx.py. Keys are snake_case to match the Python
 * API; every field is optional and the exporter fills defaults for anything
 * missing. Colors are hex without the leading '#'.
 */
export type DocTheme = {
  body_font?: string;
  heading_font?: string;
  body_size?: number;
  heading1_size?: number;
  heading2_size?: number;
  table_size?: number;
  table_title_size?: number;
  title_size?: number;
  body_color?: string;
  heading_color?: string;
  table_header_fill?: string;
  table_header_color?: string;
  highlight_color?: string;
  line_spacing?: number;
  space_after?: number;
  heading1_space_before?: number;
  heading1_space_after?: number;
  heading2_space_before?: number;
  heading2_space_after?: number;
  body_alignment?: 'justify' | 'left' | 'center' | 'right';
  first_line_indent?: number;
};

export type ExportPayload = {
  title: {
    patientName: string;
    diagnosis: string;
    studentName: string;
    indexNumber: string;
    collegeName: string;
    collegeLocation: string;
    year: string;
  };
  chapters: ExportChapter[];
  scope?: ExportScope;
  /** Document formatting for the Word export (optional; defaults to NMC style). */
  theme?: DocTheme;
};

/**
 * Export the full study to a Word (.docx) document, built server-side by the
 * Python engine (python-docx) to match the standard NMC of Ghana format.
 */
// ---------------------------------------------------------------------------
// Citation / reference verification
// ---------------------------------------------------------------------------

/** Result of checking one reference's URL on the server. */
export type SourceCheckStatus = 'ok' | 'not_found' | 'unreachable' | 'invalid' | 'no_url';

export type SourceCheck = {
  label: string;
  inText: string | null;
  url: string | null;
  status: SourceCheckStatus;
  /** Canonical URL when the server resolved the source (e.g. Wikipedia). */
  resolvedUrl: string | null;
  note: string | null;
};

export type VerifyResponse = {
  results: SourceCheck[];
  summary: Record<SourceCheckStatus, number>;
  checkedAt: string;
};

/**
 * Ask the server to verify a batch of references: Wikipedia sources are
 * resolved through the MediaWiki API, other URLs get a reachability probe.
 */
export async function verifyReferences(
  references: DraftReference[],
): Promise<VerifyResponse> {
  const controller = new AbortController();
  // Checks run sequentially server-side (up to ~10s each), so give a whole
  // study's sources room to finish.
  const timer = window.setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(`${API_URL}/references/verify`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ references }),
      signal: controller.signal,
    });
    if (!response.ok) {
      signalIfUnauthorized(response);
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `Verification failed (${response.status})`);
    }
    return (await response.json()) as VerifyResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(
        'Verification timed out — too many sources to check in one go. Try verifying section by section.',
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function exportStudyDocx(payload: ExportPayload): Promise<Blob> {
  const response = await fetch(`${API_URL}/export/docx`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    signalIfUnauthorized(response);
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(body?.error ?? `Export failed (${response.status})`);
  }

  return response.blob();
}

// ---------------------------------------------------------------------------
// Study storage — Postgres-backed saved studies with version history
// ---------------------------------------------------------------------------

/** Server-side snapshot of the full workspace. */
export type StoredSection = {
  id: string;
  notes: string;
  draft: string;
  /** Reference sources this section's draft was grounded on. */
  references: DraftReference[];
  /** Field values keyed by template field id. */
  data: Record<string, string>;
  /** Table rows as cell strings (row ids are runtime-only). */
  rowData: { cells: string[] }[];
};

export type StoredChapter = {
  name: string;
  sections: StoredSection[];
  intro?: string;
  introReferences?: DraftReference[];
};

export type StoredStudy = {
  title: ExportPayload["title"];
  chapters: StoredChapter[];
  /** Word-export formatting choices (fonts, sizes, colors, spacing…) —
   *  autosaved with the study so formatting survives reopening it anywhere.
   *  Optional: studies saved before themes existed carry no theme. */
  theme?: DocTheme;
};

export type StudySummary = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Sections drafted / total sections, computed server-side. */
  stats?: { drafted: number; total: number };
};

export type StudyDetail = StudySummary & { data: StoredStudy };

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...apiHeaders(),
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
    },
  });

  if (!response.ok) {
    signalIfUnauthorized(response);
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function listStudies(): Promise<StudySummary[]> {
  return requestJson("/studies");
}

export function createStudy(name: string, data: StoredStudy): Promise<StudySummary> {
  return requestJson("/studies", {
    method: "POST",
    body: JSON.stringify({ name, data }),
  });
}

export function getStudy(id: number): Promise<StudyDetail> {
  return requestJson(`/studies/${id}`);
}

export function updateStudy(
  id: number,
  name: string,
  data: StoredStudy,
): Promise<StudySummary> {
  return requestJson(`/studies/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name, data }),
  });
}

export function deleteStudy(id: number): Promise<void> {
  return requestJson<void>(`/studies/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Clinical document uploads — per-study files that ground every draft
// ---------------------------------------------------------------------------

/** An uploaded clinical document attached to a study. */
export type StudyFile = {
  id: number;
  filename: string;
  kind: string;
  mime: string;
  size: number;
  /** "indexing" | "ready" | "error" — text extraction + index state. */
  status: "indexing" | "ready" | "error";
  error: string | null;
  createdAt: string;
};

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

// ---------------------------------------------------------------------------
// Uploads — when the server has R2 object storage configured, files are PUT
// directly to the bucket via a presigned URL (no size cap beyond ~250 MB),
// then registered with the server. Otherwise the classic base64-in-JSON path
// is used, capped at MAX_UPLOAD_MB (default 250 MB).
// ---------------------------------------------------------------------------

export type UploadMode = "r2" | "local";

let cachedUploadMode: UploadMode | null = null;

/** Which storage backend the server is running: "r2" (direct uploads) or
 *  "local" (base64 fallback). Cached per session. */
export async function getUploadMode(): Promise<UploadMode> {
  if (cachedUploadMode) return cachedUploadMode;
  try {
    const data = await requestJson<{ mode: UploadMode }>("/uploads/config");
    cachedUploadMode = data.mode;
    return data.mode;
  } catch {
    return "local"; // config unreachable — assume the base64 path
  }
}

/** Ask the server for a presigned PUT URL for a file. Throws with a `status`
 *  property so callers can detect 501 (R2 not configured) and fall back. */
async function presignUpload(
  path: string,
  filename: string,
  file: File,
): Promise<{ uploadUrl: string; objectKey: string }> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      filename,
      size: file.size,
      contentType: file.type || "application/octet-stream",
    }),
  });
  if (!response.ok) {
    signalIfUnauthorized(response);
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    const error = new Error(body?.error ?? `Upload setup failed (${response.status})`);
    (error as { status?: number }).status = response.status;
    throw error;
  }
  return (await response.json()) as { uploadUrl: string; objectKey: string };
}

/** PUT the raw bytes to the presigned URL (the actual file upload). */
async function putToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`Upload to storage failed (${response.status}).`);
  }
}

/** POST a JSON body and surface the server's `{ error }` message. */
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    signalIfUnauthorized(response);
    const errBody = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errBody?.error ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

/** Upload a clinical document (PDF / DOCX / TXT) to ground a study's drafts. */
export async function uploadStudyFile(studyId: number, file: File): Promise<StudyFile> {
  if ((await getUploadMode()) === "r2") {
    try {
      const { uploadUrl, objectKey } = await presignUpload(
        `/studies/${studyId}/files/presign`,
        file.name,
        file,
      );
      await putToPresignedUrl(uploadUrl, file);
      const data = await postJson<{ file: StudyFile }>(`/studies/${studyId}/files/complete`, {
        objectKey,
        filename: file.name,
      });
      return data.file;
    } catch (error) {
      // Direct uploads unavailable (R2 disabled since the config check) —
      // fall back to the base64 path rather than failing the upload.
      if ((error as { status?: number }).status === 501) {
        return uploadStudyFileBase64(studyId, file);
      }
      throw error;
    }
  }
  return uploadStudyFileBase64(studyId, file);
}

/** The classic path: base64 file in the JSON body (server caps at MAX_UPLOAD_MB, default 250 MB). */
async function uploadStudyFileBase64(studyId: number, file: File): Promise<StudyFile> {
  const content = await readFileAsBase64(file);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(`${API_URL}/studies/${studyId}/files`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ filename: file.name, content }),
      signal: controller.signal,
    });
    if (!response.ok) {
      signalIfUnauthorized(response);
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `Upload failed (${response.status})`);
    }
    const data = (await response.json()) as { file: StudyFile };
    return data.file;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function listStudyFiles(studyId: number): Promise<StudyFile[]> {
  const data = await requestJson<{ files: StudyFile[] }>(`/studies/${studyId}/files`);
  return data.files;
}

export async function deleteStudyFile(studyId: number, fileId: number): Promise<void> {
  return requestJson<void>(`/studies/${studyId}/files/${fileId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Personal reference library — ebooks, notes, articles, external resources
// ---------------------------------------------------------------------------

/** A reusable study source from the user's personal library. */
export type LibrarySource = {
  id: number;
  kind: "ebook" | "notes" | "article" | "url";
  title: string;
  author: string | null;
  year: string | null;
  venue: string | null;
  citeKey: string | null;
  url: string | null;
  filename: string;
  status: "indexing" | "ready" | "error";
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Citation metadata edited on a library source. */
export type LibraryCitationInput = {
  title?: string;
  author?: string;
  year?: string;
  venue?: string;
  citeKey?: string;
  url?: string;
};

/**
 * Add a library source: a file (ebook / notes / article) uploaded directly to
 * the bucket when R2 is active (or base64 otherwise), or an external resource
 * URL that the server fetches and extracts.
 */
export async function addLibrarySource(input: {
  kind: LibrarySource["kind"];
  filename?: string;
  file?: File;
  content?: string;
  url?: string;
  title?: string;
}): Promise<LibrarySource> {
  const { kind, file, url } = input;

  // Direct-to-bucket upload for files when the server has R2 configured.
  if (file && !url && (await getUploadMode()) === "r2") {
    try {
      const filename = input.filename ?? file.name;
      const { uploadUrl, objectKey } = await presignUpload(
        "/library/sources/presign",
        filename,
        file,
      );
      await putToPresignedUrl(uploadUrl, file);
      const data = await postJson<{ source: LibrarySource }>("/library/sources/complete", {
        objectKey,
        kind,
        filename,
        title: input.title,
      });
      return data.source;
    } catch (error) {
      if ((error as { status?: number }).status === 501) {
        // R2 disabled since the config check — fall through to base64.
        input.content = input.content ?? (await readFileAsBase64(file));
      } else {
        throw error;
      }
    }
  } else if (file && !url && !input.content) {
    input.content = await readFileAsBase64(file);
  }

  const response = await fetch(`${API_URL}/library/sources`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      kind,
      filename: input.filename ?? file?.name,
      content: input.content,
      url,
      title: input.title,
    }),
  });
  if (!response.ok) {
    signalIfUnauthorized(response);
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Adding source failed (${response.status})`);
  }
  const data = (await response.json()) as { source: LibrarySource };
  return data.source;
}

export async function listLibrarySources(): Promise<LibrarySource[]> {
  const data = await requestJson<{ sources: LibrarySource[] }>("/library/sources");
  return data.sources;
}

export async function updateLibrarySource(
  id: number,
  fields: LibraryCitationInput,
): Promise<LibrarySource> {
  const data = await requestJson<{ source: LibrarySource }>(`/library/sources/${id}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
  return data.source;
}

export async function deleteLibrarySource(id: number): Promise<void> {
  return requestJson<void>(`/library/sources/${id}`, { method: "DELETE" });
}
