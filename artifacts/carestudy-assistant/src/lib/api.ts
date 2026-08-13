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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ heading, notes, tabular, kind, studyId, rowColumns }),
      signal: controller.signal,
    });

    if (!response.ok) {
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ references }),
      signal: controller.signal,
    });
    if (!response.ok) {
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
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
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!response.ok) {
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

/** Upload a clinical document (PDF / DOCX / TXT) to ground a study's drafts. */
export async function uploadStudyFile(studyId: number, file: File): Promise<StudyFile> {
  const content = await readFileAsBase64(file);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(`${API_URL}/studies/${studyId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, content }),
      signal: controller.signal,
    });
    if (!response.ok) {
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
 * Add a library source: either a base64 file (ebook / notes / article) or an
 * external resource URL that the server fetches and extracts.
 */
export async function addLibrarySource(input: {
  kind: LibrarySource["kind"];
  filename?: string;
  content?: string;
  url?: string;
  title?: string;
}): Promise<LibrarySource> {
  const response = await fetch(`${API_URL}/library/sources`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
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
