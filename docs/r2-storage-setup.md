# Cloudflare R2 storage setup

This app can keep uploaded files, student order materials, the NurseFlow
question bank and generated visuals in a Cloudflare R2 bucket instead of only
on the server's persistent disk. R2 is an S3-compatible object store with a
free tier (10 GB stored, 1M write / 10M read ops per month) and **zero egress
fees**, so downloads never add cost.

R2 is entirely optional. When it is not configured the app transparently uses
the local persistent disk at `/app/data` (or `data/` in development). See the
“File storage (R2 vs disk)” section of [DEPLOYMENT.md](../DEPLOYMENT.md) for the
per-surface layout.

## 1. Create the bucket

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com) and open
   **R2 Object Storage**.
2. Click **Create bucket**, give it a unique name (e.g. `carestudy-media`), and
   pick a location hint close to your Render region.
3. Note the **Account ID** — it is shown on the R2 overview page (also under
   **Workers & Pages → Overview**). This becomes `CLOUDFLARE_ACCOUNT_ID`.

## 2. Create an API token (access key)

1. In R2, open **API → Manage API Tokens → Create API token**.
2. Permissions: **Object Read & Write** (Admin Read & Write also works).
3. Scope it to the bucket you just created rather than all buckets.
4. Copy the **Access Key ID** and **Secret Access Key** — the secret is shown
   only once. These become `CLOUDFLARE_R2_ACCESS_KEY_ID` and
   `CLOUDFLARE_R2_SECRET_ACCESS_KEY`.

## 3. Set the four environment variables

R2 activates only when **all four** are present; if any is missing the app
falls back to disk.

| Variable | Example | Notes |
|----------|---------|-------|
| `CLOUDFLARE_ACCOUNT_ID` | `a1b2c3…` | Cloudflare account id |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | `2f9…` | R2 token access key id |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | `9c…` | R2 token secret (secret) |
| `R2_BUCKET_NAME` | `carestudy-media` | Bucket name |

- **Render:** `carestudy-api` → **Environment** → add each key. In
  `render.yaml` these are declared `sync: false`, so they are unset by default
  and must be entered in the dashboard.
- **Docker Compose (local):** export them in your shell or a `.env` file; the
  service already forwards them.
- **Local dev:** the same four variables in `artifacts/api-server/.env`.

Keep the secret out of the repository.

## 4. Configure bucket CORS

The browser uploads straight to the bucket with a presigned `PUT`, so the
bucket must allow cross-origin uploads from the **frontend origin** (your
Vercel domain, and `http://localhost:5173` for local dev).

In the bucket: **Settings → CORS policy → Add / Edit**, then paste:

```json
[
  {
    "AllowedOrigins": [
      "https://your-frontend.vercel.app",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

- Use explicit origins in production. `"*"` works for a quick test but exposes
  the bucket to any origin that obtains a presigned URL.
- `PUT` is what the browser calls; `HEAD` is included for parity with the
  server-side probes and is harmless. R2 answers the CORS preflight
  (`OPTIONS`) automatically from this policy.
- `Content-Type` must be allowed — the presigned URL is signed with it, and a
  `PUT` carrying a non-simple content type triggers a preflight.

## 5. Add a lifecycle rule for staging objects

Student order materials are uploaded to a staging prefix (`orders/pending/`)
*then* re-keyed into the order's permanent scope (`orders/<id>/`) when the order
is created. If a student abandons the form after uploading but before
submitting, those staging objects are orphaned. Expire them automatically:

In the bucket: **Settings → Object lifecycle rules → Add rule**

- **Name:** `expire-order-staging`
- **Prefix:** `orders/pending/`
- **Action:** Delete objects after **1 day** (or the shortest interval offered).

This never touches permanent objects — only the `orders/pending/` prefix is
matched. (Server-side cleanup already removes staging objects on failed
submissions; this rule is the safety net for a browser that never completes.)

No lifecycle rule is needed for the extraction cache: it lives on local disk
under `data/r2-cache/`, not in the bucket.

## 6. Verify

With the variables set and the service redeployed:

1. **Overall mode** — as an authenticated studio admin:

   ```bash
   curl -s https://your-api.onrender.com/api/storage/status \
     -H "Authorization: Bearer <admin session token>" | jq
   ```

   Every surface should report `"backend": "r2"` and `r2Configured: true`. The
   same data is shown in the studio at **Dashboard → Settings → Media storage**.

2. **Upload config** (used by the client to choose direct-to-bucket vs base64):

   ```bash
   curl -s https://your-api.onrender.com/api/uploads/config
   # => { "mode": "r2" }
   ```

3. **End to end** — upload a PDF to a study or place an order with a document.
   A `mode: "r2"` response, or the object appearing in the bucket under
   `uploads/…` / `orders/…`, confirms it. If a browser upload fails, recheck the
   CORS origin list — a mismatched origin shows as a failed `PUT` with no
   server log entry.

## Key layout

| Content | Key |
|---------|-----|
| Study uploads | `uploads/<studyId>/<uuid>.<ext>` |
| Library sources | `library/<uuid>.<ext>` |
| Order materials (staging) | `orders/pending/<uuid>.<ext>` |
| Order materials | `orders/<orderId>/<uuid>.<ext>` |
| Order deliveries | `orders/<orderId>/delivery/<uuid>.<ext>` |
| NurseFlow question bank | `nurseflow/question-bank.json` |
| NurseFlow video jobs | `nurseflow/video-jobs.json` |
| NurseFlow visual assets | `nurseflow/videos/<file>` |
| NurseFlow access store | `nurseflow/access.json` |

JSON stores are read from the bucket first and written to both the bucket and
the local disk cache. Generated visuals are mirrored to the bucket and
re-hydrated to disk on demand.

## Notes and limits

- R2 has no per-object size limit relevant here; the app caps direct uploads at
  250 MB (`MAX_R2_UPLOAD_BYTES`).
- The bucket is not public: the app serves objects through the API, never with
  a long-lived public URL.
- A persistent disk is still used as a cache and fallback, and is required as
  the local landing spot for extraction. R2 removes it as the **single point of
  failure**; it does not remove the disk entirely.
- Trial counters (`nurseflow/access.json`) are batched — many attempts collapse
  into one write — while payment records flush immediately.
