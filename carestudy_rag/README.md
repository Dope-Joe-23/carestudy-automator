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

## 1. Add your source material

- Put one or more **past care studies** (`.doc`, `.docx`, `.pdf`, or `.txt`) in
  `data/templates/`. Your uploaded `ALL__NEW_CHAPTERS.doc` is already there as an
  example — add more past ones if you have them, for a richer style reference.
- Put **reference material** (textbook chapters, BNF/drug formulary PDFs, a
  NANDA-I nursing diagnosis handbook, pathophysiology references) in
  `data/reference/`.

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

If `ANTHROPIC_API_KEY` isn't set, both modes run in **dry-run mode**: they show you
what was retrieved but skip generation, so you can sanity-check retrieval quality
for free before spending API calls.

## Project layout

```
carestudy_rag/
├── data/
│   ├── templates/          # past care studies (style/structure source)
│   ├── reference/          # textbooks, formularies (factual source)
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
- Consider keeping a log of which reference source backed each generated section,
  so drug names/dosages can be checked against the actual source before submission.

## Upgrading retrieval

TF-IDF works well once you have a handful of source documents. If your reference
library grows large (many textbooks) and retrieval quality drops, swap `retrieval.py`
to use real embeddings:
- `pip install sentence-transformers` (or use Voyage/OpenAI embeddings via API)
- replace `TfidfVectorizer` + `cosine_similarity` with embedding vectors + a vector
  store like Chroma or pgvector.
The rest of the pipeline (chunking, prompting, guardrails) stays the same.
