# NurseFlow

NurseFlow is CareStudy's short-form MCQ practice stream. It is mounted at
`/nurseflow` and can be deployed independently because it only needs the
frontend plus the `/api/nurseflow` video-job boundary.

## Content safety and quality

- Do not import, scrape, or reproduce live/proprietary exam questions from
  NMC, NCLEX, institutions, publishers, or question banks.
- Write original items from licensable or public guidance. Store the exact
  source URL, publication/version, learning objective, writer, reviewer and
  review date with every item before it reaches the feed.
- Clinical educators should approve the question, rationale and visual brief.
  The generated clip is an explanatory visual, not the evidence source.
- Do not send patient information to the video model. The server prompt blocks
  identifiable people, records, graphic procedures, dosage instructions and
  diagnostic claims.## Visual setup

NurseFlow's "motion images" are AI-generated **still images** animated with a
CSS drift on the learner card — the pipeline originally rendered silent 8-second
Veo clips, but a still plus drift reads the same on a phone card at a fraction
of the cost.

Three providers sit behind one job contract:

- **Cloudflare Workers AI** (default): `flux-1-schnell` via the REST API. Set
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (a free Workers AI token
  is enough — the free allocation is roughly 40 images per day, resetting at
  00:00 UTC; overage is about $0.003 per image on the paid plan). This is the
  replacement for the retired Pollinations free tier.
- **Pollinations** (legacy opt-in, `NURSEFLOW_VISUAL_PROVIDER=image`): its free
  anonymous generation was retired — every request now routes to a paid
  "Gen Sana" pipeline that answers 402 on an empty balance. Only useful with
  `NURSEFLOW_IMAGE_TOKEN` and a topped-up pollen balance.
- **Veo** (opt-in, `NURSEFLOW_VISUAL_PROVIDER=veo`): real 8-second MP4 clips on
  the Gemini API. Set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) and, optionally,
  `NURSEFLOW_VIDEO_MODEL` (default `veo-3.1-generate-preview`). Google's
  pricing table lists no free tier for Veo.

With the active provider unconfigured, every visual route answers 503 with a
`setup` hint and nothing is charged.

The API mirrors the job lifecycle:

```http
POST /api/nurseflow/video-jobs              # { title, visualBrief, cardId? } -> job
GET  /api/nurseflow/video-jobs?cardId=...   # newest job for a card (null when none)
GET  /api/nurseflow/video-jobs/:id          # poll; refreshes an in-flight job
GET  /api/nurseflow/video-jobs/:id/content  # streams the finished image or MP4
```

`POST` accepts only a reviewed card `title` (≤120 chars) and `visualBrief`
(≤500), plus an optional `cardId` to tie the visual to its card. It builds the
safety-constrained prompt and submits the job; the response is our own record —
the provider's operation name, prompt and download URL stay on the server.

`GET .../:id` returns the job state; in-flight jobs are refreshed from the
provider. A finished job is served from the stored record, so repeat polling
costs nothing.

`GET .../:id/content` is what the card's media element points at. Still images
are cached when they are generated; Veo clips are downloaded once to
`NURSEFLOW_VIDEO_DIR` (default `data/nurseflow/videos`) and streamed from there
afterwards. It answers 409 with the job's status while a render is still in
flight, so a caller can tell "wait" from "failed".

Job records live at `NURSEFLOW_VIDEO_PATH` (default
`data/nurseflow/video-jobs.json`). Point both visual paths at persistent
storage in production, or jobs and cached images are lost on redeploy.
`GEMINI_API_BASE_URL` overrides the Veo endpoint when routing through a
gateway; `CLOUDFLARE_AI_BASE_URL` does the same for Workers AI.

Every NurseFlow default (`NURSEFLOW_CONTENT_PATH`, `NURSEFLOW_STARTER_PATH`,
`NURSEFLOW_ACCESS_PATH`, `NURSEFLOW_VIDEO_PATH`, `NURSEFLOW_VIDEO_DIR`)
resolves against the **repository root**, not the process working directory.
That keeps `pnpm --filter @workspace/api-server run dev` (whose cwd is
`artifacts/api-server`) and the Docker image (cwd `/app`) on the same files;
an explicit `NURSEFLOW_*` value still wins.

The operation name, prompt and asset are persisted, so a creator can close the
browser between the create call and the finished visual. (The pipeline has
moved twice for cost reasons: OpenAI's Videos API shut down on 24 September
2026, and Pollinations later retired free anonymous image generation.)

### Generating and playing visuals

- **Studio** (`/studio/nurseflow`): expanding a card shows a *Generate clip*
  panel. It submits the card's title and visual brief, polls until the visual
  is ready and shows it inline. On mount it asks
  `GET /api/nurseflow/video-jobs?cardId=` for the newest job, so a render
  started before a reload is restored (and a running job keeps being polled).
  A card with no `visualBrief` cannot generate, because the brief is what the
  model is allowed to see.
- **Learner page** (`/nurseflow`): the approved feed attaches a `visual` to
  any card that has a finished one (`mediaType: "image"` or `"video"`), and the
  card shows it — a drifting still or a muted looping clip, driven by the
  existing play/pause control — instead of the static placeholder. Cards
  without a visual keep the placeholder, so the feed is never blocked on
  generation.

### Still to build

- An entitlement or admin check and per-card spend limits. The visual routes
  are mounted **before** `requireAdmin`, so they are reachable without a studio
  session today: anyone who can reach the API can spend your provider credits.
- Retention: cached visuals and the job store grow without bound, and nothing
  re-generates a visual when a card's visual brief changes.

## Monetisation

The ten-question trial is enforced by the API with an HttpOnly anonymous
visitor cookie and persistent access records; clearing browser storage does not
reset it. Set `NURSEFLOW_ACCESS_PATH` to durable storage when deploying. An
account should later merge the anonymous record into the student's account.

NurseFlow Plus uses the server's `PAYSTACK_SECRET_KEY` to create and verify a
transaction. Set the matching `VITE_PAYSTACK_PUBLIC_KEY` in the frontend, set
`NURSEFLOW_MONTHLY_PRICE_GHS` if the price changes, and register
`POST https://your-domain/api/nurseflow/payments/webhook` as the Paystack
webhook URL. The webhook signature is checked and the transaction is verified
with Paystack before access is granted; the client callback is only a faster
user experience, not the authority to unlock access.
