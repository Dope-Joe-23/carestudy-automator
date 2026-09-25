import { Router, type IRouter, type Request, type Response } from "express";
import { readNurseFlowContent } from "../lib/nurseflowContent";
import {
  completedClipsByCard,
  createVideoJob,
  ensureVideoFile,
  imageIsWatermarked,
  isValidJobId,
  isVideoConfigured,
  latestVideoJobForCard,
  publicVideoJob,
  refreshVideoJob,
  visualSetupHint,
} from "../lib/nurseflowVideo";

const notConfigured = { error: "Visual generation is not configured." };

/** One consistent 503 body with provider-specific setup guidance. */
function sendNotConfigured(res: Response): void {
  res.status(503).json({ ...notConfigured, setup: visualSetupHint() });
}

/**
 * NurseFlow's video-generation boundary. It deliberately accepts only a
 * reviewed card title and visual brief: it is not a free-form clinical advice
 * endpoint and no patient-identifiable data belongs in the prompt.
 *
 * The browser never receives GEMINI_API_KEY, and never receives the provider's
 * download URL either — completed clips are served from this server's cache.
 * A production rollout should put these routes behind the NurseFlow
 * entitlement check and add per-card spend limits.
 */
const nurseFlowRouter: IRouter = Router();

// Public feed deliberately exposes approved content only. Draft/review data,
// reviewer names and internal prompts remain inside the studio endpoint.
nurseFlowRouter.get("/nurseflow/feed", async (req: Request, res: Response) => {
  try {
    const topic = clean(req.query.topic, 80).toLowerCase();
    const content = await readNurseFlowContent();
    const questions = content.questions.filter((question) => question.reviewStatus === "approved" && (!topic || question.topic.toLowerCase() === topic));
    // A card that has a finished visual carries a same-origin URL plus the
    // media type, so the learner page knows whether to use an <img> or a
    // <video> and never sees the provider's own URL. Visuals are read once for
    // the whole feed rather than once per card.
    const clips = await completedClipsByCard();
    res.json({
      questions: questions.map(({ visualBrief, reviewedBy, reviewedAt, createdAt, updatedAt, ...question }) => {
        const clip = clips.get(question.id);
        return {
          ...question,
          visual: clip ? { url: `/api/nurseflow/video-jobs/${clip.id}/content`, mediaType: clip.mediaType } : null,
        };
      }),
    });
  } catch (error) {
    req.log?.error({ error }, "NurseFlow feed failed");
    res.status(503).json({ error: "The study feed is temporarily unavailable." });
  }
});

function clean(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.replace(/[\r\n]+/g, " ").trim().slice(0, maximum) : "";
}

/** Start a render job for a reviewed card. Returns the stored job, not the
 *  provider's raw operation, so internal ids and prompts stay server-side. */
nurseFlowRouter.post("/nurseflow/video-jobs", async (req: Request, res: Response) => {
  if (!isVideoConfigured()) {
    sendNotConfigured(res);
    return;
  }
  const title = clean(req.body?.title, 120);
  const visualBrief = clean(req.body?.visualBrief, 500);
  const cardId = clean(req.body?.cardId, 160);
  if (!title || !visualBrief) {
    res.status(400).json({ error: "A reviewed card title and visual brief are required." });
    return;
  }
  try {
    const job = await createVideoJob({ title, visualBrief, cardId: cardId || undefined });
    res.status(201).json({ job: publicVideoJob(job) });
  } catch (error) {
    req.log?.error({ error }, "NurseFlow video job failed");
    res.status(502).json({ error: error instanceof Error ? error.message : "The video provider could not be reached." });
  }
});

/** The latest job for a card, so the Studio can restore a clip (or resume a
 *  poll) after a reload. Keyed by card id rather than job id. */
nurseFlowRouter.get("/nurseflow/video-jobs", async (req: Request, res: Response) => {
  if (!isVideoConfigured()) {
    sendNotConfigured(res);
    return;
  }
  const cardId = clean(req.query.cardId, 160);
  if (!cardId) {
    res.status(400).json({ error: "A cardId query parameter is required." });
    return;
  }
  try {
    const job = await latestVideoJobForCard(cardId);
    // `watermarked` is provider config rather than per-job state, but the
    // Studio can only usefully warn about it next to the generated visual.
    res.json({ job: job ? publicVideoJob(job) : null, watermarked: imageIsWatermarked() });
  } catch (error) {
    req.log?.error({ error }, "NurseFlow card video lookup failed");
    res.status(502).json({ error: error instanceof Error ? error.message : "The video provider could not be reached." });
  }
});

/** Poll a job. In-flight jobs are refreshed from the provider; once a job has
 *  finished, repeat calls read the stored record and cost nothing. */
nurseFlowRouter.get("/nurseflow/video-jobs/:id", async (req: Request, res: Response) => {
  if (!isVideoConfigured()) {
    sendNotConfigured(res);
    return;
  }
  const id = clean(req.params.id, 160);
  if (!isValidJobId(id)) {
    res.status(400).json({ error: "Invalid video job id." });
    return;
  }
  try {
    const job = await refreshVideoJob(id);
    if (!job) {
      res.status(404).json({ error: "Video job not found." });
      return;
    }
    res.json({ job: publicVideoJob(job) });
  } catch (error) {
    req.log?.error({ error }, "NurseFlow video job lookup failed");
    res.status(502).json({ error: error instanceof Error ? error.message : "The video provider could not be reached." });
  }
});

/**
 * Serve the finished visual. The provider's own URL is short-lived (and, for
 * Veo, key-gated), so a still image is cached when it is generated and a clip
 * is downloaded on the first request; every later request is served from disk.
 * The content type follows the job, because the default provider is an image.
 */
nurseFlowRouter.get("/nurseflow/video-jobs/:id/content", async (req: Request, res: Response) => {
  if (!isVideoConfigured()) {
    sendNotConfigured(res);
    return;
  }
  const id = clean(req.params.id, 160);
  if (!isValidJobId(id)) {
    res.status(400).json({ error: "Invalid video job id." });
    return;
  }
  try {
    const job = await refreshVideoJob(id);
    if (!job) {
      res.status(404).json({ error: "Video job not found." });
      return;
    }
    if (job.status !== "completed") {
      // 409 rather than 404: the clip may exist shortly. Mirror the status and
      // the provider's message so a caller can tell "wait" from "failed".
      res.status(409).json({
        error: job.status === "failed" ? job.error || "Video generation failed." : "The clip is still rendering.",
        status: job.status,
      });
      return;
    }
    const file = await ensureVideoFile(job);
    res.type(job.mimeType || (job.mediaType === "image" ? "image/jpeg" : "video/mp4"));
    res.sendFile(file, (error) => {
      if (error) req.log?.error({ error }, "NurseFlow visual stream failed");
    });
  } catch (error) {
    req.log?.error({ error }, "NurseFlow video download failed");
    res.status(502).json({ error: error instanceof Error ? error.message : "The clip could not be downloaded." });
  }
});

export default nurseFlowRouter;
