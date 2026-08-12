// Backend-agnostic study storage contract.
//
// Both storage backends (SQLite file for development, Postgres for
// deployment) implement this interface; the API routes never touch a
// dialect-specific client or table.

export type StudyRow = {
  id: number;
  name: string;
  /** Full workspace snapshot (title + chapters). Shape is app-defined. */
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type StudyVersionRow = {
  id: number;
  data: unknown;
  createdAt: Date;
};

export type StudyVersionSummaryRow = {
  id: number;
  createdAt: Date;
};

export type StudyFileRow = {
  id: number;
  studyId: number;
  /** Original client filename (display only). */
  filename: string;
  /** Path on disk where the bytes live (set by the storage layer). */
  storedPath: string;
  kind: string;
  mime: string;
  size: number;
  /** "indexing" | "ready" | "error". */
  status: string;
  error: string | null;
  createdAt: Date;
};

export type NewStudyFile = {
  studyId: number;
  filename: string;
  storedPath: string;
  kind?: string;
  mime: string;
  size: number;
  status?: string;
  error?: string | null;
};

export type LibrarySourceRow = {
  id: number;
  kind: string;
  title: string;
  author: string | null;
  year: string | null;
  venue: string | null;
  citeKey: string | null;
  url: string | null;
  filename: string;
  storedPath: string;
  status: string;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NewLibrarySource = {
  kind: string;
  title: string;
  author?: string | null;
  year?: string | null;
  venue?: string | null;
  citeKey?: string | null;
  url?: string | null;
  filename: string;
  storedPath: string;
  status?: string;
  error?: string | null;
};

export interface StudyStore {
  /** All studies, most recently updated first. */
  list(): Promise<StudyRow[]>;
  /** Create a study and record its first version atomically. */
  create(name: string, data: unknown): Promise<StudyRow>;
  /** Latest snapshot of one study, or null when it doesn't exist. */
  get(id: number): Promise<StudyRow | null>;
  /** Save a new snapshot + version atomically; null when the study is missing. */
  update(id: number, name: string, data: unknown): Promise<StudyRow | null>;
  /** Delete a study and all its versions; false when nothing was deleted. */
  remove(id: number): Promise<boolean>;
  /** Save history for a study, newest first. */
  listVersions(studyId: number): Promise<StudyVersionSummaryRow[]>;
  /** A specific historical snapshot; null when missing. */
  getVersion(studyId: number, versionId: number): Promise<StudyVersionRow | null>;
  /** Uploaded document rows for a study, oldest first. */
  listFiles(studyId: number): Promise<StudyFileRow[]>;
  /** Register a freshly-uploaded document. */
  addFile(file: NewStudyFile): Promise<StudyFileRow>;
  /** One upload row (any study) or null. */
  getFile(id: number): Promise<StudyFileRow | null>;
  /** Update an upload's processing state. */
  setFileStatus(id: number, status: string, error?: string | null): Promise<StudyFileRow | null>;
  /** Delete an upload row; false when nothing was deleted. */
  removeFile(id: number): Promise<boolean>;
  /** All personal reference-library sources, oldest first. */
  listLibrary(): Promise<LibrarySourceRow[]>;
  /** Register a library source (ebook / notes / article / url). */
  addLibrarySource(source: NewLibrarySource): Promise<LibrarySourceRow>;
  /** One library source or null. */
  getLibrarySource(id: number): Promise<LibrarySourceRow | null>;
  /** Update a library source's processing state. */
  setLibrarySourceStatus(id: number, status: string, error?: string | null): Promise<LibrarySourceRow | null>;
  /** Update a library source's citation metadata (title/author/year/venue/key/url). */
  updateLibrarySource(
    id: number,
    fields: Partial<Pick<LibrarySourceRow, "title" | "author" | "year" | "venue" | "citeKey" | "url">>,
  ): Promise<LibrarySourceRow | null>;
  /** Delete a library source row; false when nothing was deleted. */
  removeLibrarySource(id: number): Promise<boolean>;
}
