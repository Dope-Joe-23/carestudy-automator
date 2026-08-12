import { Router, type IRouter } from "express";
import draftRouter from "./draft";
import exportRouter from "./export";
import healthRouter from "./health";
import libraryRouter from "./library";
import studiesRouter from "./studies";
import uploadsRouter from "./uploads";
import verifyRouter from "./verify";

const router: IRouter = Router();

router.use(healthRouter);
router.use(draftRouter);
router.use(exportRouter);
router.use(studiesRouter);
router.use(uploadsRouter);
router.use(libraryRouter);
router.use(verifyRouter);

export default router;
