import { Router, type IRouter } from "express";
import draftRouter from "./draft";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(draftRouter);

export default router;
