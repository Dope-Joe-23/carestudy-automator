import { Router, type IRouter } from "express";
import { execFile } from "node:child_process";
import path from "node:path";

const router: IRouter = Router();

// Same layout as the draft engine: dist -> api-server -> artifacts -> root -> carestudy_rag
const EXPORT_SCRIPT = path.resolve(__dirname, "../../../carestudy_rag/src/export_docx.py");
const PYTHON_BIN = process.env.PYTHON_BIN || "python";

/**
 * Generate a .docx from the full study payload.
 *
 * The study JSON is streamed over stdin (no temp files, no shell escaping);
 * the Python engine writes the binary .docx to stdout, which we relay back
 * with a Word attachment content-type.
 */
function buildDocx(payload: unknown): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      PYTHON_BIN,
      [EXPORT_SCRIPT],
      {
        timeout: 60_000,
        maxBuffer: 64 * 1024 * 1024,
        encoding: "buffer",
      },
      (error, stdout) => {
        if (error) {
          const detail = error.message.split("\n")[0];
          reject(new Error(detail));
          return;
        }
        resolve(stdout);
      },
    );
    child.stdin?.end(JSON.stringify(payload));
  });
}

router.post("/export/docx", async (req, res) => {
  const payload = req.body;

  if (!payload || typeof payload !== "object" || !Array.isArray(payload.chapters)) {
    res.status(422).json({ error: "A study payload with a chapters array is required" });
    return;
  }

  try {
    const buffer = await buildDocx(payload);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader("Content-Disposition", 'attachment; filename="care-study.docx"');
    res.send(buffer);
  } catch (err) {
    req.log?.error?.({ err }, "docx export failed");
    res.status(500).json({
      error: "Export failed — is the Python engine installed (python-docx)?",
    });
  }
});

export default router;
