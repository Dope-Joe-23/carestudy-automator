"""
Rule-based Chapter 4 (Implementation) builders.

The school's sample care studies write Chapter 4 in a fixed shape:

  4.1  An opening summary paragraph (care span, admission -> discharge dates,
       the patient's presenting problems) followed by bold day-by-day
       sub-headings narrating the documented care.
  4.2  A short narrative: preparation started on admission day, education on
       the condition/medications/diet/danger signs, family involvement, and
       the discharge process with long-term needs and referrals.

These builders derive every sentence from data the student already collected
(Chapters 1-3) and mark anything undocumented as an explicit bracketed
placeholder for the student to fill — the engine must never turn a proposed
plan into an event that happened. Output feeds the LLM polish pass in
draft_worker.py and serves as the field-by-cell fallback.
"""
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional


def _clean_list(values: Optional[List[str]]) -> List[str]:
    return [str(v).strip() for v in (values or []) if str(v).strip()]


def _patient_label(patient: Dict[str, str]) -> str:
    """'Mrs. M.A' from the particulars, falling back to 'the patient'."""
    for key in ("initials", "patientName", "name"):
        value = str(patient.get(key, "") or "").strip()
        if value:
            return value
    return "the patient"


def _admission_date(patient: Dict[str, str], admission: Dict[str, str]) -> str:
    for source in (admission, patient):
        for key in ("admissionDate", "admissionDateTime"):
            value = str(source.get(key, "") or "").strip()
            if value:
                return value
    return ""


# Prefix stored in a 4.3 date cell when the date was computed by the engine
# (from the 4.2 discharge date) rather than documented by the student. The
# card editor surfaces it as a confirm badge; every serializer strips it so
# an unverified date never reaches a draft or the Word export.
SUGGESTED_DATE_PREFIX = "suggested:"


def strip_suggested_date_marker(raw: str) -> str:
    """Remove the engine-suggested marker from a date cell value."""
    text = str(raw or "").strip()
    if text.lower().startswith(SUGGESTED_DATE_PREFIX):
        return text[len(SUGGESTED_DATE_PREFIX):].strip()
    return text


def has_suggested_date_marker(raw: str) -> bool:
    """True when the date cell still carries the engine-suggested marker."""
    return str(raw or "").strip().lower().startswith(SUGGESTED_DATE_PREFIX)


def _drug_phrase(drugs: List[str]) -> str:
    """'IV Paracetamol 1 g, Tab Amoxicillin 500 mg' from the 2.2 drug names."""
    if not drugs:
        return ""
    if len(drugs) == 1:
        return drugs[0]
    return ", ".join(drugs[:-1]) + " and " + drugs[-1]


# ---------------------------------------------------------------------------
# 4.2 — Preparation of Patient and Family for Discharge and Rehabilitation
# ---------------------------------------------------------------------------

_DISCHARGE_FIELDS = (
    "dischargeEducation",
    "longTermNeeds",
    "communityResources",
    "dischargeProcess",
)


def build_discharge_preparation(
    patient: Dict[str, str],
    drugs: List[str],
    diagnoses: List[str],
    patient_context: str = "",
    review_date: str = "",
) -> Dict[str, str]:
    """Deterministic 4.2 field drafts mapping onto the section's fields.

    Every field is grounded in the collected data; specifics the samples
    include but the student has not documented (review date, referral
    details) appear as bracketed placeholders instead of invented facts.
    A documented `review_date` (4.2's structured field) replaces the
    review-date placeholder in the discharge-education draft and also drives
    the Day-of-Review block in 4.3.
    """
    label = _patient_label(patient)
    diagnosis = str(patient.get("diagnosis", "") or "").strip()
    date = _admission_date(patient, {})
    drug_phrase = _drug_phrase(_clean_list(drugs))
    diagnoses = _clean_list(diagnoses)
    context = str(patient_context or "").strip()

    condition_ref = diagnosis or (diagnoses[0] if diagnoses else "the diagnosed condition")

    discharge_education = (
        f"Preparation of {label} and family for discharge and rehabilitation "
        f"started on the day of admission"
        + (f" ({date})" if date else "")
        + " and continued until discharge. Patient and family were informed that "
        "hospital admission is a temporary environment for professional caregiving, "
        f"and were educated on {condition_ref} — its cause, signs and symptoms, "
        "complications, and prevention. "
        + (
            f"Medication education covered the prescribed medications ({drug_phrase}): "
            "the name of each drug, its purpose, the dose, route and frequency, the "
            "importance of completing the full course, and the need never to share "
            "left-over medicines. "
            if drug_phrase
            else "Medication education covered the prescribed medications — each "
            "drug's name, purpose, dose, route and frequency, completing the full "
            "course, and never sharing left-over medicines. "
        )
        + "Dietary education was given, including foods to favour and those to "
        "avoid, and family members were taught the danger signs that require "
        "an immediate report to the hospital — [state the specific danger signs "
        "taught]. "
        + (
            f"A review date was communicated to patient and family — "
            f"{_date_phrase(review_date)}."
            if review_date
            else "A review date was communicated to patient and family — "
            "[state the review date]."
        )
    )

    long_term_needs = (
        "Long-term needs discussed with patient and family included continued "
        "medication adherence at home after discharge, keeping all follow-up "
        "appointments, adequate rest and gradual return to normal activity, and "
        "the lifestyle adjustments needed to prevent recurrence of "
        f"{condition_ref}. Family responsibilities agreed for home care were "
        "[state the family's agreed responsibilities — e.g. reminding the patient "
        "to take medications, preparing recommended meals, and accompanying the "
        "patient to review appointments]. "
        + (f"These needs were grounded in the patient's documented history: {context} " if context else "")
        + "Rehabilitation priorities for the patient were [state any activity, "
        "dietary, or self-care goals for rehabilitation]."
    )

    community_resources = (
        "Continuity of care after discharge was planned through [state the "
        "community resources and referrals used — e.g. referral to the medical "
        "outpatient clinic, a community health nurse home visit, or a nearest-"
        "clinic plan]. Patient and family were informed of where and when to "
        "seek help if the condition worsened before the review date — "
        "[state the facility or contact given]."
    )

    discharge_process = (
        "The discharge process was gradual: patient and family were involved in "
        "every step from admission, demonstrations and teach-back were used to "
        "confirm understanding of the education given, and the discharge "
        "summary and medications were handed over with clear instructions. "
        f"{label} and family expressed understanding of the discharge plan — "
        "[state how understanding was verified, e.g. the patient correctly "
        "recalled the medication schedule and danger signs during teach-back] — "
        "and were discharged home in a stable condition."
    )

    return {
        "dischargeEducation": discharge_education,
        "longTermNeeds": long_term_needs,
        "communityResources": community_resources,
        "dischargeProcess": discharge_process,
    }


# ---------------------------------------------------------------------------
# 4.1 — Summary of the Actual Nursing Care (day-by-day skeleton)
# ---------------------------------------------------------------------------

def build_care_summary_skeleton(
    patient: Dict[str, str],
    admission: Dict[str, str],
    care_plan_rows: List[List[str]],
    drugs: List[str],
) -> Dict[str, object]:
    """Deterministic 4.1 skeleton: opening paragraph + per-day/per-problem notes.

    The sample studies narrate care day by day. The student's records usually
    document care per problem (the 3.2 care-plan rows), so the skeleton
    provides: the opening summary paragraph in the samples' style, a
    day-of-admission block from the documented admission care, a per-problem
    care outline from the care-plan rows, and explicit placeholders marking
    the day-by-day details only the student can supply.

    Returns {"opening": str, "days": [{"heading": str, "points": [str, ...]}]}.
    """
    label = _patient_label(patient)
    diagnosis = str(patient.get("diagnosis", "") or "").strip()
    ward = str(patient.get("ward", "") or "").strip()
    admission_date = _admission_date(patient, admission)
    drugs = _clean_list(drugs)
    drug_phrase = _drug_phrase(drugs)

    problems: List[str] = []
    interventions_by_problem: List[tuple] = []
    for row in care_plan_rows:
        if not row or not any(str(cell or "").strip() for cell in row):
            continue
        diagnosis_cell = str(row[1] if len(row) > 1 else row[0]).strip()
        orders = str(row[3] if len(row) > 3 else "").strip()
        interventions = str(row[4] if len(row) > 4 else "").strip()
        if diagnosis_cell and diagnosis_cell.lower() not in {p.lower() for p in problems}:
            problems.append(diagnosis_cell)
        if diagnosis_cell and (orders or interventions):
            interventions_by_problem.append((diagnosis_cell, orders, interventions))

    problem_list = ", ".join(problems[:6]) if problems else (
        diagnosis or "the identified health problems"
    )

    opening = (
        f"Comprehensive nursing care was given to {label}"
        + (f" from {admission_date}" if admission_date else " during the period of admission")
        + (f" to the day of discharge" if admission_date else "")
        + (f" at the {ward}" if ward else "")
        + (f". {label} came with the following health problems: {problem_list}."
           if problems else
           f". Care targeted {problem_list}.")
        + (f" Prescribed medications ({drug_phrase}) were administered as charted."
           if drug_phrase else
           " Prescribed treatment was administered as recorded.")
        + " The care rendered is summarised day by day below."
    )

    days: List[Dict[str, object]] = []

    admission_points: List[str] = []
    route = str(admission.get("admissionRoute", "") or "").strip()
    investigations = str(admission.get("admissionInvestigations", "") or "").strip()
    treatment = str(admission.get("treatmentStarted", "") or "").strip()
    initial_care = str(admission.get("initialCare", "") or "").strip()
    if admission_date:
        admission_points.append(
            f"{label} was admitted"
            + (f" through {route}" if route and not route.lower().startswith(("through", "via")) else (f" — {route}" if route else ""))
            + (f" on {admission_date}" if admission_date else "")
            + ". [Describe the reception, orientation to the ward, and the patient's condition on arrival.]"
        )
    if investigations:
        admission_points.append(f"Investigations requested: {investigations}.")
    if treatment:
        admission_points.append(f"Treatment started: {treatment}.")
    if initial_care:
        admission_points.append(f"Immediate nursing care: {initial_care}.")
    vital_prefixes = ("admission",)
    vitals = {
        key: str(admission.get(key, "") or "").strip()
        for key in admission
        if any(key.startswith(p) for p in vital_prefixes)
        and str(admission.get(key, "") or "").strip()
    }
    if vitals:
        vital_text = "; ".join(f"{k.replace('admission', '', 1).capitalize()}: {v}" for k, v in vitals.items())
        admission_points.append(f"Vital signs on admission — {vital_text}.")
    if admission_date:
        days.append({"heading": f"Day of Admission ({admission_date})", "points": admission_points or ["[Document the care given on the day of admission.]"]})

    for problem, orders, interventions in interventions_by_problem[:8]:
        points = []
        if orders:
            points.append(f"Planned orders — {orders}")
        if interventions:
            points.append(f"Documented interventions — {interventions}")
        points.append("[State the date and time this objective was set and met, and the evidence observed.]")
        days.append({"heading": f"Care for {problem}", "points": points})

    days.append({
        "heading": "Day of Discharge ([date])",
        "points": [
            "[Describe the patient's condition on the discharge day, the discharge "
            "planning completed (see 4.2), medications handed over, and the review "
            "date given.]",
        ],
    })

    return {"opening": opening, "days": days}


# ---------------------------------------------------------------------------
# 4.3 — Follow-up / Home Visit / Continuity of Care (per-visit skeleton)
# ---------------------------------------------------------------------------

# The samples' visit purposes are conventional: visit 1 happens before
# discharge (home-environment / risk-factor assessment), visit 2 after
# discharge (recovery + adherence), and the final visit confirms recovery
# and hands over to a community health nurse. The student's own "Day of
# Review" OPD note is a common interleaved block.

_VISIT1_PURPOSE = (
    "to assess the home environment and identify factors that could worsen "
    "{poss}, and to begin educating the family on managing "
    "them"
)
_VISIT2_PURPOSE = (
    "to assess {poss} recovery at home after discharge, reinforce "
    "medication adherence, and provide continued health education and "
    "support"
)
_VISIT3_PURPOSE = (
    "to confirm {poss} full recovery, provide final health education, "
    "and hand over continuing care to the community health nurse"
)

# Conventional education topics for each visit, phrased to carry the
# student's documented specifics once merged in.
_VISIT1_EDUCATION_SEEDS = (
    "the identification and management of risk factors in the home associated "
    "with {condition}",
)
_VISIT2_EDUCATION_SEEDS = (
    "medication adherence — completing the full course as prescribed",
    "keeping the review appointment and reporting warning signs early",
)
_VISIT3_EDUCATION_SEEDS = (
    "sustaining the lifestyle changes taught during the period of care",
)

# Column indices of the 4.3 home-visits grid:
# [Date / visit, Objectives, Assessment & findings, Education, Outcome].
_COL_DATE = 0
_COL_OBJECTIVES = 1
_COL_FINDINGS = 2
_COL_EDUCATION = 3
_COL_OUTCOME = 4


def _join_phrases(items: List[str]) -> str:
    """'a, b and c' for phrase lists (no Oxford comma, matching the samples)."""
    items = [item for item in items if item]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " and " + items[-1]


def _date_phrase(raw: str) -> str:
    """Light normalisation of a student-entered date/visit label.

    The app's date pickers store ISO values ("2023-08-31" or
    "2023-08-31T09:00") in the date cell; prose headings want the samples'
    style ("31st August, 2023"). Engine-suggested dates carry the
    "suggested:" marker, which is stripped here and replaced with an explicit
    placeholder so unverified dates never read as documented facts.
    Free-text labels pass through unchanged.
    """
    suggested = has_suggested_date_marker(raw)
    text = strip_suggested_date_marker(raw).rstrip(",;")
    if not text:
        return ""
    normalized = text.replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            phrase = _ordinal_date(datetime.strptime(normalized, fmt))
            return f"[confirm the suggested date: {phrase}]" if suggested else phrase
        except ValueError:
            continue
    return f"[confirm the suggested date: {text}]" if suggested else text


# Base-form verbs a student's objectives cell typically starts with
# ("assess home environment", "review progress at the OPD").
_OBJECTIVE_VERBS = (
    "assess", "evaluate", "monitor", "review", "check", "confirm",
    "determine", "observe", "reinforce", "provide", "educate", "teach",
    "identify", "examine", "follow up", "follow-up", "assessing",
)


def _purpose_from_objectives(objectives: str) -> str:
    """'The purpose of this visit was to assess...' from the objectives cell.

    A verb-phrase cell gets 'to ' inserted; a noun phrase ("OPD review")
    reads correctly without it.
    """
    text = objectives.strip().rstrip(".")
    lowered = text.lower()
    if lowered.startswith("to "):
        return f"The purpose of this visit was {text}."
    if any(lowered.startswith(verb) for verb in _OBJECTIVE_VERBS):
        return f"The purpose of this visit was to {text}."
    return f"The purpose of this visit was {text}."


def _documented_visit_education(row: List[str]) -> str:
    """The education cell, minus anything already carried by the seeds."""
    documented = str(row[_COL_EDUCATION] if len(row) > _COL_EDUCATION else "").strip()
    if not documented:
        return ""
    return documented


_SOCIO_LABELS = (
    ("housing", "housing"),
    ("water", "water source"),
    ("sanitation", "sanitation"),
    ("familyType", "family type"),
    ("dependents", "dependents"),
)


def _environment_parts(socio: Dict[str, str]) -> str:
    """'housing — 3-bedroom self-contained; water source — pipe-borne' from 1.3.

    Label style keeps the text grammatical whatever phrasing the student used.
    Returns "" when nothing is documented.
    """
    parts: List[str] = []
    for key, label in _SOCIO_LABELS:
        value = str(socio.get(key, "") or "").strip().rstrip(".")
        if value:
            parts.append(f"{label} — {value[0].lower() + value[1:]}")
    return "; ".join(parts)


def _environment_sentence(socio: Dict[str, str]) -> str:
    """Grounded home-environment sentence from the 1.3 socio-economic facts.

    The samples' first home visit assesses the home environment — but the
    student already documented housing, water, sanitation, and family size in
    section 1.3, so that data seeds the findings instead of being retyped.
    Returns "" when nothing is documented.
    """
    parts = _environment_parts(socio or {})
    if not parts:
        return ""
    return (
        "From the family's socio-economic background documented in Chapter 1: "
        + parts
        + "."
    )


def _parse_date(raw: str) -> Optional[datetime]:
    """Parse the discharge-date field (ISO from the date input, or d/m/Y)."""
    text = str(raw or "").strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def _ordinal_date(value: datetime) -> str:
    """datetime(2023, 8, 25) -> '25th August, 2023' (the samples' style)."""
    day = value.day
    suffix = "th" if 11 <= day % 100 <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    return f"{day}{suffix} {value.strftime('%B')}, {value.year}"


def build_home_visit_skeleton(
    patient: Dict[str, str],
    drugs: List[str],
    diagnoses: List[str],
    discharge: Dict[str, str],
    socio: Dict[str, str],
    visit_rows: List[List[str]],
    admission: Optional[Dict[str, str]] = None,
) -> Dict[str, object]:
    """Deterministic 4.3 skeleton: definition paragraph + per-visit blocks.

    Mirrors build_care_summary_skeleton for the samples' 4.3 shape: an opening
    paragraph defining home visits and their purpose, then one block per
    documented visit (or the conventional three when the grid is empty) with a
    derived heading, purpose sentence, documented findings, education pulled
    from the visit row plus the documented 4.2 discharge education, and an
    outcome / handover point. Anything the student has not documented appears
    as an explicit bracketed placeholder — never an invented fact.

    Two grounded shortcuts reduce retyping:
      - `discharge` may carry `dischargeDate` (section 4.2), from which the
        conventional visit dates (pre-discharge, +7, +14 days) are suggested.
      - `socio` carries the 1.3 socio-economic facts (housing, water,
        sanitation, family type, dependents), which seed the first visit's
        environment findings.
      - `admission` may carry the 1.8-mirrored `dischargeDate`, used when 4.2
        has not documented its own discharge date.

    Returns {"opening": str, "visits": [{"heading", "paragraph"}]}.
    """
    label = _patient_label(patient)
    diagnosis = str(patient.get("diagnosis", "") or "").strip()
    drugs = _clean_list(drugs)
    diagnoses = _clean_list(diagnoses)
    condition = diagnosis or (diagnoses[0] if diagnoses else "the diagnosed condition")

    discharge_education = str(discharge.get("dischargeEducation", "") or "").strip()
    community_resources = str(discharge.get("communityResources", "") or "").strip()
    environment_sentence = _environment_sentence(socio or {})
    environment_parts = _environment_parts(socio or {})
    # The discharge date may be documented in 4.2 or mirrored in 1.8; prefer
    # 4.2 (the discharge narrative's own section) when both are present.
    discharge_date = _parse_date(str(discharge.get("dischargeDate", "") or ""))
    if discharge_date is None:
        discharge_date = _parse_date(str((admission or {}).get("dischargeDate", "") or ""))
    # The structured 4.2 review date drives the conventional Day-of-Review
    # block (and replaces the review-date placeholder in the 4.2 drafts).
    review_date = _parse_date(str(discharge.get("reviewDate", "") or ""))

    # Conventional per-position content, overridable per row below.
    # 'Mrs. T.T's hypertension', or 'the patient's condition' when no
    # diagnosis is documented yet.
    poss = f"{label}'s {condition}" if condition != "the diagnosed condition" else f"{label}'s condition"
    purposes = [
        _VISIT1_PURPOSE.format(poss=poss),
        _VISIT2_PURPOSE.format(poss=poss),
        _VISIT3_PURPOSE.format(poss=poss),
    ]
    education_seeds_by_visit = [
        [seed.format(condition=condition) for seed in _VISIT1_EDUCATION_SEEDS],
        [seed.format(condition=condition) for seed in _VISIT2_EDUCATION_SEEDS],
        [seed.format(condition=condition) for seed in _VISIT3_EDUCATION_SEEDS],
    ]

    opening = (
        "Follow-up home visits are visits paid to the patient's home after "
        "(or shortly before) discharge to continue the care started in the "
        "hospital — assessing the home environment, identifying risk factors, "
        "reinforcing the education given, and ensuring continuity of care "
        "until the interaction is formally terminated."
    )

    # Normalise the documented rows: keep only rows with any content, and pad
    # each to the full five cells.
    rows: List[List[str]] = []
    for row in visit_rows or []:
        if not row or not any(str(cell or "").strip() for cell in row):
            continue
        rows.append([str(row[i] if i < len(row) else "") for i in range(5)])

    # No documented visits: pre-seed the conventional three with empty
    # date/findings/outcome placeholders so the student only fills facts.
    if not rows:
        rows = [
            ["", "", "", "", ""],
            ["", "", "", "", ""],
            ["", "", "", "", ""],
        ]

    ordinal_names = ("First", "Second", "Third", "Fourth", "Fifth")
    drug_phrase = _drug_phrase(drugs)
    # Conventional visit spacing from the documented discharge date:
    # pre-discharge (the day before), +1 week, +2 weeks.
    suggested_dates: tuple = ()
    if discharge_date:
        suggested_dates = (
            discharge_date - timedelta(days=1),
            discharge_date + timedelta(days=7),
            discharge_date + timedelta(days=14),
        )
    visits: List[Dict[str, object]] = []
    seen_headings: set = set()
    # Per-visit flags for the card editor: True while a visit's date is still
    # an engine suggestion the student hasn't confirmed.
    suggested_date_flags: Dict[int, bool] = {}

    for index, row in enumerate(rows):
        is_final = index == len(rows) - 1
        date_phrase = _date_phrase(row[_COL_DATE])

        heading = ""
        raw_label = date_phrase
        position_hint = ""
        if raw_label:
            lowered = raw_label.lower()
            if "review" in lowered:
                # Strip a leading 'Review' / 'Day of Review' label so the
                # parenthetical carries just the date: 'Review — 13th Sept'
                # → 'Day of Review (13th Sept)'.
                stripped = re.sub(
                    r"^\s*day\s+of\s+review\s*[:,—\-]*\s*|^\s*review\s*[:,—\-]*\s*",
                    "",
                    raw_label,
                    flags=re.IGNORECASE,
                ).strip()
                heading = f"Day of Review ({stripped or raw_label})"
                position_hint = "review"
            elif "visit" in lowered:
                heading = raw_label if raw_label[0].isupper() else f"{raw_label.capitalize()}"
                # "visit 1 — pre-discharge, 5th Sept" style labels keep their
                # position hint for the purpose sentence.
                position_hint = "pre" if "pre-discharge" in lowered else (
                    "post" if "post" in lowered or "after" in lowered else ""
                )
        if not heading:
            ordinal = ordinal_names[index] if index < len(ordinal_names) else f"{index + 1}th"
            if date_phrase:
                heading = f"{ordinal} Home Visit ({date_phrase})"
            elif suggested_dates and index < len(suggested_dates):
                # Marked as a suggestion — the student confirms the dates.
                heading = f"{ordinal} Home Visit ([suggested: {_ordinal_date(suggested_dates[index])}])"
            else:
                heading = f"{ordinal} Home Visit ([state the date])"
            # Position hints from the documented objectives cell.
            objectives_text = str(row[_COL_OBJECTIVES] or "").lower()
            if "environment" in objectives_text and "discharge" not in objectives_text:
                position_hint = position_hint or "pre"
        if heading in seen_headings:
            ordinal = ordinal_names[index] if index < len(ordinal_names) else f"{index + 1}th"
            heading = f"{heading} ({date_phrase or f'visit {index + 1}'})"
        seen_headings.add(heading)

        # Purpose: conventional purpose by position, unless the student
        # documented their own objectives (which win).
        if str(row[_COL_OBJECTIVES] or "").strip():
            purpose = _purpose_from_objectives(str(row[_COL_OBJECTIVES]))
        elif position_hint == "review":
            purpose = "The purpose of this appointment was to assess the response to treatment and evaluate progress since discharge."
        else:
            purpose = (
                f"The purpose of this visit was {purposes[index] if index < len(purposes) else purposes[1]}"
                "."
            )

        # Findings: documented content, else the 1.3 socio-economic facts on
        # the first visit (the student documented the home once already),
        # else an explicit placeholder.
        findings = str(row[_COL_FINDINGS] or "").strip()
        if findings:
            findings_sentence = f"On assessment, {findings.rstrip('.')}."
        elif index == 0 and environment_sentence:
            findings_sentence = (
                environment_sentence
                + " [Add what you observed on the day — the patient's condition "
                "and any new findings.]"
            )
        else:
            findings_sentence = (
                "[State what you observed on this visit — the home environment, "
                "the patient's condition, and any findings.]"
            )

        # Education: the visit's documented education cell first, then the
        # conventional seeds for that visit position, then the documented 4.2
        # discharge education as a reinforcement sentence.
        documented_education = _documented_visit_education(row)
        seeds = education_seeds_by_visit[index] if index < len(education_seeds_by_visit) else _VISIT2_EDUCATION_SEEDS
        seed_phrases = [seed for seed in seeds]
        if documented_education:
            seed_phrases.append(documented_education.rstrip("."))
        education_sentence = (
            "Education given focused on " + _join_phrases(seed_phrases) + "."
            if seed_phrases
            else "[State the health education given on this visit.]"
        )
        if discharge_education and not position_hint == "pre":
            education_sentence += (
                " The education given at discharge was reinforced, including "
                f"{discharge_education[0].lower() + discharge_education[1:].rstrip('.')}"
                " — [trim to the points actually revisited on this visit]."
            )

        # Outcome / continuity: documented outcome, else placeholder; the
        # final visit adds the conventional hand-over point.
        outcome = str(row[_COL_OUTCOME] or "").strip()
        if outcome:
            outcome_body = outcome.rstrip(".")
            outcome_sentence = f"{outcome_body[0].upper() + outcome_body[1:]}."
        else:
            outcome_sentence = "[State the outcome of the visit and the family's response.]"
        if is_final:
            if community_resources:
                outcome_sentence += (
                    " Continuing care was handed over through "
                    f"{community_resources.rstrip('.')}."
                )
            else:
                outcome_sentence += (
                    " Continuing care was handed over to [state who took over — "
                    "e.g. the community health nurse] for continuity of care."
                )

        paragraph = " ".join(
            part for part in (purpose, findings_sentence, education_sentence, outcome_sentence) if part
        )

        # Card fields for the guided 4.3 editor — the documented values with
        # the conventional objective, the suggested ISO date, and the 1.3
        # environment facts pre-filled where the student hasn't documented.
        # Column order matches the 4.3 grid: [date, objectives, findings,
        # education, outcome].
        raw_date = str(row[_COL_DATE] or "").strip()
        cell_date = raw_date
        if has_suggested_date_marker(cell_date):
            # Keep the marker (the card editor's confirm badge reads it) but
            # make the payload value an ISO date the date picker can show.
            bare = strip_suggested_date_marker(cell_date)
            parsed_bare = _parse_date(bare)
            cell_date = bare if parsed_bare else ""
            suggested_date_flags[index] = bool(parsed_bare)
        if not cell_date and index < len(suggested_dates):
            cell_date = suggested_dates[index].strftime("%Y-%m-%d")
            suggested_date_flags[index] = True
        documented_objective = str(row[_COL_OBJECTIVES] or "").strip()
        cell_objectives = documented_objective or (
            purposes[index] if index < len(purposes) else purposes[1]
        )
        cell_findings = findings or (environment_parts if index == 0 else "")
        education_suggestions = list(seeds)
        if discharge_education:
            lead = discharge_education.split(". ")[0].rstrip(".")
            if lead:
                education_suggestions.append(
                    f"reinforce discharge education — {lead[0].lower() + lead[1:]}"
                )

        visits.append({
            "heading": heading,
            "paragraph": paragraph,
            "cells": [cell_date, cell_objectives, cell_findings, documented_education, outcome],
            "educationSuggestions": education_suggestions,
            "dateIsSuggested": bool(suggested_date_flags.get(index, False)),
        })

    # Day-of-Review block: a conventional final block derived from the 4.2
    # review date — the samples close 4.3 with the patient reporting to the
    # clinic (OPD) for the scheduled review. A student-documented review row
    # already produced a "Day of Review" heading in the loop above, so the
    # block is only added when they haven't documented one themselves.
    if not any("Day of Review" in str(v.get("heading", "")) for v in visits):
        review_when = _ordinal_date(review_date) if review_date else "[state the review date]"
        visits.append({
            "heading": f"Day of Review ({review_when})",
            "paragraph": (
                "The client reported to the outpatient department for the "
                "scheduled review appointment communicated at discharge. "
                "The response to treatment was reassessed against the discharge "
                "objectives — [state the findings at review: vital signs, "
                "symptoms resolved, any changes to medication] — and the "
                "continuing care arrangements were confirmed."
            ),
            "cells": [
                review_date.strftime("%Y-%m-%d") if review_date else "",
                "Review appointment — assess response to treatment and progress since discharge",
                "",
                "",
                "",
            ],
            "educationSuggestions": [
                "confirming the next review appointment and reporting warning signs early",
            ],
            "dateIsSuggested": False,
            "isReviewBlock": True,
        })

    return {"opening": opening, "visits": visits}


def home_visit_skeleton_to_text(skeleton: Dict[str, object]) -> str:
    """Serialize the skeleton into the 4.3 field value (per-visit prose)."""
    lines: List[str] = [str(skeleton.get("opening", "")).strip()]
    for visit in skeleton.get("visits", []) or []:
        if not isinstance(visit, dict):
            continue
        heading = str(visit.get("heading", "")).strip()
        paragraph = str(visit.get("paragraph", "")).strip()
        if not heading and not paragraph:
            continue
        lines.append("")
        lines.append(heading)
        lines.append(paragraph)
    return "\n".join(lines).strip()


def skeleton_to_text(skeleton: Dict[str, object]) -> str:
    """Serialize the skeleton into the 4.1 'careGiven' field value."""
    lines: List[str] = [str(skeleton.get("opening", "")).strip()]
    for day in skeleton.get("days", []) or []:
        if not isinstance(day, dict):
            continue
        heading = str(day.get("heading", "")).strip()
        if heading:
            lines.append("")
            lines.append(f"{heading}")
        for point in day.get("points", []) or []:
            point = str(point).strip()
            if point:
                lines.append(f"- {point}")
    return "\n".join(lines).strip()
