"""
Per-section care study templates, ported from the React app (src/lib/template.ts).

Drives the Streamlit drafting forms so each section collects the exact
information the sample care studies in attached_assets/ contain.
"""


def _f(field_id, label, placeholder="", ftype="text", options=None, hint="", required=False):
    return {
        "id": field_id,
        "label": label,
        "placeholder": placeholder,
        "type": ftype,
        "options": options or [],
        "hint": hint,
        "required": required,
    }


def _vitals(prefix):
    return [
        _f(f"{prefix}Temperature", "Temperature (°C)", "e.g. 38.7"),
        _f(f"{prefix}Pulse", "Pulse (bpm)", "e.g. 125"),
        _f(f"{prefix}Respiration", "Respiration (cpm)", "e.g. 30"),
        _f(f"{prefix}BP", "Blood pressure (mmHg)", "e.g. 142/85"),
        _f(f"{prefix}Spo2", "SpO₂ (%)", "e.g. 96"),
        _f(f"{prefix}Weight", "Weight (kg)", "e.g. 69"),
    ]


# heading -> {blurb, fields, rows}
SECTIONS = {
    "1.1 Patient's Particulars": {
        "blurb": "Biographical details that identify the patient and the admission.",
        "fields": [
            _f("initials", "Patient's name / initials", "e.g. Mrs. P.A", required=True),
            _f("age", "Age", "e.g. 49 years", required=True),
            _f("sex", "Sex", "", "select", ["Female", "Male"], required=True),
            _f("dob", "Date of birth", "YYYY-MM-DD"),
            _f("religion", "Religion", "e.g. Christian / Muslim"),
            _f("ethnicity", "Ethnicity / tribe", "e.g. Akan / Mole-Dagbani"),
            _f("maritalStatus", "Marital status", "", "select",
               ["Single", "Married", "Divorced", "Widowed", "Separated"]),
            _f("occupation", "Occupation", "e.g. Farmer / trader"),
            _f("address", "Address / residence", "e.g. Drobo, Bono Region"),
            _f("hospitalNumber", "Hospital number", "e.g. 002145/23"),
            _f("ward", "Ward / unit", "e.g. Female Medical Ward"),
            _f("admissionDateTime", "Date & time of admission", "e.g. 21st August, 2023, 2:30 pm"),
            _f("diagnosis", "Admission diagnosis", "e.g. Sickle cell disease — acute chest syndrome", required=True),
            _f("informant", "Informant & reliability", "e.g. Patient herself — reliable"),
        ],
        "rows": None,
    },
    "1.2 Family's Medical/Surgical History": {
        "blurb": "Hereditary and chronic conditions running in the family.",
        "fields": [
            _f("familyHistoryPresent", "Known history of hereditary / chronic disease", "", "select", ["No", "Yes"]),
            _f("familyConditions", "Conditions found in the family",
               "e.g. Hypertension in mother and two aunts; diabetes in father",
               "textarea",
               hint="Diabetes, hypertension, asthma, sickle cell, allergies, etc."),
            _f("familySurgery", "Significant family surgical history",
               "e.g. Mother had a cholecystectomy in 2019 — no complications", "textarea"),
        ],
        "rows": None,
    },
    "1.3 Family's Socio-Economic History": {
        "blurb": "The family's living conditions and how they affect care.",
        "fields": [
            _f("familyType", "Family type", "", "select", ["Nuclear", "Extended", "Single-parent", "Other"]),
            _f("dependents", "Number of children / dependents", "e.g. 4 children, 2 elderly parents"),
            _f("familyOccupation", "Family members & their occupations",
               "e.g. Husband — farmer; wife — petty trader", "textarea"),
            _f("income", "Estimated monthly income", "e.g. GH₵ 1,500 from trading"),
            _f("housing", "Type of housing", "e.g. 4-bedroom compound house, self-contained", "textarea"),
            _f("water", "Water source", "e.g. Pipe-borne / borehole / well"),
            _f("sanitation", "Sanitation facilities", "e.g. KVIP / water closet, refuse disposal"),
            _f("socioEffect", "Effect of socio-economic status on care",
               "e.g. Can afford prescribed drugs; transport to hospital is a challenge", "textarea"),
        ],
        "rows": None,
    },
    "1.4 Patient's Developmental History": {
        "blurb": "From pregnancy and birth through the milestones of growth.",
        "fields": [
            _f("pregnancy", "Pregnancy & delivery",
               "e.g. Normal pregnancy, carried to full term, spontaneous vaginal delivery", "textarea"),
            _f("milestones", "Developmental milestones",
               "e.g. Sat at 6 months, walked at 13 months, talked in sentences by 2 years", "textarea",
               hint="Age of walking, talking, teething, weaning"),
            _f("childhood", "Childhood illnesses & vaccinations",
               "e.g. Completed immunizations as a child; measles at age 4", "textarea"),
        ],
        "rows": None,
    },
    "1.5 Patient's Lifestyle & Hobbies": {
        "blurb": "How the patient lives day to day — routine, diet, habits.",
        "fields": [
            _f("dailyRoutine", "Daily routine",
               "e.g. Wakes 5:00 am, prays, prepares breakfast, goes to farm by 7 am", "textarea"),
            _f("diet", "Diet & appetite",
               "e.g. Three meals a day; likes banku with okro stew; poor appetite since admission", "textarea"),
            _f("sleep", "Sleep pattern", "e.g. Sleeps 10 pm – 4:30 am; no daytime naps"),
            _f("exercise", "Exercise", "e.g. Walks to farm daily; no formal exercise"),
            _f("habits", "Smoking / alcohol / drug use",
               "e.g. Non-smoker; occasional local gin at festivals; no illicit drugs", "textarea"),
            _f("hobbies", "Hobbies & interests", "e.g. Singing in the church choir, knitting"),
        ],
        "rows": None,
    },
    "1.6 Past Medical/Surgical/Obstetric History": {
        "blurb": "Everything significant that happened to the patient before this illness.",
        "fields": [
            _f("childhoodIllness", "Childhood illnesses",
               "e.g. No serious childhood illness; measles at age 4", "textarea"),
            _f("pastAdmissions", "Previous admissions & surgeries",
               "e.g. Admitted 17th June 2021 for malaria; caesarean section in 2018", "textarea"),
            _f("transfusions", "Blood transfusions", "e.g. Transfused 2 units of whole blood in 2021"),
            _f("allergies", "Allergies", "e.g. Penicillin — causes skin rash"),
            _f("medications", "Regular medications taken", "e.g. Folic acid 5 mg daily"),
            _f("obstetric", "Obstetric history (female patients)",
               "e.g. Gravida 3, para 3, alive; last delivery 2018; menarche at 14", "textarea"),
        ],
        "rows": None,
    },
    "1.7 Present Medical/Surgical History": {
        "blurb": "The history of the present illness, in the patient's own timeline.",
        "fields": [
            _f("onset", "Onset & course of present illness",
               "e.g. Was well until three days ago when she became febrile; 18th August she developed...", "textarea"),
            _f("presentingSymptoms", "Presenting symptoms",
               "e.g. Fever, chest pain, cough with sputum, difficulty breathing", "textarea"),
            _f("associatedSymptoms", "Associated symptoms",
               "e.g. Headache, general body weakness, poor appetite", "textarea"),
        ] + _vitals("assessment") + [
            _f("physicalFindings", "Physical assessment findings",
               "e.g. Conscious, pale, in respiratory distress; crackles in right lower lung", "textarea"),
            _f("investigations", "Investigations ordered & results",
               "e.g. FBC — Hb 9.2 g/dl; chest x-ray — right lower lobe consolidation; sickling test — positive",
               "textarea"),
        ],
        "rows": None,
    },
    "1.8 Admission of the Patient": {
        "blurb": "How the admission happened and what was done immediately.",
        "fields": [
            _f("admissionDate", "Date & time of admission", "e.g. 21st August, 2023, 11:20 am"),
            _f("admissionRoute", "Route of admission", "", "select",
               ["Through OPD", "Emergency unit", "Referral", "Other"]),
            _f("admittingDiagnosis", "Admitting diagnosis", "e.g. Pneumonia"),
        ] + _vitals("admission") + [
            _f("admissionInvestigations", "Investigations requested on admission",
               "e.g. Full blood count, blood film for malaria parasites, urine for routine examination", "textarea"),
            _f("treatmentStarted", "Treatment started",
               "e.g. IV ceftriaxone 2 g daily, IV paracetamol 1 g tds, IV normal saline 500 ml tds", "textarea"),
            _f("initialCare", "Immediate nursing care",
               "e.g. Admitted into female medical ward, oriented to ward routine, vital signs monitored 4-hourly",
               "textarea"),
        ],
        "rows": None,
    },
    "1.9 Patient's Concept of Illness": {
        "blurb": "What the patient believes, knows, and feels about the illness.",
        "fields": [
            _f("understanding", "Patient's understanding of the illness",
               "e.g. Did not know the cause; thought it was malaria", "textarea"),
            _f("perceivedCause", "Perceived cause",
               "e.g. Believes it was caused by working too hard on the farm", "textarea"),
            _f("emotionalResponse", "Emotional response & concerns",
               "e.g. Anxious about hospital bills and leaving her children", "textarea"),
        ],
        "rows": None,
    },
    "1.10 Literature Review": {
        "blurb": "The disease condition explained with authority — the evidence base.",
        "fields": [
            _f("condition", "Disease condition", "e.g. Pneumonia"),
            _f("definition", "Definition",
               "e.g. Inflammation of the lung tissue commonly caused by bacteria, viruses or fungi...", "textarea"),
            _f("anatomy", "Relevant anatomy & physiology",
               "e.g. The respiratory system — nose, pharynx, larynx, trachea, bronchi, alveoli...", "textarea"),
            _f("incidence", "Incidence & prevalence",
               "e.g. About 3 million cases of pneumonia reported each year...", "textarea"),
            _f("causes", "Causes / risk factors",
               "e.g. Bacterial (S. pneumoniae), viral; risk: smoking, extremes of age...", "textarea"),
            _f("pathophysiology", "Pathophysiology",
               "e.g. Organism reaches alveoli, triggers inflammatory response, consolidation...", "textarea"),
            _f("clinicalFeatures", "Clinical features",
               "e.g. Fever, cough with purulent sputum, pleuritic chest pain, tachypnoea...", "textarea"),
            _f("diagnostics", "Diagnostic investigations",
               "e.g. Chest x-ray, sputum culture, full blood count, ESR, blood cultures...", "textarea"),
            _f("treatment", "Treatment / management",
               "e.g. Antibiotics (ceftriaxone), oxygen therapy, fluids, analgesics...", "textarea"),
            _f("complications", "Complications",
               "e.g. Pleural effusion, empyema, septicaemia, respiratory failure...", "textarea"),
            _f("nursingConsiderations", "Nursing considerations",
               "e.g. Airway management, oxygen therapy monitoring, fluid balance, health education...", "textarea"),
        ],
        "rows": None,
    },
    "1.11 Validation of Data": {
        "blurb": "Show that the collected data was confirmed against trustworthy sources.",
        "fields": [
            _f("validationMethods", "Methods used to validate the data",
               "e.g. Cross-checked with patient interview, family reports, admission records, and investigation results",
               "textarea"),
            _f("discrepancies", "Discrepancies found & how they were resolved",
               "e.g. Reported fever of 39°C differed from charted 38.2°C; re-checked with the ward thermometer",
               "textarea"),
        ],
        "rows": None,
    },
    "2.1 Comparison of Data with Standards": {
        "blurb": "Patient findings compared against the literature reviewed.",
        "fields": [
            _f("featuresComparison", "Clinical features — patient vs literature",
               "e.g. Patient's fever, cough and chest pain match the classical features of pneumonia...", "textarea"),
            _f("testsComparison", "Diagnostic investigations — patient vs standard",
               "e.g. Chest x-ray findings of consolidation are consistent with the literature...", "textarea"),
            _f("treatmentComparison", "Treatment given vs recommended",
               "e.g. Ceftriaxone 2 g IV daily corresponds to the first-line therapy in the literature...", "textarea"),
        ],
        "rows": None,
    },
    "2.2 Pharmacology of Drugs Prescribed": {
        "blurb": "Every drug the patient received, described with authority.",
        "fields": [],
        "rows": {
            "title": "Prescribed drugs",
            "columns": ["Drug", "Class", "Dose, route & frequency", "Indication",
                        "Side effects", "Nursing responsibility"],
            "slots": 4,
        },
    },
    "2.3 Health Needs Identified": {
        "blurb": "The nursing diagnoses, health problems, and patient strengths.",
        "fields": [
            _f("nursingDiagnoses", "Nursing diagnoses",
               "e.g. Impaired gas exchange related to alveolar consolidation...", "textarea"),
            _f("healthProblems", "Other health problems / needs",
               "e.g. Knowledge deficit about the disease; financial constraints", "textarea"),
            _f("strengths", "Patient / family strengths",
               "e.g. Supportive family, willingness to learn, religious faith", "textarea"),
        ],
        "rows": None,
    },
    "3.1 Objectives for Patient/Family Care": {
        "blurb": "What the care is meant to achieve — long and short term.",
        "fields": [
            _f("longTerm", "Long-term objectives",
               "e.g. Patient will be discharged with no respiratory distress by...", "textarea"),
            _f("shortTerm", "Short-term objectives",
               "e.g. Patient will maintain SpO₂ ≥ 95% within 24 hours of oxygen therapy...", "textarea"),
            _f("familyObjectives", "Family objectives",
               "e.g. Family will demonstrate understanding of the disease and support care", "textarea"),
        ],
        "rows": None,
    },
    "3.2 Nursing Care Plan": {
        "blurb": "Diagnosis → goal → interventions with rationale → evaluation.",
        "fields": [],
        "rows": {
            "title": "Care plan entries",
            "columns": ["Nursing diagnosis", "Goal / outcome", "Nursing interventions",
                        "Rationale", "Evaluation"],
            "slots": 3,
        },
    },
    "4.1 Summary of the Actual Nursing Care": {
        "blurb": "What was done, day by day — care, procedures, education.",
        "fields": [
            _f("careGiven", "Care actually given",
               "e.g. Vital signs monitored 4-hourly; oxygen at 4 L/min; IV drugs administered as charted...",
               "textarea", hint="Day-to-day nursing care, procedures performed, drugs administered"),
            _f("healthEducation", "Health education given",
               "e.g. Taught patient about the disease, medication compliance, and when to report to hospital",
               "textarea"),
            _f("familyInvolvement", "Family involvement",
               "e.g. Family taught how to support feeding and recognise danger signs", "textarea"),
        ],
        "rows": None,
    },
    "5.1 Statement of Evaluation": {
        "blurb": "Evaluate each goal — fully met, partially met, or not met.",
        "fields": [
            _f("overallEvaluation", "Overall statement of evaluation",
               "e.g. Care provided was effective. Two of the four care plan goals were fully met...", "textarea"),
            _f("followUp", "Follow-up & referrals",
               "e.g. Referred for review at the medical outpatient clinic in two weeks", "textarea"),
        ],
        "rows": {
            "title": "Outcome evaluation per nursing diagnosis",
            "columns": ["Nursing diagnosis", "Outcome"],
            "slots": 3,
        },
    },
    "6.1 Summary": {
        "blurb": "A concise recap of the whole study.",
        "fields": [
            _f("summaryText", "Summary of the study",
               "e.g. This study assessed Mrs. P.A, a 49-year-old trader with sickle cell disease...", "textarea"),
        ],
        "rows": None,
    },
    "6.2 Conclusion": {
        "blurb": "What the study concludes about the care given.",
        "fields": [
            _f("conclusionText", "Conclusion",
               "e.g. The care given was holistic and goal-directed. The study deepened my understanding of...",
               "textarea"),
            _f("recommendations", "Recommendations",
               "e.g. Health education should emphasise early reporting of danger signs...", "textarea"),
        ],
        "rows": None,
    },
}

CHAPTERS = [
    ("Assessment", [
        "1.1 Patient's Particulars",
        "1.2 Family's Medical/Surgical History",
        "1.3 Family's Socio-Economic History",
        "1.4 Patient's Developmental History",
        "1.5 Patient's Lifestyle & Hobbies",
        "1.6 Past Medical/Surgical/Obstetric History",
        "1.7 Present Medical/Surgical History",
        "1.8 Admission of the Patient",
        "1.9 Patient's Concept of Illness",
        "1.10 Literature Review",
        "1.11 Validation of Data",
    ]),
    ("Analysis of Data", [
        "2.1 Comparison of Data with Standards",
        "2.2 Pharmacology of Drugs Prescribed",
        "2.3 Health Needs Identified",
    ]),
    ("Planning", [
        "3.1 Objectives for Patient/Family Care",
        "3.2 Nursing Care Plan",
    ]),
    ("Implementation", [
        "4.1 Summary of the Actual Nursing Care",
    ]),
    ("Evaluation", [
        "5.1 Statement of Evaluation",
    ]),
    ("Summary and Conclusion", [
        "6.1 Summary",
        "6.2 Conclusion",
    ]),
]

# ---------------------------------------------------------------------------
# Section classification & word-count targets
# ---------------------------------------------------------------------------
#
# "data_only" sections contain only the patient's own collected data.
# The AI must NOT make inferences, impressions, or predictions in these
# sections — it should report the facts exactly as provided.
#
# "allows_inference" sections require external knowledge (literature,
# analysis, care planning, evaluation) so the AI may add evidence-based
# inferences, analysis, and clinical reasoning.

def _heading_key(heading: str) -> str:
    """Normalise a heading for lookup — strip leading numbers and whitespace."""
    import re as _re
    return _re.sub(r"^[\d.]+\s*", "", heading.strip().lower())


# Section heading (or unique substring) -> classification
_SECTION_CLASSIFICATION: dict = {
    # Chapter 1 — Assessment (data-only sections)
    "patient\u2019s particulars": "data_only",
    "patient's particulars": "data_only",
    "family\u2019s medical/surgical history": "data_only",
    "family's medical/surgical history": "data_only",
    "family\u2019s socio-economic history": "data_only",
    "family's socio-economic history": "data_only",
    "patient\u2019s developmental history": "data_only",
    "patient's developmental history": "data_only",
    "patient\u2019s lifestyle": "data_only",
    "patient's lifestyle": "data_only",
    "past medical/surgical/obstetric history": "data_only",
    "present medical/surgical history": "data_only",
    "admission of the patient": "data_only",
    "patient\u2019s concept of illness": "data_only",
    "patient's concept of illness": "data_only",
    "validation of data": "data_only",
    # Chapter 1 — Literature Review (inference allowed)
    "literature review": "allows_inference",
    # Chapter 2 — Analysis of Data
    "comparison of data with standards": "allows_inference",
    "pharmacology of drugs prescribed": "allows_inference",
    "health needs identified": "allows_inference",
    # Chapter 3 — Planning
    "objectives for patient/family care": "allows_inference",
    "nursing care plan": "allows_inference",
    # Chapter 4 — Implementation
    "summary of the actual nursing care": "allows_inference",
    # Chapter 5 — Evaluation
    "statement of evaluation": "allows_inference",
    # Chapter 6 — Summary and Conclusion
    "summary": "allows_inference",
    "conclusion": "allows_inference",
}


def classify_section(heading: str) -> str:
    """Return 'data_only' or 'allows_inference' for a section heading.

    Defaults to 'allows_inference' when the heading is not in the lookup
    table (new sections, custom headings, etc.).
    """
    normalised = heading.strip().lower()
    # Exact match first.
    if normalised in _SECTION_CLASSIFICATION:
        return _SECTION_CLASSIFICATION[normalised]
    # Fuzzy match — check if any registered key is contained in the heading.
    for key, classification in _SECTION_CLASSIFICATION.items():
        if key in normalised or normalised in key:
            return classification
    return "allows_inference"


def is_data_only(heading: str) -> bool:
    """True when a section must contain only patient data (no AI inferences)."""
    return classify_section(heading) == "data_only"


# Target word-count ranges per section heading (min, max).
#
# Derived from actual word counts measured across 7 sample care studies in
# data/templates/ (CASE STUDY.docx, Halima Final care study...HPT.docx,
# Joe's Care Study.docx, Kyeremeh Amanda Ampaabeng.docx, Nad's.docx,
# SHARIFA'S.docx, rafa's.docx).  Ranges use the observed min/max with a
# ~20 % buffer on each side, then capped at practical limits.
#
# The AI should aim for this range; if the collected data is shorter than
# the minimum, it may add minimal and directly relevant inferences only to
# bring the section up to the target.  Data-only sections will never
# exceed their maximum from AI padding — they are capped by the actual
# data provided.
#
# Keys are lowercase unique substrings of the section headings.
WORD_COUNT_RANGES: dict = {
    # Chapter 1 — Assessment (data-only)
    # 1.1 Patient's Particulars: observed 102–2150 words across 5 samples.
    # Wide range because some studies include detailed narrative; a typical
    # particulars section is 150–400 words.
    "patient\u2019s particulars": (150, 500),
    "patient's particulars": (150, 500),
    # 1.2 Family's Medical/Surgical History: observed 80–249 words (6 samples)
    "family\u2019s medical/surgical history": (80, 300),
    "family's medical/surgical history": (80, 300),
    # 1.3 Family's Socio-Economic History: observed 75–164 words (3 samples)
    "family\u2019s socio-economic history": (75, 200),
    "family's socio-economic history": (75, 200),
    # 1.4 Patient's Developmental History: observed 114–687 words (6 samples)
    "patient\u2019s developmental history": (100, 500),
    "patient's developmental history": (100, 500),
    # 1.5 Patient's Lifestyle & Hobbies: observed 138–408 words (5 samples)
    "patient\u2019s lifestyle": (130, 500),
    "patient's lifestyle": (130, 500),
    # 1.6 Past Medical/Surgical/Obstetric History: observed 40–152 words (3 samples)
    "past medical/surgical/obstetric history": (50, 200),
    # 1.7 Present Medical/Surgical History: observed 40–196 words (7 samples)
    "present medical/surgical history": (50, 250),
    # 1.8 Admission of the Patient: observed 233–2200 words (6 samples).
    # Very wide range because some studies include extensive admission detail.
    "admission of the patient": (200, 600),
    # 1.9 Patient's Concept of Illness: observed 48–141 words (7 samples)
    "patient\u2019s concept of illness": (50, 200),
    "patient's concept of illness": (50, 200),
    # 1.10 Literature Review: observed 453–4412 words (7 samples)
    "literature review": (1000, 3000),
    # 1.11 Validation of Data: observed 7–117 words (6 samples)
    "validation of data": (50, 150),
    # Chapter 2 — Analysis of Data (inference-allowed)
    # 2.1 Comparison of Data with Standards: observed 27–150 words (5 samples)
    "comparison of data with standards": (50, 250),
    # 2.2 Pharmacology of Drugs Prescribed: observed 1–783 words (7 samples)
    # Typically a table of 3–5 drugs; 300–600 words is typical.
    "pharmacology of drugs prescribed": (200, 700),
    # 2.3 Health Needs Identified: observed 52–6870 words (6 samples)
    # Wide range; typical is 200–500 words for nursing diagnoses + needs.
    "health needs identified": (200, 600),
    # Chapter 3 — Planning (inference-allowed)
    # 3.1 Objectives for Patient/Family Care: observed 49–286 words (6 samples)
    "objectives for patient/family care": (80, 350),
    # 3.2 Nursing Care Plan: observed 1–1105 words (5 samples)
    # Usually a table; 300–700 words typical.
    "nursing care plan": (300, 700),
    # Chapter 4 — Implementation (inference-allowed)
    # 4.1 Summary of the Actual Nursing Care: observed 2–271 words (4 samples)
    "summary of the actual nursing care": (100, 400),
    # Chapter 5 — Evaluation (inference-allowed)
    # 5.1 Statement of Evaluation: observed 254 words (1 sample)
    "statement of evaluation": (200, 400),
    # Chapter 6 — Summary and Conclusion (inference-allowed)
    # 6.1 Summary: observed 72 words (1 sample)
    "summary": (100, 300),
    # 6.2 Conclusion: observed 343 words (1 sample)
    "conclusion": (200, 500),
}


def get_word_count_range(heading: str) -> tuple:
    """Return (min_words, max_words) for a section heading.

    Defaults to (150, 300) for sections not in the lookup table.
    """
    normalised = heading.strip().lower()
    for key, range_ in WORD_COUNT_RANGES.items():
        if key in normalised or normalised in key:
            return range_
    return (150, 300)
