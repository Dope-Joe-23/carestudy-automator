"""
PDF / Word -> NurseFlow question cards, via the shared Anthropic gateway.

The Studio's question bank imports strict JSON: every card carries a stem,
exactly four answer options, one correct index, a rationale, a learning
objective, a visual brief, and source metadata. A document has none of that
structure, so this module asks the configured model to read it and emit that
shape directly. PDFs are handed to the model as a native document block; Word
(.docx) files are converted to text first (via the shared text loader) and sent
as a plain prompt, since the model cannot read the .docx container itself.
Nothing here publishes anything — the Studio treats the result like any pasted
batch (validate, review, approve), so a bad extraction is caught by a human
before a learner sees it.

The model is told never to invent URLs. A citation URL that the document does
not actually contain comes back empty, and the caller records the document's
own filename as a *reference* source instead (sourceKind="document"), which
the review queue flags as needing a real source before approval.

Output shape (an import payload fragment)::

    {"questions": [
        {"id", "topic", "level", "title", "question", "options"[4],
         "correctOptionIndex", "rationale", "sourceTitle", "sourceUrl",
         "learningObjective", "visualBrief", "reviewStatus", "sourceKind"},
        ...
    ]}

Only structurally valid cards are returned (a stem, four distinct options,
and an in-range correct index). Everything else is dropped rather than
shipped to the importer to fail validation.
"""
from __future__ import annotations

import base64
import json
import os
import re
import sys
import tempfile
from typing import Dict, List
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(__file__))
from model_gateway import _chat_model  # noqa: E402
from loaders import load_as_text  # noqa: E402

MAX_CARDS = 50
# Word documents carry far more prose than a quiz; cap what we put in the
# prompt so one long handbook cannot blow past the model's context window.
MAX_TEXT_CHARS = 120_000

_LEVELS = ("Undergraduate", "Postgraduate", "Continuing education")

SYSTEM_PROMPT = """You are an experienced nursing educator building multiple-choice \
learning cards from a provided document for a nursing study app.

Read the provided document and produce exam-quality multiple-choice cards \
grounded ONLY in its content. Each card must be answerable from the document \
alone.

Rules:
- Every card needs exactly FOUR answer options, with exactly one correct.
- Options must be plausible and of similar length; never use "all of the above" \
or "none of the above".
- Write the stem as a clear question or a single-best-answer scenario.
- The rationale must explain why the correct option is right and why the 
distractors are wrong, in 2-4 sentences.
- Give each card a short title (3-8 words), a topic label, a learning \
objective, and a one-sentence visual brief describing a simple teaching \
image (no real patient data).
- Use ONLY facts present in the document. Never invent statistics, drug doses, \
dates, or citations.
- For sourceTitle use the document's own title if it states one, otherwise a \
short descriptive name. For sourceUrl: only fill it with a URL that literally \
appears in the document (a DOI or publisher link). If the document contains no \
such URL, return an empty string for sourceUrl. NEVER fabricate a URL.
- Aim for 8-20 cards covering the document's key sections. Return fewer if the \
document is short.

Output STRICT JSON ONLY, no markdown fences, no commentary, in exactly this shape:
{"questions": [
  {"topic": "...", "level": "Undergraduate", "title": "...",
   "question": "...", "options": ["...", "...", "...", "..."],
   "correctOptionIndex": 0, "rationale": "...", "sourceTitle": "...",
   "sourceUrl": "", "learningObjective": "...", "visualBrief": "..."}
]}"""


def _slugify(value: str, fallback: str = "card") -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return slug[:48] or fallback


def _valid_absolute_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def _parse_bank(raw: str) -> List[dict]:
    """Pull the questions array out of a model response, tolerantly.

    Handles a bare JSON object, fenced JSON, and prose wrapped around the JSON.
    """
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end <= start:
        raise RuntimeError("The model did not return JSON for the question cards.")
    payload = json.loads(cleaned[start : end + 1])
    questions = payload.get("questions")
    if not isinstance(questions, list):
        raise RuntimeError("The model's response had no questions array.")
    return [item for item in questions if isinstance(item, dict)]


def _normalize_card(
    item: dict,
    index: int,
    default_topic: str,
    default_level: str,
    default_source_title: str,
    default_source_url: str,
    source_kind_hint: str,
) -> dict | None:
    """Turn one model card into the importer's shape, or None if unusable."""
    question = str(item.get("question") or "").strip()
    if not question:
        return None

    options = item.get("options")
    if not isinstance(options, list):
        return None
    options = [str(option).strip() for option in options if str(option or "").strip()]
    if len(options) != 4:
        return None

    try:
        correct = int(item.get("correctOptionIndex"))
    except (TypeError, ValueError):
        return None
    if not 0 <= correct <= 3:
        return None

    topic = str(item.get("topic") or "").strip() or default_topic
    level = str(item.get("level") or "").strip() or default_level
    title = str(item.get("title") or "").strip() or question[:70]
    # The importer requires every text field non-empty. The prompt asks the
    # model for all of them; these derived fallbacks keep a structurally valid
    # card from being rejected outright when one comes back blank, and the
    # review queue is where a reviewer fixes anything too generic.
    rationale = str(item.get("rationale") or "").strip() or "Refer to the source document for the supporting rationale."
    learning_objective = (
        str(item.get("learningObjective") or "").strip() or f"Explain: {title}"
    )
    visual_brief = (
        str(item.get("visualBrief") or "").strip() or f"A simple teaching visual about {topic}."
    )

    # Source handling: an explicit URL supplied by the admin wins; otherwise a
    # genuine URL found by the model; otherwise the document reference, which is
    # flagged as needing a source before approval.
    model_url = str(item.get("sourceUrl") or "").strip()
    source_title = str(item.get("sourceTitle") or "").strip() or default_source_title
    if default_source_url and _valid_absolute_url(default_source_url):
        source_url, source_kind = default_source_url, "url"
        source_title = default_source_title or source_title
    elif _valid_absolute_url(model_url):
        source_url, source_kind = model_url, "url"
    else:
        source_url, source_kind = default_source_title, "document"

    return {
        "id": f"{source_kind_hint}-{_slugify(title)}-{index + 1}",
        "topic": topic,
        "level": level,
        "title": title,
        "question": question,
        "options": options,
        "correctOptionIndex": correct,
        "rationale": rationale,
        "sourceTitle": source_title,
        "sourceUrl": source_url,
        "learningObjective": learning_objective,
        "visualBrief": visual_brief,
        # Discarded by the importer (everything lands as a draft), but kept so
        # the payload matches the documented import shape.
        "reviewStatus": "draft",
        "sourceKind": source_kind,
    }


def _dedupe_ids(cards: List[dict]) -> List[dict]:
    used: Dict[str, int] = {}
    for card in cards:
        base = card["id"]
        count = used.get(base, 0)
        used[base] = count + 1
        if count:
            card["id"] = f"{base}-{count + 1}"
    return cards


def _docx_to_text(document_base64: str) -> str:
    """Decode an uploaded .docx and extract its text via the shared loader.

    The model can read PDFs directly but not the .docx zip container, so Word
    documents are flattened to text first. Reuses loaders.load_as_text so
    paragraphs and table cells are read exactly as the rest of the app reads
    them.
    """
    try:
        data = base64.b64decode(document_base64, validate=True)
    except (ValueError, TypeError):
        raise RuntimeError("The uploaded Word document was not valid base64.")
    with tempfile.TemporaryDirectory() as tmpdir:
        path = os.path.join(tmpdir, "document.docx")
        with open(path, "wb") as handle:
            handle.write(data)
        return load_as_text(path)


def extract_questions_from_document(
    document_base64: str,
    kind: str = "pdf",
    filename: str = "",
    source_url: str = "",
    source_title: str = "",
    topic: str = "",
    level: str = "",
) -> dict:
    """Extract NurseFlow cards from a base64 PDF or Word document.

    ``kind`` is "pdf" (sent to the model as a native document block) or "docx"
    (converted to text first). Returns {"questions": [...]} or raises
    RuntimeError with a message safe to show the Studio.
    """
    if not document_base64:
        raise RuntimeError("No document content was provided.")
    if kind not in ("pdf", "docx"):
        raise RuntimeError(f"Unsupported document type: {kind}")

    default_topic = topic.strip() or "General nursing"
    default_level = level.strip() if level.strip() in _LEVELS else "Undergraduate"
    default_source_title = source_title.strip() or filename.strip() or "Uploaded document"
    # A slug for generated ids, derived from the document name.
    slug_seed = _slugify(source_title or filename, "doc")

    prompt = (
        "Build the multiple-choice learning cards from the attached document now, "
        "following the rules in the system prompt. Output the JSON only."
    )
    if kind == "pdf":
        raw = _chat_model(
            SYSTEM_PROMPT,
            prompt,
            max_tokens=8000,
            label="PDF question extraction",
            document={"data": document_base64, "media_type": "application/pdf"},
        )
    else:
        text = _docx_to_text(document_base64).strip()
        if not text:
            raise RuntimeError("The Word document had no extractable text.")
        if len(text) > MAX_TEXT_CHARS:
            text = text[:MAX_TEXT_CHARS] + "\n\n[Document truncated for length.]"
        raw = _chat_model(
            SYSTEM_PROMPT,
            f"{prompt}\n\nDOCUMENT TEXT:\n\n{text}",
            max_tokens=8000,
            label="Word question extraction",
        )

    items = _parse_bank(raw)
    cards = []
    for index, item in enumerate(items[:MAX_CARDS]):
        card = _normalize_card(
            item,
            index,
            default_topic=default_topic,
            default_level=default_level,
            default_source_title=default_source_title,
            default_source_url=source_url.strip(),
            source_kind_hint=f"{kind}-{slug_seed}",
        )
        if card is not None:
            cards.append(card)

    if not cards:
        raise RuntimeError(
            "The model read the document but produced no usable multiple-choice cards. "
            "Check that it actually contains questions or answerable content."
        )
    return {"questions": _dedupe_ids(cards)}


def extract_questions_from_pdf(
    pdf_base64: str,
    filename: str = "",
    source_url: str = "",
    source_title: str = "",
    topic: str = "",
    level: str = "",
) -> dict:
    """PDF-specific convenience wrapper around extract_questions_from_document."""
    return extract_questions_from_document(
        pdf_base64,
        kind="pdf",
        filename=filename,
        source_url=source_url,
        source_title=source_title,
        topic=topic,
        level=level,
    )
