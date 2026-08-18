"""
Viva Preparation — build a practice question bank from a completed care study.

The viva (defense) is where a student must answer for every chapter of their
Patient/Family Care Study. This module takes the full text of the delivered
study and asks the drafting model to act as a nursing examination panel: it
produces a structured set of questions the panel would plausibly ask, each
with a guidance outline the student can compare against, organised by the
categories Ghanaian panels actually probe (assessment, the condition, the
nursing care plan, interventions and rationale, medications, health
education, citations, and reflection).

The output is strict JSON (parsed defensively below) so the app can drive a
mock-defense session from it: one question at a time, answer, reveal
guidance, self-rate.
"""
import ast
import json
import os
import re
import sys

# A study is far longer than any prompt should carry whole; keep the richest
# material (drafts are the substance of the defense) and cap what we send.
MAX_STUDY_CHARS = 60_000

CATEGORIES = [
    "Patient & Assessment",
    "The Condition",
    "Nursing Care Plan",
    "Interventions & Rationale",
    "Medications & Investigations",
    "Health Education & Discharge",
    "Citations & Evidence",
    "Reflection & Viva Skills",
]

SYSTEM_PROMPT = """You are the chair of a nursing examination panel preparing a final-year \
student nurse for the viva voce defense of their Patient/Family Care Study. The student \
completed a full written care study and must now defend it before their college's panel. \
Your job is to build the question bank the panel would use.

You will be given the text of the student's completed care study.

Rules:
- Write questions the panel would ACTUALLY ask about THIS study — its patient, its \
diagnoses, its care plan, its interventions, its citations. Never generic textbook \
questions that could apply to any study.
- Questions must be answerable from the study itself (plus standard nursing knowledge). \
Every question must be one the student can prepare for by re-reading their own work.
- Cover the breadth of a real defense. Aim for 12-16 questions spread across these \
categories: Patient & Assessment; The Condition; Nursing Care Plan; Interventions & \
Rationale; Medications & Investigations; Health Education & Discharge; Citations & \
Evidence; Reflection & Viva Skills. Include at least one question per category, and put \
most weight on the nursing care plan and interventions, where panels probe hardest.
- For each question give:
  - "question": the exact question the panel member would ask, phrased as a spoken \
question, not a topic.
  - "guidance": a bullet-style outline (4-8 short points) of what a strong answer \
covers, written specifically for THIS study (name the actual diagnosis, interventions, \
rationales, and sources from the study where possible).
  - "tip": one short sentence of viva craft for this question (e.g. how to structure \
the answer, what trap to avoid, what to have on the tip of your tongue).
- Cite the study's own sources where relevant (e.g. "Be ready to quote your WHO fact \
sheet"). Never invent sources that are not in the study.
- Output STRICT JSON ONLY: a single JSON object with one key "questions" holding an \
array of objects, each with exactly "category", "question", "guidance", and "tip". \
No markdown fences, no commentary before or after the JSON."""


def _build_study_text(title: dict, chapters: list) -> str:
    """Flatten a stored study snapshot into the text the panel reads.

    The server stores the full workspace snapshot (title metadata + chapters of
    sections with their collected fields, notes, and drafts). Drafts are the
    substance of the defense; collected field data and notes give context.
    """
    parts = []
    for key, label in (
        ("patientName", "Patient"),
        ("diagnosis", "Diagnosis"),
        ("collegeName", "College"),
        ("collegeLocation", "College location"),
        ("year", "Year"),
    ):
        value = title.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(f"{label}: {value.strip()}")
    if parts:
        parts.append("")

    for chapter in chapters or []:
        name = chapter.get("name") or ""
        if name:
            parts.append(f"## {name}")
        intro = chapter.get("intro")
        if isinstance(intro, str) and intro.strip():
            parts.append(f"[Chapter introduction] {intro.strip()}")
        for section in chapter.get("sections") or []:
            heading = section.get("heading") or section.get("id") or ""
            draft = section.get("draft")
            notes = section.get("notes")
            data = section.get("data")
            if heading:
                parts.append(f"\n### {heading}")
            if isinstance(draft, str) and draft.strip():
                parts.append(draft.strip())
            if isinstance(notes, str) and notes.strip():
                parts.append(f"[Student notes: {notes.strip()}]")
            if data and isinstance(data, dict):
                filled = [
                    f"{label}: {value.strip()}"
                    for label, value in data.items()
                    if isinstance(value, str) and value.strip()
                ]
                if filled:
                    parts.append(" | ".join(filled))
    text = "\n\n".join(parts)
    if len(text) > MAX_STUDY_CHARS:
        text = text[:MAX_STUDY_CHARS] + "\n\n[Study text truncated for length.]"
    return text


def _normalize_guidance(value: str) -> str:
    """Turn a list-shaped guidance string into bullet lines.

    Models sometimes render the guidance outline as a Python/JSON array
    literal (e.g. "['Point A', 'Point B']") instead of bullet text. Detect
    that shape and convert it to "• Point A\n• Point B" so the student sees
    an outline, not a raw literal.
    """
    stripped = value.strip()
    if stripped.startswith("[") and stripped.endswith("]"):
        try:
            # Models often render the outline as a Python literal with single
            # quotes (['A', "B's"]), which JSON.parse rejects — ast.literal_eval
            # handles every Python literal shape correctly.
            items = ast.literal_eval(stripped)
        except (ValueError, SyntaxError):
            items = None
        if isinstance(items, list) and items:
            lines = []
            for item in items:
                text = str(item).strip()
                if text:
                    lines.append(f"\u2022 {text}")
            if lines:
                return "\n".join(lines)
    return value


def _parse_bank(raw: str) -> dict:
    """Extract the questions array from a model response, tolerantly.

    Models sometimes wrap JSON in markdown fences or add a trailing sentence.
    We strip fences, cut to the first '{' / last '}', and validate the shape —
    anything that does not parse cleanly becomes an explicit error instead of
    silently corrupting the student's practice session.
    """
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end <= start:
        raise RuntimeError("The model did not return JSON for the viva question bank.")
    payload = json.loads(cleaned[start : end + 1])
    questions = payload.get("questions")
    if not isinstance(questions, list) or not questions:
        raise RuntimeError("The viva question bank came back empty.")
    normalized = []
    for raw_q in questions:
        if not isinstance(raw_q, dict):
            continue
        question = str(raw_q.get("question") or "").strip()
        if not question:
            continue
        category = str(raw_q.get("category") or "Reflection & Viva Skills").strip()
        guidance = _normalize_guidance(str(raw_q.get("guidance") or "").strip())
        tip = str(raw_q.get("tip") or "").strip()
        normalized.append({"category": category, "question": question, "guidance": guidance, "tip": tip})
    if not normalized:
        raise RuntimeError("The viva question bank came back empty.")
    return {"questions": normalized}


def generate_viva_bank(title: dict, chapters: list) -> dict:
    """Generate the question bank for a completed study (strict JSON).

    Returns {"questions": [...]} or raises with a student-facing message when
    the engine is not configured or the model returns unusable output.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    auth_token = os.environ.get("ANTHROPIC_AUTH_TOKEN")
    if not api_key and not auth_token:
        raise RuntimeError(
            "The viva question bank needs the AI engine to be configured "
            "(set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN) — no key is present."
        )

    import anthropic

    client_kwargs: dict = {
        "base_url": os.environ.get("ANTHROPIC_BASE_URL") or "https://api.anthropic.com",
    }
    if auth_token:
        client_kwargs["auth_token"] = auth_token
    else:
        client_kwargs["api_key"] = api_key

    client = anthropic.Anthropic(**client_kwargs)

    study_text = _build_study_text(title, chapters)
    prompt = (
        "STUDENT'S COMPLETED CARE STUDY:\n\n"
        + study_text
        + "\n\nBuild the viva question bank for this study now, "
        "following the rules in the system prompt. Output the JSON only."
    )

    response = client.messages.create(
        model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
        max_tokens=4000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = "".join(block.text for block in response.content if block.type == "text")
    if not raw.strip():
        raise RuntimeError("The AI model returned an empty response — please try again.")
    return _parse_bank(raw)


if __name__ == "__main__":
    # CLI for quick manual testing: pipe a JSON snapshot (the shape stored in
    # the studies table: { title, chapters }) on stdin.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    snapshot = json.loads(sys.stdin.read())
    bank = generate_viva_bank(snapshot.get("title") or {}, snapshot.get("chapters") or [])
    print(json.dumps(bank, ensure_ascii=False, indent=2))
