import { Router, type IRouter } from "express";
import { requireAdmin } from "../lib/adminAuth";
import adminRouter from "./admin";
import adminDashboardRouter from "./adminDashboard";
import chapter2Router from "./chapter2";
import draftRouter from "./draft";
import exportRouter from "./export";
import healthRouter from "./health";
import libraryRouter from "./library";
import ordersRouter, { studioRouter } from "./orders";
import studentsRouter from "./students";
import studiesRouter from "./studies";
import importStudyRouter from "./importStudy";
import studyAssistantRouter from "./studyAssistant";
import uploadsRouter from "./uploads";
import verifyRouter from "./verify";
import nurseFlowRouter from "./nurseflow";
import nurseFlowAdminRouter from "./nurseflowAdmin";
import nurseFlowAccessRouter, { nurseFlowEntitlementRouter } from "./nurseflowAccess";

const router: IRouter = Router();

// Public + student-facing surface first (health, admin login, student portal,
// and the student's own orders + viva prep — all outside the studio gate).
router.use(healthRouter);
router.use(adminRouter);
router.use(adminDashboardRouter);
router.use(studentsRouter);
router.use(ordersRouter);
// Public preview surface. Generation itself is constrained to reviewed cards;
// production entitlement enforcement belongs in the payment/session layer.
router.use(nurseFlowRouter);
router.use(nurseFlowAccessRouter);
// Document import is available to both students (correction flow) and the
// studio, so it sits before the admin gate.
router.use(importStudyRouter);

// The studio — drafting, exports, saved studies, uploads, the personal
// reference library, reference verification, and the order bin. Every route
// from here on requires a studio admin session; visitors and students are
// rejected with 401.
router.use(requireAdmin);
router.use(nurseFlowAdminRouter);
router.use(nurseFlowEntitlementRouter);
router.use(draftRouter);
router.use(chapter2Router);
router.use(exportRouter);
router.use(studiesRouter);
router.use(studyAssistantRouter);
router.use(uploadsRouter);
router.use(libraryRouter);
router.use(verifyRouter);
router.use(studioRouter);

export default router;
