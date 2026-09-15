"""
Long-lived drafting worker used by the API server.

The one-shot CLI (generate.py) pays a ~30s startup on every run because it
reloads the pickled retrieval indexes from disk each time. This worker loads
them exactly once at startup and then serves one draft request per line,
so every request after the first starts at model speed.

Protocol (JSON lines, one object per line):

    draft request  ->  {"id": <int>, "op": "draft", "heading": "...", "notes": "...", "tabular": false, "kind": "section" | "chapter_intro", "studyId": <int|None>}
    draft response ->  {"id": <int>, "draft": "...", "references": [{...}, ...]}
    ingest request ->  {"id": <int>, "op": "ingest", "studyId": <int>, "paths": [<abs file paths>]}
    ingest response -> {"id": <int>, "files": [{"path": ..., "textLength": <int|None>, "error": <str|None>}], "chunks": <int>}
    viva_bank request ->  {"id": <int>, "op": "viva_bank", "title": {..}, "chapters": [..]}
    viva_bank response -> {"id": <int>, "bank": {"questions": [{category, question, guidance, tip}, ...]}}
    error response ->  {"id": <int>, "error": "..."}   (request failed, worker stays alive)
    error response ->  {"error": "..."}                  (unparseable line, no id to echo)

The worker inherits the server's environment, so ANTHROPIC_API_KEY /
ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL / ANTHROPIC_MODEL work exactly as
they do for generate.py. Non-protocol diagnostics go to stderr, never stdout.
"""
import json
import os
import re
import sys
from typing import Dict, List, Optional

sys.path.insert(0, os.path.dirname(__file__))
from generate import draft_section, load_indexes  # noqa: E402
from loaders import load_as_text  # noqa: E402
from viva import generate_viva_bank  # noqa: E402
from reference_chunker import chunk_reference_text, ref_chunks_to_dicts  # noqa: E402
from retrieval import SimpleIndex  # noqa: E402
from import_worker import import_study, import_study_with_fields  # noqa: E402
from nanda_mapper import (  # noqa: E402
    build_chapter2_analysis_from_chapter1,
    build_comparison_section_from_chapter1_and_lit,
)
from pharm_mapper import build_pharmacology_rows  # noqa: E402
from care_plan import generate_care_plan_recommendations  # noqa: E402
from implementation_mapper import (  # noqa: E402
    build_care_summary_skeleton,
    build_home_visit_skeleton,
    home_visit_skeleton_to_text,
    build_discharge_preparation,
    skeleton_to_text,
)
from model_gateway import _chat_model  # noqa: E402  (shared gateway — see model_gateway.py)

# Per-study retrieval indexes, keyed by study id and cached in memory so each
# draft doesn't reload the pickled index from disk. Lives at the project root
# (data/studies) so the API server can clean it up alongside study deletion.
STUDY_INDEX_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "studies")
LIBRARY_INDEX_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "library")
_study_indexes: Dict[int, SimpleIndex] = {}

# The user's personal reference library (ebooks, notes, articles, external
# resources) — a single shared index, loaded at startup like the bundled ones.
_library_index = SimpleIndex()


def _study_index_path(study_id: int) -> str:
    return os.path.join(STUDY_INDEX_DIR, str(study_id), "index.pkl")


def _get_study_index(study_id: Optional[int]) -> Optional[SimpleIndex]:
    """The cached per-study index for a study, or None when absent."""
    if study_id is None:
        return None
    if study_id in _study_indexes:
        return _study_indexes[study_id]
    path = _study_index_path(study_id)
    if not os.path.exists(path):
        return None
    index = SimpleIndex()
    try:
        index.load(path)
        _study_indexes[study_id] = index
        return index
    except Exception as exc:
        print(f"[worker] failed to load study index {path}: {exc}", file=sys.stderr, flush=True)
        return None


def _load_library_index() -> None:
    """Load the personal-library index once at startup (empty when absent)."""
    path = os.path.join(LIBRARY_INDEX_DIR, "index.pkl")
    if not os.path.exists(path):
        return
    try:
        _library_index.load(path)
    except Exception as exc:
        print(f"[worker] failed to load library index {path}: {exc}", file=sys.stderr, flush=True)


def ingest_library_sources(sources: List[dict]) -> dict:
    """Extract text from the personal library's sources and rebuild its index.

    Each source: {"path": <abs path>, "citation": {label, inText, url}} where the
    citation was registered by the user (or auto-derived). Empty sources clears
    the index.
    """
    results = []
    all_records = []
    for source in sources:
        path = source.get("path")
        citation = source.get("citation") or {}
        try:
            text = load_as_text(path)
        except Exception as exc:
            results.append({"path": path, "textLength": None, "error": str(exc)})
            continue
        text = text.strip()
        if not text:
            results.append({"path": path, "textLength": 0, "error": "No extractable text (scanned PDF?)"})
            continue
        results.append({"path": path, "textLength": len(text), "error": None})
        for chunk in chunk_reference_text(text, os.path.basename(path)):
            all_records.append({
                "text": chunk.text,
                "heading": chunk.heading,
                "source": path,
                "chapter": "",
                "citation": citation,
            })

    global _library_index
    if all_records:
        index = SimpleIndex()
        index.build(all_records)
        os.makedirs(LIBRARY_INDEX_DIR, exist_ok=True)
        index.save(os.path.join(LIBRARY_INDEX_DIR, "index.pkl"))
        _library_index = index
    else:
        try:
            os.remove(os.path.join(LIBRARY_INDEX_DIR, "index.pkl"))
        except OSError:
            pass
        _library_index = SimpleIndex()
    return {"files": results, "chunks": len(all_records)}


def ingest_study_files(study_id: int, paths: List[str]) -> dict:
    """Extract text from the study's uploaded documents and (re)build its index.

    Returns per-file results so the server can mark each upload ready/error,
    plus the total chunk count. An empty path list clears the index.
    """
    results = []
    all_records = []
    for path in paths:
        try:
            text = load_as_text(path)
        except Exception as exc:
            results.append({"path": path, "textLength": None, "error": str(exc)})
            continue
        text = text.strip()
        if not text:
            results.append(
                {"path": path, "textLength": 0, "error": "No extractable text (scanned PDF?)"}
            )
            continue
        results.append({"path": path, "textLength": len(text), "error": None})
        for chunk in chunk_reference_text(text, os.path.basename(path)):
            all_records.append({
                "text": chunk.text,
                "heading": chunk.heading,
                "source": path,
                "chapter": "",
            })

    if all_records:
        index = SimpleIndex()
        index.build(all_records)
        os.makedirs(os.path.dirname(_study_index_path(study_id)), exist_ok=True)
        index.save(_study_index_path(study_id))
        _study_indexes[study_id] = index
    else:
        # Nothing to index (no files, or every extraction failed). Drop any
        # stale index so drafts never ground in a deleted document — building
        # an empty TF-IDF matrix would also crash (empty vocabulary).
        try:
            os.remove(_study_index_path(study_id))
        except OSError:
            pass
        _study_indexes.pop(study_id, None)
    return {"files": results, "chunks": len(all_records)}


def emit(obj: dict) -> None:
    # ensure_ascii keeps the wire format plain UTF-8-safe ASCII; newlines inside
    # the draft are escaped so one response always stays on one physical line.
    sys.stdout.write(json.dumps(obj, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def _parse_assistant_result(raw: str) -> dict:
    """Accept the structured edit response while tolerating plain-text models.

    Some models prepend natural-language text before the JSON block.  We
    handle three shapes:
      1. Pure JSON:  {"message": ..., "edits": [...]}
      2. Fenced:     ```json { ... } ```
      3. Mixed:      Some explanation...\n{"message": ..., "edits": [...]}
    """
    candidate = raw.strip()

    # Strip markdown fences.
    if candidate.startswith("```json") and candidate.endswith("```"):
        candidate = candidate[7:-3].strip()

    # Try parsing the whole string first.
    parsed = None
    try:
        parsed = json.loads(candidate)
    except (json.JSONDecodeError, ValueError):
        pass

    # If that failed, look for a JSON object embedded in the text.
    if parsed is None:
        first_brace = candidate.find('{')
        last_brace = candidate.rfind('}')
        if first_brace != -1 and last_brace > first_brace:
            try:
                parsed = json.loads(candidate[first_brace:last_brace + 1])
            except (json.JSONDecodeError, ValueError):
                pass

    if not isinstance(parsed, dict) or not isinstance(parsed.get("message"), str):
        return {"message": raw.strip(), "edits": []}

    # Collect the explanatory text that precedes the JSON block (if any).
    message_text = parsed["message"].strip()
    first_brace = raw.find('{')
    if first_brace > 0:
        prefix = raw[:first_brace].strip()
        if prefix and prefix != message_text:
            message_text = f"{prefix}\n\n{message_text}"

    edits = []
    for edit in parsed.get("edits", []):
        if not isinstance(edit, dict) or not isinstance(edit.get("sectionId"), str):
            continue
        clean: dict = {"sectionId": edit["sectionId"]}
        for field in ("draft", "notes"):
            if isinstance(edit.get(field), str):
                clean[field] = edit[field]
        # The assistant may also supply updated field data for the section.
        if isinstance(edit.get("data"), dict):
            clean["data"] = edit["data"]
        if len(clean) > 1:
            edits.append(clean)
    return {"message": message_text, "edits": edits}


def assist_with_study(study: dict, message: str) -> dict:
    """Answer an editorial request against the entire current study snapshot."""
    # Browser JSON can contain lone UTF-16 surrogates from pasted content.
    # Escape them before the SDK encodes the prompt as UTF-8.
    safe_message = message.encode("utf-8", "replace").decode("utf-8")
    snapshot = json.dumps(study, ensure_ascii=True, separators=(",", ":"))
    prompt = f"STUDENT REQUEST:\n{safe_message}\n\nCARE STUDY JSON:\n{snapshot}"
    system = (
        "You are a senior nursing tutor at a Ghana NMC-accredited college. "
        "You are reviewing a student's care study. Be direct, specific, and concise. "
        "Never write walls of text. Use short paragraphs (2-3 sentences max). "
        "Never invent patient facts or clinical findings.\n\n"
        "RESPONSE FORMAT — always return this exact JSON: "
        '{"message": "your response", "edits": [{"sectionId": "...", "draft": "..."}]}'
        "\n\n"
        "RULES:\n"
        "- message: 3-5 short paragraphs. Lead with the most important finding. "
        "End with one concrete next step the student should take.\n"
        "- edits: only include when you have a complete, ready-to-paste replacement. "
        "Use the exact sectionId from the study. Never include partial edits.\n"
        "- If asked to polish text: rewrite it in the message, then put the improved "
        "version in edits with the correct sectionId.\n"
        "- If asked to review: list the top 3-5 issues as bullet points, not prose.\n"
        "- Never use markdown formatting in the message field."
    )
    answer = _chat_model(system, prompt, max_tokens=3500, label="study review")
    result = _parse_assistant_result(answer)
    if result["message"]:
        return result
    raise RuntimeError("The AI models returned no usable study review. Please try again.")


_CHAPTER2_SYSTEM = (
    "You are a nursing tutor at a Ghana NMC-accredited college helping a student "
    "write Chapter 2 of a care study. You receive the patient's Chapter 1 assessment "
    "data and a rule-based draft of suggested problems, strengths, and NANDA-I "
    "diagnoses. Refine the draft so it is specific to THIS patient, using only the "
    "findings present in the data — never invent clinical findings. Keep NMC format. "
    "Actual (problem-focused) diagnoses use PES format: 'Diagnosis related to ... as "
    "evidenced by ...'. Risk diagnoses must be written ONLY as 'Risk for X (reason)' — "
    "never add 'related to' or 'as evidenced by' to a risk diagnosis. Remove duplicate "
    "diagnoses. Return ONLY a JSON object with exactly this shape — every value a real, "
    "complete plain string; never fill a value with ellipses, placeholders, or the template "
    "itself:\n"
    '{"section_23": {"actualProblems": "<bulleted list>", "potentialProblems": "<bulleted list>", '
    '"problemPriority": "<numbered list>"}, "section_24": {"generalStrengths": "<bulleted list>", '
    '"specificStrengths": "<bulleted list>"}, "section_25": {"nursingDiagnoses": "<bulleted list>", '
    '"diagnosisPriority": "<comma-separated>"}}'
)


def _chapter2_with_llm(chapter1_fields: Dict[str, str], condition: str, rules_result: dict) -> dict:
    """One model call that personalises the rule-based chapter2 draft."""
    fields_text = json.dumps(chapter1_fields, ensure_ascii=True, indent=2)
    rules_text = json.dumps(rules_result, ensure_ascii=True, indent=2)
    prompt = (
        f"PATIENT CONDITION: {condition or '(not stated)'}\n\n"
        f"CHAPTER 1 ASSESSMENT DATA:\n{fields_text}\n\n"
        f"RULE-BASED DRAFT TO REFINE:\n{rules_text}\n\n"
        "Refine this draft for this specific patient:\n"
        "- section_23.actualProblems: bulleted list ('- ' per line) of the health problems "
        "evident in the data, written in clinical terms.\n"
        "- section_23.potentialProblems: bulleted list ('- ' per line) of risk diagnoses "
        "grounded in the patient's condition and problems. No duplicates.\n"
        "- section_23.problemPriority: bulleted numbered list with priority in parentheses, "
        "e.g. '- 1. Hyperthermia (high priority)'.\n"
        "- section_24.generalStrengths / specificStrengths: bulleted lists ('- ' per line) "
        "of strengths evident in the data; specific strengths map to the identified problems.\n"
        "- section_25.nursingDiagnoses: bulleted PES statements ('- Diagnosis related to ... "
        "as evidenced by ...') ordered by priority; risk diagnoses written only as "
        "'Risk for X (reason)'.\n"
        "- section_25.diagnosisPriority: comma-separated '1. Diagnosis, 2. Diagnosis, ...' in the same order.\n"
        "Return only the JSON object."
    )
    # Generous headroom: router models in 'thinking' mode can spend thousands
    # of tokens reasoning before any text appears (seen with openrouter/free).
    answer = _chat_model(_CHAPTER2_SYSTEM, prompt, max_tokens=8000, label="chapter2 recommendations")
    return _merge_chapter2_result(answer, rules_result)


_PHARMACY_SYSTEM = (
    "You are a nursing tutor at a Ghana NMC-accredited college helping a student "
    "complete section 2.2 'Pharmacology of Drugs Prescribed' of a care study. You "
    "receive the patient's Chapter 1 drug data and rule-generated table rows "
    "grounded in the WHO Model Formulary. Keep every dose, route, and frequency "
    "EXACTLY as given in the rule rows — never invent or alter doses. For drugs "
    "the rules could not fill (listed as unmatched), you may add a row ONLY with "
    "standard, well-established information (drug class, typical indication, "
    "common side effects, nursing care) and keep doses general — never a specific "
    "made-up dose. Return ONLY a JSON object of this exact shape where rows is an "
    "array of 6-element string arrays [name, drugClass, doseRouteFrequency, "
    "indication, sideEffects, nursingResponsibility]:\n"
    '{"rows": [["...", "...", "...", "...", "...", "..."]]}\n'
    "Keep each cell concise (one to two sentences)."
)


def _pharmacology_with_llm(chapter1_fields: Dict[str, str], rules_result: dict) -> dict:
    """One model call that polishes the rule-generated pharmacology rows."""
    fields_text = json.dumps(chapter1_fields, ensure_ascii=True, indent=2)
    rules_text = json.dumps(rules_result, ensure_ascii=True, indent=2)
    prompt = (
        f"CHAPTER 1 DRUG DATA:\n{fields_text}\n\n"
        f"RULE-GENERATED ROWS (grounded in the WHO Model Formulary):\n{rules_text}\n\n"
        "Polish these rows for the student's pharmacology table: tidy wording, keep "
        "all doses verbatim, keep one row per drug, keep the column order "
        "[name, class, dose/route/frequency, indication, side effects, nursing "
        "responsibility]. You may add rows for unmatched drugs using only "
        "well-established standard information with no invented specific doses. "
        "Return only the JSON object."
    )
    # Thinking models can spend thousands of tokens before any text appears.
    answer = _chat_model(_PHARMACY_SYSTEM, prompt, max_tokens=6000, label="pharmacology recommendations")
    return _merge_pharmacology_result(answer, rules_result)


def _merge_pharmacology_result(raw: str, rules_result: dict) -> dict:
    """Validate the model's rows JSON, falling back to the rule rows."""
    candidate = raw.strip()
    if candidate.startswith("```"):
        end = candidate.rfind("```")
        candidate = candidate[3:end if end != -1 else None].strip()
        if candidate.lower().startswith("json"):
            candidate = candidate[4:].strip()

    parsed = None
    try:
        parsed = json.loads(candidate)
    except (json.JSONDecodeError, ValueError):
        pass
    if parsed is None:
        first_brace = candidate.find("{")
        last_brace = candidate.rfind("}")
        if first_brace != -1 and last_brace > first_brace:
            try:
                parsed = json.loads(candidate[first_brace:last_brace + 1])
            except (json.JSONDecodeError, ValueError):
                pass
    if not isinstance(parsed, dict):
        raise ValueError("model response was not a JSON object")

    model_rows = parsed.get("rows")
    if not isinstance(model_rows, list) or not model_rows:
        raise ValueError("model response contained no rows")

    clean_rows: List[List[str]] = []
    for row in model_rows:
        if not isinstance(row, list):
            continue
        cells = [str(cell).strip() if cell is not None else "" for cell in row]
        while len(cells) < 6:
            cells.append("")
        clean_rows.append(cells[:6])
    if not clean_rows:
        raise ValueError("model response contained no usable rows")
    return {"rows": clean_rows}


def generate_pharmacology_recommendations(chapter1_fields: Dict[str, str]) -> dict:
    """Proposed section 2.2 pharmacology rows: LLM polish, rule fallback.

    The deterministic formulary rows ground the model prompt and serve as the
    fallback whenever the model call fails or returns an unusable shape, so the
    API always returns a usable table proposal.
    """
    rules_result = build_pharmacology_rows(chapter1_fields)
    try:
        result = _pharmacology_with_llm(chapter1_fields, rules_result)
        result["note"] = rules_result.get("note", "")
        result["unmatched"] = rules_result.get("unmatched", [])
        return result
    except Exception as exc:
        print(
            f"[worker] pharmacology recommendations: model call failed, using rule-based rows: {exc}",
            file=sys.stderr, flush=True,
        )
        return rules_result


_CHAPTER2_FIELDS = {
    "section_23": ("actualProblems", "potentialProblems", "problemPriority"),
    "section_24": ("generalStrengths", "specificStrengths"),
    "section_25": ("nursingDiagnoses", "diagnosisPriority"),
}


# Values the model must never be credited with: template ellipses echoed back,
# or bullet/number scaffolding with no actual content behind it.
_CHAPTER2_PLACEHOLDER_RE = re.compile(r"^[\s.·…\-–—*•]*$")


def _is_usable_chapter2_value(value: object) -> bool:
    """True when a model-supplied field holds real content, not a placeholder."""
    if not isinstance(value, str) or not value.strip():
        return False
    for line in value.splitlines():
        stripped = line.strip().lstrip("-*•–— ").lstrip("0123456789. ")
        if stripped and not _CHAPTER2_PLACEHOLDER_RE.match(stripped):
            return True
    return False


def _merge_chapter2_result(raw: str, rules_result: dict) -> dict:
    """Validate the model's chapter2 JSON, falling back per-field to the rules."""
    candidate = raw.strip()
    if candidate.startswith("```"):
        end = candidate.rfind("```")
        candidate = candidate[3:end if end != -1 else None].strip()
        if candidate.lower().startswith("json"):
            candidate = candidate[4:].strip()

    parsed = None
    try:
        parsed = json.loads(candidate)
    except (json.JSONDecodeError, ValueError):
        pass
    if parsed is None:
        first_brace = candidate.find("{")
        last_brace = candidate.rfind("}")
        if first_brace != -1 and last_brace > first_brace:
            try:
                parsed = json.loads(candidate[first_brace:last_brace + 1])
            except (json.JSONDecodeError, ValueError):
                pass
    if not isinstance(parsed, dict):
        raise ValueError("model response was not a JSON object")

    merged: dict = {}
    usable = False
    for section, fields in _CHAPTER2_FIELDS.items():
        model_section = parsed.get(section)
        rule_section = rules_result.get(section) or {}
        merged[section] = {}
        for field in fields:
            value = model_section.get(field) if isinstance(model_section, dict) else None
            if _is_usable_chapter2_value(value):
                merged[section][field] = value.strip()
                usable = True
            else:
                merged[section][field] = rule_section.get(field, "")
    if not usable:
        raise ValueError("model response contained no usable chapter2 fields")
    return merged


def generate_chapter2_recommendations(chapter1_fields: Dict[str, str], condition: str) -> dict:
    """Personalised Chapter 2 recommendations via LLM, grounded in the rule mapper.

    The deterministic nanda_mapper output is used twice: as grounding material for
    the model prompt, and as a field-by-field fallback whenever the model call
    fails, times out, or returns an unusable shape — so the frontend always gets
    the same Chapter2Recommendations shape.
    """
    rules_result = build_chapter2_analysis_from_chapter1(chapter1_fields, condition)
    try:
        result = _chapter2_with_llm(chapter1_fields, condition, rules_result)
    except Exception as exc:
        print(
            f"[worker] chapter2 recommendations: model call failed, using rule-based output: {exc}",
            file=sys.stderr, flush=True,
        )
        result = rules_result

    # The Chapter 1 payload includes the student's literature-review fields.
    # Keep every Chapter 2 suggestion together under its single action.
    result["section_21"] = build_comparison_section_from_chapter1_and_lit(
        chapter1_fields, chapter1_fields, condition,
    )
    result["section_22"] = generate_pharmacology_recommendations(chapter1_fields)
    return result


_DISCHARGE_SYSTEM = (
    "You are a nursing tutor at a Ghana NMC-accredited college helping a student "
    "write section 4.2 'Preparation of Patient and Family for Discharge and "
    "Rehabilitation' of a care study. You receive the patient's particulars, the "
    "documented diagnoses, the rule-based field drafts, and any free-form notes. "
    "Personalise the drafts so they are specific to THIS patient, using only the "
    "findings present in the data — never invent clinical findings, dates, drugs, "
    "doses, or review dates. Keep the school's structure: preparation started on "
    "the day of admission, condition/medication/diet/danger-sign education, family "
    "involvement, long-term needs, community resources and referrals, and the "
    "gradual discharge process. Where the source marks a bracketed placeholder "
    "like [state ...], keep a placeholder in the polished text so the student "
    "fills it from their own records — never fill it with an invented fact. Return "
    "ONLY a JSON object with exactly these string keys:\n"
    '{"dischargeEducation": "...", "longTermNeeds": "...", '
    '"communityResources": "...", "dischargeProcess": "..."}'
)


def _discharge_with_llm(
    payload: Dict[str, object],
    rules_result: Dict[str, str],
) -> Dict[str, str]:
    """One model call that personalises the rule-based 4.2 field drafts."""
    context_text = json.dumps(payload, ensure_ascii=True, indent=2)
    rules_text = json.dumps(rules_result, ensure_ascii=True, indent=2)
    prompt = (
        f"PATIENT DATA:\n{context_text}\n\n"
        f"RULE-BASED FIELD DRAFTS TO REFINE:\n{rules_text}\n\n"
        "Polish these 4.2 discharge-preparation field drafts for this specific "
        "patient: keep the school's structure, keep every bracketed placeholder "
        "as a placeholder (you may reword the bracket text), use only documented "
        "facts, and write flowing professional prose (3-6 sentences per field). "
        "The PATIENT DATA carries the documented review date (reviewDate) — use "
        "it where the draft references the review appointment instead of leaving "
        "the placeholder. Return only the JSON object."
    )
    answer = _chat_model(
        _DISCHARGE_SYSTEM, prompt, max_tokens=4000, label="discharge preparation recommendations",
    )
    return _merge_discharge_result(answer, rules_result)


def _merge_discharge_result(raw: str, rules_result: Dict[str, str]) -> Dict[str, str]:
    """Validate the model's 4.2 JSON, falling back per-field to the rules."""
    candidate = raw.strip()
    if candidate.startswith("```"):
        end = candidate.rfind("```")
        candidate = candidate[3:end if end != -1 else None].strip()
        if candidate.lower().startswith("json"):
            candidate = candidate[4:].strip()

    parsed = None
    try:
        parsed = json.loads(candidate)
    except (json.JSONDecodeError, ValueError):
        pass
    if parsed is None:
        first_brace = candidate.find("{")
        last_brace = candidate.rfind("}")
        if first_brace != -1 and last_brace > first_brace:
            try:
                parsed = json.loads(candidate[first_brace:last_brace + 1])
            except (json.JSONDecodeError, ValueError):
                pass
    if not isinstance(parsed, dict):
        raise ValueError("model response was not a JSON object")

    merged: Dict[str, str] = {}
    usable = False
    for field in ("dischargeEducation", "longTermNeeds", "communityResources", "dischargeProcess"):
        value = parsed.get(field)
        if isinstance(value, str) and len(value.strip()) >= 60:
            merged[field] = value.strip()
            usable = True
        else:
            merged[field] = rules_result.get(field, "")
    if not usable:
        raise ValueError("model response contained no usable discharge fields")
    return merged


def generate_discharge_recommendations(
    patient: Dict[str, str],
    drugs: List[str],
    diagnoses: List[str],
    patient_context: str = "",
    discharge: Optional[Dict[str, str]] = None,
) -> dict:
    """Proposed 4.2 field drafts: LLM polish, rule fallback.

    Mirrors generate_chapter2_recommendations / generate_care_plan_recommendations:
    the deterministic builder grounds the prompt and serves as the per-field
    fallback, so the API always returns the same field shape. `discharge`
    carries the documented 4.2 fields (its structured `reviewDate` replaces
    the review-date placeholder in the drafts).
    """
    rules_result = build_discharge_preparation(
        patient, drugs, diagnoses, patient_context,
        (discharge or {}).get("reviewDate", ""),
    )
    try:
        return _discharge_with_llm(
            {
                "patient": patient,
                "drugs": drugs,
                "diagnoses": diagnoses,
                "patientContext": patient_context,
                "reviewDate": (discharge or {}).get("reviewDate", ""),
            },
            rules_result,
        )
    except Exception as exc:
        print(
            f"[worker] discharge recommendations: model call failed, using rule-based output: {exc}",
            file=sys.stderr, flush=True,
        )
        return rules_result


def generate_home_visit_skeleton(
    patient: Dict[str, str],
    drugs: List[str],
    diagnoses: List[str],
    discharge: Dict[str, str],
    socio: Dict[str, str],
    visit_rows: List[List[str]],
    admission: Optional[Dict[str, str]] = None,
) -> dict:
    """Proposed 4.3 per-visit skeleton — deterministic, no model calls.

    Mirrors generate_care_summary: the skeleton (definition paragraph +
    per-visit blocks with grounded purpose/education sentences and explicit
    placeholders) is returned directly; the student fills only the facts they
    documented. Serialized into the 4.3 notes for review before drafting.
    """
    skeleton = build_home_visit_skeleton(patient, drugs, diagnoses, discharge, socio, visit_rows, admission)
    return {
        "opening": str(skeleton.get("opening", "")),
        "visits": [
            {
                "heading": str(visit.get("heading", "")),
                "paragraph": str(visit.get("paragraph", "")),
                "cells": [str(cell) for cell in visit.get("cells", []) or []],
                "educationSuggestions": [
                    str(s) for s in visit.get("educationSuggestions", []) or []
                ],
                "dateIsSuggested": bool(visit.get("dateIsSuggested", False)),
                "isReviewBlock": bool(visit.get("isReviewBlock", False)),
            }
            for visit in skeleton.get("visits", []) or []
            if isinstance(visit, dict)
        ],
        "visitsText": home_visit_skeleton_to_text(skeleton),
    }


def generate_care_summary(
    patient: Dict[str, str],
    admission: Dict[str, str],
    care_plan_rows: List[List[str]],
    drugs: List[str],
) -> dict:
    """Proposed 4.1 day-by-day skeleton — deterministic, no model call.

    The skeleton (opening paragraph + per-day headings with grounded points and
    explicit placeholders) is returned directly; the student fills the day
    narratives only they can document. Serialized into the 'careGiven' field.
    """
    skeleton = build_care_summary_skeleton(patient, admission, care_plan_rows, drugs)
    return {"careGiven": skeleton_to_text(skeleton), "skeleton": skeleton}


def main() -> None:
    # Windows consoles/pipes default stdin to cp1252 with surrogateescape, and
    # stdout/stderr to cp1252. Reconfigure all three to UTF-8: request JSON on
    # stdin is always UTF-8 (Express writes raw UTF-8), and a cp1252 decode
    # turns every unmapped byte into a lone surrogate (\udc9d etc.) that later
    # crashes the SDK's UTF-8 prompt encoding with UnicodeEncodeError. 'replace'
    # keeps output safe from characters the console can't encode.
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    # load_indexes swallows per-file failures internally (degrading to empty
    # retrieval) and always returns SimpleIndex objects, so reuse them
    # directly — passing None here would make draft_section reload the slow
    # indexes on every request, which is exactly what this worker avoids.
    template_index, reference_index = load_indexes()
    _load_library_index()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except ValueError as exc:
            emit({"error": f"invalid request line: {exc}"})
            continue

        try:
            op = req.get("op", "draft")
            if op == "ingest":
                study_id = req.get("studyId")
                paths = req.get("paths", []) or []
                if not isinstance(study_id, int) or not isinstance(paths, list):
                    emit({"id": req.get("id"), "error": "ingest requires studyId and a paths list"})
                    continue
                emit({"id": req.get("id"), **ingest_study_files(study_id, paths)})
                continue
            if op == "extract":
                file_path = req.get("path", "")
                if not isinstance(file_path, str) or not file_path:
                    emit({"id": req.get("id"), "error": "extract requires a file path"})
                    continue
                emit({"id": req.get("id"), "text": load_as_text(file_path)})
                continue
            if op == "library_ingest":
                sources = req.get("sources", []) or []
                if not isinstance(sources, list):
                    emit({"id": req.get("id"), "error": "library_ingest requires a sources list"})
                    continue
                emit({"id": req.get("id"), **ingest_library_sources(sources)})
                continue
            if op == "viva_bank":
                title = req.get("title") or {}
                chapters = req.get("chapters") or []
                if not isinstance(title, dict) or not isinstance(chapters, list):
                    emit({"id": req.get("id"), "error": "viva_bank requires a title object and chapters list"})
                    continue
                bank = generate_viva_bank(title, chapters)
                emit({"id": req.get("id"), "bank": bank})
                continue
            if op == "import_study":
                raw_text = req.get("text", "")
                if not isinstance(raw_text, str) or not raw_text.strip():
                    emit({"id": req.get("id"), "error": "import_study requires a text field"})
                    continue
                result = import_study(raw_text.strip())
                emit({"id": req.get("id"), "imported": result})
                continue
            if op == "import_study_with_fields":
                raw_text = req.get("text", "")
                if not isinstance(raw_text, str) or not raw_text.strip():
                    emit({"id": req.get("id"), "error": "import_study_with_fields requires a text field"})
                    continue
                try:
                    result = import_study_with_fields(raw_text.strip())
                    emit({"id": req.get("id"), "imported": result})
                except Exception as exc:
                    emit({"id": req.get("id"), "error": str(exc)})
                continue
            if op == "discharge_recommendations":
                patient = req.get("patient") or {}
                drugs = req.get("drugs") or []
                diagnoses = req.get("diagnoses") or []
                patient_context = req.get("patientContext", "")
                if not isinstance(patient, dict):
                    emit({"id": req.get("id"), "error": "discharge_recommendations requires a patient object"})
                    continue
                if not isinstance(drugs, list) or not all(isinstance(d, str) for d in drugs):
                    emit({"id": req.get("id"), "error": "discharge_recommendations requires drugs as a list of strings"})
                    continue
                if not isinstance(diagnoses, list) or not all(isinstance(d, str) for d in diagnoses):
                    emit({"id": req.get("id"), "error": "discharge_recommendations requires diagnoses as a list of strings"})
                    continue
                if not isinstance(patient_context, str):
                    patient_context = ""
                discharge_payload = req.get("discharge") or {}
                if not isinstance(discharge_payload, dict):
                    discharge_payload = {}
                result = generate_discharge_recommendations(
                    {str(k): str(v) for k, v in patient.items()},
                    [d.strip() for d in drugs],
                    [d.strip() for d in diagnoses],
                    patient_context.strip(),
                    {str(k): str(v) for k, v in discharge_payload.items()},
                )
                emit({"id": req.get("id"), "discharge": result})
                continue
            if op == "home_visit_skeleton":
                patient = req.get("patient") or {}
                discharge = req.get("discharge") or {}
                socio = req.get("socio") or {}
                admission = req.get("admission") or {}
                drugs = req.get("drugs") or []
                diagnoses = req.get("diagnoses") or []
                visit_rows = req.get("visitRows") or []
                if not isinstance(patient, dict) or not isinstance(discharge, dict) or not isinstance(socio, dict) or not isinstance(admission, dict):
                    emit({"id": req.get("id"), "error": "home_visit_skeleton requires patient, discharge, socio, and admission objects"})
                    continue
                if not isinstance(drugs, list) or not all(isinstance(d, str) for d in drugs):
                    emit({"id": req.get("id"), "error": "home_visit_skeleton requires drugs as a list of strings"})
                    continue
                if not isinstance(diagnoses, list) or not all(isinstance(d, str) for d in diagnoses):
                    emit({"id": req.get("id"), "error": "home_visit_skeleton requires diagnoses as a list of strings"})
                    continue
                if not isinstance(visit_rows, list):
                    emit({"id": req.get("id"), "error": "home_visit_skeleton requires visitRows as a list"})
                    continue
                result = generate_home_visit_skeleton(
                    {str(k): str(v) for k, v in patient.items()},
                    [d.strip() for d in drugs],
                    [d.strip() for d in diagnoses],
                    {str(k): str(v) for k, v in discharge.items()},
                    {str(k): str(v) for k, v in socio.items()},
                    [row if isinstance(row, list) else [] for row in visit_rows],
                    {str(k): str(v) for k, v in admission.items()},
                )
                emit({"id": req.get("id"), "homeVisits": result})
                continue
            if op == "care_summary_skeleton":
                patient = req.get("patient") or {}
                admission = req.get("admission") or {}
                care_plan_rows = req.get("carePlanRows") or []
                drugs = req.get("drugs") or []
                if not isinstance(patient, dict) or not isinstance(admission, dict):
                    emit({"id": req.get("id"), "error": "care_summary_skeleton requires patient and admission objects"})
                    continue
                if not isinstance(care_plan_rows, list):
                    emit({"id": req.get("id"), "error": "care_summary_skeleton requires carePlanRows as a list"})
                    continue
                if not isinstance(drugs, list) or not all(isinstance(d, str) for d in drugs):
                    emit({"id": req.get("id"), "error": "care_summary_skeleton requires drugs as a list of strings"})
                    continue
                result = generate_care_summary(
                    {str(k): str(v) for k, v in patient.items()},
                    {str(k): str(v) for k, v in admission.items()},
                    [row if isinstance(row, list) else [] for row in care_plan_rows],
                    [d.strip() for d in drugs],
                )
                emit({"id": req.get("id"), "careSummary": result})
                continue
            if op == "study_assistant":
                study = req.get("study")
                message = req.get("message", "")
                if not isinstance(study, dict) or not isinstance(message, str) or not message.strip():
                    emit({"id": req.get("id"), "error": "study_assistant requires a study and message"})
                    continue
                result = assist_with_study(study, message.strip())
                emit({"id": req.get("id"), "answer": result["message"], "edits": result["edits"]})
                continue
            if op == "chapter2_recommendations":
                chapter1_fields = req.get("chapter1Fields") or {}
                condition = req.get("condition", "")
                if not isinstance(chapter1_fields, dict) or not isinstance(condition, str):
                    emit({"id": req.get("id"), "error": "chapter2_recommendations requires chapter1Fields and condition"})
                    continue
                result = generate_chapter2_recommendations(
                    {str(key): str(value) for key, value in chapter1_fields.items()},
                    condition.strip(),
                )
                emit({"id": req.get("id"), "recommendations": result})
                continue
            if op == "pharmacology_recommendations":
                chapter1_fields = req.get("chapter1Fields") or {}
                if not isinstance(chapter1_fields, dict):
                    emit({"id": req.get("id"), "error": "pharmacology_recommendations requires chapter1Fields"})
                    continue
                result = generate_pharmacology_recommendations(
                    {str(key): str(value) for key, value in chapter1_fields.items()},
                )
                emit({"id": req.get("id"), "pharmacology": result})
                continue
            if op == "care_plan_recommendations":
                diagnoses = req.get("diagnoses") or []
                drugs = req.get("drugs") or []
                patient_context = req.get("patientContext", "")
                if (
                    not isinstance(diagnoses, list)
                    or not diagnoses
                    or not all(isinstance(d, str) and d.strip() for d in diagnoses)
                ):
                    emit({"id": req.get("id"), "error": "care_plan_recommendations requires a non-empty diagnoses list of strings"})
                    continue
                if not isinstance(drugs, list) or not all(isinstance(d, str) for d in drugs):
                    emit({"id": req.get("id"), "error": "care_plan_recommendations requires drugs as a list of strings"})
                    continue
                if not isinstance(patient_context, str):
                    patient_context = ""
                result = generate_care_plan_recommendations(
                    [d.strip() for d in diagnoses],
                    [d.strip() for d in drugs],
                    patient_context.strip(),
                )
                emit({"id": req.get("id"), "carePlan": result})
                continue

            study_id = req.get("studyId")
            study_index = _get_study_index(study_id)
            study_chunks = (
                study_index.query(req.get("notes", ""), k=4) if study_index else None
            )
            library_chunks = _library_index.query(req.get("notes", ""), k=3)
            result = draft_section(
                req.get("heading", ""),
                req.get("notes", ""),
                tabular=bool(req.get("tabular", False)),
                chapter_intro=(req.get("kind") == "chapter_intro"),
                template_index=template_index,
                reference_index=reference_index,
                study_chunks=study_chunks,
                library_chunks=library_chunks,
                row_columns=req.get("rowColumns") or None,
            )
            response = {"id": req.get("id"), "draft": result.draft, "references": result.references}
            # Include word-count metadata when available so the frontend can
            # display section length info without re-counting.
            if result.word_count_status and result.word_count_status != "no_target":
                response["wordCount"] = result.word_count
                response["wordCountMin"] = result.word_count_min
                response["wordCountMax"] = result.word_count_max
                response["wordCountStatus"] = result.word_count_status
            emit(response)
        except Exception as exc:
            # A failed model call must not kill the worker: report it for this
            # request and keep serving the next line.
            emit({"id": req.get("id"), "error": f"{type(exc).__name__}: {exc}"})


if __name__ == "__main__":
    main()
