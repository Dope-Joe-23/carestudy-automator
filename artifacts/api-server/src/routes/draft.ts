import { Router, type IRouter } from "express";
import { execFile } from "node:child_process";
import path from "node:path";

const router: IRouter = Router();

// Resolve the Python RAG engine relative to this bundle (dist/):
//   dist -> api-server -> artifacts -> project root -> carestudy_rag
const RAG_SCRIPT = path.resolve(__dirname, "../../../carestudy_rag/src/generate.py");
const PYTHON_BIN = process.env.PYTHON_BIN || "python";

/**
 * Run the RAG drafting engine for one section.
 *
 * Patient notes are streamed over stdin (no temp files, no shell escaping).
 * The Python child process inherits this server's env, so ANTHROPIC_API_KEY
 * set on the api-server process enables real Claude drafts; without it the
 * engine returns its transparent dry-run report instead.
 */
function runDraft(heading: string, notes: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      PYTHON_BIN,
      [RAG_SCRIPT, "--heading", heading, "--stdin"],
      { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          const detail = error.message.split("\n")[0];
          reject(new Error(detail));
          return;
        }
        resolve(stdout);
      },
    );
    child.stdin?.end(notes);
  });
}

router.post("/sections/draft", async (req, res) => {
  const heading =
    typeof req.body?.heading === "string" ? req.body.heading.trim() : "";
  const notes =
    typeof req.body?.notes === "string" ? req.body.notes.trim() : "";

  if (!heading || !notes) {
    res
      .status(422)
      .json({ error: "heading and notes are required and must be non-empty" });
    return;
  }

  try {
    const draft = await runDraft(heading, notes);
    res.json({ draft });
  } catch (err) {
    req.log?.error?.({ err }, "draft generation failed");
    res.status(500).json({
      error: "Drafting failed — is the Python RAG engine installed and reachable?",
    });
  }
});

export default router;
