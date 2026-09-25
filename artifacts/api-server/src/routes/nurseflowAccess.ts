import { createHmac } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { confirmPayment, createPendingPayment, createVisitorId, getAccess, getPayment, grantPaidAccess, recordAttempt } from "../lib/nurseflowAccess";

const nurseFlowAccessRouter: IRouter = Router();
const COOKIE = "nurseflow_visitor";
const PAYSTACK_BASE = "https://api.paystack.co";
const pricePesewas = () => Math.round(Number(process.env.NURSEFLOW_MONTHLY_PRICE_GHS || 35) * 100);
function cookieValue(req: Request) { const raw = req.headers.cookie ?? ""; return raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? ""; }
function visitor(req: Request, res: Response) { const existing = cookieValue(req); if (/^[A-Za-z0-9_-]{20,80}$/.test(existing)) return existing; const id = createVisitorId(); res.append("Set-Cookie", `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${process.env.NODE_ENV === "production" ? "; Secure" : ""}`); return id; }

nurseFlowAccessRouter.get("/nurseflow/access", async (req, res) => {
  try { res.json({ access: await getAccess(visitor(req, res)) }); }
  catch (error) { req.log?.error({ error }, "NurseFlow access read failed"); res.status(503).json({ error: "Practice access is temporarily unavailable." }); }
});
nurseFlowAccessRouter.post("/nurseflow/attempts", async (req, res) => {
  const questionId = typeof req.body?.questionId === "string" ? req.body.questionId.trim() : "";
  if (!/^[A-Za-z0-9_-]{3,160}$/.test(questionId)) { res.status(400).json({ error: "Invalid question." }); return; }
  try { const result = await recordAttempt(visitor(req, res), req.body?.correct === true); if (!result.accepted) { res.status(402).json({ error: "Your free practice set is complete.", access: result.access }); return; } res.status(201).json(result); }
  catch (error) { req.log?.error({ error }, "NurseFlow attempt record failed"); res.status(503).json({ error: "Your answer could not be saved. Please try again." }); }
});

async function verifyPaystack(reference: string) {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) throw new Error("Payments are not configured.");
  const pending = await getPayment(reference);
  if (!pending) throw new Error("Unknown payment reference.");
  const response = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret}` } });
  const data = await response.json() as { status?: boolean; data?: { status?: string; amount?: number; reference?: string } };
  if (!data.status || data.data?.status !== "success" || data.data.reference !== reference || data.data.amount !== pending.amount) throw new Error("Payment has not been confirmed.");
  return confirmPayment(reference);
}

nurseFlowAccessRouter.post("/nurseflow/payments/initialize", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: "Enter a valid email for your receipt." }); return; }
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) { res.status(503).json({ error: "Payments are not configured yet." }); return; }
  try {
    const payment = await createPendingPayment(visitor(req, res), email, pricePesewas(), 30);
    const response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ email, amount: payment.amount, reference: payment.reference, currency: "GHS", metadata: { product: "nurseflow_plus", visitorId: payment.visitorId, days: payment.days } }) });
    const data = await response.json() as { status?: boolean; data?: { authorization_url?: string } ; message?: string };
    if (!data.status) { res.status(502).json({ error: data.message || "Unable to start checkout." }); return; }
    res.status(201).json({ reference: payment.reference, amount: payment.amount, email, authorizationUrl: data.data?.authorization_url ?? "" });
  } catch (error) { req.log?.error({ error }, "NurseFlow payment initialization failed"); res.status(502).json({ error: "Unable to start checkout." }); }
});
nurseFlowAccessRouter.post("/nurseflow/payments/verify", async (req, res) => {
  const reference = typeof req.body?.reference === "string" ? req.body.reference.trim() : "";
  if (!/^NF-[a-f0-9]{24}$/.test(reference)) { res.status(400).json({ error: "Invalid payment reference." }); return; }
  try { const access = await verifyPaystack(reference); if (!access) { res.status(404).json({ error: "Payment was not found." }); return; } res.json({ verified: true, access }); }
  catch (error) { res.status(402).json({ verified: false, error: error instanceof Error ? error.message : "Payment verification failed." }); }
});
nurseFlowAccessRouter.post("/nurseflow/payments/webhook", async (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  const signature = req.header("x-paystack-signature") ?? "";
  const raw = Buffer.isBuffer(req.body) ? req.body : null;
  if (!secret || !raw || createHmac("sha512", secret).update(raw).digest("hex") !== signature) { res.status(401).end(); return; }
  let event: { event?: string; data?: { reference?: string } };
  try { event = JSON.parse(raw.toString("utf8")) as typeof event; } catch { res.status(400).end(); return; }
  if (event.event === "charge.success" && typeof event.data?.reference === "string" && /^NF-[a-f0-9]{24}$/.test(event.data.reference)) {
    try { await verifyPaystack(event.data.reference); } catch (error) { req.log?.error({ error }, "NurseFlow webhook verification failed"); res.status(400).end(); return; }
  }
  res.status(200).end();
});

// Temporary staff-controlled entitlement hook. Replace calls to this route
// with a verified Paystack webhook once checkout is connected.
export const nurseFlowEntitlementRouter: IRouter = Router();
nurseFlowEntitlementRouter.post("/nurseflow/entitlements/grant", async (req, res) => {
  const visitorId = typeof req.body?.visitorId === "string" ? req.body.visitorId.trim() : "";
  const days = Number(req.body?.days ?? 30);
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(visitorId) || !Number.isInteger(days) || days < 1 || days > 366) { res.status(400).json({ error: "Provide a valid visitorId and access period." }); return; }
  try { res.status(201).json({ access: await grantPaidAccess(visitorId, days) }); }
  catch (error) { req.log?.error({ error }, "NurseFlow entitlement grant failed"); res.status(503).json({ error: "Practice access is temporarily unavailable." }); }
});

export default nurseFlowAccessRouter;
