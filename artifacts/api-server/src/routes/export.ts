import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import path from "node:path";
import { getStudyStore } from "@workspace/db";
import type { AuthedAdminRequest } from "../lib/adminAuth";

const router: IRouter = Router();

// Same layout as the draft engine: dist -> api-server -> artifacts -> root -> carestudy_rag
const EXPORT_SCRIPT = path.resolve(__dirname, "../../../carestudy_rag/src/export_docx.py");
const PYTHON_BIN = process.env.PYTHON_BIN || "python";
const STAFF_PREVIEW_EXPORT_PRICE_GHS = 150;
const PAYSTACK_BASE = "https://api.paystack.co";

function getPaystackSecret(): string {
  return process.env.PAYSTACK_SECRET_KEY ?? "";
}

/**
 * Generate a .docx from the full study payload.
 *
 * The study JSON is streamed over stdin (no temp files, no shell escaping);
 * the Python engine writes the binary .docx to stdout, which we relay back
 * with a Word attachment content-type.
 */
export function buildDocx(payload: unknown): Promise<Buffer> {
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

  const admin = (req as AuthedAdminRequest).admin;
  if (!admin) {
    res.status(401).json({ error: "Studio sign-in is required to export a document." });
    return;
  }
  if (admin.role !== "admin" && admin.role !== "staff") {
    res.status(403).json({ error: "This account cannot export Studio documents." });
    return;
  }

  let credit: "free" | "paid" | null = null;
  let buffer: Buffer;
  try {
    if (admin.role === "staff") {
      credit = await getStudyStore().reserveStaffPreviewExport(admin.id);
      if (!credit) {
        res.status(402).json({
          error: `Pay GH₵${STAFF_PREVIEW_EXPORT_PRICE_GHS} to export this document.`,
          paymentRequired: true,
          amountGhs: STAFF_PREVIEW_EXPORT_PRICE_GHS,
        });
        return;
      }
    }
    buffer = await buildDocx(payload);
  } catch (err) {
    if (credit) {
      try {
        await getStudyStore().refundStaffPreviewExport(admin.id, credit);
      } catch (refundError) {
        req.log?.error?.({ refundError, adminId: admin.id }, "failed to restore a Studio export entitlement");
      }
    }
    req.log?.error?.({ err }, "docx export failed");
    res.status(500).json({
      error: "Export failed — is the Python engine installed (python-docx)?",
    });
    return;
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  res.setHeader("Content-Disposition", 'attachment; filename="care-study.docx"');
  res.send(buffer);
});

router.post("/export/docx/payment/initialize", async (req, res) => {
  const admin = (req as AuthedAdminRequest).admin;
  if (!admin || admin.role !== "staff") {
    res.status(admin ? 403 : 401).json({
      error: "Only Studio staff can purchase preview export credits.",
    });
    return;
  }
  const secret = getPaystackSecret();
  if (!secret) {
    res.status(503).json({ error: "Payments are not configured yet — set PAYSTACK_SECRET_KEY." });
    return;
  }

  const amountPesewas = STAFF_PREVIEW_EXPORT_PRICE_GHS * 100;
  const reference = `CSE-${admin.id}-${randomBytes(8).toString("hex")}`;
  const email = admin.email?.trim() || `${admin.username}@carestudy.local`;
  try {
    await getStudyStore().createStaffPreviewExportPayment(admin.id, reference, amountPesewas);
    const response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amountPesewas,
        reference,
        currency: "GHS",
        metadata: { previewExport: true, adminId: admin.id },
      }),
    });
    const data = (await response.json()) as {
      status?: boolean;
      data?: { authorization_url?: string };
      message?: string;
    };
    if (!response.ok || !data.status) {
      req.log?.warn?.({ paystack: data, adminId: admin.id }, "preview export payment initialization failed");
      res.status(502).json({ error: data.message || "Unable to start checkout." });
      return;
    }
    res.json({
      reference,
      amount: amountPesewas,
      email,
      authorization_url: data.data?.authorization_url ?? "",
    });
  } catch (err) {
    req.log?.error?.({ err, adminId: admin.id }, "preview export payment initialization failed");
    res.status(502).json({ error: "Unable to start checkout." });
  }
});

router.post("/export/docx/payment/verify", async (req, res) => {
  const admin = (req as AuthedAdminRequest).admin;
  if (!admin || admin.role !== "staff") {
    res.status(admin ? 403 : 401).json({
      error: "Only Studio staff can verify preview export payments.",
    });
    return;
  }
  const reference = typeof req.body?.reference === "string" ? req.body.reference.trim() : "";
  if (!new RegExp(`^CSE-${admin.id}-[a-f0-9]{16}$`).test(reference)) {
    res.status(400).json({ error: "A valid preview export payment reference is required." });
    return;
  }
  const secret = getPaystackSecret();
  if (!secret) {
    res.status(503).json({ error: "Payments are not configured yet — set PAYSTACK_SECRET_KEY." });
    return;
  }

  const amountPesewas = STAFF_PREVIEW_EXPORT_PRICE_GHS * 100;
  try {
    const response = await fetch(
      `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const data = (await response.json()) as {
      status?: boolean;
      data?: { status?: string; amount?: number; currency?: string; reference?: string };
    };
    if (!response.ok) {
      res.status(502).json({ verified: false, message: "Paystack verification is unavailable." });
      return;
    }
    if (
      !data.status ||
      data.data?.status !== "success" ||
      data.data.reference !== reference ||
      data.data.amount !== amountPesewas ||
      data.data.currency !== "GHS"
    ) {
      res.status(402).json({
        verified: false,
        message: `The GH₵${STAFF_PREVIEW_EXPORT_PRICE_GHS} Paystack payment has not been confirmed.`,
      });
      return;
    }
    const verified = await getStudyStore().verifyStaffPreviewExportPayment(
      admin.id,
      reference,
      amountPesewas,
    );
    if (!verified) {
      res.status(402).json({
        verified: false,
        message: "This payment reference is invalid or does not belong to your account.",
      });
      return;
    }
    res.json({ verified: true, amountGhs: STAFF_PREVIEW_EXPORT_PRICE_GHS });
  } catch (err) {
    req.log?.error?.({ err, adminId: admin.id }, "preview export payment verification failed");
    res.status(502).json({ verified: false, message: "Payment verification failed." });
  }
});

export default router;
