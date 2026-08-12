import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import path from "node:path";

// Resolve the Python RAG engine relative to this bundle (dist/):
//   dist -> api-server -> artifacts -> project root -> carestudy_rag
const RAG_DIR = path.resolve(__dirname, "../../../carestudy_rag");
const WORKER_SCRIPT = path.join(RAG_DIR, "src", "draft_worker.py");
const PYTHON_BIN = process.env.PYTHON_BIN || "python";

// The worker loads the retrieval indexes once at startup (a few seconds), but
// after that each request is just the model call. 300s is generous for slow
// free-tier gateways while still surfacing genuinely hung requests.
const REQUEST_TIMEOUT_MS = 300_000;
const STDERR_TAIL_MAX = 600;

export type DraftReference = {
  label: string;
  inText: string;
  url?: string | null;
};

export type DraftResult = {
  draft: string;
  references: DraftReference[];
};

export type IngestFileResult = {
  path: string;
  textLength: number | null;
  error: string | null;
};

export type IngestResult = {
  files: IngestFileResult[];
  chunks: number;
};

/** A worker response is either a draft or an ingest result. */
type WorkerResult = DraftResult | IngestResult;

interface PendingRequest {
  /** The worker instance this request was written to. */
  child: ChildProcessWithoutNullStreams;
  resolve: (result: WorkerResult) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Manages the long-lived Python drafting worker.
 *
 * - Lazily spawns the worker on the first draft request.
 * - Requests are JSON lines on stdin; responses (matched by id) arrive on
 *   stdout in order. The worker processes one request at a time, so any
 *   number of in-flight requests simply queue inside the worker.
 * - If a request times out, the worker is presumed wedged on a hung model
 *   call: it is killed and respawned so later requests don't queue behind it.
 * - If the worker dies, every pending request written to *that* worker fails
 *   with a useful message and the next request respawns it.
 */
class DraftWorker {
  private child: ChildProcessWithoutNullStreams | null = null;
  private lines: Interface | null = null;
  private pending = new Map<number, PendingRequest>();
  private nextId = 1;

  /** Ask the worker to draft one section (or a chapter introduction). */
  async draft(
    heading: string,
    notes: string,
    tabular = false,
    kind: "section" | "chapter_intro" = "section",
    studyId: number | null = null,
  ): Promise<DraftResult> {
    const child = this.ensureWorker();
    const id = this.nextId++;

    return new Promise<DraftResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        // The request gave up. The worker may still be blocked computing it,
        // so replace the worker rather than let later requests queue behind a
        // hung model call. The late response (if any) carries a stale id and
        // is ignored.
        this.pending.delete(id);
        this.restartWorker(child);
        reject(
          new Error(
            `The drafting engine timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds — the AI model may be slow right now. Please try again.`,
          ),
        );
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        child,
        resolve: (result) => resolve(result as DraftResult),
        reject,
        timer,
      });
      try {
        child.stdin.write(JSON.stringify({ id, heading, notes, tabular, kind, studyId }) + "\n");
      } catch (writeErr) {
        // Stream destroyed (worker died a moment ago); fail fast instead of
        // leaving an entry that only self-cleans when the timer fires.
        this.pending.delete(id);
        clearTimeout(timer);
        reject(writeErr instanceof Error ? writeErr : new Error(String(writeErr)));
      }
    });
  }

  /**
   * Ask the worker to (re)build a study's retrieval index from its uploaded
   * documents. Fast — text extraction + TF-IDF, no model call. An empty path
   * list clears the study's index (used when the last file is deleted).
   */
  async ingest(studyId: number, paths: string[]): Promise<IngestResult> {
    const child = this.ensureWorker();
    const id = this.nextId++;

    return new Promise<IngestResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.restartWorker(child);
        reject(new Error("Document processing timed out — please try the upload again."));
      }, 120_000);

      this.pending.set(id, {
        child,
        resolve: (result) => resolve(result as IngestResult),
        reject,
        timer,
      });
      try {
        child.stdin.write(JSON.stringify({ id, op: "ingest", studyId, paths }) + "\n");
      } catch (writeErr) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(writeErr instanceof Error ? writeErr : new Error(String(writeErr)));
      }
    });
  }

  /**
   * Rebuild the personal reference library index (ebooks, notes, articles,
   * external resources) from its stored sources. Each source carries the
   * user-supplied citation metadata, baked into its chunks at ingest time.
   */
  async libraryIngest(
    sources: { path: string; citation: DraftReference }[],
  ): Promise<IngestResult> {
    const child = this.ensureWorker();
    const id = this.nextId++;

    return new Promise<IngestResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.restartWorker(child);
        reject(new Error("Library processing timed out — please try again."));
      }, 120_000);

      this.pending.set(id, {
        child,
        resolve: (result) => resolve(result as IngestResult),
        reject,
        timer,
      });
      try {
        child.stdin.write(
          JSON.stringify({ id, op: "library_ingest", sources }) + "\n",
        );
      } catch (writeErr) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(writeErr instanceof Error ? writeErr : new Error(String(writeErr)));
      }
    });
  }

  private ensureWorker(): ChildProcessWithoutNullStreams {
    if (this.child && this.child.exitCode === null) return this.child;

    const child = spawn(PYTHON_BIN, [WORKER_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;

    // Closure-local so a worker's crash message never picks up stderr lines
    // written by a worker that was spawned after it.
    let workerStderrTail = "";
    child.stderr.on("data", (chunk) => {
      workerStderrTail = (workerStderrTail + chunk.toString()).slice(-STDERR_TAIL_MAX);
    });

    const lines = createInterface({ input: child.stdout });
    this.lines = lines;
    lines.on("line", (line) => this.handleLine(line));

    child.stdin.on("error", () => {
      // EPIPE etc. when the worker dies mid-write; the exit handler below
      // rejects everything still pending on this worker.
    });

    child.on("error", (err) => {
      const nodeErr = err as NodeJS.ErrnoException;
      this.failAllForChild(
        child,
        new Error(
          nodeErr.code === "ENOENT"
            ? `Could not start the Python engine ("${PYTHON_BIN}"). Is Python installed and on PATH?`
            : `Could not start the drafting engine: ${err.message}`,
        ),
      );
      if (this.child === child) this.child = null;
    });

    child.on("exit", (code) => {
      const lastStderrLine = workerStderrTail
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .pop();
      this.failAllForChild(
        child,
        new Error(
          code === 0
            ? "The drafting engine stopped unexpectedly."
            : `The drafting engine stopped unexpectedly (exit code ${code}).${lastStderrLine ? ` ${lastStderrLine}` : ""}`,
        ),
      );
      if (this.child === child) this.child = null;
    });

    return child;
  }

  private handleLine(line: string) {
    let msg: {
      id?: number;
      draft?: string;
      references?: DraftReference[];
      files?: IngestFileResult[];
      chunks?: number;
      error?: string;
    };
    try {
      msg = JSON.parse(line);
    } catch {
      return; // ignore malformed lines
    }
    if (typeof msg.id !== "number") return; // startup/error line without a request id

    const pending = this.pending.get(msg.id);
    if (!pending) return; // already timed out or resolved
    this.pending.delete(msg.id);
    clearTimeout(pending.timer);

    if (typeof msg.error === "string") {
      pending.reject(new Error(msg.error.slice(0, 300)));
    } else if (typeof msg.draft === "string") {
      pending.resolve({
        draft: msg.draft,
        references: Array.isArray(msg.references) ? msg.references : [],
      });
    } else if (Array.isArray(msg.files)) {
      pending.resolve({ files: msg.files, chunks: Number(msg.chunks) || 0 });
    } else {
      pending.reject(new Error("The drafting engine returned an unexpected response."));
    }
  }

  /** Reject every pending request that was written to the given worker. */
  private failAllForChild(child: ChildProcessWithoutNullStreams, error: Error) {
    for (const [id, pending] of this.pending) {
      if (pending.child !== child) continue;
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }

  /**
   * Replace a worker: reject anything still waiting on it and kill it. Used
   * when a request times out and the worker is presumed wedged.
   */
  private restartWorker(child: ChildProcessWithoutNullStreams) {
    this.failAllForChild(
      child,
      new Error(
        "The drafting engine was restarted because a previous request timed out. Please try again.",
      ),
    );
    if (this.child === child) {
      this.child = null;
      this.lines?.close();
      this.lines = null;
    }
    child.kill();
  }

  /** Kill the worker. Safe to call more than once or when nothing is running. */
  shutdown() {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("The drafting engine is shutting down."));
    }
    this.pending.clear();
    this.lines?.close();
    this.child?.kill();
    this.child = null;
    this.lines = null;
  }
}

export const draftWorker = new DraftWorker();
