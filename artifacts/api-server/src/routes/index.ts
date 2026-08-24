import { Router, type IRouter } from "express";
import { requireAdmin } from "../lib/adminAuth";
import adminRouter from "./admin";
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

const router: IRouter = Router();

// Public + student-facing surface first (health, admin login, student portal,
// and the student's own orders + viva prep — all outside the studio gate).
router.use(healthRouter);
router.use(adminRouter);
router.use(studentsRouter);
router.use(ordersRouter);

// The studio — drafting, exports, saved studies, uploads, the personal
// reference library, reference verification, and the order bin. Every route
// from here on requires a studio admin session; visitors and students are
// rejected with 401.
router.use(requireAdmin);
router.use(draftRouter);
router.use(exportRouter);
router.use(studiesRouter);
router.use(studyAssistantRouter);
router.use(importStudyRouter);
router.use(uploadsRouter);
router.use(libraryRouter);
router.use(verifyRouter);
router.use(studioRouter);

export default router;
