"""
Parse a pasted or uploaded care study document into the standard chapter/section
structure used by the CareStudy editor.

The AI reads the raw text and returns a JSON object with chapters, each
containing sections with heading + content. The frontend then distributes
this into the study's chapter scaffold.
"""
import json
import re
import sys
from typing import Any

from model_gateway import _candidate_models, _chat_model


# The standard chapter structure matching the NMC Ghana care study format.
# "Additional Pages" is the merged front-matter + closing chapter (preliminary
# sections P.* plus the 6.* summary/conclusion/bibliography sections).
CHAPTER_NAMES = [
    "Additional Pages",
    "Assessment",
    "Analysis of Data",
    "Planning",
    "Implementation",
    "Evaluation",
]
MAX_IMPORT_CHARS = 180_000


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
    if len(raw_text) > MAX_IMPORT_CHARS:
        raw_text = raw_text[:MAX_IMPORT_CHARS] + f"\n\n[...document truncated at {MAX_IMPORT_CHARS:,} characters...]"

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

    model_errors: list[str] = []

    for candidate in models:
        try:
            text = _chat_model(
                system,
                prompt,
                max_tokens=8000,
                label="document import",
                candidates=[candidate],
            )
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
            model_errors.append(f"{candidate.label}: {type(exc).__name__}: {exc}")
            print(
                f"[worker] import_study model {candidate.label} returned invalid JSON: {exc}",
                file=sys.stderr,
                flush=True,
            )
        except Exception as exc:
            model_errors.append(f"{candidate.label}: {type(exc).__name__}: {exc}")
            print(
                f"[worker] import_study model {candidate.label} failed: {exc}",
                file=sys.stderr,
                flush=True,
            )

    detail = "; ".join(model_errors) if model_errors else "all models returned unusable responses"
    raise RuntimeError(f"All AI models failed for import_study: {detail}")


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
    "1.8": ["admissionDate", "admissionRoute", "admittingDiagnosis", "admissionInvestigations", "treatmentStarted", "initialCare", "dischargeDate"],
    "1.9": ["understanding", "perceivedCause", "emotionalResponse"],
    "1.10": ["condition", "definition", "anatomy", "incidence", "causes", "pathophysiology", "clinicalFeatures", "diagnostics", "treatment", "complications", "nursingConsiderations"],
    "1.11": ["validationMethods", "discrepancies"],
    "2.1": ["featuresComparison", "testsComparison", "treatmentComparison"],
    "2.3": ["healthProblems", "potentialProblems", "problemPriority"],
    "2.4": ["generalStrengths", "strengths"],
    "2.5": ["nursingDiagnoses", "diagnosisPriority"],
    "3.1": ["longTerm", "shortTerm", "outcomeCriteria", "familyObjectives"],
    "4.1": ["careGiven", "healthEducation", "familyInvolvement"],
    "4.2": ["dischargeEducation", "longTermNeeds", "communityResources", "dischargeProcess", "dischargeDate", "reviewDate"],
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


def _coverage_report(chapters: list[dict[str, Any]]) -> dict[str, Any]:
    """Report section coverage against the complete studio template."""
    expected = list(SECTION_ID_MAP)
    detected = list(dict.fromkeys(
        section.get("sectionId")
        for chapter in chapters
        for section in chapter.get("sections", [])
        if section.get("sectionId") in SECTION_ID_MAP
    ))
    by_chapter: dict[str, dict[str, Any]] = {}
    chapter_names = {
        "P": "Additional Pages",
        "1": "Assessment",
        "2": "Analysis of Data",
        "3": "Planning",
        "4": "Implementation",
        "5": "Evaluation",
        "6": "Additional Pages",
    }
    for prefix, name in chapter_names.items():
        chapter_expected = [section_id for section_id in expected if section_id.startswith(f"{prefix}.")]
        chapter_detected = [section_id for section_id in detected if section_id.startswith(f"{prefix}.")]
        by_chapter[name] = {
            "expected": chapter_expected,
            "detected": chapter_detected,
            "missing": [section_id for section_id in chapter_expected if section_id not in chapter_detected],
            "complete": len(chapter_expected) == len(chapter_detected),
        }
    return {
        "expected": expected,
        "detected": detected,
        "missing": [section_id for section_id in expected if section_id not in detected],
        "complete": len(detected) == len(expected),
        "byChapter": by_chapter,
    }


def _normalise_heading(value: str) -> str:
    """Normalise heading text for matching Word headings and pasted text."""
    value = re.sub(r"['’]s\b", "", value.lower())
    tokens = re.findall(r"[a-z0-9]+", value)
    return " ".join(token[:-1] if len(token) > 3 and token.endswith("s") else token for token in tokens)


def _section_id_for_heading(value: str, heading_by_normalised: dict[str, str]) -> str | None:
    """Match only a complete standard heading.

    Import text contains many descriptive subheadings (especially in a
    literature review). Fuzzy matching those lines can incorrectly split one
    section into another canonical section, so boundary detection must be
    conservative here.
    """
    normalised = _normalise_heading(value)
    return heading_by_normalised.get(normalised)


def _section_with_draft(section_id: str, draft: str) -> dict[str, Any]:
    fields = _extract_labeled_fields(draft, section_id)
    fields.update(
        {
            key: value
            for key, value in _extract_narrative_fields(draft, section_id).items()
            if key not in fields
        }
    )
    return {
        "sectionId": section_id,
        "heading": SECTION_ID_MAP[section_id],
        "fields": fields,
        "draft": draft.strip(),
    }


def _route_chapter_two_sections(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    routed: list[dict[str, Any]] = []
    cause_markers = re.compile(r"\b(?:cause|causes|etiology|transmitted|mosquito|exposure)\b", re.IGNORECASE)
    drug_markers = re.compile(
        r"\b(?:dose|dosage|mg|tablet|injection|drug|medication|side effects)\b",
        re.IGNORECASE,
    )
    clinical_comparison_markers = re.compile(
        r"(?:comparison of clinical features|comments on clinical features|clinical features exhibited by patient)",
        re.IGNORECASE,
    )
    pharmacology_table = re.compile(
        r"(?im)^Table\s+\d+\s*:\s*Pharmacology of Drugs\b.*$",
    )
    treatment_comparison_markers = re.compile(
        r"(?:comparison of treatment|comments on medical treatment)",
        re.IGNORECASE,
    )
    diagnosis_markers = re.compile(r"\b(?:nursing diagnosis|related to|NANDA)\b", re.IGNORECASE)

    for section in sections:
        section_id = section["sectionId"]
        draft = section["draft"]

        if section_id == "2.2" and cause_markers.search(draft) and not drug_markers.search(draft):
            routed.append(_section_with_draft("2.1", draft))
            continue

        if section_id == "2.3" and clinical_comparison_markers.search(draft):
            routed.append(_section_with_draft("2.1", draft))
            continue

        if section_id == "2.4":
            pharmacology_match = pharmacology_table.search(draft)
            if pharmacology_match and treatment_comparison_markers.search(draft[:pharmacology_match.start()]):
                treatment_text = draft[:pharmacology_match.start()].strip()
                drug_text = draft[pharmacology_match.start():].strip()
                if treatment_text:
                    routed.append(_section_with_draft("2.1", treatment_text))
                if drug_text:
                    routed.append(_section_with_draft("2.2", drug_text))
                continue

        if (
            section_id == "2.5"
            and re.search(r"\bcomplications?\b", draft, re.IGNORECASE)
            and not diagnosis_markers.search(draft)
        ):
            routed.append(_section_with_draft("2.1", draft))
            continue

        routed.append(section)
    return routed


def _infer_docx_care_plan_headings(raw_text: str) -> str:
    """Add missing 3.1/3.2 boundaries when extracted DOCX tables identify a care plan."""
    lines = raw_text.splitlines()
    care_plan_header = re.compile(r"^\s*DOCX table \d+,\s*row 1:\s*(.*)$", re.IGNORECASE)
    care_plan_table_index: int | None = None
    for index, line in enumerate(lines):
        match = care_plan_header.match(line)
        if not match:
            continue
        header = " ".join(re.findall(r"[a-z0-9]+", match.group(1).lower()))
        if all(
            label in header
            for label in (
                "nursing diagnosis",
                "objective outcome criteria",
                "nursing order",
                "nursing intervention",
                "evaluation",
            )
        ):
            care_plan_table_index = index
            break
    if care_plan_table_index is None:
        return raw_text

    def has_section_heading(section_id: str) -> bool:
        pattern = re.compile(rf"^\s*{re.escape(section_id)}(?:\b|[).:\-])", re.IGNORECASE)
        heading_by_normalised = {
            _normalise_heading(heading): mapped_id
            for mapped_id, heading in SECTION_ID_MAP.items()
        }
        return any(
            pattern.match(re.sub(r"^#{1,6}\s*", "", line.strip()))
            or _section_id_for_heading(line.strip(), heading_by_normalised) == section_id
            for line in lines
        )

    insertions: dict[int, list[str]] = {}
    if not has_section_heading("3.2"):
        insertions.setdefault(care_plan_table_index, []).append("3.2 Nursing Care Plan")

    if not has_section_heading("3.1"):
        objectives_start = next(
            (
                index
                for index, line in enumerate(lines[:care_plan_table_index])
                if re.search(
                    r"\b(?:patient(?:\s+and\s+family)?|family)\s+care objectives\b",
                    line,
                    re.IGNORECASE,
                )
            ),
            None,
        )
        if objectives_start is not None:
            insertions.setdefault(objectives_start, []).insert(0, "3.1 Objectives for Patient/Family Care")

    if not insertions:
        return raw_text
    output: list[str] = []
    for index, line in enumerate(lines):
        output.extend(insertions.get(index, []))
        output.append(line)
    return "\n".join(output)


def _extract_labeled_fields(text: str, section_id: str) -> dict[str, str]:
    """Extract unambiguous label/value pairs without requiring an AI call."""
    fields = SECTION_FIELDS.get(section_id, [])
    if not fields:
        return {}

    aliases: dict[str, list[str]] = {
        "initials": ["patient name", "patient initials", "name / initials", "name"],
        "age": ["age"],
        "sex": ["sex", "gender"],
        "dob": ["date of birth", "dob", "birth date"],
        "religion": ["religion"],
        "ethnicity": ["ethnicity", "tribe"],
        "maritalStatus": ["marital status"],
        "occupation": ["occupation"],
        "address": ["address", "residential address"],
        "hospitalNumber": ["hospital number", "hospital no", "patient number"],
        "ward": ["ward"],
        "facility": ["hospital", "health facility", "facility"],
        "admissionDateTime": ["date of admission", "admission date", "date and time of admission"],
        "diagnosis": ["diagnosis", "admitting diagnosis"],
        "informant": ["informant"],
        "familyHistoryPresent": ["known history", "family history", "hereditary or chronic disease"],
        "familyConditions": ["family conditions", "hereditary conditions", "chronic conditions", "conditions found in the family"],
        "familySurgery": ["family surgery", "family surgical history", "significant family surgical history"],
        "pseudonym": ["pseudonym"],
        "chiefComplaint": ["chief complaint", "presenting complaint"],
        "presentingSymptoms": ["presenting symptoms", "symptoms"],
        "admissionDate": ["date of admission", "admission date"],
        "nursingDiagnoses": ["nursing diagnoses", "nursing diagnosis"],
    }
    result: dict[str, str] = {}
    label_to_field = {
        _normalise_heading(alias): field
        for field in fields
        for alias in aliases.get(field, [re.sub(r"(?<!^)([A-Z])", r" \1", field)])
    }
    if not label_to_field:
        return result
    # Match the source label first, then normalise it for lookup. This keeps
    # plural labels such as "Family Conditions" matchable after normalisation.
    pattern = re.compile(r"^\s*([^:|\-]+?)\s*[:\-]\s*(.+?)\s*$", re.IGNORECASE)
    for line in text.splitlines():
        match = pattern.match(line)
        if match:
            pairs = [(match.group(1), match.group(2))]
        else:
            cells = [cell.strip() for cell in line.split("|") if cell.strip()]
            pairs = list(zip(cells[::2], cells[1::2]))
        for label, value in pairs:
            field = label_to_field.get(_normalise_heading(label))
            value = value.strip()
            if field and value and field not in result:
                result[field] = value
    return result


def _extract_narrative_fields(text: str, section_id: str) -> dict[str, str]:
    """Extract only high-confidence facts written as ordinary prose."""
    if section_id == "1.1":
        result: dict[str, str] = {}
        age = re.search(r"\b(\d{1,3})\s*years?\s*old\b", text, re.IGNORECASE)
        if age:
            result["age"] = f"{age.group(1)} years"
        if re.search(r"\b(young\s+)?lady\b|\bwoman\b|\bfemale\b", text, re.IGNORECASE):
            result["sex"] = "Female"
        elif re.search(r"\b(man|male|boy)\b", text, re.IGNORECASE):
            result["sex"] = "Male"
        birth_date = re.search(
            r"\bborn\s+on\s+(?:the\s+)?(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+\d{4})",
            text,
            re.IGNORECASE,
        )
        if birth_date:
            result["dob"] = birth_date.group(1).strip()
        religion = re.search(r"\bis\s+a[n]?\s+(Christian|Muslim|Hindu|traditionalist)\b", text, re.IGNORECASE)
        if religion:
            result["religion"] = religion.group(1).capitalize()
        ethnicity = re.search(r"\bis\s+([A-Za-z][A-Za-z -]+?)\s+by\s+tribe\b", text, re.IGNORECASE)
        if ethnicity:
            result["ethnicity"] = ethnicity.group(1).strip()
        marital_status = re.search(r"\bis\s+(single|married|divorced|widowed|separated)\b", text, re.IGNORECASE)
        if marital_status:
            result["maritalStatus"] = marital_status.group(1).capitalize()
        return result

    if section_id == "1.2":
        result = {}
        if re.search(r"\bno\s+known\s+history\b|\bknown\s+history\s*[:\-]\s*no\b", text, re.IGNORECASE):
            result["familyHistoryPresent"] = "No"
        elif re.search(r"\bknown\s+history\b", text, re.IGNORECASE):
            result["familyHistoryPresent"] = "Yes"
        conditions = re.search(
            r"(?:hereditary|chronic)\s+diseases?\s+like\s+(.+?)(?=\s+in\s+the\s+family|[.;])",
            text,
            re.IGNORECASE,
        )
        if conditions:
            result["familyConditions"] = conditions.group(1).strip()
        occupation = re.search(
            r"(?:family|they)\s+derives?\s+(?:their\s+)?financial\s+support\s+from\s+(?:their\s+)?occupation\s*\[?([^].,;]+)",
            text,
            re.IGNORECASE,
        )
        if occupation:
            result["familyOccupation"] = occupation.group(1).strip()
        return result

    return {}


def _deterministic_import(raw_text: str) -> dict | None:
    """Build an import result from explicit section headings and labels.

    Returning None means the document needs the AI classifier. Returning a
    result, including one with unmapped narrative omitted, means the document
    had enough structure to import without an external model.
    """
    raw_text = _infer_docx_care_plan_headings(raw_text)
    heading_by_normalised = {
        _normalise_heading(heading): section_id
        for section_id, heading in SECTION_ID_MAP.items()
    }
    heading_by_normalised.update(
        {
            _normalise_heading("Patient and Family Strengths"): "2.4",
            _normalise_heading("Patient/Family Health Problems"): "2.3",
            _normalise_heading("Nursing Diagnosis"): "2.5",
        }
    )
    chapter_names_by_number = {
        "1": "Assessment", "i": "Assessment", "one": "Assessment",
        "2": "Analysis of Data", "ii": "Analysis of Data", "two": "Analysis of Data",
        "3": "Planning", "iii": "Planning", "three": "Planning",
        "4": "Implementation", "iv": "Implementation", "four": "Implementation",
        "5": "Evaluation", "v": "Evaluation", "five": "Evaluation",
        "6": "Additional Pages", "vi": "Additional Pages", "six": "Additional Pages",
    }
    chapter_heading_pattern = re.compile(
        r"^\s*chapter\s+(one|two|three|four|five|six|i{1,3}|iv|v|vi|[1-6])"
        r"\b(?:\s*[:.)\-–—]?\s*(.*?))?\s*$",
        re.IGNORECASE,
    )
    heading_pattern = re.compile(
        r"^\s*((?:P|[1-6])\.\d+(?:\.\d+)*)\s*[).:\-]?\s*(.*?)\s*$",
        re.IGNORECASE,
    )
    sections: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    def chapter_for_section(section_id: str) -> str:
        if section_id.startswith(("P.", "6.")):
            return "Additional Pages"
        return chapter_names_by_number.get(section_id[0], "Assessment")

    def finish_section() -> None:
        nonlocal current
        if not current:
            return
        current["draft"] = "\n".join(current["lines"]).strip()
        current.pop("lines", None)
        current["fields"] = _extract_labeled_fields(current["draft"], current["sectionId"])
        current["fields"].update(
            {
                key: value
                for key, value in _extract_narrative_fields(current["draft"], current["sectionId"]).items()
                if key not in current["fields"]
            }
        )
        sections.append(current)
        current = None

    chapter_order: list[str] = []
    chapter_intro_lines: dict[str, list[str]] = {}
    intro_lines: list[str] = []
    preamble_lines: list[str] = []
    pending_section_lead_in: list[str] = []
    active_chapter: str | None = None
    chapter_title_pending = False

    def add_chapter(chapter_name: str) -> None:
        if chapter_name not in chapter_order:
            chapter_order.append(chapter_name)

    def finish_intro() -> None:
        if active_chapter and intro_lines:
            chapter_intro_lines.setdefault(active_chapter, []).extend(intro_lines)
            intro_lines.clear()

    def take_section_lead_in(lines: list[str]) -> list[str]:
        for index, line in enumerate(lines):
            if re.search(r"\bthis section\b", line, re.IGNORECASE):
                lead_in = lines[index:]
                del lines[index:]
                return lead_in
        return []

    def flush_pending_section_lead_in() -> None:
        if current and pending_section_lead_in:
            current["lines"].extend(pending_section_lead_in)
            pending_section_lead_in.clear()

    chapter_title_names = {
        _normalise_heading(name): chapter_names_by_number[number]
        for number, name in {
            "1": "Assessment",
            "2": "Analysis of Data",
            "3": "Planning",
            "4": "Implementation",
            "5": "Evaluation",
            "6": "Summary and Conclusion",
        }.items()
    }
    chapter_title_names[_normalise_heading("Additional Pages")] = "Additional Pages"

    for raw_line in raw_text.splitlines():
        line = re.sub(r"^#{1,6}\s*", "", raw_line.strip())
        chapter_match = chapter_heading_pattern.match(line)
        if chapter_match:
            flush_pending_section_lead_in()
            finish_section()
            finish_intro()
            preamble_lines.clear()
            active_chapter = chapter_names_by_number[chapter_match.group(1).lower()]
            add_chapter(active_chapter)
            chapter_title_pending = not bool((chapter_match.group(2) or "").strip())
            continue

        normalised_line = _normalise_heading(line)
        if chapter_title_pending and line:
            chapter_title_pending = False
            if normalised_line in chapter_title_names or normalised_line in {
                "introduction",
                "chapter introduction",
            }:
                continue
        if normalised_line in chapter_title_names:
            flush_pending_section_lead_in()
            finish_section()
            finish_intro()
            preamble_lines.clear()
            active_chapter = chapter_title_names[normalised_line]
            add_chapter(active_chapter)
            continue

        match = heading_pattern.match(line)
        raw_section_id = match.group(1).upper() if match else None
        heading = match.group(2).strip() if match else ""
        if re.search(r"(?:\.{3,}|…{2,})", line):
            match = None
            raw_section_id = None
            heading = ""

        if raw_section_id and raw_section_id.startswith(tuple(f"{number}." for number in "123456")):
            parts = raw_section_id.split(".")
            if len(parts) == 2 and parts[1] == "0":
                flush_pending_section_lead_in()
                finish_section()
                finish_intro()
                preamble_lines.clear()
                active_chapter = chapter_names_by_number[parts[0]]
                add_chapter(active_chapter)
                chapter_title_pending = False
                continue

        nested_heading = False
        section_id = raw_section_id
        if section_id and len(section_id.split(".")) > 2:
            nested_heading = True
            section_id = ".".join(section_id.split(".")[:2])
        if not match:
            section_id = _section_id_for_heading(line, heading_by_normalised)
            heading = line
        if section_id not in SECTION_ID_MAP:
            section_id = _section_id_for_heading(heading, heading_by_normalised)

        if section_id:
            section_lead_in: list[str] = []
            if current and pending_section_lead_in:
                if current["sectionId"] != section_id:
                    section_lead_in = pending_section_lead_in[:]
                    pending_section_lead_in.clear()
                else:
                    flush_pending_section_lead_in()
            if nested_heading and current and current["sectionId"] == section_id:
                current["lines"].append(line)
                continue
            if nested_heading and current is None and not section_lead_in:
                section_lead_in = take_section_lead_in(intro_lines)
                if not section_lead_in:
                    section_lead_in = take_section_lead_in(preamble_lines)
            finish_section()
            finish_intro()
            preamble_lines.clear()
            section_chapter = chapter_for_section(section_id)
            if active_chapter != section_chapter:
                active_chapter = section_chapter
            add_chapter(active_chapter)
            current = {
                "sectionId": section_id,
                "heading": SECTION_ID_MAP[section_id],
                "lines": [*section_lead_in, *([line] if nested_heading else [])],
                "fields": {},
                "draft": "",
            }
            continue
        if current:
            if pending_section_lead_in or re.search(r"\bthis section\b", line, re.IGNORECASE):
                pending_section_lead_in.append(raw_line.rstrip())
            else:
                current["lines"].append(raw_line.rstrip())
        elif active_chapter and line:
            intro_lines.append(raw_line.rstrip())
        elif line:
            preamble_lines.append(raw_line.rstrip())

    flush_pending_section_lead_in()
    finish_section()
    finish_intro()
    sections = _route_chapter_two_sections(sections)

    if not sections and not chapter_intro_lines:
        return None
    chapter_by_name: dict[str, dict[str, Any]] = {
        chapter_name: {"name": chapter_name, "sections": []}
        for chapter_name in chapter_order
    }
    for chapter_name, lines in chapter_intro_lines.items():
        intro = "\n".join(lines).strip()
        if intro:
            chapter_by_name.setdefault(chapter_name, {"name": chapter_name, "sections": []})["intro"] = intro
    section_by_id: dict[str, dict[str, Any]] = {}
    for section in sections:
        section_id = section["sectionId"]
        chapter_name = chapter_for_section(section_id)
        chapter = chapter_by_name.setdefault(
            chapter_name,
            {"name": chapter_name, "sections": []},
        )
        existing = section_by_id.get(section_id)
        if existing is None:
            section_by_id[section_id] = section
            chapter["sections"].append(section)
        else:
            existing_draft = existing["draft"]
            repeated_draft = section["draft"]
            if repeated_draft and repeated_draft not in existing_draft:
                if existing_draft and existing_draft not in repeated_draft:
                    existing["draft"] = f"{existing_draft}\n\n{repeated_draft}"
                else:
                    existing["draft"] = repeated_draft
            existing["fields"].update(
                {key: value for key, value in section["fields"].items() if key not in existing["fields"]}
            )
    chapters = list(chapter_by_name.values())
    return {
        "title": {},
        "chapters": chapters,
        "importMode": "deterministic",
        "unmappedText": "",
        "coverage": _coverage_report(chapters),
    }


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
    if len(raw_text) > MAX_IMPORT_CHARS:
        raw_text = raw_text[:MAX_IMPORT_CHARS] + f"\n\n[...document truncated at {MAX_IMPORT_CHARS:,} characters...]"

    deterministic = _deterministic_import(raw_text)
    if deterministic is not None:
        return deterministic

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
        '      "intro": "Verbatim chapter-introduction text before the first numbered section, or empty string if none",\n'
        '      "sections": [\n'
        '        { "sectionId": "1.1", "heading": "Patient\'s Particulars",\n'
        '          "fields": { "initials": "extracted value", "age": "extracted value", ... },\n'
        '          "draft": "Complete section text copied faithfully from the document" },\n'
        "      ]\n    }\n  ]\n}\n\n"
        "Rules:\n"
        "- Every section MUST have a 'sectionId' that matches one of the IDs listed above.\n"
        "- The 'heading' should match the standard heading for that sectionId.\n"
        "- Text after a chapter heading and before its first numbered section belongs in that chapter's 'intro', "
        "not in the preceding section. Preserve the wording exactly.\n"
        "- Treat only an explicit numbered heading (for example, '1.10 Literature Review') "
        "or an exact standard heading as a section boundary.\n"
        "- Subheadings inside Literature Review, including Definition, Incidence, Causes, "
        "Pathophysiology, Signs and Symptoms, Diagnostic Investigations, Medical Management, "
        "Nursing Management, Prevention, and Complications, must remain in section 1.10; "
        "do not map them to other canonical sections.\n"
        "- The 'draft' is the FULL text of the section from the document. Copy it verbatim; do not summarize, "
        "rewrite, polish, or replace it with an interpretation.\n"
        "- Preserve every table heading, row, and cell as source text. Never replace a table with prose that "
        "describes or infers what the table means.\n"
        "- The 'fields' object extracts specific values from the text. Use the field IDs listed above.\n"
        "  Only include fields you can confidently extract. Omit fields you cannot find.\n"
        "  For field values, use SHORT extracted values (names, dates, numbers), not full sentences.\n"
        "  Long narrative text belongs in 'draft', not in 'fields'.\n"
        "- Care-plan tables with columns for Nursing Diagnosis, Objective/Outcome Criteria, Nursing Orders, "
        "Nursing Interventions, and Evaluation belong in section 3.2 'Nursing Care Plan', never in section 3.1.\n"
        "- Sections with only a table (drugs, care plan, home visits, bibliography) should have\n"
        "  the table text in 'draft' and an empty 'fields' object.\n"
        "- If a chapter has no matching content, include it with an empty 'intro' and 'sections' array.\n"
        "- Do NOT invent content. Only include text that exists in the source document."
    )

    prompt = f"PASTE THE CARE STUDY DOCUMENT BELOW:\n\n{raw_text}"

    model_errors: list[str] = []

    for candidate in models:
        try:
            text = _chat_model(
                system,
                prompt,
                max_tokens=12000,
                label="structured document import",
                candidates=[candidate],
            )
            if text.startswith("```"):
                lines = text.split("\n")
                if lines[-1].strip() == "```":
                    text = "\n".join(lines[1:-1])
                elif lines[0].strip().startswith("```"):
                    text = "\n".join(lines[1:])

            result = json.loads(text)
            if "chapters" not in result or not isinstance(result["chapters"], list):
                raise ValueError("Response missing 'chapters' array")
            result["importMode"] = "ai"
            result["coverage"] = _coverage_report(result.get("chapters", []))
            return result
        except (json.JSONDecodeError, ValueError) as exc:
            model_errors.append(f"{candidate.label}: {type(exc).__name__}: {exc}")
            print(
                f"[worker] import_study_with_fields model {candidate.label} returned invalid JSON: {exc}",
                file=sys.stderr,
                flush=True,
            )
        except Exception as exc:
            model_errors.append(f"{candidate.label}: {type(exc).__name__}: {exc}")
            print(
                f"[worker] import_study_with_fields model {candidate.label} failed: {exc}",
                file=sys.stderr,
                flush=True,
            )

    detail = "; ".join(model_errors) if model_errors else "all models returned unusable responses"
    raise RuntimeError(f"All AI models failed for import_study_with_fields: {detail}")
