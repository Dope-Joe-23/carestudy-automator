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

// ---------------------------------------------------------------------------
// Studio admin rows
// ---------------------------------------------------------------------------

export type AdminRow = {
  id: number;
  /** Login username (unique). */
  username: string;
  /** scrypt hash "salt:hash" — never the plaintext password. */
  passwordHash: string;
  /** Display name (optional). */
  name: string | null;
  createdAt: Date;
};

export type NewAdmin = {
  username: string;
  passwordHash: string;
  name?: string | null;
};

// ---------------------------------------------------------------------------
// Student portal rows
// ---------------------------------------------------------------------------

export type StudentRow = {
  id: number;
  name: string;
  /** Lowercased login email (unique). */
  email: string;
  /** scrypt hash "salt:hash" — never the plaintext password. */
  passwordHash: string;
  college: string;
  program: string;
  year: string | null;
  createdAt: Date;
};

export type NewStudent = {
  name: string;
  email: string;
  passwordHash: string;
  college: string;
  program: string;
  year?: string | null;
};

/** "submitted" | "in_production" | "ready" | "cancelled". */
export type OrderStatus = "submitted" | "in_production" | "ready" | "cancelled";

export const ORDER_STATUSES: OrderStatus[] = ["submitted", "in_production", "ready", "cancelled"];

export type OrderRow = {
  id: number;
  studentId: number;
  title: string;
  diagnosis: string | null;
  college: string;
  program: string;
  notes: string | null;
  correctionScope: "chapter" | "full" | null;
  correctionText: string | null;
  status: OrderStatus;
  /** Studio note to the student (status context / feedback). */
  note: string | null;
  /** The study created from this order in the studio (null until produced). */
  producedStudyId: number | null;
  deliveryFilename: string | null;
  deliveryPath: string | null;
  deliverySize: number | null;
  /** Generated viva question bank (JSON-encoded { questions: [...] }) — null until generated. */
  vivaBank: string | null;
  /** "none" | "pending" | "ready" | "error". */
  vivaStatus: VivaStatus;
  vivaError: string | null;
  vivaUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** "none" | "pending" | "ready" | "error" — viva question bank lifecycle. */
export type VivaStatus = "none" | "pending" | "ready" | "error";

export type NewOrder = {
  studentId: number;
  title: string;
  diagnosis?: string | null;
  college: string;
  program: string;
  notes?: string | null;
  correctionScope?: "chapter" | "full" | null;
  correctionText?: string | null;
};

/** An order plus the student's name/email (studio order bin). */
export type OrderWithStudent = OrderRow & { studentName: string; studentEmail: string };

/** "guidelines" | "clinical" | "reference" — what an attached file is for. */
export type OrderFileKind = "guidelines" | "clinical" | "reference" | "correction";

export type OrderFileRow = {
  id: number;
  orderId: number;
  kind: OrderFileKind;
  filename: string;
  storedPath: string;
  mime: string;
  size: number;
  createdAt: Date;
};

export type NewOrderFile = {
  orderId: number;
  kind: OrderFileKind;
  filename: string;
  storedPath: string;
  mime: string;
  size: number;
};

export interface StudyStore {
  /** All studies, most recently updated first. */
  list(): Promise<StudyRow[]>;
  /** Create a study. */
  create(name: string, data: unknown): Promise<StudyRow>;
  /** Latest snapshot of one study, or null when it doesn't exist. */
  get(id: number): Promise<StudyRow | null>;
  /** Save the current snapshot; null when the study is missing. */
  update(id: number, name: string, data: unknown): Promise<StudyRow | null>;
  /** Delete a study; false when nothing was deleted. */
  remove(id: number): Promise<boolean>;
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

  // --- Studio admins ------------------------------------------------------

  /** Create an admin account; rejects on duplicate username. */
  addAdmin(admin: NewAdmin): Promise<AdminRow>;
  /** One admin by login username, or null. */
  getAdminByUsername(username: string): Promise<AdminRow | null>;
  /** One admin by id, or null. */
  getAdmin(id: number): Promise<AdminRow | null>;
  /** Issue a new session token for an admin. */
  createAdminSession(adminId: number, token: string): Promise<void>;
  /** Resolve a session token to its admin, or null. */
  getAdminByToken(token: string): Promise<AdminRow | null>;
  /** Destroy an admin session; false when nothing was deleted. */
  removeAdminSession(token: string): Promise<boolean>;

  // --- Student portal: accounts, sessions, orders -------------------------

  /** Create a student account; rejects on duplicate email. */
  addStudent(student: NewStudent): Promise<StudentRow>;
  /** One student by login email, or null. */
  getStudentByEmail(email: string): Promise<StudentRow | null>;
  /** One student by id, or null. */
  getStudent(id: number): Promise<StudentRow | null>;
  /** Issue a new session token for a student. */
  createSession(studentId: number, token: string): Promise<void>;
  /** Resolve a session token to its student, or null. */
  getStudentByToken(token: string): Promise<StudentRow | null>;
  /** Destroy a session token; false when nothing was deleted. */
  removeSession(token: string): Promise<boolean>;

  /** Place an order (status starts as "submitted"). */
  addOrder(order: NewOrder): Promise<OrderRow>;
  /** A student's own orders, newest first. */
  listOrders(studentId: number): Promise<OrderRow[]>;
  /** Every order, newest first (studio order bin). */
  listAllOrders(): Promise<OrderRow[]>;
  /** One order, or null. */
  getOrder(id: number): Promise<OrderRow | null>;
  /** Update an order's status (+ optional note). */
  updateOrderStatus(
    id: number,
    status: OrderStatus,
    note?: string | null,
  ): Promise<OrderRow | null>;
  /** Attach the delivered study and mark the order ready. */
  setOrderDelivery(
    id: number,
    delivery: { filename: string; storedPath: string; size: number },
  ): Promise<OrderRow | null>;
  /** Record the studio study produced from this order (status → in_production). */
  setOrderProduced(
    id: number,
    studyId: number,
    note?: string | null,
  ): Promise<OrderRow | null>;
  /** Save the generated viva question bank (or its error) on the order. */
  setOrderViva(
    id: number,
    viva: { status: "ready"; bankJson: string } | { status: "error"; error: string },
  ): Promise<OrderRow | null>;

  /** Register a document attached to an order. */
  addOrderFile(file: NewOrderFile): Promise<OrderFileRow>;
  /** Documents attached to an order, oldest first. */
  listOrderFiles(orderId: number): Promise<OrderFileRow[]>;
}
