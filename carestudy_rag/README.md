# Care Study Drafting Assistant

A RAG tool that helps draft nursing Patient/Family Care Study sections **from your own
clinical notes**, using past care studies as a structure/style reference and textbooks
or formularies as a factual reference.

It does **not** invent patient facts. If you don't provide notes for a section, it
tells you instead of making something up.

## How it works

```
your patient notes  ─┐
                      ├─► Claude drafts the section, in the right style,
past care studies    ─┤    grounded in real reference material
(structure/style)     │
                      │
textbooks/formulary  ─┘
(facts)
```

Two separate retrieval indexes:
- **Template index**: built from `data/templates/` — past care studies, used to
  retrieve example passages showing the expected structure/tone for a given heading.
- **Reference index**: built from `data/reference/` — textbooks, drug formularies,
  NANDA diagnosis handbooks, etc., used to retrieve factual grounding for clinical
  claims (drug info, pathophysiology, standard interventions).

Retrieval uses TF-IDF (scikit-learn) — no model downloads, runs instantly, good
enough for this corpus size. Swap in real embeddings later if you outgrow it (see
"Upgrading retrieval" below).

## Setup

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...    # get one at console.anthropic.com
```

The engine reads these env vars:

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Anthropic key (required unless `ANTHROPIC_AUTH_TOKEN` is set) |
| `ANTHROPIC_AUTH_TOKEN` | — | Alternative auth for Anthropic-compatible gateways (e.g. OpenRouter) — sent as `Authorization: Bearer` |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | API endpoint override |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Model override |

### Free option: OpenRouter free models

If you don't have Anthropic credits, point the engine at OpenRouter's free-tier
models (no payment method needed):

1. Sign up at **openrouter.ai** and create a key at **openrouter.ai/keys**.
2. Set the env vars before starting the server:
   ```bash
   export ANTHROPIC_AUTH_TOKEN=sk-or-...            # your OpenRouter key
   export ANTHROPIC_BASE_URL=https://openrouter.ai/api
   export ANTHROPIC_MODEL=openai/gpt-oss-20b:free   # or openrouter/free, google/gemma-4-31b-it:free, ...
   ```
3. Free models are rate-limited to 50 requests/day per account; use
   `openrouter/free` as the model to auto-pick an available free model.

## 1. Add your source material

- Put one or more **past care studies** (`.doc`, `.docx`, `.pdf`, or `.txt`) in
  `data/templates/`. Your uploaded `ALL__NEW_CHAPTERS.doc` is already there as an
  example — add more past ones if you have them, for a richer style reference.
- Put **reference material** (textbook chapters, BNF/drug formulary PDFs, a
  NANDA-I nursing diagnosis handbook, pathophysiology references) in
  `data/reference/`.

  A starter library is already bundled there — see `data/reference/SOURCES.txt`
  for full attribution:
  - **22 open-licensed Wikipedia articles** (pneumonia, hypertension, sickle
    cell disease, malaria, ceftriaxone, paracetamol, metformin, nursing
    process/diagnosis, etc.), CC BY-SA 4.0. `scripts_fetch_reference.py` adds
    more topics — edit its `TOPICS` dict and re-run.
  - **8 WHO fact sheets** (asthma, diabetes, hypertension, malaria,
    tuberculosis, pneumonia, sickle-cell disease, anaemia), CC BY-NC-SA 3.0
    IGO — cited in-text as `(WHO, 2026)` exactly like the sample care
    studies. `scripts_fetch_who.py` refreshes them or picks up newer editions.

  **Citations:** every file in `data/reference/` should have an entry in
  `data/reference/citations.json` mapping it to a citable title and URL.
  Drafts then cite sources in-text (like the sample care studies) and return
  the reference list with each draft so it can be stored and printed.

### Citing textbooks you own (Potter & Perry, NANDA-I)

Copyrighted textbooks **cannot be bundled** into the library — but you can add
short excerpts from copies you lawfully own, and the engine will cite them in
the same style as the samples. Per source:

1. Save the excerpt as a `.txt` in `data/reference/` (e.g. `potter_perry.txt`).
   Keep it to the passages you actually need and note the page numbers.
2. Register it in `citations.json` with a `citeKey` — that's what drafts use
   in-text:

   ```json
   "potter_perry.txt": {
     "title": "Fundamentals of Nursing",
     "author": "Potter, P. A., Perry, A. G., Stockert, P., & Hall, A.",
     "year": 2021,
     "citeKey": "Potter & Perry",
     "venue": "11th ed., Elsevier",
     "url": ""
   },
   "nanda.txt": {
     "title": "Nursing Diagnoses: Definitions and Classification",
     "author": "NANDA International",
     "year": 2021,
     "citeKey": "NANDA-I",
     "venue": "12th ed., Thieme",
     "url": ""
   }
   ```

   Drafts then cite them as `(Potter & Perry, 2021)` and `(NANDA-I, 2021)`,
   with full reference-list entries built from the same metadata.
3. Rebuild the index: `python src/ingest_reference.py "data/reference/*"`.

## 2. Build the indexes

```bash
python src/ingest_template.py "data/templates/*"
python src/ingest_reference.py "data/reference/*"
```

Re-run these any time you add new source documents.

## 3. Draft a section

### Command line
```bash
python src/generate.py --heading "1.2 Family's Medical/Surgical History" --notes my_notes.txt
```

### Web UI (recommended)
```bash
streamlit run src/app.py
```
Opens a form with one expandable box per section across all 6 chapters. Paste your
notes for a section, click "Draft this section," review, edit, repeat.

If neither `ANTHROPIC_API_KEY` nor `ANTHROPIC_AUTH_TOKEN` is set, both modes run
in **dry-run mode**: they show you what was retrieved but skip generation, so you
can sanity-check retrieval quality for free before spending API calls.

### Server mode: persistent worker

The React/Express app drafts through a **long-lived worker** (`src/draft_worker.py`)
instead of the one-shot CLI. It loads the retrieval indexes exactly once at startup
and then serves one draft request per JSON line on stdin — so the ~30s index reload
that every CLI invocation pays is only paid once per server run. Requests are sent
as `{"id", "heading", "notes", "tabular"}` lines; responses come back on stdout as
`{"id", "draft", "references"}` or `{"id", "error"}`. All env vars above
(`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`,
`ANTHROPIC_MODEL`) apply unchanged.

## Project layout

```
carestudy_rag/
├── data/
│   ├── templates/          # past care studies (style/structure source)
│   ├── reference/          # textbooks, formularies + citations.json (factual source)
│   ├── template_index.pkl  # built by ingest_template.py
│   └── reference_index.pkl # built by ingest_reference.py
├── src/
│   ├── loaders.py          # .doc/.docx/.pdf/.txt -> plain text
│   ├── chunker.py          # splits care studies into chapter/subsection chunks
│   ├── reference_chunker.py# splits reference docs into ~350-word overlapping chunks
│   ├── retrieval.py        # TF-IDF index (build/query/save/load)
│   ├── ingest_template.py  # CLI: build the template index
│   ├── ingest_reference.py # CLI: build the reference index
│   ├── generate.py         # retrieval + Claude drafting, with the grounding prompt
│   ├── draft_worker.py     # persistent server worker (index loaded once, JSON-lines protocol)
│   └── app.py               # Streamlit UI
└── requirements.txt
```

## Guardrails built in

- **No notes, no draft.** `draft_section()` refuses to write a section with empty
  patient notes rather than inventing a patient.
- **System prompt instructs Claude** to source every patient-specific fact from the
  notes only, and to flag (not guess) when reference material doesn't cover a claim.
- **Dry-run mode** lets you inspect exactly what template/reference chunks would be
  used before any generation happens — useful for spot-checking that retrieval is
  pulling the right material.
- **Citations are returned with every draft.** The engine cites the reference
  sources it was grounded on in-text (never fabricating a citation) and returns
  the full reference list alongside the draft, so the app can store it with the
  study and print it as the document's REFERENCES section. Drug names/dosages
  can still be checked against the actual source before submission.

## Upgrading retrieval

TF-IDF works well once you have a handful of source documents. If your reference
library grows large (many textbooks) and retrieval quality drops, swap `retrieval.py`
to use real embeddings:
- `pip install sentence-transformers` (or use Voyage/OpenAI embeddings via API)
- replace `TfidfVectorizer` + `cosine_similarity` with embedding vectors + a vector
  store like Chroma or pgvector.
The rest of the pipeline (chunking, prompting, guardrails) stays the same.
