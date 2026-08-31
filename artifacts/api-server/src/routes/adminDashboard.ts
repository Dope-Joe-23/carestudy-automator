/**
 * Admin dashboard routes — stats, staff management, and invite links.
 *
 * These routes require admin auth with role=\"admin\" for staff management,
 * but the dashboard stats are available to any authenticated admin/staff.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { getStudyStore } from "@workspace/db";
import {
  requireAdmin,
  type AuthedAdminRequest,
} from "../lib/adminAuth";
import { hashPassword, createAuthToken } from "../lib/studentAuth";

const router: IRouter = Router();

let store: ReturnType<typeof getStudyStore> | null = null;
let storageUnavailable: string | null = null;

function studyStore() {
  if (storageUnavailable) throw new Error(storageUnavailable);
  if (store) return store;
  try {
    store = getStudyStore();
    return store;
  } catch (err) {
    storageUnavailable = `Study storage failed to initialize: ${
      err instanceof Error ? err.message : "unknown error"
    }`;
    throw new Error(storageUnavailable);
  }
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    handler(req, res).catch((err) => {
      req.log?.error?.({ err }, "admin dashboard request failed");
      res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
    });
  };
}

/** Middleware: require admin role (not just staff). */
function requireAdminRole(req: Request, res: Response, next: Function) {
  const admin = (req as AuthedAdminRequest).admin;
  if (admin.role !== "admin") {
    res.status(403).json({ error: "This action requires admin privileges." });
    return;
  }
  next();
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------

// GET /api/admin/dashboard — aggregate stats for the admin dashboard.
// Admin-only: staff cannot access this endpoint.
router.get(
  "/admin/dashboard",
  requireAdmin,
  requireAdminRole,
  asyncRoute(async (_req, res) => {
    const db = studyStore();

    const [orders, students, admins, invites] = await Promise.all([
      db.listAllOrders(),
      Promise.all([]), // students don't have a listAll method, count from orders
      db.listAdmins(),
      db.listStaffInvites(),
    ]);

    // Compute stats
    const totalOrders = orders.length;
    const submittedOrders = orders.filter((o) => o.status === "submitted").length;
    const inProductionOrders = orders.filter((o) => o.status === "in_production").length;
    const readyOrders = orders.filter((o) => o.status === "ready").length;
    const cancelledOrders = orders.filter((o) => o.status === "cancelled").length;

    // Payment stats
    const paidOrders = orders.filter((o) => o.paymentStatus === "verified");
    const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.paidAmount ?? 0), 0);
    const fullStudyPayments = paidOrders.filter((o) => o.paidScope === "full").length;
    const chapterPayments = paidOrders.filter((o) => o.paidScope === "chapter").length;

    // Unique students who placed orders
    const uniqueStudentIds = new Set(orders.map((o) => o.studentId));

    // Staff stats
    const staffCount = admins.length;
    const adminCount = admins.filter((a) => a.role === "admin").length;
    const staffOnlyCount = admins.filter((a) => a.role !== "admin").length;
    const pendingInvites = invites.filter((i) => !i.usedAt).length;
    const usedInvites = invites.filter((i) => i.usedAt).length;

    // Recent orders (last 5)
    const recentOrders = orders.slice(0, 5).map((o) => ({
      id: o.id,
      title: o.title,
      status: o.status,
      paymentStatus: o.paymentStatus,
      createdAt: o.createdAt.toISOString(),
    }));

    res.json({
      orders: {
        total: totalOrders,
        submitted: submittedOrders,
        inProduction: inProductionOrders,
        ready: readyOrders,
        cancelled: cancelledOrders,
      },
      revenue: {
        total: totalRevenue,
        fullStudyPayments,
        chapterPayments,
        paidOrderCount: paidOrders.length,
      },
      students: {
        total: uniqueStudentIds.size,
      },
      staff: {
        total: staffCount,
        admins: adminCount,
        staffOnly: staffOnlyCount,
        pendingInvites,
        usedInvites,
      },
      recentOrders,
    });
  }),
);

// ---------------------------------------------------------------------------
// Staff management (admin-only)
// ---------------------------------------------------------------------------

// GET /api/admin/staff — list all staff members.
router.get(
  "/admin/staff",
  requireAdmin,
  requireAdminRole,
  asyncRoute(async (_req, res) => {
    const db = studyStore();
    const admins = await db.listAdmins();
    const safeAdmins = admins.map((a) => ({
      id: a.id,
      username: a.username,
      name: a.name,
      role: a.role,
      email: a.email,
      invitedBy: a.invitedBy,
      createdAt: a.createdAt.toISOString(),
    }));
    res.json({ staff: safeAdmins });
  }),
);

// PATCH /api/admin/staff/:id — update a staff member's role or details.
router.patch(
  "/admin/staff/:id",
  requireAdmin,
  requireAdminRole,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!id || id <= 0) {
      res.status(400).json({ error: "Invalid staff id" });
      return;
    }
    const db = studyStore();
    const fields: { role?: string; name?: string; email?: string } = {};
    if (typeof req.body?.role === "string" && ["admin", "staff"].includes(req.body.role)) {
      fields.role = req.body.role;
    }
    if (typeof req.body?.name === "string") fields.name = req.body.name.trim() || null;
    if (typeof req.body?.email === "string") fields.email = req.body.email.trim() || null;

    if (Object.keys(fields).length === 0) {
      res.status(400).json({ error: "No valid fields to update." });
      return;
    }

    const updated = await db.updateAdmin(id, fields);
    if (!updated) {
      res.status(404).json({ error: "Staff member not found." });
      return;
    }
    res.json({
      staff: {
        id: updated.id,
        username: updated.username,
        name: updated.name,
        role: updated.role,
        email: updated.email,
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// Student management (admin-only)
// ---------------------------------------------------------------------------

// GET /api/admin/students — list all students with order counts.
router.get(
  "/admin/students",
  requireAdmin,
  requireAdminRole,
  asyncRoute(async (_req, res) => {
    const db = studyStore();
    const [students, orders] = await Promise.all([
      db.listAllStudents(),
      db.listAllOrders(),
    ]);

    // Count orders per student
    const orderCountByStudent = new Map<number, number>();
    const ordersByStudent = new Map<number, typeof orders>();
    for (const order of orders) {
      orderCountByStudent.set(order.studentId, (orderCountByStudent.get(order.studentId) ?? 0) + 1);
      const list = ordersByStudent.get(order.studentId) ?? [];
      list.push(order);
      ordersByStudent.set(order.studentId, list);
    }

    const safeStudents = students.map((s) => {
      const studentOrders = ordersByStudent.get(s.id) ?? [];
      const readyOrders = studentOrders.filter((o) => o.status === "ready").length;
      const paidOrders = studentOrders.filter((o) => o.paymentStatus === "verified").length;
      return {
        id: s.id,
        name: s.name,
        username: s.username,
        email: s.email,
        college: s.college,
        program: s.program,
        year: s.year,
        orderCount: orderCountByStudent.get(s.id) ?? 0,
        readyOrders,
        paidOrders,
        createdAt: s.createdAt.toISOString(),
      };
    });

    res.json({ students: safeStudents });
  }),
);

// ---------------------------------------------------------------------------
// Invite links (admin-only)
// ---------------------------------------------------------------------------

// POST /api/admin/invites — generate a new staff invite link.
router.post(
  "/admin/invites",
  requireAdmin,
  requireAdminRole,
  asyncRoute(async (req, res) => {
    const admin = (req as AuthedAdminRequest).admin;
    const label = str(req.body?.label) || null;
    const token = randomBytes(24).toString("hex");
    const db = studyStore();
    const invite = await db.createStaffInvite({
      token,
      createdBy: admin.id,
      label,
    });
    res.status(201).json({
      invite: {
        id: invite.id,
        token: invite.token,
        label: invite.label,
        createdAt: invite.createdAt.toISOString(),
        registrationUrl: `/staff/register?invite=${invite.token}`,
      },
    });
  }),
);

// GET /api/admin/invites — list all invite links.
router.get(
  "/admin/invites",
  requireAdmin,
  requireAdminRole,
  asyncRoute(async (_req, res) => {
    const db = studyStore();
    const invites = await db.listStaffInvites();
    const admins = await db.listAdmins();
    const adminMap = new Map(admins.map((a) => [a.id, a]));

    res.json({
      invites: invites.map((i) => ({
        id: i.id,
        token: i.token,
        label: i.label,
        createdBy: adminMap.get(i.createdBy)?.name ?? adminMap.get(i.createdBy)?.username ?? "Unknown",
        usedAt: i.usedAt ? i.usedAt.toISOString() : null,
        usedBy: i.usedBy ? adminMap.get(i.usedBy)?.name ?? adminMap.get(i.usedBy)?.username ?? "Unknown" : null,
        createdAt: i.createdAt.toISOString(),
        registrationUrl: `/staff/register?invite=${i.token}`,
      })),
    });
  }),
);

// ---------------------------------------------------------------------------
// Staff registration via invite link (public — no auth required)
// ---------------------------------------------------------------------------

// GET /api/admin/invites/:token — validate an invite token (public).
router.get(
  "/admin/invites/:token",
  asyncRoute(async (req, res) => {
    const token = str(req.params.token);
    if (!token) {
      res.status(400).json({ error: "Invalid invite token." });
      return;
    }
    const db = studyStore();
    const invite = await db.getStaffInviteByToken(token);
    if (!invite) {
      res.status(404).json({ error: "This invite link is invalid or has expired." });
      return;
    }
    if (invite.usedAt) {
      res.status(409).json({ error: "This invite link has already been used." });
      return;
    }
    res.json({
      valid: true,
      label: invite.label,
      registrationUrl: `/staff/register?invite=${token}`,
    });
  }),
);

// POST /api/admin/staff/register — register a new staff member via invite link.
router.post(
  "/admin/staff/register",
  asyncRoute(async (req, res) => {
    const inviteToken = str(req.body?.inviteToken);
    const username = str(req.body?.username);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const name = str(req.body?.name) || null;
    const email = str(req.body?.email) || null;

    if (!inviteToken) {
      res.status(400).json({ error: "Invite token is required." });
      return;
    }
    if (!username || username.length < 3) {
      res.status(400).json({ error: "Username must be at least 3 characters." });
      return;
    }
    if (!password || password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }

    const db = studyStore();

    // Validate invite
    const invite = await db.getStaffInviteByToken(inviteToken);
    if (!invite) {
      res.status(404).json({ error: "This invite link is invalid or has expired." });
      return;
    }
    if (invite.usedAt) {
      res.status(409).json({ error: "This invite link has already been used." });
      return;
    }

    // Check username uniqueness
    const existing = await db.getAdminByUsername(username);
    if (existing) {
      res.status(409).json({ error: "This username is already taken." });
      return;
    }

    // Create the staff account
    const admin = await db.addAdmin({
      username,
      passwordHash: hashPassword(password),
      name,
      role: "staff",
      email,
      invitedBy: invite.createdBy,
    });

    // Mark invite as used
    await db.useStaffInvite(invite.id, admin.id);

    // Auto-login: create a session token
    const token = createAuthToken();
    await db.createAdminSession(admin.id, token);

    res.status(201).json({
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        name: admin.name,
        role: admin.role,
      },
    });
  }),
);

export default router;
