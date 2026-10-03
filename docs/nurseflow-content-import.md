# NurseFlow question-bank import

Start from [starter-questions.json](../data/nurseflow/starter-questions.json).
Every card requires four answer options, a zero-based `correctOptionIndex`, a
source, a rationale, a learning objective and a visual brief. New cards
must start as `draft`; a reviewer changes them to `approved` only after the
question, rationale and source have been checked.

A card's source is normally a real URL (`sourceKind` omitted or `"url"`). Cards
extracted from a PDF start as `sourceKind: "document"`, where `sourceUrl` is a
reference such as the document's filename rather than a link. Those cards are
flagged **Needs source** in the review queue and cannot be approved until a
real URL is attached with `PATCH /api/nurseflow/questions/:id/source`; the
server rejects an approval attempt on a document-sourced card with `422`.

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

## Extract cards from a PDF or Word document (AI)

Instead of authoring JSON by hand, a studio admin can upload a PDF or Word
(`.docx`) file and have the configured AI model (the shared Python gateway —
`ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL`) turn it into
candidate cards:

```http
POST /api/nurseflow/questions/extract
Content-Type: application/json
Authorization: Bearer <admin session token>

{ "filename": "module-3.pdf", "content": "<base64 PDF>",
  "sourceUrl": "https://…", "sourceTitle": "…", "topic": "…", "level": "…" }
```

The endpoint identifies the file by its magic bytes — PDF (`%PDF-`) or a real
Word package (a zip containing `word/`); legacy binary `.doc` is not supported.
It returns `{ "questions": [ ... ] }` in the import shape — it writes nothing. Drop
the result into the Studio editor, validate, and import it as drafts like any
other batch. The `sourceUrl` field is optional and, when given, is applied to
every extracted card so they arrive publishable; left blank, the cards are
flagged as needing a source. The model is instructed never to invent URLs.
Because extraction is non-deterministic, the human approval step is what keeps
an inaccurate card from reaching learners.

PDFs are handed to the model as a native document block. The model cannot read
the `.docx` container, so Word files are converted to text first (via the
shared `loaders.load_as_text`, which also reads table cells) and sent as a plain
prompt; very long documents are truncated before the call.

## Storage

The initial repository is an atomic JSON content store at
`data/nurseflow/question-bank.json`. For deployment, set
`NURSEFLOW_CONTENT_PATH` to a mounted persistent volume; do not keep this file
only on ephemeral application storage.

When R2 is configured, the store is also mirrored to the bucket
(`nurseflow/question-bank.json`) and read from it first, with the local file as
a write-through cache. See [r2-storage-setup.md](r2-storage-setup.md).

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
