import { Router, type IRouter, type Request, type Response } from "express";
import type { AuthedAdminRequest } from "../lib/adminAuth";
import { resetStudioAiUsage } from "../lib/studioAiQuota";

const router: IRouter = Router();

router.post("/studio/ai-usage/reset", async (req: Request, res: Response): Promise<void> => {
  const admin = (req as AuthedAdminRequest).admin;
  if (!admin || admin.role !== "admin") {
    res.status(403).json({ error: "Only the Studio owner can reset AI attempt limits." });
    return;
  }

  const rawStudyId = req.body?.studyId;
  const studyId = Number.isSafeInteger(rawStudyId) && rawStudyId > 0
    ? rawStudyId as number
    : null;
  const studioProjectKey = req.body?.studioProjectKey;
  if (
    studyId === null &&
    (typeof studioProjectKey !== "string" || !/^[a-zA-Z0-9._:-]{8,128}$/.test(studioProjectKey))
  ) {
    res.status(422).json({ error: "A saved study id or valid draft project key is required." });
    return;
  }

  const rawTargets = req.body?.targetIds;
  if (
    !Array.isArray(rawTargets) ||
    rawTargets.length === 0 ||
    rawTargets.length > 10 ||
    !rawTargets.every((target: unknown) =>
      typeof target === "string" && target.trim().length > 0 && target.length <= 120)
  ) {
    res.status(422).json({ error: "Provide between 1 and 10 valid AI target ids." });
    return;
  }

  try {
    const resetCount = await resetStudioAiUsage(req, studyId, rawTargets as string[]);
    res.json({ resetCount });
  } catch (err) {
    req.log?.error?.({ err, adminId: admin.id }, "Studio AI usage reset failed");
    res.status(503).json({ error: "AI usage limits could not be reset right now." });
  }
});

export default router;
