# NurseLearn

## Repository audit and integration points

- The app is a pnpm TypeScript workspace. `artifacts/carestudy-assistant` is React, Vite, Wouter, Tailwind, and shared shadcn-style components. `artifacts/api-server` is Express. The NurseLearn catalogue is stored in JSON; this follows the reviewed NurseSpin content-store approach and can be moved with `NURSELEARN_CONTENT_PATH`.
- General NurseAid chat is not connected in the student workspace. The existing model-backed assistant in the care-study studio is limited to editing study content. Health education therefore has a direct searchable discovery page, and does not send education queries to that study editor.
- NurseSpin is the existing quiz/practice product at `/nurseflow`. The public education page links to it. Care-study orders and payment routes were left unchanged.
- Existing admin sessions protect the `/studio` area. Only the `admin` role can read or modify the catalogue; staff accounts receive 403. Public endpoints return only approved records.

## User experience

- Public library: `/nurselearn`. Search accepts condition names, aliases, and natural-language prompts. Learning paths filter for public, nursing, or caregiver content. Language choices reflect languages with approved videos; Twi is never implied when no reviewed Twi video exists.
- Video records use a validated 11-character YouTube ID. The player uses `youtube-nocookie.com`, loads only after the learner chooses a video, and links attribution to the stored publishing record. Playback availability remains controlled by YouTube.
- Admin editor: `/studio/nurselearn`. Paste or edit JSON arrays for `conditions` and `videos`, save them as drafts, and approve or retire each entry from the review list. Saving content cannot set approval status. Approval is a separate administrator action.

## Catalogue records

`data/nurselearn/catalogue.json` is created on the first save. Configure `NURSELEARN_CONTENT_PATH` to use a durable path in production. Do not seed examples with invented approvals. All fields are described by the TypeScript types in `artifacts/api-server/src/lib/nurselearn.ts`. Video language codes are `en` and `tw`; audience values are `public`, `nursing`, and `caregiver`. Content can store references, subtitles, objectives, duration, specialty/category, and reviewer metadata. Only verified/reviewed values should be published.

API routes:

- `GET /api/nurselearn?q=...&language=en&audience=nursing&category=...` — public, approved catalogue search.
- `GET /api/admin/nurselearn` — admin bearer session required.
- `PUT /api/admin/nurselearn` — admin bearer session required; saves records as drafts (existing approval state is preserved for records with the same ID).
- `PATCH /api/admin/nurselearn/{conditions|videos}/:id/review` — admin bearer session required; separate `approved` or `retired` action.

## Known scope boundary

The project has no general-purpose chat or conversation endpoint, so NurseLearn does not claim to provide chat conversation history or LLM-driven clinical explanations. The prompt-style search keeps discovery grounded in published catalogue records. The initial catalogue is empty until NurseAid supplies reviewed condition entries, real channel-approved YouTube IDs, Twi review, and clinical references. NurseSpin recommendations and care-study referrals can be linked on records as that content is populated; NurseSpin has a direct link today.
