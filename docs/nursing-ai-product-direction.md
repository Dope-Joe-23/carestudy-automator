# Nursing AI Product Direction

## Executive recommendation

Build a nursing-focused learning and study assistant around an existing capable
language model, a trustworthy, searchable nursing knowledge base, and structured
student workflows. Do **not** fine-tune or train a model as the first step.

The product should aim to be more useful for specific nursing-school tasks than
a general-purpose chatbot—not claim to outperform ChatGPT or Claude at every
task. Its advantage should come from evidence-grounded answers, nursing-aware
workflows, transparent citations, and support for the student's own materials.

## Product vision

Help nursing students and, over time, practicing nurses move from a question,
assignment brief, or set of study materials to an organized, well-supported,
reviewable result. Examples include:

- Developing and reviewing a patient/family care study.
- Understanding a nursing or medical topic using reliable sources.
- Planning an assignment or presentation.
- Summarizing and studying material the user is permitted to access.
- Creating revision questions from course materials.

The assistant should teach and support the user's work. It should not obscure
the evidence, invent clinical facts, or encourage users to submit unreviewed AI
output as their own work.

## First release: source-backed care-study assistant

Start with one end-to-end workflow: help a nursing student draft and improve a
care-study section using the student's notes and relevant, retrievable sources.

The first release should let a student:

1. Ask a question or choose a care-study task.
2. Provide or import relevant notes and learning materials.
3. Retrieve relevant passages from approved sources and those materials.
4. Receive a structured, editable draft grounded in the supplied facts and
   retrieved evidence.
5. Inspect citations and source passages, then accept, edit, or reject
   suggestions.
6. See a clear notice when the available evidence or patient information is
   insufficient.

Patient-specific facts must come from the student's supplied information, not
from model-generated assumptions. Clinical suggestions must be presented as
educational assistance for review, not as a substitute for professional
judgment.

## Why this direction

Fine-tuning is not the right first way to give a model reliable medical
knowledge. Model training does not provide citations for each claim, and
updating clinical facts in model weights is harder than updating a maintained
source collection. Fine-tuning may later help with narrow, measurable needs
such as consistent formatting or output structure, but it should not be the
knowledge base.

An open-weight model may avoid a per-request API charge, but it is not
automatically free to operate. Hosting, suitable hardware, monitoring,
maintenance, evaluation, and upgrades all have costs. Begin with an existing
model behind the project's model gateway and compare options using the same
nursing-task evaluation set.

The product's core system should combine:

- **A model** for interpreting the request, explaining concepts, and drafting.
- **Retrieval** for finding relevant passages in trusted sources and user
  materials.
- **Structured workflows** that constrain tasks to useful nursing formats.
- **Source presentation** so users can inspect the evidence behind a response.
- **Human review** for clinical, academic, and patient-specific content.

## Fit with the current project

The repository already contains a care-study RAG engine with separate template
and reference indexes, a model gateway, document ingestion, and a study
assistant endpoint. These are useful foundations for the MVP. The reference
retrieval currently uses TF-IDF, so retrieval quality and citation behavior
should be measured before replacing it or adding more infrastructure.

The student experience can move toward a chat-first workspace without removing
the current feature pages. Chat should act as the front door to specialized
workflows; existing tools and pages should remain reachable and preserve their
useful behavior.

## Recommended implementation sequence

### Phase 1: Define the evaluation set

Collect a small, representative set of care-study tasks and source materials.
For each task, record what a strong answer should contain, which sources are
appropriate, and which claims or patient facts must not be invented. Have a
qualified nursing educator review the expected outputs.

Use this same set to compare models and retrieval changes. Evaluate at least:

- Clinical and nursing factual accuracy.
- Whether patient facts are traceable to the provided notes.
- Citation correctness and relevance.
- Retrieval of the right source passages.
- Required structure and usefulness of the draft.
- Appropriate uncertainty when evidence is missing.
- Response time and cost.

### Phase 2: Improve evidence retrieval

Test the current TF-IDF retrieval against the evaluation set. Improve search
only where the results show a real gap; candidate approaches include semantic
or hybrid search. Keep source metadata and passage-level citations intact, and
provide a way to verify that cited passages support the answer.

Only ingest material that the project is permitted to use. A source being
available online does not by itself grant permission to copy or redistribute
it.

### Phase 3: Connect retrieval to drafting

Use the existing model gateway to draft from retrieved passages and the
student's own notes. Require the assistant to distinguish source-supported
information from student-provided patient facts, avoid filling missing clinical
details with guesses, and disclose when it cannot find adequate evidence.

Keep outputs editable and make proposed changes explicit. Do not silently
overwrite student work.

### Phase 4: Introduce the chat-first workspace

Make conversation the primary way to start a task, while preserving navigation
to current pages and tools. Route requests into defined actions such as
care-study drafting, evidence search, or document summarization rather than
relying on one unstructured prompt to do everything.

### Phase 5: Expand based on results

After the care-study workflow performs reliably, add adjacent workflows such
as assignment planning, presentation outlines, research summaries, or revision
questions. Evaluate each one separately before making it broadly available.

## Model strategy

1. Keep the current provider integration behind the model gateway.
2. Compare a small number of hosted models using the same evaluation set,
   including cost, quality, latency, citation behavior, and data-handling terms.
3. Consider self-hosting an open-weight model only if measured product needs,
   privacy requirements, or usage economics justify its operational burden.
4. Consider fine-tuning only when evaluation reveals a persistent,
   well-defined problem that prompting and retrieval cannot solve.
5. If fine-tuning is justified, use lawful, high-quality, educator-reviewed
   examples and measure performance against a held-out evaluation set. Do not
   use fine-tuning as a substitute for current clinical references.

## Safety, privacy, and content responsibilities

- Treat clinical outputs as educational drafts that require human review.
- Do not invent patient history, observations, diagnoses, or outcomes.
- Make source attribution visible and distinguish evidence from generated
  explanation.
- Protect uploaded files and patient-related information with appropriate
  access controls, retention limits, and secure handling.
- Encourage de-identification and avoid collecting patient information that
  is not needed for the task.
- Respect copyright, license terms, and institutional restrictions for books,
  articles, taxonomies, and course materials.
- Establish educator review and correction processes for curated learning
  content.
- Set clear academic-integrity expectations for student use.

## Out of scope for the first release

- Training a foundation model from scratch.
- Fine-tuning before there is a measured need and a lawful training dataset.
- Replacing every current application page with chat.
- Claiming the assistant is a clinical decision-maker or a replacement for
  educators, clinicians, or authoritative guidance.
- Supporting every nursing or medical workflow before the first one is
  evaluated.

## Success criteria for the MVP

The MVP is ready to expand when it can consistently:

- Retrieve relevant, permitted source passages for representative tasks.
- Produce useful care-study drafts without fabricating patient-specific facts.
- Provide citations that reviewers can verify against the original material.
- Acknowledge insufficient evidence instead of presenting unsupported claims
  as fact.
- Preserve the student's ability to edit and control their work.
- Meet agreed educator-reviewed quality and cost targets on the evaluation set.

The immediate next action is to assemble and review the initial care-study
evaluation set, then use it to guide retrieval, model, and interface decisions.
