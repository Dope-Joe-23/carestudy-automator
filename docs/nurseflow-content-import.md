# NurseFlow question-bank import

Start from [starter-questions.json](../data/nurseflow/starter-questions.json).
Every card requires four answer options, a zero-based `correctOptionIndex`, a
source URL, a rationale, a learning objective and a visual brief. New cards
must start as `draft`; a reviewer changes them to `approved` only after the
question, rationale and source have been checked.

The import endpoint enforces this rather than trusting the file. It accepts a
`reviewStatus` field only to report typos, and ignores its value: every imported
card is stored as `draft` with no reviewer recorded, so `reviewedBy` and
`reviewedAt` in a payload are discarded. Approval can only come from the Studio
review action, which is why a batch cannot publish itself.

## Validate a batch

An authenticated studio admin can validate up to 250 JSON cards without
publishing them:

```http
POST /api/nurseflow/questions/validate
Content-Type: application/json
Authorization: Bearer <admin session token>

{ "questions": [ ... ] }
```

The response returns every row and field error. After it is valid, import the
same payload from the Studio Question Bank at `/studio/nurseflow`. Imported
cards begin as drafts. They appear to learners only after an editor marks them
`approved`.

The initial repository is an atomic JSON content store at
`data/nurseflow/question-bank.json`. For deployment, set
`NURSEFLOW_CONTENT_PATH` to a mounted persistent volume; do not keep this file
only on ephemeral application storage.

## Fast test workflow

1. Copy the starter file and add 10–20 original cards from the Open RN OER,
   WHO, NICE, or an institution's material you are licensed to use.
2. Open Studio → Question Bank (`/studio/nurseflow`). Either paste the
   `questions` payload (or drop in a `.json` file), or press **Load starter
   questions** to pull `data/nurseflow/starter-questions.json` straight into the
   editor via `GET /api/nurseflow/questions/starter`; then validate and import
   it as drafts. Set `NURSEFLOW_STARTER_PATH` if the example batch lives
   somewhere else on the server.
3. Have a qualified nursing educator review the card, then use **Approve**.
   This records the review date and makes it eligible for the public feed.
4. Generate a short, non-procedural visual from the `visualBrief`; retain the
   source and review metadata alongside the final clip.

Do not label an item as an NMC or NCLEX question unless it is actually an
authorised item. “NMC-aligned” or “NCLEX-style” should mean an original item
mapped to the relevant published competency/test-plan concepts.
