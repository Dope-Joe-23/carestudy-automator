/**
 * NurseFlow teaching visuals.
 *
 * Three providers sit behind one job contract:
 *
 *   - `cloudflare` (default): a still image from Cloudflare Workers AI
 *     (flux-1-schnell). The REST call is synchronous, so the job is created
 *     `in_progress` and a detached task finishes it within seconds. The learner
 *     page animates the still with CSS, which is why the previous video-only
 *     clip was replaced — the Veo prompt forbade narration, dialogue and music,
 *     so the output was already a silent loop. See docs/nurseflow.md.
 *   - `image` (legacy opt-in): Pollinations. Its free anonymous generation was
 *     retired — every model now routes to a paid "Gen Sana" pipeline that
 *     answers 402 on an empty balance — so this only works with a token and
 *     pollen balance. Kept for deployments that already have one.
 *   - `veo` (opt-in): Google's Veo models on the Gemini API. Requires
 *     GEMINI_API_KEY and a paid Google project. Asynchronous:
 *
 *       POST {base}/models/{model}:predictLongRunning  -> long-running operation
 *       GET  {base}/{operation}                        -> done / error / video uri
 *       GET  {videoUri}                                -> the MP4 bytes
 *
 * Whichever provider runs, the provider URL is short-lived and key-gated, so it
 * is never handed to the browser. A job record is persisted instead, the asset
 * is cached on disk, and the browser only ever sees our own job id and a
 * same-origin `contentUrl`.
 *
 * Note on naming: the routes and this module are still called "video" jobs. The
 * endpoint names are a published contract (`/api/nurseflow/video-jobs`), so the
 * switch to still images was made by adding `mediaType`/`mimeType` to the job
 * rather than by renaming the surface.
 */
import { randomBytes, randomInt } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { nurseflowPath } from "./nurseflowPaths";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "veo-3.1-generate-preview";
const DEFAULT_IMAGE_BASE_URL = "https://image.pollinations.ai";
const DEFAULT_IMAGE_MODEL = "flux";
/** Portrait source for a phone card: enough detail without a slow render. */
const DEFAULT_IMAGE_WIDTH = 720;
const DEFAULT_IMAGE_HEIGHT = 1280;
const DEFAULT_CF_BASE_URL = "https://api.cloudflare.com/client/v4";
const DEFAULT_CF_IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
/** flux-1-schnell renders square; the learner card crops with object-cover. */
const CF_IMAGE_WIDTH = 1024;
const CF_IMAGE_HEIGHT = 1024;
/** flux-1-schnell caps at 8 diffusion steps; 4 is the documented default. */
const CF_IMAGE_STEPS = 4;
const POLL_TIMEOUT_MS = 60_000;
/** Clips and images are a few megabytes; downloads get a longer leash. */
const DOWNLOAD_TIMEOUT_MS = 300_000;

export type VideoJobStatus = "in_progress" | "completed" | "failed";
/** What `contentUrl` actually serves, so the client knows which element to use. */
export type VisualMediaType = "image" | "video";

export type NurseFlowVideoJob = {
  id: string;
  title: string;
  /** The card this visual belongs to, when the caller supplied one. */
  cardId?: string;
  /** The safety-constrained prompt actually sent to the provider. */
  prompt: string;
  model: string;
  provider: "cloudflare" | "image" | "veo";
  mediaType: VisualMediaType;
  /** Set once the asset exists, so `/content` can answer with the right type. */
  mimeType?: string;
  width?: number;
  height?: number;
  status: VideoJobStatus;
  /**
   * Provider resource name ("operations/...") for Veo, needed to poll and
   * download. Empty for the synchronous image provider.
   */
  operationName: string;
  /** Provider download URL — short-lived, and never sent to the browser. */
  videoUri?: string;
  /** Filename of the cached asset once it has been written to disk. */
  storedFile?: string;
  error?: string;
  seconds: number;
  aspectRatio: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

type VideoFile = { schemaVersion: 1; jobs: NurseFlowVideoJob[] };

/** Node's fetch types do not export RequestRedirect; mirror the values we use. */
type RedirectMode = "error" | "follow" | "manual";

/** The subset of Google's operation shape this module relies on. */
type GoogleOperation = {
  name?: string;
  done?: boolean;
  error?: { message?: string; status?: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: { video?: { uri?: string } }[];
    };
  };
};

type JobInput = { title: string; visualBrief: string; cardId?: string };

/**
 * `cloudflare` is the default: a free Workers AI token is the cheapest working
 * option left, since Pollinations retired free anonymous generation. `veo`
 * stays available for anyone with a paid Google project already wired up.
 */
const provider = (): "cloudflare" | "image" | "veo" => {
  const requested = process.env.NURSEFLOW_VISUAL_PROVIDER?.trim().toLowerCase();
  if (requested === "veo") return "veo";
  if (requested === "image") return "image";
  return "cloudflare";
};

const apiKey = () => (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
const modelName = () => process.env.NURSEFLOW_VIDEO_MODEL?.trim() || DEFAULT_MODEL;
const baseUrl = () => (process.env.GEMINI_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");

const imageBaseUrl = () => (process.env.NURSEFLOW_IMAGE_BASE_URL?.trim() || DEFAULT_IMAGE_BASE_URL).replace(/\/+$/, "");
const imageModel = () => process.env.NURSEFLOW_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
const imageToken = () => (process.env.NURSEFLOW_IMAGE_TOKEN || process.env.POLLINATIONS_TOKEN || "").trim();

const cfBaseUrl = () => (process.env.CLOUDFLARE_AI_BASE_URL?.trim() || DEFAULT_CF_BASE_URL).replace(/\/+$/, "");
const cfToken = () => (process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || "").trim();
/** Defaults to the R2 account id; a Nurses-specific override still wins. */
const cfAccountId = () => (process.env.NURSEFLOW_CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
const cfImageModel = () => process.env.NURSEFLOW_CF_IMAGE_MODEL?.trim() || DEFAULT_CF_IMAGE_MODEL;

function imageDimensions(): { width: number; height: number } {
  const width = Number.parseInt(process.env.NURSEFLOW_IMAGE_WIDTH ?? "", 10);
  const height = Number.parseInt(process.env.NURSEFLOW_IMAGE_HEIGHT ?? "", 10);
  return {
    width: Number.isFinite(width) && width > 0 ? width : DEFAULT_IMAGE_WIDTH,
    height: Number.isFinite(height) && height > 0 ? height : DEFAULT_IMAGE_HEIGHT,
  };
}

/** The free image tier is congested often enough to be worth retrying. */
const IMAGE_ATTEMPTS = 3;
const IMAGE_RETRY_BASE_MS = 2_000;
/**
 * How long an image job may sit `in_progress` before a poll gives up on it.
 * Generation itself is seconds; the margin covers retries and a slow queue,
 * and only matters when the process restarted mid-render.
 */
const IMAGE_JOB_TIMEOUT_MS = 5 * 60_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const storePath = () => nurseflowPath(process.env.NURSEFLOW_VIDEO_PATH, "video-jobs.json");
const videoDir = () => nurseflowPath(process.env.NURSEFLOW_VIDEO_DIR, "videos");

/** True when the legacy Pollinations tier will stamp a watermark, i.e. no token. */
export const imageIsWatermarked = () => provider() === "image" && !imageToken();

export function isVideoConfigured(): boolean {
  // Each provider answers 503 with setup guidance rather than silently failing
  // or spending money: Cloudflare needs a Workers AI token, Veo needs a key,
  // and the legacy Pollinations tier still starts without any account.
  if (provider() === "veo") return Boolean(apiKey());
  if (provider() === "cloudflare") return Boolean(cfToken() && cfAccountId());
  return true;
}

/** What to set up, per active provider, for the routes' 503 responses. */
export function visualSetupHint(): string {
  if (provider() === "veo") {
    return "Set GEMINI_API_KEY to enable Veo, or unset NURSEFLOW_VISUAL_PROVIDER to use the default Cloudflare image provider.";
  }
  if (provider() === "cloudflare") {
    return "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (a free Workers AI token is enough) to enable the default Cloudflare image provider.";
  }
  return "The legacy Pollinations provider has no free anonymous tier any more; set NURSEFLOW_IMAGE_TOKEN with a pollen balance, or switch to the Cloudflare provider.";
}

export const isValidJobId = (id: string) => /^vid_[A-Za-z0-9_-]+$/.test(id);

/** Absolute path of a job's cached asset. The filename is re-validated because
 *  it is derived from record data and must never escape the visual directory. */
export function videoFilePath(job: NurseFlowVideoJob): string {
  const file = job.storedFile ?? `${job.id}.mp4`;
  if (!/^[A-Za-z0-9_.-]+$/.test(file)) throw new Error("Invalid stored visual filename.");
  return resolve(videoDir(), file);
}

/** Extension for the bytes the provider actually returned. */
function extensionFor(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("mp4")) return "mp4";
  return mimeType.includes("image") ? "jpg" : "mp4";
}

/** Reduce a pixel size to a display ratio (720x1280 -> "9:16"). */
function ratioLabel(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height) || 1;
  return `${width / divisor}:${height / divisor}`;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

/**
 * The prompt is the only thing the model sees, and it is constrained the same
 * way for both providers: a simulated training visual, never patient data,
 * advice, or anything procedural on a body.
 */
function videoPrompt(title: string, visualBrief: string): string {
  return [
    "Create a short vertical nursing education visual, not medical advice.",
    `Topic: ${title}.`,
    `Teaching visual: ${visualBrief}.`,
    "Vertical 9:16 framing for a phone screen.",
    "Show a simulated clinical environment with no real patient data, no identifiable people, no logos, no readable records, no procedures being performed on a body, and no graphic content.",
    "Use calm, accurate, non-sensational training visuals. Do not display diagnostic claims, dosage instructions, or text that could replace local clinical policy.",
    "Ambient room tone only: no narration, no dialogue, no spoken words, no music.",
  ].join(" ");
}

/**
 * The still-image prompt. It drops the audio clauses (which are meaningless for
 * an image) and adds an explicit no-text rule: diffusion models render
 * lettering as convincing-looking gibberish, which is exactly the kind of
 * pseudo-clinical text this content must not ship.
 */
function imagePrompt(title: string, visualBrief: string): string {
  return [
    "A calm, accurate vertical nursing education illustration, not medical advice.",
    `Topic: ${title}.`,
    `Teaching visual: ${visualBrief}.`,
    "Clean, modern editorial illustration for a phone screen, vertical composition, soft even lighting, teal and deep blue palette.",
    "A simulated clinical environment with no real patient data, no identifiable people, no logos, and no procedures being performed on a body.",
    "No text, no captions, no lettering, no labels, no signage, no dosage instructions, no charts, no diagnostic claims.",
  ].join(" ");
}

/** Pollinations takes no negative prompt, so the exclusions ride in the text. */
const IMAGE_EXCLUSIONS =
  " Avoid: identifiable faces, close-up portraits, readable medical records, any lettering or numbers, watermarks, logos, blood, gore, needles entering skin, surgical procedures, drug names, dosage charts, graphic content.";

/** Veo 3.1 supports negativePrompt; keep the exclusions in one place. */
const NEGATIVE_PROMPT = [
  "identifiable people, close-up faces, real patient data, readable medical records",
  "surgical procedures on a body, blood, gore, needles entering skin",
  "clinical advice text, dosage instructions, drug names, diagnostic claims",
  "logos, brand marks, watermarks, captions, subtitles",
  "narration, dialogue, speech, voice-over, music",
].join(", ");

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

async function readStore(): Promise<VideoFile> {
  try {
    const file = JSON.parse(await readFile(storePath(), "utf8")) as VideoFile;
    return Array.isArray(file.jobs) ? file : { schemaVersion: 1, jobs: [] };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: 1, jobs: [] };
    throw error;
  }
}

async function writeStore(jobs: NurseFlowVideoJob[]): Promise<void> {
  const target = storePath();
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, JSON.stringify({ schemaVersion: 1, jobs }, null, 2), "utf8");
  await rename(temporary, target);
}

// Serialise read-modify-write cycles so two concurrent polls cannot clobber
// each other's update (the access store uses the same pattern).
let writeQueue: Promise<unknown> = Promise.resolve();

async function mutate<T>(operation: (jobs: NurseFlowVideoJob[]) => T | Promise<T>): Promise<T> {
  const previous = writeQueue;
  let release!: () => void;
  writeQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    const store = await readStore();
    const result = await operation(store.jobs);
    await writeStore(store.jobs);
    return result;
  } finally {
    release();
  }
}

// ---------------------------------------------------------------------------
// Provider calls
// ---------------------------------------------------------------------------

/**
 * Call the Gemini API. `path` may be an absolute URL — the download URI Google
 * returns is on a different host, so a bare path would otherwise be prefixed
 * with the API base and silently 404.
 */
async function google(
  path: string,
  init: RequestInit = {},
  options: { redirect?: RedirectMode; timeoutMs?: number } = {},
) {
  const target = /^https?:\/\//i.test(path) ? path : `${baseUrl()}${path}`;
  return fetch(target, {
    ...init,
    redirect: options.redirect ?? "error",
    headers: {
      "x-goog-api-key": apiKey(),
      // Only bodies are JSON; a GET with a Content-Type confuses some gateways.
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? POLL_TIMEOUT_MS),
  });
}

/** Provider error text, when the body has one, for surfacing to the caller. */
async function providerError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { error?: string | { message?: string } };
    if (typeof parsed.error === "string" && parsed.error) return parsed.error;
    if (typeof parsed.error === "object" && parsed.error?.message) return parsed.error.message;
  } catch { /* not JSON — fall through to the raw text */ }
  return text.slice(0, 300) || `The visual provider returned HTTP ${response.status}.`;
}

/** Fields a client may see. `videoUri`, `operationName` and `prompt` stay here. */
export function publicVideoJob(job: NurseFlowVideoJob) {
  return {
    id: job.id,
    cardId: job.cardId ?? null,
    title: job.title,
    model: job.model,
    provider: job.provider,
    mediaType: job.mediaType,
    width: job.width ?? null,
    height: job.height ?? null,
    status: job.status,
    seconds: job.seconds,
    aspectRatio: job.aspectRatio,
    error: job.error ?? null,
    /** Same-origin endpoint that serves the finished visual. */
    contentUrl: job.status === "completed" ? `/api/nurseflow/video-jobs/${job.id}/content` : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt ?? null,
  };
}

/** Fold a provider operation into a job record. */
function applyOperation(job: NurseFlowVideoJob, operation: GoogleOperation): void {
  if (operation.error) {
    job.status = "failed";
    job.error = operation.error.message || operation.error.status || "The video provider reported a failure.";
    return;
  }
  if (!operation.done) {
    job.status = "in_progress";
    return;
  }
  const uri = operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) {
    job.status = "failed";
    job.error = "The video job finished without a downloadable clip.";
    return;
  }
  job.status = "completed";
  job.videoUri = uri;
  job.completedAt = job.completedAt ?? new Date().toISOString();
}

/** A hint appended when the provider's own congestion is what bit us. */
function withRateLimitHint(message: string): string {
  if (!/429|rate.?limit|RPM|quota/i.test(message)) return message;
  if (provider() === "image") {
    return `${message} The legacy Pollinations tier is congested or rate-limiting this server; setting NURSEFLOW_IMAGE_TOKEN raises the limit and removes the watermark.`;
  }
  return `${message} The Cloudflare Workers AI free allocation is about 40 images per day and resets at 00:00 UTC.`;
}

function imageUrl(prompt: string, width: number, height: number): URL {
  const url = new URL(`${imageBaseUrl()}/prompt/${encodeURIComponent(prompt)}`);
  url.searchParams.set("model", imageModel());
  url.searchParams.set("width", String(width));
  url.searchParams.set("height", String(height));
  url.searchParams.set("seed", String(seededOrRandom()));
  // Strict content filtering: this is clinical teaching content.
  url.searchParams.set("safe", "true");
  // Watermark removal is an account feature, so only ask when we have a token.
  if (imageToken()) url.searchParams.set("nologo", "true");
  return url;
}

/**
 * Fetch one still, retrying transient failures. The free tier reports upstream
 * congestion as an HTTP 500 body ("Gen Sana request failed with 429 ..."), so a
 * 5xx here usually deserves another attempt rather than a hard failure.
 */
async function fetchImage(url: URL): Promise<{ bytes: Buffer; mimeType: string }> {
  let message = "The image provider could not be reached.";
  for (let attempt = 1; attempt <= IMAGE_ATTEMPTS; attempt += 1) {
    let response: Response | null = null;
    try {
      response = await fetch(url, {
        redirect: "follow",
        headers: imageToken() ? { Authorization: `Bearer ${imageToken()}` } : {},
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
    } catch (error) {
      message = error instanceof Error ? error.message : message;
    }

    if (response?.ok) {
      const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
      if (!mimeType.startsWith("image/")) {
        message = `The image provider returned ${mimeType || "an unknown content type"} instead of an image.`;
      } else {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.byteLength > 0) return { bytes, mimeType };
        message = "The image provider returned an empty visual.";
      }
    } else if (response) {
      message = await providerError(response);
      // A hard client error will not improve on a retry.
      if (response.status < 500 && response.status !== 429) break;
    }
    if (attempt < IMAGE_ATTEMPTS) await sleep(IMAGE_RETRY_BASE_MS * attempt);
  }
  throw new Error(withRateLimitHint(message));
}

/** NURSEFLOW_IMAGE_SEED pins reproducible art; otherwise vary per render. */
function seededOrRandom(): number {
  const seeded = Number.parseInt(process.env.NURSEFLOW_IMAGE_SEED ?? "", 10);
  return Number.isFinite(seeded) ? seeded : randomInt(1, 2_147_483_647);
}

/**
 * Cloudflare Workers AI text-to-image. The REST call is synchronous (a few
 * seconds) and returns the image as base64, so it slots into the same detached
 * task the Pollinations flow uses and the client poll is unchanged.
 */
type CloudflareRunResponse = {
  success?: boolean;
  errors?: { code?: number; message?: string }[] | string[];
  messages?: unknown[];
  result?: { image?: string };
};

function cloudflareErrorText(response: Response, body: CloudflareRunResponse): string {
  const listed = Array.isArray(body.errors) ? body.errors : [];
  const first = listed.find(Boolean);
  const message =
    typeof first === "string"
      ? first
      : first && typeof first === "object"
        ? first.message
        : undefined;
  return message || `The Cloudflare Workers AI request returned HTTP ${response.status}.`;
}

async function fetchCloudflareImage(prompt: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const endpoint = `${cfBaseUrl()}/accounts/${cfAccountId()}/ai/run/${cfImageModel()}`;
  let message = "The Cloudflare Workers AI endpoint could not be reached.";
  for (let attempt = 1; attempt <= IMAGE_ATTEMPTS; attempt += 1) {
    let response: Response | null = null;
    let body: CloudflareRunResponse | null = null;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          steps: CF_IMAGE_STEPS,
          // No `seed`: flux-1-schnell's input schema rejects it, and each run
          // varies server-side anyway, so "Generate again" still differs.
        }),
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      body = (await response.json().catch(() => null)) as CloudflareRunResponse | null;
    } catch (error) {
      message = error instanceof Error ? error.message : message;
    }

    const base64 = body?.result?.image;
    if (response?.ok && body?.success !== false && base64) {
      const bytes = Buffer.from(base64, "base64");
      if (bytes.byteLength > 0) return { bytes, mimeType: "image/jpeg" };
      message = "The Cloudflare Workers AI request returned an empty visual.";
    } else if (response && body) {
      message = cloudflareErrorText(response, body);
      // A 4xx will not improve on a retry — except 429 (the free tier's
      // per-minute cap) and 404, which Cloudflare's inference route returns
      // intermittently under load and which succeeds on a second attempt.
      const transient = response.status === 429 || response.status === 404;
      if (response.status >= 400 && response.status < 500 && !transient) break;
    }
    if (attempt < IMAGE_ATTEMPTS) await sleep(IMAGE_RETRY_BASE_MS * attempt);
  }
  throw new Error(message);
}

/**
 * Build the record before generating, so the create call stays quick and the
 * client polls a job exactly as it does for the asynchronous Veo provider.
 */
function startImageJob(input: JobInput): NurseFlowVideoJob {
  const stillProvider = provider();
  const { width, height } =
    stillProvider === "cloudflare"
      ? { width: CF_IMAGE_WIDTH, height: CF_IMAGE_HEIGHT }
      : imageDimensions();
  const now = new Date().toISOString();
  return {
    id: `vid_${randomBytes(10).toString("hex")}`,
    title: input.title,
    cardId: input.cardId,
    prompt: imagePrompt(input.title, input.visualBrief),
    model: stillProvider === "cloudflare" ? cfImageModel() : imageModel(),
    provider: stillProvider,
    mediaType: "image",
    width,
    height,
    status: "in_progress",
    operationName: "",
    // No duration to report; the UI shows the pixel size instead.
    seconds: 0,
    aspectRatio: ratioLabel(width, height),
    createdAt: now,
    updatedAt: now,
  };
}

/** The detached half of a still-image job: fetch, cache, record the outcome. */
async function runImageJob(id: string, prompt: string): Promise<void> {
  const job = await findVideoJob(id);
  if (!job) return;
  try {
    const { bytes, mimeType } =
      job.provider === "cloudflare"
        ? await fetchCloudflareImage(prompt + IMAGE_EXCLUSIONS)
        : await fetchImage(imageUrl(prompt + IMAGE_EXCLUSIONS, job.width ?? DEFAULT_IMAGE_WIDTH, job.height ?? DEFAULT_IMAGE_HEIGHT));
    const file = `${id}.${extensionFor(mimeType)}`;
    const target = videoFilePath({ ...job, storedFile: file });
    await mkdir(videoDir(), { recursive: true });
    const temporary = `${target}.tmp`;
    await writeFile(temporary, bytes);
    await rename(temporary, target);

    await mutate((jobs) => {
      const stored = jobs.find((candidate) => candidate.id === id);
      if (!stored) return;
      stored.status = "completed";
      stored.mimeType = mimeType;
      stored.storedFile = file;
      stored.completedAt = new Date().toISOString();
      stored.updatedAt = stored.completedAt;
    });
  } catch (error) {
    await mutate((jobs) => {
      const stored = jobs.find((candidate) => candidate.id === id);
      if (!stored) return;
      stored.status = "failed";
      stored.error = error instanceof Error ? error.message : "The visual could not be generated.";
      stored.updatedAt = new Date().toISOString();
    });
  }
}

/** Submit a Veo render job. Returns an in-progress record to be polled. */
async function createVeoJob(input: JobInput): Promise<NurseFlowVideoJob> {
  const prompt = videoPrompt(input.title, input.visualBrief);
  const response = await google(`/models/${encodeURIComponent(modelName())}:predictLongRunning`, {
    method: "POST",
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        // Portrait for a phone screen. `resolution` is deliberately unset: the
        // 1080p tier is landscape-only, so 9:16 stays on the default.
        aspectRatio: "9:16",
        durationSeconds: 8,
        negativePrompt: NEGATIVE_PROMPT,
      },
    }),
  });
  if (!response.ok) throw new Error(await providerError(response));

  const operation = (await response.json()) as GoogleOperation;
  const operationName = operation.name ?? "";
  if (!operationName) throw new Error("The video provider did not return an operation name.");

  const now = new Date().toISOString();
  const job: NurseFlowVideoJob = {
    id: `vid_${randomBytes(10).toString("hex")}`,
    title: input.title,
    cardId: input.cardId,
    prompt,
    model: modelName(),
    provider: "veo",
    mediaType: "video",
    mimeType: "video/mp4",
    status: "in_progress",
    operationName,
    seconds: 8,
    aspectRatio: "9:16",
    createdAt: now,
    updatedAt: now,
  };
  applyOperation(job, operation);
  return job;
}

/** Create a visual job with the configured provider and persist it. */
export async function createVideoJob(input: JobInput): Promise<NurseFlowVideoJob> {
  if (provider() === "veo") {
    const job = await createVeoJob(input);
    await mutate((jobs) => { jobs.push(job); });
    return job;
  }
  const job = startImageJob(input);
  await mutate((jobs) => { jobs.push(job); });
  // Generation takes seconds to a minute and may retry, so it runs detached
  // while the caller polls — the same shape as the Veo provider.
  void runImageJob(job.id, job.prompt).catch(() => undefined);
  return job;
}

export async function findVideoJob(id: string): Promise<NurseFlowVideoJob | null> {
  const store = await readStore();
  return store.jobs.find((job) => job.id === id) ?? null;
}

/** Newest job wins when a card has been generated more than once. */
const newestFirst = (a: NurseFlowVideoJob, b: NurseFlowVideoJob) =>
  (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt);

/**
 * The most recent job for a card, whatever its state. The Studio uses this to
 * restore a visual (or resume a poll) for a card after a page reload.
 */
export async function latestVideoJobForCard(cardId: string): Promise<NurseFlowVideoJob | null> {
  const store = await readStore();
  return store.jobs.filter((job) => job.cardId === cardId).sort(newestFirst)[0] ?? null;
}

/**
 * Completed visuals keyed by card id, for the public feed. Reads the store once
 * rather than once per card in the feed.
 */
export async function completedClipsByCard(): Promise<Map<string, NurseFlowVideoJob>> {
  const store = await readStore();
  const latest = new Map<string, NurseFlowVideoJob>();
  for (const job of store.jobs) {
    if (job.status !== "completed" || !job.cardId) continue;
    const current = latest.get(job.cardId);
    if (!current || newestFirst(job, current) < 0) latest.set(job.cardId, job);
  }
  return latest;
}

/**
 * Poll the provider for an in-flight job and persist any transition. Terminal
 * jobs are returned untouched, so repeated client polling costs nothing — and
 * image jobs are always terminal, so this normally reads the store and stops.
 */
export async function refreshVideoJob(id: string): Promise<NurseFlowVideoJob | null> {
  const existing = await findVideoJob(id);
  if (!existing || existing.status !== "in_progress") return existing;

  if (existing.provider === "image") {
    // There is no provider operation to poll — the work is an in-process task.
    // If the process restarted mid-render the task is gone, so a job that has
    // been quiet for too long is failed rather than left spinning forever.
    if (Date.now() - new Date(existing.updatedAt).getTime() < IMAGE_JOB_TIMEOUT_MS) return existing;
    return mutate((jobs) => {
      const job = jobs.find((candidate) => candidate.id === id);
      if (!job) return null;
      job.status = "failed";
      job.error = "The visual was still rendering when the server restarted. Generate it again.";
      job.updatedAt = new Date().toISOString();
      return job;
    });
  }

  const response = await google(`/${existing.operationName}`);
  if (!response.ok) {
    const message = await providerError(response);
    // A provider hiccup must not destroy a job that may still be rendering.
    if (response.status >= 500) return existing;
    return mutate((jobs) => {
      const job = jobs.find((candidate) => candidate.id === id);
      if (!job) return null;
      job.status = "failed";
      job.error = message;
      job.updatedAt = new Date().toISOString();
      return job;
    });
  }

  const operation = (await response.json()) as GoogleOperation;
  return mutate((jobs) => {
    const job = jobs.find((candidate) => candidate.id === id);
    if (!job) return null;
    applyOperation(job, operation);
    job.updatedAt = new Date().toISOString();
    return job;
  });
}

/**
 * Make sure the finished asset is on disk. Image jobs are written at creation
 * time, so this is normally a hit; a Veo clip is downloaded once here and then
 * served from cache, so playback no longer depends on the provider's
 * short-lived URL. Returns the cached file path.
 */
export async function ensureVideoFile(job: NurseFlowVideoJob): Promise<string> {
  const target = videoFilePath(job);
  if (await stat(target).then(() => true, () => false)) return target;

  if (job.status !== "completed" || !job.videoUri) throw new Error("The video job has not finished yet.");

  const response = await google(job.videoUri, {}, { redirect: "follow", timeoutMs: DOWNLOAD_TIMEOUT_MS });
  if (!response.ok) throw new Error(await providerError(response));

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("The video provider returned an empty clip.");

  await mkdir(videoDir(), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, target);

  await mutate((jobs) => {
    const stored = jobs.find((candidate) => candidate.id === job.id);
    if (stored) stored.storedFile = `${job.id}.mp4`;
  });
  return target;
}
