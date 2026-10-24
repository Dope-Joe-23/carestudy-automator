import { Router, type IRouter } from "express";
import { requireAdmin, type AuthedAdminRequest } from "../lib/adminAuth";
import { readNurseLearn, saveNurseLearn, YOUTUBE_ID, type EducationVideo, type HealthCondition } from "../lib/nurselearn";

const router: IRouter = Router();
const requireNurseLearnAdmin = (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  if ((req as AuthedAdminRequest).admin?.role !== "admin") { res.status(403).json({ error: "An administrator account is required to manage NurseLearn content." }); return; }
  next();
};
const lower = (value: unknown) => typeof value === "string" ? value.toLocaleLowerCase().trim() : "";
const searchTerms = (value: string) => value.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2 && !["the", "and", "for", "with", "about", "show", "teach", "explain", "learn", "video", "videos", "simple", "please", "me", "to", "from"].includes(word));
router.get("/nurselearn", async (req, res) => {
  try {
    const { conditions, videos } = await readNurseLearn();
    const query = lower(req.query.q); const terms = searchTerms(query); const language = lower(req.query.language); const audience = lower(req.query.audience); const category = lower(req.query.category);
    const publishedConditions = conditions.filter((item) => item.reviewStatus === "approved");
    const visibleVideos = videos.filter((item) => item.reviewStatus === "approved" && YOUTUBE_ID.test(item.youtubeId));
    const matchingConditions = publishedConditions.filter((item) => (!category || item.category.toLowerCase() === category) && (!terms.length || terms.some((term) => [item.name, item.slug, item.category, item.summary, ...item.aliases].join(" ").toLowerCase().includes(term))));
    const conditionIds = new Set(matchingConditions.map((item) => item.id));
    const matchingVideos = visibleVideos.filter((item) => (!language || item.language === language) && (!audience || item.audience.includes(audience as never)) && (!terms.length || terms.some((term) => [item.title, item.description, ...item.conditionIds].join(" ").toLowerCase().includes(term)) || item.conditionIds.some((id) => conditionIds.has(id))));
    res.json({ conditions: matchingConditions, videos: matchingVideos, availableLanguages: [...new Set(visibleVideos.map((item) => item.language))] });
  } catch (error) { req.log?.error({ error }, "NurseLearn catalogue read failed"); res.status(503).json({ error: "The NurseLearn library is temporarily unavailable." }); }
});

// Management uses the existing studio session. Incoming records always land as
// drafts; only the review endpoint can publish them.
router.get("/admin/nurselearn", requireAdmin, requireNurseLearnAdmin, async (_req, res) => {
  try { res.json(await readNurseLearn()); } catch { res.status(503).json({ error: "Catalogue storage is unavailable." }); }
});
router.put("/admin/nurselearn", requireAdmin, requireNurseLearnAdmin, async (req, res) => {
  const incoming = req.body as { conditions?: HealthCondition[]; videos?: EducationVideo[] };
  if (!Array.isArray(incoming?.conditions) || !Array.isArray(incoming?.videos)) { res.status(400).json({ error: "Provide conditions and videos arrays." }); return; }
  const invalidVideo = incoming.videos.find((video) => !video.id || !video.slug || !video.title || !YOUTUBE_ID.test(video.youtubeId) || !["en", "tw"].includes(video.language));
  if (invalidVideo) { res.status(422).json({ error: "Each video needs an ID, slug, title, valid 11-character YouTube ID, and supported language (en or tw)." }); return; }
  const current = await readNurseLearn();
  const videos = incoming.videos.map((video) => ({ ...video, reviewStatus: current.videos.find((old) => old.id === video.id)?.reviewStatus ?? "draft" as const }));
  const conditions = incoming.conditions.map((condition) => ({ ...condition, reviewStatus: current.conditions.find((old) => old.id === condition.id)?.reviewStatus ?? "draft" as const }));
  await saveNurseLearn({ schemaVersion: 1, updatedAt: new Date().toISOString(), conditions, videos });
  res.json({ saved: true, conditionCount: conditions.length, videoCount: videos.length });
});
router.patch("/admin/nurselearn/:type/:id/review", requireAdmin, requireNurseLearnAdmin, async (req, res) => {
  const status = req.body?.reviewStatus;
  if (!["draft", "in_review", "approved", "retired"].includes(status)) { res.status(400).json({ error: "Invalid review status." }); return; }
  const content = await readNurseLearn(); const isVideo = req.params.type === "videos"; const items = isVideo ? content.videos : req.params.type === "conditions" ? content.conditions : null;
  if (!items) { res.status(400).json({ error: "Type must be conditions or videos." }); return; }
  const item = items.find((entry) => entry.id === req.params.id); if (!item) { res.status(404).json({ error: "Content not found." }); return; }
  if (status === "approved" && isVideo && !YOUTUBE_ID.test((item as EducationVideo).youtubeId)) { res.status(422).json({ error: "A valid YouTube ID is required before publication." }); return; }
  Object.assign(item, { reviewStatus: status, ...(status === "approved" ? { reviewedBy: req.body?.reviewedBy || "Studio reviewer", lastReviewedAt: new Date().toISOString() } : {}) });
  await saveNurseLearn(content); res.json({ item });
});
export default router;
