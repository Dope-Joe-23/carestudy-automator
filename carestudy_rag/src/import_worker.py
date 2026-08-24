"""
Parse a pasted or uploaded care study document into the standard chapter/section
structure used by the CareStudy editor.

The AI reads the raw text and returns a JSON object with chapters, each
containing sections with heading + content. The frontend then distributes
this into the study's chapter scaffold.
"""
import json
import os
import sys
import time
from typing import Any


# The standard chapter structure matching the NMC Ghana care study format.
CHAPTER_NAMES = [
    "Preliminary Pages",
    "Assessment",
    "Analysis of Data",
    "Planning",
    "Implementation",
    "Evaluation",
    "Summary and Conclusion",
]


def _make_client():
    import anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    auth_token = os.environ.get("ANTHROPIC_AUTH_TOKEN")
    if not api_key and not auth_token:
        raise RuntimeError("No AI API key is configured for document import.")

    kwargs: dict[str, Any] = {
        "base_url": os.environ.get("ANTHROPIC_BASE_URL") or "https://api.anthropic.com",
    }
    if auth_token:
        kwargs["auth_token"] = auth_token
    else:
        kwargs["api_key"] = api_key
    return anthropic.Anthropic(**kwargs)


def _candidate_models() -> list[str]:
    primary = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
    configured = [
        m.strip()
        for m in os.environ.get("ANTHROPIC_FALLBACK_MODELS", "").split(",")
        if m.strip()
    ]
    base_url = os.environ.get("ANTHROPIC_BASE_URL") or "https://api.anthropic.com"
    fallbacks = configured or (
        ["openrouter/free"]
        if "openrouter.ai" in base_url and primary != "openrouter/free"
        else []
    )
    return list(dict.fromkeys([primary, *fallbacks]))


def import_study(raw_text: str) -> dict:
    """Parse a pasted/uploaded care study document into structured chapters.

    Returns::

        {
          "title": { "patientName": "...", "diagnosis": "...", ... },
          "chapters": [
            {
              "name": "Assessment",
              "sections": [
                { "heading": "Patient's Particulars", "content": "..." },
                ...
              ]
            },
            ...
          ]
        }
    """
    # Truncate very long documents so the prompt stays within context limits.
    # 80k chars is roughly 20k tokens — generous for a care study.
    if len(raw_text) > 80_000:
        raw_text = raw_text[:80_000] + "\n\n[...document truncated at 80 000 characters...]"

    client = _make_client()
    models = _candidate_models()

    system = (
        "You are a document-structuring assistant for nursing care studies. "
        "The user will paste the full text of an existing care study document. "
        "Your job is to parse it into the standard NMC Ghana care study structure.\n\n"
        "You MUST return ONLY a valid JSON object with this exact shape — no markdown fences, no commentary:\n"
        "{\n"
        '  "title": {\n'
        '    "patientName": "", "diagnosis": "", "studentName": "",\n'
        '    "indexNumber": "", "collegeName": "", "collegeLocation": "", "year": ""\n'
        "  },\n"
        '  "chapters": [\n'
        "    {\n"
        f'      "name": "one of {CHAPTER_NAMES}",\n'
        '      "sections": [\n'
        '        { "heading": "Section heading", "content": "Full text for this section" }\n'
        "      ]\n"
        "    }\n"
        "  ]\n"
        "}\n\n"
        "Rules:\n"
        "- Map the document's content to the correct chapter. The standard chapters are: "
        + ", ".join(CHAPTER_NAMES) + "\n"
        "- Each section's 'content' should be the FULL paragraph text for that section, "
        "not a summary. Preserve the student's original wording.\n"
        "- Extract the title page fields (patient name, diagnosis, student name, etc.) "
        "from the document if present.\n"
        "- If a chapter has no matching content in the document, include it with an empty "
        "sections array.\n"
        "- Section headings should be short and descriptive (e.g. \"Patient's Particulars\", "
        "\"Medical History\", \"Physical Assessment\").\n"
        "- Do NOT invent or fabricate any content. Only include text that exists in the "
        "source document.\n"
        "- The 'content' field should NOT include the section heading as a prefix."
    )

    prompt = f"PASTE THE CARE STUDY DOCUMENT BELOW:\n\n{raw_text}"

    max_retries = 2
    model_errors: list[str] = []

    for model in models:
        last_exc: Exception | None = None
        for attempt in range(1, max_retries + 1):
            try:
                response = client.messages.create(
                    model=model,
                    max_tokens=8000,
                    system=system,
                    messages=[{"role": "user", "content": prompt}],
                )
                text = "".join(
                    b.text for b in response.content if b.type == "text"
                ).strip()
                if not text:
                    if attempt < max_retries:
                        time.sleep(2 ** attempt)
                        continue
                    model_errors.append(f"{model}: empty response")
                    break

                # Strip markdown fences if the model wraps them anyway.
                if text.startswith("```"):
                    lines = text.split("\n")
                    # Remove first and last lines (fences)
                    if lines[-1].strip() == "```":
                        text = "\n".join(lines[1:-1])
                    elif lines[0].strip().startswith("```"):
                        text = "\n".join(lines[1:])

                result = json.loads(text)
                # Basic validation.
                if "chapters" not in result or not isinstance(result["chapters"], list):
                    raise ValueError("Response missing 'chapters' array")
                return result

            except (json.JSONDecodeError, ValueError) as exc:
                last_exc = exc
                print(
                    f"[worker] import_study model {model} returned bad JSON (attempt {attempt}/{max_retries}): {exc}",
                    file=sys.stderr, flush=True,
                )
                if attempt < max_retries:
                    time.sleep(2 ** attempt)
            except Exception as exc:
                last_exc = exc
                print(
                    f"[worker] import_study model {model} failed (attempt {attempt}/{max_retries}): {exc}",
                    file=sys.stderr, flush=True,
                )
                if attempt < max_retries:
                    time.sleep(2 ** attempt)

        if last_exc is not None:
            model_errors.append(f"{model}: {type(last_exc).__name__}: {last_exc}")

    detail = "; ".join(model_errors) if model_errors else "all models returned unusable responses"
    raise RuntimeError(f"Document import failed. [{detail}]")
