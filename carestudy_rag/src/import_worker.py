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


# ─────────────────────────────────────────────────────────────────────────────
# Enhanced import: returns section IDs, extracted field data, and draft content
# ─────────────────────────────────────────────────────────────────────────────

# Section ID → heading mapping so the AI can return matching IDs.
SECTION_ID_MAP = {
    "P.1": "Preface",
    "P.2": "Acknowledgement",
    "P.3": "Introduction",
    "1.1": "Patient's Particulars",
    "1.2": "Family's Medical/Surgical History",
    "1.3": "Family's Socio-Economic History",
    "1.4": "Patient's Developmental History",
    "1.5": "Patient's Lifestyle & Hobbies",
    "1.6": "Past Medical/Surgical/Obstetric History",
    "1.7": "Present Medical/Surgical History",
    "1.8": "Admission of the Patient",
    "1.9": "Patient's Concept of Illness",
    "1.10": "Literature Review",
    "1.11": "Validation of Data",
    "2.1": "Comparison of Data with Standards",
    "2.2": "Pharmacology of Drugs Prescribed",
    "2.3": "Patient Health Problems",
    "2.4": "Patient/Family Strengths",
    "2.5": "Nursing Diagnoses",
    "3.1": "Objectives for Patient/Family Care",
    "3.2": "Nursing Care Plan",
    "4.1": "Summary of the Actual Nursing Care",
    "4.2": "Preparation of Patient and Family for Discharge and Rehabilitation",
    "4.3": "Follow-up / Home Visit / Continuity of Care",
    "5.1": "Statement of Evaluation",
    "5.2": "Amendment of Nursing Care for Partially Met or Unmet Outcome Criteria",
    "5.3": "Termination of Care",
    "6.1": "Summary",
    "6.2": "Conclusion",
    "6.3": "Bibliography",
}

SECTION_FIELDS = {
    "P.1": ["reasonForStudy", "necessityForStudy", "helpToStudent"],
    "P.2": ["ackPatientFamily", "ackTutors", "ackWardStaff", "ackOthers"],
    "P.3": ["pseudonym", "interactionStart", "conditionOnAdmission", "chiefComplaint", "conditionOnDischarge", "areasCovered"],
    "1.1": ["initials", "age", "sex", "dob", "religion", "ethnicity", "maritalStatus", "occupation", "address", "hospitalNumber", "ward", "facility", "admissionDateTime", "diagnosis", "informant"],
    "1.2": ["familyHistoryPresent", "familyConditions", "familySurgery"],
    "1.3": ["familyType", "dependents", "familyOccupation", "income", "housing", "water", "sanitation", "socioEffect"],
    "1.4": ["pregnancy", "milestones", "childhood"],
    "1.5": ["dailyRoutine", "diet", "sleep", "exercise", "habits", "hobbies"],
    "1.6": ["childhoodIllness", "pastAdmissions", "transfusions", "allergies", "medications", "obstetric"],
    "1.7": ["onset", "presentingSymptoms", "associatedSymptoms", "physicalFindings", "investigations"],
    "1.8": ["admissionDate", "admissionRoute", "admittingDiagnosis", "admissionInvestigations", "treatmentStarted", "initialCare"],
    "1.9": ["understanding", "perceivedCause", "emotionalResponse"],
    "1.10": ["condition", "definition", "anatomy", "incidence", "causes", "pathophysiology", "clinicalFeatures", "diagnostics", "treatment", "complications", "nursingConsiderations"],
    "1.11": ["validationMethods", "discrepancies"],
    "2.1": ["featuresComparison", "testsComparison", "treatmentComparison"],
    "2.3": ["healthProblems", "potentialProblems", "problemPriority"],
    "2.4": ["generalStrengths", "strengths"],
    "2.5": ["nursingDiagnoses", "diagnosisPriority"],
    "3.1": ["longTerm", "shortTerm", "outcomeCriteria", "familyObjectives"],
    "4.1": ["careGiven", "healthEducation", "familyInvolvement"],
    "4.2": ["dischargeEducation", "longTermNeeds", "communityResources", "dischargeProcess"],
    "5.1": ["overallEvaluation", "followUp"],
    "5.2": ["failedOutcomes", "amendment"],
    "5.3": ["terminationProcess", "patientInvolvement", "handover"],
    "6.1": ["summaryText"],
    "6.2": ["conclusionText", "recommendations"],
}

SECTION_ID_LIST = ", ".join(f"{sid}: {heading}" for sid, heading in SECTION_ID_MAP.items())
FIELD_ID_LIST = "\n".join(
    f"  {sid}: [{', '.join(fields)}]"
    for sid, fields in SECTION_FIELDS.items()
)


def import_study_with_fields(raw_text: str) -> dict:
    """Parse a care study document into structured sections with field extraction.

    Returns::

        {
          "title": { "patientName": "...", ... },
          "chapters": [
            {
              "name": "Assessment",
              "sections": [
                {
                  "sectionId": "1.1",
                  "heading": "Patient's Particulars",
                  "fields": { "initials": "Mrs. P.A", "age": "49 years", ... },
                  "draft": "Full polished text for this section..."
                },
                ...
              ]
            },
            ...
          ]
        }
    """
    if len(raw_text) > 80_000:
        raw_text = raw_text[:80_000] + "\n\n[...document truncated at 80 000 characters...]"

    client = _make_client()
    models = _candidate_models()

    system = (
        "You are a document-structuring assistant for nursing care studies. "
        "The user will paste the full text of an existing care study document. "
        "Your job is to parse it into the standard NMC Ghana care study structure, "
        "extracting both the full text (as 'draft') and individual field values (as 'fields').\n\n"
        "You MUST return ONLY a valid JSON object — no markdown fences, no commentary:\n\n"
        "Section IDs and their extractable fields:\n"
        + FIELD_ID_LIST + "\n\n"
        "Return this exact JSON shape:\n"
        "{\n"
        '  "title": { "patientName": "", "diagnosis": "", "studentName": "", "indexNumber": "", "collegeName": "", "collegeLocation": "", "year": "" },\n'
        '  "chapters": [\n'
        '    { "name": "one of ' + str(CHAPTER_NAMES) + '",\n'
        '      "sections": [\n'
        '        { "sectionId": "1.1", "heading": "Patient\'s Particulars",\n'
        '          "fields": { "initials": "extracted value", "age": "extracted value", ... },\n'
        '          "draft": "Full polished section text — the complete paragraph(s) from the document" },\n'
        "      ]\n    }\n  ]\n}\n\n"
        "Rules:\n"
        "- Every section MUST have a 'sectionId' that matches one of the IDs listed above.\n"
        "- The 'heading' should match the standard heading for that sectionId.\n"
        "- The 'draft' is the FULL text of the section from the document — preserve the student's original wording.\n"
        "- The 'fields' object extracts specific values from the text. Use the field IDs listed above.\n"
        "  Only include fields you can confidently extract. Omit fields you cannot find.\n"
        "  For field values, use SHORT extracted values (names, dates, numbers), not full sentences.\n"
        "  Long narrative text belongs in 'draft', not in 'fields'.\n"
        "- Sections with only a table (drugs, care plan, home visits, bibliography) should have\n"
        "  the table text in 'draft' and an empty 'fields' object.\n"
        "- If a chapter has no matching content, include it with an empty 'sections' array.\n"
        "- Do NOT invent content. Only include text that exists in the source document."
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
                    max_tokens=12000,
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

                if text.startswith("```"):
                    lines = text.split("\n")
                    if lines[-1].strip() == "```":
                        text = "\n".join(lines[1:-1])
                    elif lines[0].strip().startswith("```"):
                        text = "\n".join(lines[1:])

                result = json.loads(text)
                if "chapters" not in result or not isinstance(result["chapters"], list):
                    raise ValueError("Response missing 'chapters' array")
                return result

            except (json.JSONDecodeError, ValueError) as exc:
                last_exc = exc
                print(
                    f"[worker] import_study_with_fields model {model} bad JSON (attempt {attempt}/{max_retries}): {exc}",
                    file=sys.stderr, flush=True,
                )
                if attempt < max_retries:
                    time.sleep(2 ** attempt)
            except Exception as exc:
                last_exc = exc
                print(
                    f"[worker] import_study_with_fields model {model} failed (attempt {attempt}/{max_retries}): {exc}",
                    file=sys.stderr, flush=True,
                )
                if attempt < max_retries:
                    time.sleep(2 ** attempt)

        if last_exc is not None:
            model_errors.append(f"{model}: {type(last_exc).__name__}: {last_exc}")

    detail = "; ".join(model_errors) if model_errors else "all models returned unusable responses"
    raise RuntimeError(f"All AI models failed for import_study_with_fields: {detail}")
