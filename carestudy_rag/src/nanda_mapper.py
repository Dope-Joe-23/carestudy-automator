"""\
NANDA-I nursing diagnosis mapping and patient strengths recommendation.

Maps common patient problems (from Chapter 1 presenting complaints, physical
assessment, and medical history) to appropriate NANDA-I nursing diagnoses, and
recommends corresponding patient strengths that counter those problems.

This enables seamless automation: once problems are identified (ideally pulled
from Chapter 1 data — presenting complaints, present medical history, admission
findings), the nursing diagnoses and strengths in Chapter 2 can be auto-suggested
in NANDA-I format.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# NANDA-I Diagnosis Templates
#
# Each entry maps a problem keyword to:
#   - diagnosis: the NANDA-I diagnosis label (can include "related to" if known)
#   - related_to: the etiology/cause phrase (derived from the problem context)
#   - as_evidenced_by: optional defining characteristics (from patient data)
#   - strength_hint: a corresponding strength that may counter this problem
#
# These are starting points — the AI should refine them based on actual patient
# context from Chapter 1. The format follows NANDA-I PES (Problem, Etiology,
# Signs/Symptoms) convention.
# ---------------------------------------------------------------------------

# Common presenting symptoms/problems → NANDA-I diagnosis mappings
PROBLEM_TO_NANDA: Dict[str, Dict] = {
    # Cardiovascular / hypertension related
    "hypertension": {
        "diagnosis": "Decreased Cardiac Output",
        "related_to": "increased peripheral vascular resistance",
        "as_evidenced_by": "elevated blood pressure readings",
    },
    "high blood pressure": {
        "diagnosis": "Decreased Cardiac Output",
        "related_to": "increased peripheral vascular resistance",
        "as_evidenced_by": "elevated blood pressure readings",
    },
    "chest pain": {
        "diagnosis": "Acute Pain",
        "related_to": "myocardial ischemia or increased cardiac workload",
        "as_evidenced_by": "patient report of chest pain",
    },
    "palpitation": {
        "diagnosis": "Decreased Cardiac Output",
        "related_to": "altered heart rate and rhythm",
        "as_evidenced_by": "patient report of palpitations",
    },
    "shortness of breath": {
        "diagnosis": "Ineffective Breathing Pattern",
        "related_to": "decreased cardiac output or fluid overload",
        "as_evidenced_by": "patient report of dyspnea, tachypnea",
    },
    "dyspnea": {
        "diagnosis": "Ineffective Breathing Pattern",
        "related_to": "decreased cardiac output or fluid overload",
        "as_evidenced_by": "patient report of difficulty breathing",
    },
    # Neurological / CNS
    "headache": {
        "diagnosis": "Acute Pain",
        "related_to": "increased cerebrovascular resistance",
        "as_evidenced_by": "patient report of headache",
    },
    "dizziness": {
        "diagnosis": "Risk for Falls",
        "related_to": "vestibular dysfunction or orthostatic hypotension",
        "as_evidenced_by": "patient report of dizziness, unsteady gait",
    },
    "vertigo": {
        "diagnosis": "Risk for Falls",
        "related_to": "vestibular dysfunction",
        "as_evidenced_by": "patient report of spinning sensation",
    },
    "blurred vision": {
        "diagnosis": "Disturbed Sensory Perception",
        "related_to": "hypertensive retinopathy",
        "as_evidenced_by": "patient report of vision changes",
    },
    "vision changes": {
        "diagnosis": "Disturbed Sensory Perception",
        "related_to": "hypertensive retinopathy",
        "as_evidenced_by": "patient report of visual disturbances",
    },
    # General / constitutional
    "fatigue": {
        "diagnosis": "Activity Intolerance",
        "related_to": "imbalance between oxygen supply and demand",
        "as_evidenced_by": "patient report of exhaustion, reduced activity tolerance",
    },
    "general body weakness": {
        "diagnosis": "Activity Intolerance",
        "related_to": "generalized weakness from decreased cardiac output",
        "as_evidenced_by": "patient report of weakness, difficulty with ADLs",
    },
    "weakness": {
        "diagnosis": "Activity Intolerance",
        "related_to": "generalized weakness",
        "as_evidenced_by": "patient report of weakness, reduced physical capacity",
    },
    "tiredness": {
        "diagnosis": "Activity Intolerance",
        "related_to": "decreased cardiac output or anaemia",
        "as_evidenced_by": "patient report of fatigue",
    },
    # Pain (general)
    "pain": {
        "diagnosis": "Acute Pain",
        "related_to": "underlying condition or tissue injury",
        "as_evidenced_by": "patient verbal report of pain",
    },
    "joint pain": {
        "diagnosis": "Acute Pain",
        "related_to": "inflammation or musculoskeletal strain",
        "as_evidenced_by": "patient report of joint pain",
    },
    "body pain": {
        "diagnosis": "Acute Pain",
        "related_to": "underlying medical condition",
        "as_evidenced_by": "patient report of generalized body pain",
    },
    # Psychological / emotional
    "anxiety": {
        "diagnosis": "Anxiety",
        "related_to": "unfamiliarity with condition, threat to health status, or uncertain prognosis",
        "as_evidenced_by": "patient report of worry, restlessness, or apprehension",
    },
    "worried": {
        "diagnosis": "Anxiety",
        "related_to": "threat to health status or uncertain outcome",
        "as_evidenced_by": "patient expresses concern about condition",
    },
    "fear": {
        "diagnosis": "Fear",
        "related_to": "perceived threat to health or life",
        "as_evidenced_by": "patient expresses fear about condition or treatment",
    },
    "stress": {
        "diagnosis": "Ineffective Coping",
        "related_to": "situational crisis or inadequate support systems",
        "as_evidenced_by": "patient report of overwhelming stress",
    },
    # Sleep / rest
    "insomnia": {
        "diagnosis": "Disturbed Sleep Pattern",
        "related_to": "environmental change, anxiety, or discomfort",
        "as_evidenced_by": "patient report of difficulty falling or staying asleep",
    },
    "difficulty sleeping": {
        "diagnosis": "Disturbed Sleep Pattern",
        "related_to": "environmental or psychological factors",
        "as_evidenced_by": "patient report of sleep disturbance",
    },
    "sleeplessness": {
        "diagnosis": "Disturbed Sleep Pattern",
        "related_to": "discomfort, anxiety, or change in environment",
        "as_evidenced_by": "patient report of inadequate sleep",
    },
    # Knowledge / education
    "little knowledge": {
        "diagnosis": "Deficient Knowledge",
        "related_to": "lack of exposure to information about the condition",
        "as_evidenced_by": "patient verbalizes inaccurate understanding or asks clarifying questions",
    },
    "knowledge deficit": {
        "diagnosis": "Deficient Knowledge",
        "related_to": "lack of prior exposure to information about the condition",
        "as_evidenced_by": "patient unable to describe condition or treatment",
    },
    "does not understand": {
        "diagnosis": "Deficient Knowledge",
        "related_to": "unfamiliarity with the disease process",
        "as_evidenced_by": "patient questions about condition or treatment",
    },
    "wants to learn": {
        "diagnosis": "Readiness for Enhanced Knowledge",
        "related_to": "expressed desire to understand condition and self-management",
        "as_evidenced_by": "patient requests information about condition and treatment",
    },
    "willing to learn": {
        "diagnosis": "Readiness for Enhanced Knowledge",
        "related_to": "motivation to understand health condition",
        "as_evidenced_by": "patient expresses interest in learning about condition",
    },
    # Mobility / safety
    "falls": {
        "diagnosis": "Risk for Falls",
        "related_to": "decreased lower extremity strength, dizziness, or altered mobility",
        "as_evidenced_by": "patient history of falls or unsteady gait",
    },
    "unsteady": {
        "diagnosis": "Risk for Falls",
        "related_to": "muscle weakness or impaired balance",
        "as_evidenced_by": "patient demonstrates unsteady gait",
    },
    # Nutrition / fluid
    "poor appetite": {
        "diagnosis": "Imbalanced Nutrition: Less Than Body Requirements",
        "related_to": "decreased intake due to illness or medication side effects",
        "as_evidenced_by": "patient report of reduced food intake, weight loss",
    },
    "loss of appetite": {
        "diagnosis": "Imbalanced Nutrition: Less Than Body Requirements",
        "related_to": "illness, medication side effects, or nausea",
        "as_evidenced_by": "patient reports reduced food intake",
    },
    "nausea": {
        "diagnosis": "Nausea",
        "related_to": "medication side effects, GI disturbance, or increased intracranial pressure",
        "as_evidenced_by": "patient report of queasiness or urge to vomit",
    },
    "vomiting": {
        "diagnosis": "Risk for Imbalanced Fluid Volume",
        "related_to": "active fluid loss from vomiting",
        "as_evidenced_by": "patient report of vomiting, decreased fluid intake",
    },
    "diarrhoea": {
        "diagnosis": "Risk for Deficient Fluid Volume",
        "related_to": "active fluid loss from diarrhoea",
        "as_evidenced_by": "patient report of frequent loose stools",
    },
    # Elimination
    "constipation": {
        "diagnosis": "Constipation",
        "related_to": "decreased mobility, inadequate fluid intake, or medication side effects",
        "as_evidenced_by": "patient report of infrequent or difficult bowel movements",
    },
    "difficulty passing urine": {
        "diagnosis": "Urinary Retention",
        "related_to": "medication effects, obstruction, or decreased mobility",
        "as_evidenced_by": "patient report of difficulty voiding, distended bladder",
    },
    "painful urination": {
        "diagnosis": "Impaired Urinary Elimination",
        "related_to": "urinary tract infection or inflammation",
        "as_evidenced_by": "patient report of dysuria",
    },
    # Respiratory
    "cough": {
        "diagnosis": "Ineffective Airway Clearance",
        "related_to": "retained secretions or airway irritation",
        "as_evidenced_by": "patient report of cough, audible secretions",
    },
    "difficult breathing": {
        "diagnosis": "Ineffective Breathing Pattern",
        "related_to": "decreased lung expansion or fluid accumulation",
        "as_evidenced_by": "patient report of difficulty breathing, use of accessory muscles",
    },
    "wheezing": {
        "diagnosis": "Ineffective Airway Clearance",
        "related_to": "bronchoconstriction or airway narrowing",
        "as_evidenced_by": "audible wheezing on auscultation",
    },
    "noisy breathing": {
        "diagnosis": "Ineffective Airway Clearance",
        "related_to": "airway obstruction or secretions",
        "as_evidenced_by": "audible abnormal breath sounds",
    },
    # Fluid / circulatory
    "swelling": {
        "diagnosis": "Excess Fluid Volume",
        "related_to": "compromised regulatory mechanisms (heart, kidney, or liver dysfunction)",
        "as_evidenced_by": "observable edema, weight gain, or crackles on auscultation",
    },
    "oedema": {
        "diagnosis": "Excess Fluid Volume",
        "related_to": "compromised regulatory mechanisms",
        "as_evidenced_by": "observable peripheral edema, weight gain",
    },
    "swollen legs": {
        "diagnosis": "Excess Fluid Volume",
        "related_to": "decreased cardiac output or venous insufficiency",
        "as_evidenced_by": "observable edema in lower extremities",
    },
    "fluid overload": {
        "diagnosis": "Excess Fluid Volume",
        "related_to": "compromised regulatory mechanisms",
        "as_evidenced_by": "edema, crackles, weight gain, jugular venous distension",
    },
    # Skin / tissue
    "wound": {
        "diagnosis": "Impaired Skin Integrity",
        "related_to": "trauma, surgical incision, or pressure",
        "as_evidenced_by": "observable break in skin surface",
    },
    "skin breakdown": {
        "diagnosis": "Impaired Skin Integrity",
        "related_to": "pressure, moisture, or immobility",
        "as_evidenced_by": "observable skin erosion or ulceration",
    },
    "pressure sore": {
        "diagnosis": "Impaired Skin Integrity",
        "related_to": "prolonged pressure on bony prominences",
        "as_evidenced_by": "observable tissue damage over pressure point",
    },
    "rash": {
        "diagnosis": "Impaired Skin Integrity",
        "related_to": "allergic reaction, infection, or irritation",
        "as_evidenced_by": "observable skin lesion or eruption",
    },
    # Infection / immune
    "fever": {
        "diagnosis": "Hyperthermia",
        "related_to": "inflammatory response or infection",
        "as_evidenced_by": "elevated body temperature, warm skin",
    },
    "high temperature": {
        "diagnosis": "Hyperthermia",
        "related_to": "infection or inflammatory process",
        "as_evidenced_by": "elevated body temperature",
    },
    "chills": {
        "diagnosis": "Hyperthermia",
        "related_to": "infection or inflammatory response",
        "as_evidenced_by": "patient report of rigors, elevated temperature",
    },
    # Self-care / ADLs
    "difficulty feeding": {
        "diagnosis": "Self-Care Deficit: Feeding",
        "related_to": "weakness, decreased mobility, or cognitive impairment",
        "as_evidenced_by": "patient unable to feed self independently",
    },
    "difficulty bathing": {
        "diagnosis": "Self-Care Deficit: Bathing",
        "related_to": "decreased mobility, weakness, or pain",
        "as_evidenced_by": "patient unable to bathe independently",
    },
    "difficulty dressing": {
        "diagnosis": "Self-Care Deficit: Dressing",
        "related_to": "decreased mobility, weakness, or pain",
        "as_evidenced_by": "patient unable to dress independently",
    },
    "needs assistance": {
        "diagnosis": "Self-Care Deficit",
        "related_to": "decreased strength, mobility, or cognitive status",
        "as_evidenced_by": "patient requires assistance with ADLs",
    },
    # Communication / cognition
    "confused": {
        "diagnosis": "Acute Confusion",
        "related_to": "decreased cerebral perfusion, hypoxia, or metabolic imbalance",
        "as_evidenced_by": "patient demonstrates disorientation, inappropriate responses",
    },
    "memory loss": {
        "diagnosis": "Impaired Memory",
        "related_to": "neurological impairment or cognitive decline",
        "as_evidenced_by": "patient unable to recall recent events or instructions",
    },
    "forgetful": {
        "diagnosis": "Impaired Memory",
        "related_to": "cognitive changes or medication effects",
        "as_evidenced_by": "patient forgets instructions, appointments, or medication schedule",
    },
    # Immobility
    "immobility": {
        "diagnosis": "Impaired Physical Mobility",
        "related_to": "musculoskeletal impairment, pain, or decreased strength",
        "as_evidenced_by": "limited range of motion, inability to move independently",
    },
    "limited mobility": {
        "diagnosis": "Impaired Physical Mobility",
        "related_to": "pain, weakness, or musculoskeletal condition",
        "as_evidenced_by": "decreased range of motion, difficulty moving",
    },
    "difficulty walking": {
        "diagnosis": "Impaired Physical Mobility",
        "related_to": "muscle weakness, pain, or balance impairment",
        "as_evidenced_by": "patient requires assistance to ambulate",
    },
    "bedridden": {
        "diagnosis": "Impaired Physical Mobility",
        "related_to": "medical condition, weakness, or pain",
        "as_evidenced_by": "patient confined to bed",
    },
    # Comfort
    "discomfort": {
        "diagnosis": "Acute Pain",
        "related_to": "underlying condition or procedure",
        "as_evidenced_by": "patient verbal report of discomfort",
    },
    # Coping / support
    "lonely": {
        "diagnosis": "Risk for Loneliness",
        "related_to": "altered social interaction or lack of support system",
        "as_evidenced_by": "patient expresses feeling isolated or alone",
    },
    "social isolation": {
        "diagnosis": "Social Isolation",
        "related_to": "lack of support system, physical limitations, or stigma",
        "as_evidenced_by": "patient lacks meaningful social contact",
    },
    "no support": {
        "diagnosis": "Risk for Caregiver Role Strain",
        "related_to": "lack of family or community support",
        "as_evidenced_by": "patient or family expresses inadequate support",
    },
    # Bleeding / safety
    "bleeding": {
        "diagnosis": "Risk for Bleeding",
        "related_to": "anticoagulant therapy, thrombocytopenia, or invasive procedure",
        "as_evidenced_by": "patient on blood thinners or with bleeding disorder",
    },
    "easy bruising": {
        "diagnosis": "Risk for Bleeding",
        "related_to": "altered clotting mechanism or anticoagulant use",
        "as_evidenced_by": "patient exhibits bruising with minimal trauma",
    },
}

# Generic strengths that can apply to many situations
GENERIC_STRENGTHS: List[str] = [
    "Patient is compliant with prescribed medications",
    "Patient has supportive family members",
    "Patient demonstrates positive attitude towards treatment",
    "Patient is willing to learn about condition and treatment",
    "Patient is able to verbalize concerns and ask questions",
    "Patient has strong religious or spiritual faith",
    "Patient can perform basic activities of daily living",
    "Patient is able to tolerate prescribed medications",
    "Patient maintains a positive outlook",
    "Patient has adequate financial support",
    "Patient demonstrates good adherence to treatment plan",
    "Patient is able to rest in a quiet environment",
    "Patient can anticipate and report symptoms early",
    "Patient has previously successfully managed health challenges",
    "Patient is motivated to recover and resume normal activities",
    "Patient has access to healthcare facilities",
    "Patient maintains healthy lifestyle habits (diet, exercise)",
    "Patient communicates effectively with healthcare team",
    "Patient demonstrates problem-solving ability",
    "Patient has stable home environment",
]

# Strengths mapped to specific problem types — used to recommend a strength
# that directly counters an identified problem
PROBLEM_TO_STRENGTH: Dict[str, List[str]] = {
    "hypertension": [
        "Patient is compliant with antihypertensive medications",
        "Patient can monitor blood pressure at home",
        "Patient is willing to adopt lifestyle modifications",
        "Patient has family support for medication adherence",
    ],
    "headache": [
        "Patient is able to verbalize the intensity and location of pain",
        "Patient can identify factors that relieve or worsen headache",
        "Patient is compliant with analgesic medications",
    ],
    "dizziness": [
        "Patient is able to anticipate the onset of dizziness",
        "Patient can move slowly and carefully to prevent falls",
        "Patient reports dizziness promptly to healthcare team",
    ],
    "palpitation": [
        "Patient can describe the frequency and duration of palpitations",
        "Patient is able to rest when experiencing palpitations",
        "Patient reports palpitations promptly for assessment",
    ],
    "fatigue": [
        "Patient can pace activities to conserve energy",
        "Patient is able to rest between activities",
        "Patient can identify activities that cause fatigue",
    ],
    "general body weakness": [
        "Patient can perform minor activities independently",
        "Patient is able to rest and conserve energy",
        "Patient can ask for assistance when needed",
    ],
    "anxiety": [
        "Patient is able to express feelings and concerns openly",
        "Patient has supportive family members who provide reassurance",
        "Patient practices stress reduction techniques (prayer, deep breathing)",
        "Patient has faith or spiritual beliefs that provide comfort",
    ],
    "insomnia": [
        "Patient is able to doze off in a quiet environment",
        "Patient maintains a consistent sleep routine where possible",
        "Patient can verbalize factors that interfere with sleep",
    ],
    "little knowledge": [
        "Patient is willing to learn about the condition",
        "Patient asks questions to understand treatment and self-care",
        "Patient is receptive to health education",
    ],
    "knowledge deficit": [
        "Patient expresses interest in learning about condition",
        "Patient is able to ask relevant questions",
        "Patient demonstrates readiness to understand treatment plan",
    ],
    "pain": [
        "Patient is able to verbalize the intensity and location of pain",
        "Patient can describe what relieves the pain",
        "Patient reports pain promptly for management",
    ],
    "shortness of breath": [
        "Patient can use relaxation techniques to manage breathlessness",
        "Patient can position self to ease breathing",
        "Patient reports worsening symptoms promptly",
    ],
    "fever": [
        "Patient is able to report changes in temperature sensation",
        "Patient maintains adequate fluid intake",
        "Patient complies with antipyretic medications",
    ],
    "cough": [
        "Patient can describe the nature and frequency of cough",
        "Patient is able to clear secretions effectively",
        "Patient complies with prescribed respiratory medications",
    ],
    "nausea": [
        "Patient can identify foods or situations that trigger nausea",
        "Patient is able to tolerate small, frequent meals",
        "Patient reports nausea promptly for management",
    ],
    "vomiting": [
        "Patient maintains some oral fluid intake despite vomiting",
        "Patient reports vomiting episodes for assessment",
    ],
    "diarrhoea": [
        "Patient maintains hydration by drinking fluids",
        "Patient reports frequency and characteristics of stools",
    ],
    "constipation": [
        "Patient is able to increase fluid and fibre intake",
        "Patient can report changes in bowel habits",
    ],
    "swelling": [
        "Patient can report changes in swelling or edema",
        "Patient elevates affected limbs when resting",
        "Patient complies with diuretic medications",
    ],
    "wound": [
        "Patient can keep wound site clean and dry",
        "Patient reports signs of infection promptly",
        "Patient complies with wound care instructions",
    ],
    "confusion": [
        "Patient has family members who can provide orientation and support",
        "Patient responds to re-orientation strategies",
    ],
    "difficulty walking": [
        "Patient can use assistive devices if provided",
        "Patient asks for assistance when mobilizing",
        "Patient has family support for mobility",
    ],
    "immobility": [
        "Patient can perform range of motion exercises independently",
        "Patient is able to reposition self in bed with assistance",
        "Patient maintains upper body strength",
    ],
    "imbalanced nutrition": [
        "Patient can identify preferred foods that are nutritionally adequate",
        "Patient is willing to try small, frequent meals",
        "Patient has family support for meal preparation",
    ],
    "poor appetite": [
        "Patient can eat small, frequent meals throughout the day",
        "Patient is willing to try preferred foods",
        "Patient has family support for feeding if needed",
    ],
}

# Domain-based fallback: if no specific match, use the problem's general domain
# to suggest a strength category
DOMAINS = {
    "cardiovascular": ["compliance", "support", "monitoring"],
    "neurological": ["reporting", "safety", "support"],
    "pain": ["verbalization", "compliance", "comfort measures"],
    "psychological": ["expression", "support", "faith", "coping"],
    "sleep": ["routine", "environment", "reporting"],
    "knowledge": ["willingness", "questions", "receptiveness"],
    "mobility": ["assistance", "devices", "family support"],
    "nutrition": ["preferences", "small meals", "family support"],
    "fluid": ["reporting", "compliance", "positioning"],
    "skin": ["hygiene", "reporting", "compliance"],
    "infection": ["reporting", "hydration", "compliance"],
    "self_care": ["independence", "assistance", "adaptation"],
    "coping": ["support", "faith", "expression"],
}


def find_matching_problems(patient_text: str) -> List[Tuple[str, str]]:
    """Find problems mentioned in patient text and return (keyword, problem_label) pairs.

    Scans the patient's presenting complaints, symptoms, and assessment findings
    for keywords that match known NANDA-I-mapped problems.
    """
    import re

    text_lower = patient_text.lower()

    # Split into sentences for more contextual matching
    sentences = re.split(r'[.!?]\s*', patient_text)

    found: Dict[str, str] = {}

    for keyword, data in PROBLEM_TO_NANDA.items():
        # Check if keyword appears in patient text
        if keyword in text_lower:
            # Use the diagnosis name as the label
            label = data["diagnosis"]
            if keyword not in found:
                found[keyword] = label

    # Also check for symptom phrases from the patient's presenting complaints
    symptom_patterns = [
        (r"(?:complained of|complains of|reported|experienced|had|has|with)\s+([^.!?]+?(?:dizziness|dizziness|palpitation|headache|weakness|fatigue|anxiety|insomnia|pain|fever|cough|shortness of breath|breathlessness|nausea|vomiting|diarrhoea|constipation|swelling|oedema|confusion|difficulty breathing|difficulty walking|mobility))",
         "symptom"),
    ]

    for pattern, _ in symptom_patterns:
        for match in re.finditer(pattern, patient_text, re.IGNORECASE):
            snippet = match.group(1).strip().lower()
            for keyword in PROBLEM_TO_NANDA:
                if keyword in snippet or snippet in keyword:
                    label = PROBLEM_TO_NANDA[keyword]["diagnosis"]
                    if keyword not in found:
                        found[keyword] = label

    return [(k, v) for k, v in found.items()]


def suggest_nanda_diagnoses(problems: List[str]) -> List[Dict]:
    """Given a list of identified problems, suggest NANDA-I nursing diagnoses.

    Each diagnosis is returned with:
      - diagnosis: the NANDA-I label
    - full_statement: complete "Diagnosis related to etiology as evidenced by..."
      - problem_source: the original problem keyword that triggered this
      - priority_hint: suggested priority (high/medium/low) based on ABC/Maslow
    """
    suggestions: List[Dict] = []
    seen_diagnoses: set = set()

    for problem in problems:
        problem_lower = problem.lower().strip()
        match = None

        # Direct keyword match
        if problem_lower in PROBLEM_TO_NANDA:
            match = PROBLEM_TO_NANDA[problem_lower]
        else:
            # Try partial matching
            for keyword, data in PROBLEM_TO_NANDA.items():
                if keyword in problem_lower or problem_lower in keyword:
                    match = data
                    break

        if match and match["diagnosis"] not in seen_diagnoses:
            seen_diagnoses.add(match["diagnosis"])

            # Build the full NANDA-I statement
            statement_parts = [match["diagnosis"]]
            if match.get("related_to"):
                statement_parts.append(f"related to {match['related_to']}")
            if match.get("as_evidenced_by"):
                statement_parts.append(f"as evidenced by {match['as_evidenced_by']}")

            # Determine priority hint based on diagnosis type
            priority = _suggest_priority(match["diagnosis"])

            suggestions.append({
                "problem_source": problem,
                "diagnosis": match["diagnosis"],
                "related_to": match.get("related_to", ""),
                "as_evidenced_by": match.get("as_evidenced_by", ""),
                "full_statement": " ".join(statement_parts) + ".",
                "priority_hint": priority,
            })

    # Sort by priority: high first, then medium, then low
    priority_order = {"high": 0, "medium": 1, "low": 2}
    suggestions.sort(key=lambda s: priority_order.get(s["priority_hint"], 3))

    return suggestions


def _suggest_priority(diagnosis: str) -> str:
    """Suggest a priority level for a NANDA-I diagnosis based on ABC/Maslow."""
    diagnosis_lower = diagnosis.lower()

    # High priority — life-threatening, ABC issues
    high_priority = [
        "decreased cardiac output", "ineffective breathing pattern",
        "impaired gas exchange", "risk for falls", "acute confusion",
        "bleeding", "shock", "hyperthermia", "hypothermia",
        "risk for infection", "impaired skin integrity"  # if extensive
    ]

    # Medium priority — comfort, mobility, nutrition
    medium_priority = [
        "acute pain", "chronic pain", "activity intolerance",
        "impaired physical mobility", "imbalanced nutrition",
        "constipation", "nausea", "disturbed sleep pattern",
        "self-care deficit", "impaired urinary elimination",
        "risk for bleeding", "risk for injury"
    ]

    # Low priority — knowledge, coping, health promotion
    low_priority = [
        "deficient knowledge", "readiness for enhanced knowledge",
        "anxiety", "fear", "ineffective coping", "social isolation",
        "risk for loneliness", "disturbed sensory perception",
        "impaired memory", "risk for caregiver role strain"
    ]

    for d in high_priority:
        if d in diagnosis_lower:
            return "high"
    for d in medium_priority:
        if d in diagnosis_lower:
            return "medium"
    for d in low_priority:
        if d in diagnosis_lower:
            return "low"

    return "medium"  # default


def suggest_strengths_for_problems(problems: List[str], max_per_problem: int = 2) -> List[Dict]:
    """Given identified problems, recommend corresponding patient strengths.

    For each problem, tries to find a specific strength that counters it.
    Returns at most max_per_problem strengths per problem to match NMC format
    (which lists only the most relevant strengths).
    Falls back to generic strengths if no specific match is found.
    """
    strengths_map: Dict[str, List[str]] = {}

    for problem in problems:
        problem_lower = problem.lower().strip()
        matched = False

        # Try direct keyword match in PROBLEM_TO_STRENGTH
        if problem_lower in PROBLEM_TO_STRENGTH:
            strengths_map[problem] = PROBLEM_TO_STRENGTH[problem_lower][:max_per_problem]
            matched = True
        else:
            # Try partial matching
            for keyword, strength_list in PROBLEM_TO_STRENGTH.items():
                if keyword in problem_lower or problem_lower in keyword:
                    strengths_map[problem] = strength_list[:max_per_problem]
                    matched = True
                    break

        if not matched:
            # Use domain-based fallback
            domain_strengths = _get_domain_strengths(problem_lower)
            if domain_strengths:
                strengths_map[problem] = domain_strengths[:max_per_problem]
            else:
                # Generic fallback (just 1 generic)
                strengths_map[problem] = GENERIC_STRENGTHS[:1]

    return strengths_map


def _get_domain_strengths(problem_text: str) -> List[str]:
    """Get strengths based on the problem's domain."""
    problem_lower = problem_text.lower()

    for domain, categories in DOMAINS.items():
        if domain in problem_lower:
            domain_strengths = []
            for cat in categories:
                if cat == "compliance":
                    domain_strengths.append("Patient is compliant with prescribed medications")
                elif cat == "support":
                    domain_strengths.append("Patient has supportive family or caregivers")
                elif cat == "monitoring":
                    domain_strengths.append("Patient can monitor and report symptoms")
                elif cat == "reporting":
                    domain_strengths.append("Patient reports symptoms promptly to healthcare team")
                elif cat == "safety":
                    domain_strengths.append("Patient takes precautions to prevent injury")
                elif cat == "verbalization":
                    domain_strengths.append("Patient is able to verbalize symptoms and concerns")
                elif cat == "faith":
                    domain_strengths.append("Patient has faith or spiritual beliefs that provide comfort")
                elif cat == "coping":
                    domain_strengths.append("Patient demonstrates effective coping strategies")
                elif cat == "expression":
                    domain_strengths.append("Patient is able to express feelings and concerns")
                elif cat == "routine":
                    domain_strengths.append("Patient maintains a consistent daily routine")
                elif cat == "environment":
                    domain_strengths.append("Patient can rest in a comfortable, quiet environment")
                elif cat == "willingness":
                    domain_strengths.append("Patient is willing to learn and participate in care")
                elif cat == "questions":
                    domain_strengths.append("Patient asks relevant questions about condition and treatment")
                elif cat == "receptiveness":
                    domain_strengths.append("Patient is receptive to health education")
                elif cat == "devices":
                    domain_strengths.append("Patient can use assistive devices for mobility")
                elif cat == "family support":
                    domain_strengths.append("Patient has family support for daily activities")
                elif cat == "preferences":
                    domain_strengths.append("Patient can identify food preferences for nutritional planning")
                elif cat == "small meals":
                    domain_strengths.append("Patient can tolerate small, frequent meals")
                elif cat == "positioning":
                    domain_strengths.append("Patient can position self to promote comfort and circulation")
                elif cat == "hygiene":
                    domain_strengths.append("Patient maintains personal hygiene within ability")
                elif cat == "hydration":
                    domain_strengths.append("Patient maintains adequate fluid intake")
                elif cat == "independence":
                    domain_strengths.append("Patient performs self-care activities independently where possible")
                elif cat == "assistance":
                    domain_strengths.append("Patient asks for assistance when needed")
                elif cat == "adaptation":
                    domain_strengths.append("Patient adapts to limitations with available resources")
            return domain_strengths

    return []


def generate_bulleted_list(items: List[str], bullet_char: str = "-") -> str:
    """Format a list of items as a bulleted string.

    Each item becomes its own bullet line. Used for problems, strengths,
    and nursing diagnoses sections that should be bulleted per NMC standard.
    """
    if not items:
        return "(No problems identified from the assessment data.)"

    return "\n".join(f"{bullet_char} {item}" for item in items)


def format_nanda_diagnosis_bullets(diagnoses: List[Dict], bullet_char: str = "-") -> str:
    """Format NANDA-I diagnoses as bulleted list in proper PES format.

    Each diagnosis is formatted as:
      - [Diagnosis] related to [etiology] as evidenced by [signs/symptoms].
    or, if no etiology/signs:
      - [Diagnosis].
    """
    if not diagnoses:
        return "(No nursing diagnoses identified from the assessment data.)"

    lines = []
    for diag in diagnoses:
        parts = [diag["diagnosis"]]
        if diag.get("related_to"):
            parts.append(f"related to {diag['related_to']}")
        # Risk diagnoses describe susceptibility, not an existing problem, so
        # they must not carry an "as evidenced by" clause.
        if diag.get("as_evidenced_by") and not diag["diagnosis"].lower().startswith("risk for"):
            parts.append(f"as evidenced by {diag['as_evidenced_by']}")
        lines.append(f"{bullet_char} {' '.join(parts)}.")

    return "\n".join(lines)


def extract_problems_from_chapter1(chapter1_data: Dict[str, str]) -> List[str]:
    """Extract potential health problems from Chapter 1 data fields.

    Pulls problems from:
      - Presenting symptoms (1.7 presentingSymptoms, associatedSymptoms)
      - Physical assessment findings (1.7 physicalFindings)
      - Present medical history (1.7 onset, associated symptoms)
      - Admission findings (1.8 initialCare, treatmentStarted context clues)
      - Patient's concept of illness (1.9 emotionalResponse → anxiety/etc.)
    """
    problems: List[str] = []
    clinical_notes = chapter1_data.get("clinicalNotes", "")
    if clinical_notes:
        problems.extend(_extract_items_from_text(clinical_notes))
        emotional_problem = _extract_emotional_problem(clinical_notes)
        if emotional_problem:
            problems.append(emotional_problem)

    # From presenting symptoms
    presenting = chapter1_data.get("presentingSymptoms", "")
    if presenting:
        problems.extend(_extract_items_from_text(presenting))

    # From associated symptoms
    associated = chapter1_data.get("associatedSymptoms", "")
    if associated:
        problems.extend(_extract_items_from_text(associated))

    # From physical findings
    physical = chapter1_data.get("physicalFindings", "")
    if physical:
        problems.extend(_extract_items_from_text(physical))

    # From emotional response (may indicate anxiety, fear)
    emotional = chapter1_data.get("emotionalResponse", "")
    if emotional:
        prob = _extract_emotional_problem(emotional)
        if prob:
            problems.append(prob)

    # From patient's concept / understanding
    understanding = chapter1_data.get("understanding", "")
    if understanding and any(kw in understanding.lower() for kw in ["don't know", "does not know", "not aware", "no idea", "did not know"]):
        problems.append("little knowledge")

    # From onset narrative (may contain symptom descriptions)
    onset = chapter1_data.get("onset", "")
    if onset:
        problems.extend(_extract_items_from_text(onset))

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for p in problems:
        p_lower = p.lower().strip()
        if p_lower and p_lower not in seen:
            seen.add(p_lower)
            unique.append(p)

    return unique


def _extract_items_from_text(text: str) -> List[str]:
    """Extract symptom/problem items from narrative text.

    Handles common patterns like:
      - "patient complained of X, Y, and Z"
      - "symptoms include X, Y, Z"
      - lists separated by commas, "and", semicolons
    """
    import re

    items = []

    # Split by common delimiters
    for segment in re.split(r'[,;]\s*', text):
        segment = segment.strip().lower()

        # Check against known problem keywords
        for keyword in PROBLEM_TO_NANDA:
            if keyword in segment:
                if keyword not in items:
                    items.append(keyword)
                break  # one match per segment

    # Also look for "and X" patterns at end of lists
    and_match = re.search(r'\band\s+([^,.]+?)(?:\.|$)', text, re.IGNORECASE)
    if and_match:
        last_item = and_match.group(1).strip().lower()
        for keyword in PROBLEM_TO_NANDA:
            if keyword in last_item:
                if keyword not in items:
                    items.append(keyword)
                break

    return items


def _extract_emotional_problem(text: str) -> Optional[str]:
    """Extract emotional/psychological problem from patient's response text."""
    text_lower = text.lower()

    if any(kw in text_lower for kw in ["anxious", "anxiety", "worried", "worry", "fear", "scared", " afraid"]):
        return "anxiety"
    if any(kw in text_lower for kw in ["stress", "stressed", "overwhelmed"]):
        return "stress"
    if any(kw in text_lower for kw in ["depressed", "depression", "sad", "sadness"]):
        return "fear"  # or could map to grieving
    if any(kw in text_lower for kw in ["concern", "concerned"]):
        return "anxiety"

    return None


# ---------------------------------------------------------------------------
# Helper to build a complete Chapter 2.3-2.5 data structure from Chapter 1
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Comparison of Data with Standards (Section 2.1) helper
# ---------------------------------------------------------------------------


def build_comparison_section_from_chapter1_and_lit(
    chapter1_fields: Dict[str, str],
    literature_review_fields: Dict[str, str],
    condition: str = "",
) -> Dict[str, str]:
    """Build suggested content for section 2.1 Comparison of Data with Standards.

    This section compares patient data (from Chapter 1) with literature standards
    (from Chapter 1's Literature Review - section 1.10).

    Returns a dict with all the fields needed for 2.1:
      - introDefinition: opening definition with citation
      - investigationsList: patient's diagnostic tests
      - testsComparisonComment: % match commentary
      - causesComparison: literature causes vs patient's factors
      - clinicalFeaturesComparison: table-ready comparison data
      - clinicalFeaturesComment: % of features exhibited
      - treatmentGivenList: patient's medications/treatments
      - treatmentComparison: comparison with standard treatment
      - treatmentComment: % of drugs from literature
      - complicationsComparison: literature complications vs patient status
    """
    # Extract relevant data
    investigations = chapter1_fields.get("investigations", "") or chapter1_fields.get("admissionInvestigations", "")
    treatment = chapter1_fields.get("treatmentStarted", "") or ""
    physical_findings = chapter1_fields.get("physicalFindings", "") or ""
    presenting = chapter1_fields.get("presentingSymptoms", "") or ""
    associated = chapter1_fields.get("associatedSymptoms", "") or ""

    # Literature review fields (from section 1.10)
    lit_diagnostics = literature_review_fields.get("diagnostics", "") or ""
    lit_causes = literature_review_fields.get("causes", "") or ""
    lit_clinical = literature_review_fields.get("clinicalFeatures", "") or ""
    lit_treatment = literature_review_fields.get("treatment", "") or ""
    lit_complications = literature_review_fields.get("complications", "") or ""

    # Build the comparison sections
    result = {
        "introDefinition": _build_intro_definition(condition),
        "investigationsList": investigations.strip() if investigations else _suggest_investigations(condition),
        "testsComparisonComment": _build_tests_comment(investigations, lit_diagnostics),
        "causesComparison": _build_causes_comparison(lit_causes, presenting, associated, chapter1_fields),
        "clinicalFeaturesComparison": _build_clinical_features_comparison(lit_clinical, presenting, associated, physical_findings),
        "clinicalFeaturesComment": _build_clinical_features_comment(lit_clinical, presenting, associated, physical_findings),
        "treatmentGivenList": treatment.strip() if treatment else _suggest_treatment(condition),
        "treatmentComparison": _build_treatment_comparison(lit_treatment, treatment, condition),
        "treatmentComment": _build_treatment_comment(lit_treatment, treatment),
        "complicationsComparison": _build_complications_comparison(lit_complications, condition),
    }

    return result


def _build_intro_definition(condition: str) -> str:
    """Build an opening definition for the comparison section with citation."""
    definitions = {
        "hypertension": "A medical test is a medical procedure performed to detect, diagnose, or monitor diseases, disease processes, susceptibility, or to determine a course of treatment and investigation is a systematic examination or research (Bolboacă, 2019).",
        "pneumonia": "A medical test is a medical procedure performed to detect, diagnose, or monitor diseases, disease processes, susceptibility, or to determine a course of treatment and investigation is a systematic examination or research (Bolboacă, 2019).",
        "diabetes": "A medical test is a medical procedure performed to detect, diagnose, or monitor diseases, disease processes, susceptibility, or to determine a course of treatment and investigation is a systematic examination or research (Bolboacă, 2019).",
        "malaria": "A medical test is a medical procedure performed to detect, diagnose, or monitor diseases, disease processes, susceptibility, or to determine a course of treatment and investigation is a systematic examination or research (Bolboacă, 2019).",
        "sickle cell": "A medical test is a medical procedure performed to detect, diagnose, or monitor diseases, disease processes, susceptibility, or to determine a course of treatment and investigation is a systematic examination or research (Bolboacă, 2019).",
    }
    condition_lower = condition.lower()
    for key, definition in definitions.items():
        if key in condition_lower:
            return definition
    return "Diagnostic tests and investigation are approaches used in clinical practice to precisely inquire and confirm the presence of diseases and illness amongst patients, henceforth to provide timely and appropriate medical treatments and interventions (Bolboacă, 2019)."


def _suggest_investigations(condition: str) -> str:
    """Suggest common investigations based on condition."""
    condition_lower = condition.lower()
    suggestions = {
        "hypertension": "Blood Pressure Measurement (multiple readings)\nLipid Profile\nSerum Creatinine / Renal Function Test\nElectrocardiogram (ECG)\nUrinalysis",
        "pneumonia": "Chest X-ray\nComplete Blood Count (FBC)\nSputum Culture\nESR (Erythrocyte Sedimentation Rate)\nBlood Culture (if severe)\nSickling test (if applicable)",
        "diabetes": "Fasting Blood Glucose\nHbA1c\nLipid Profile\nSerum Creatinine\nUrinalysis\nOral Glucose Tolerance Test (OGTT)",
        "malaria": "Blood Film for Malaria Parasites (thick and thin)\nRapid Diagnostic Test (RDT)\nComplete Blood Count (FBC)\nSerum Creatinine\nUrinalysis",
        "sickle cell": "Sickling Test\nHb Electrophoresis\nComplete Blood Count (FBC)\nBlood Film\nSerum Electrolytes",
    }
    for key, sugg in suggestions.items():
        if key in condition_lower:
            return sugg
    return "(List diagnostic investigations carried out on the patient during admission.)"


def _build_tests_comment(investigations: str, lit_diagnostics: str) -> str:
    """Build commentary on % of tests compared to literature."""
    if not investigations.strip():
        return "(State how many of the patient's diagnostic tests match the literature standards.)"
    if not lit_diagnostics.strip():
        return "The diagnostic investigations carried out on the patient were compared with standard investigations from the literature."
    return "The diagnostic investigations carried out on the patient were compared with those outlined in the literature review. Investigations not found in the literature were still requested where clinically indicated."


def _build_causes_comparison(
    lit_causes: str,
    presenting: str,
    associated: str,
    chapter1: Dict[str, str],
) -> str:
    """Build causes comparison: literature vs patient's contributing factors."""
    if not lit_causes.strip():
        return "(Compare literature causes with the patient's specific contributing factors.)"

    # Extract patient-specific factors from history
    patient_factors = []
    socio = chapter1.get("socioEffect", "") or chapter1.get("familyOccupation", "") or ""
    diet = chapter1.get("diet", "") or ""
    lifestyle = chapter1.get("habits", "") or ""

    if "smoking" in lifestyle.lower() or "tobacco" in lifestyle.lower():
        patient_factors.append("Smoking/tobacco use")
    if "alcohol" in lifestyle.lower():
        patient_factors.append("Alcohol consumption")
    if "salt" in diet.lower() or "fatty" in diet.lower():
        patient_factors.append("Dietary habits (high salt/fat intake)")
    if "stress" in socio.lower() or "hard work" in socio.lower():
        patient_factors.append("Stress from occupation/environment")
    if "sedentary" in lifestyle.lower() or "no exercise" in lifestyle.lower():
        patient_factors.append("Lack of physical exercise")

    # Add from presenting symptoms context
    if "obese" in presenting.lower() or "overweight" in presenting.lower():
        patient_factors.append("Obesity/overweight")
    if "family" in presenting.lower() and "history" in presenting.lower():
        patient_factors.append("Family history of condition")

    if not patient_factors:
        return f"With reference to the literature review, the causes of {chapter1.get('diagnosis', 'the condition')} include various factors as stated in the literature. However, based on the patient's history and socio-economic background, the contributing factors in this case include assessment of individual risk factors from the patient's history."

    factors_text = "; ".join(patient_factors) + "."
    return f"With reference to the literature review, the causes of the condition include various factors as stated. However, in the case of this patient, the contributing factors include: {factors_text}"


def _build_clinical_features_comparison(
    lit_clinical: str,
    presenting: str,
    associated: str,
    physical_findings: str,
) -> str:
    """Build clinical features comparison in a table-ready format.

    Format: each feature followed by Present/Absent status
    Example:
    Fever: Present
    Cough: Present
    Chest pain: Absent
    """
    patient_symptoms = (presenting + " " + associated + " " + physical_findings).lower()

    # Common clinical features by condition type (general list)
    common_features = [
        "fever", "cough", "chest pain", "difficulty breathing", "dyspnea",
        "headache", "fatigue", "weakness", "generalized body weakness",
        "pain", "anxiety", "restlessness", "poor appetite", "nausea",
        "vomiting", "diarrhoea", "constipation", "palpitation", "dizziness",
        "sweating", "chills", "rigors", "malaise", "body ache",
        "swelling", "oedema", "altered vital signs", "tachypnoea", "tachycardia",
    ]

    lines = []
    for feature in common_features:
        feature_lower = feature.lower()
        if feature_lower in patient_symptoms:
            lines.append(f"{feature.capitalize()}: Present")
        # Don't add Absent for features not mentioned — only list what's relevant

    # Also add from presenting symptoms explicitly
    if presenting.strip():
        for symptom in presenting.split(","):
            symptom = symptom.strip().lower()
            if symptom and symptom not in [l.split(":")[0].lower() for l in lines]:
                lines.append(f"{symptom.capitalize()}: Present")

    if not lines:
        return "(List each clinical feature from the literature and state whether the patient exhibited it: Feature Name: Present/Absent)"

    return "\n".join(lines)


def _build_clinical_features_comment(
    lit_clinical: str,
    presenting: str,
    associated: str,
    physical_findings: str,
) -> str:
    """Build commentary on % of clinical features exhibited."""
    all_patient_text = (presenting + " " + associated + " " + physical_findings).strip().lower()

    if not all_patient_text:
        return "(State the percentage or proportion of clinical features the patient exhibited compared to literature.)"

    # Count how many common features are present
    common_features = ["fever", "cough", "chest pain", "difficulty breathing", "headache",
                       "fatigue", "weakness", "pain", "anxiety", "palpitation", "dizziness"]
    present_count = sum(1 for f in common_features if f in all_patient_text)

    if present_count == 0:
        return "The patient exhibited some clinical features consistent with the literature, though not all features were present."

    if present_count <= 2:
        return f"The patient exhibited a limited number of clinical features compared to those outlined in the literature."
    elif present_count <= 4:
        return f"The patient exhibited approximately half of the clinical features found in the literature."
    else:
        return f"The patient exhibited the majority of clinical features found in the literature."


def _suggest_treatment(condition: str) -> str:
    """Suggest common treatments based on condition."""
    condition_lower = condition.lower()
    suggestions = {
        "hypertension": "Antihypertensive medications (e.g. Nifedipine, Losartan, Hydralazine)\nAnalgesics for headache (e.g. Paracetamol)\nHealth education on lifestyle modification",
        "pneumonia": "Antibiotics (e.g. Ceftriaxone, Azithromycin)\nIV fluids\nAntipyretics (e.g. Paracetamol)\nOxygen therapy (if hypoxic)\nChest physiotherapy",
        "diabetes": "Insulin therapy or oral hypoglycaemics\nDietary management\nFluid replacement\nHealth education on foot care and glucose monitoring",
        "malaria": "Antimalarial medications (e.g. Artemether-Lumefantrine)\nAntipyretics for fever\nIV fluids if dehydrated\nBlood transfusion if severe anaemia",
        "sickle cell": "Analgesics for pain\nHydration (IV fluids)\nAntibiotics for infection\nBlood transfusion (if indicated)\nOxygen therapy",
    }
    for key, sugg in suggestions.items():
        if key in condition_lower:
            return sugg
    return "(List each drug or treatment the patient received during admission.)"


def _build_treatment_comparison(
    lit_treatment: str,
    treatment: str,
    condition: str,
) -> str:
    """Build treatment comparison with standard treatment."""
    if not treatment.strip():
        return "(Compare each treatment given with standard treatment from literature. Format: Drug name and dose: matches/does not match standard; Comments)"

    if not lit_treatment.strip():
        return f"The treatment given to the patient was compared with the standard treatment outlined in the literature for {condition}."

    return f"With reference from the literature, the treatment modality suitable for the patient's condition includes the medications and interventions as stated in the literature review. The table below illustrates the comparison of specific treatment given to the patient and that of the literature."


def _build_treatment_comment(lit_treatment: str, treatment: str) -> str:
    """Build commentary on % of drugs from literature given."""
    if not treatment.strip():
        return "(State what proportion of standard treatment the patient received.)"

    if not lit_treatment.strip():
        return "The treatment given to the patient was reviewed against standard treatment protocols."

    # Count drugs in treatment
    drug_count = len([line for line in treatment.split("\n") if line.strip()])
    if drug_count >= 4:
        return f"The majority of drugs found in the literature for this condition were administered to the patient."
    elif drug_count >= 2:
        return f"A significant proportion of the standard drugs outlined in the literature were given to the patient."
    else:
        return f"Some of the drugs found in the literature were administered to the patient based on clinical indication."


def _build_complications_comparison(
    lit_complications: str,
    condition: str,
) -> str:
    """Build complications comparison: literature vs patient status."""
    if not lit_complications.strip():
        return "(List possible complications from literature and state whether the patient developed any.)"

    # Common complications by condition
    condition_complications = {
        "hypertension": "myocardial infarction, congestive heart failure, hypertensive encephalopathy, cerebrovascular accident (stroke), renal failure, angina pectoris, hypertensive retinopathy. The patient showed no signs of these complications during the period of hospitalization.",
        "pneumonia": "pleural effusion, atelectasis, septicaemia, respiratory failure, lung abscess, pericarditis, meningitis, cardiac failure. The patient showed no signs of these complications during the period of hospitalization.",
        "diabetes": "diabetic ketoacidosis, hypoglycaemia, diabetic foot ulcer, nephropathy, retinopathy, neuropathy, cardiovascular complications. The patient showed no signs of these complications during the period of hospitalization.",
        "malaria": "severe anaemia, cerebral malaria, acute renal failure, hypoglycaemia, respiratory distress, blackwater fever. The patient showed no signs of these complications during the period of hospitalization.",
        "sickle cell": "vaso-occlusive crisis, acute chest syndrome, stroke, priapism, splenic sequestration, avascular necrosis, leg ulcers. The patient showed no signs of these complications during the period of hospitalization.",
    }

    condition_lower = condition.lower()
    for key, comp in condition_complications.items():
        if key in condition_lower:
            return f"With reference to the literature review, the possible complications of {condition} include: {comp}"

    return f"With reference to the literature review, the possible complications of {condition} include various complications as stated. The patient was monitored for these complications throughout the period of hospitalization."


def build_chapter2_analysis_from_chapter1(
    chapter1_fields: Dict[str, str],
    condition: str = "",
) -> Dict[str, any]:
    """Build suggested data for sections 2.3, 2.4, and 2.5 from Chapter 1 fields.

    This is the core automation: given the patient data collected in Chapter 1,
    it identifies problems, suggests NANDA-I diagnoses, and recommends strengths.

    Returns a dict with keys:
      - section_23: {actualProblems, potentialProblems, problemPriority}
      - section_24: {generalStrengths, specificStrengths}
      - section_25: {nursingDiagnoses, diagnosisPriority}
    """
    # Step 1: Extract problems from Chapter 1
    identified_problems = extract_problems_from_chapter1(chapter1_fields)

    # Step 2: Suggest NANDA-I diagnoses
    nanda_suggestions = suggest_nanda_diagnoses(identified_problems) if identified_problems else []

    # Step 3: Suggest strengths
    strengths_map = suggest_strengths_for_problems(identified_problems) if identified_problems else {}

    # Build specific strengths (mapped to each problem)
    # Take only the top 2-3 most relevant strengths overall to match NMC format
    specific_strengths = []
    seen_strengths: set = set()
    for problem, strengths in strengths_map.items():
        for s in strengths:
            if s.lower() not in seen_strengths:
                seen_strengths.add(s.lower())
                specific_strengths.append(s)
                if len(specific_strengths) >= 10:  # cap at 10 total specific strengths
                    break
        if len(specific_strengths) >= 10:
            break

    # General strengths (not tied to a specific problem)
    general_strength_candidates = [
        "Patient is compliant with prescribed medications",
        "Patient has supportive family members who assist with care",
        "Patient demonstrates positive attitude towards recovery",
        "Patient is able to verbalize concerns and participate in care decisions",
    ]
    general_strengths = []
    for gs in general_strength_candidates:
        if gs.lower() not in seen_strengths:
            seen_strengths.add(gs.lower())
            general_strengths.append(gs)

    # Format nursing diagnoses as bullets
    nanda_lines = format_nanda_diagnosis_bullets(nanda_suggestions) if nanda_suggestions else "(No nursing diagnoses identified from the assessment data.)"

    # Format actual problems as bullets
    actual_problems_lines = generate_bulleted_list(identified_problems) if identified_problems else "(No specific health problems identified from the assessment data. Review Chapter 1 presenting complaints and physical assessment findings.)"

    # Diagnosis priority (comma-separated list of diagnosis names, ordered)
    diagnosis_priority = ""
    if nanda_suggestions:
        diagnosis_priority = ", ".join(
            f"{i+1}. {d['diagnosis']}"
            for i, d in enumerate(nanda_suggestions)
        )

    return {
        "section_23": {
            "actualProblems": actual_problems_lines,
            "potentialProblems": _suggest_potential_problems(condition, identified_problems),
            "problemPriority": _build_priority_summary(identified_problems, nanda_suggestions),
        },
        "section_24": {
            "generalStrengths": "\n".join(f"- {s}" for s in general_strengths) if general_strengths else "(General strengths not yet identified.)",
            "specificStrengths": "\n".join(f"- {s}" for s in specific_strengths) if specific_strengths else "(Specific strengths mapped to problems not yet identified.)",
        },
        "section_25": {
            "nursingDiagnoses": nanda_lines,
            "diagnosisPriority": diagnosis_priority,
        },
    }


def _suggest_potential_problems(condition: str, actual_problems: List[str]) -> str:
    """Suggest potential problems/risks based on the condition and actual problems."""
    if not condition and not actual_problems:
        return "(Assess for potential complications based on the patient's condition.)"

    potentials = []

    condition_lower = condition.lower()

    # Condition-based risks
    if "hypertension" in condition_lower or "high blood pressure" in condition_lower:
        if "dizziness" not in actual_problems and "dizziness" not in str(actual_problems).lower():
            potentials.append("Risk for Falls (due to potential orthostatic hypotension from antihypertensive medications)")
        if "headache" not in actual_problems and "stroke" not in str(actual_problems).lower():
            potentials.append("Risk for Cerebrovascular Accident (stroke) due to uncontrolled blood pressure")
        potentials.append("Risk for Decreased Cardiac Output (if blood pressure remains uncontrolled)")
        potentials.append("Risk for Impaired Renal Function (hypertension is a risk factor for kidney damage)")

    if "diabetes" in condition_lower or "diabetic" in condition_lower:
        potentials.append("Risk for Hypoglycemia (related to medication and dietary management)")
        potentials.append("Risk for Impaired Skin Integrity (due to decreased wound healing)")
        potentials.append("Risk for Infection (diabetes increases infection risk)")

    if "asthma" in condition_lower:
        potentials.append("Risk for Ineffective Breathing Pattern (due to potential asthma exacerbation)")
        potentials.append("Risk for Activity Intolerance (due to impaired oxygen exchange)")

    if "pneumonia" in condition_lower:
        potentials.append("Risk for Ineffective Airway Clearance (due to retained secretions)")
        potentials.append("Risk for Impaired Gas Exchange (if condition worsens)")

    if "malaria" in condition_lower:
        potentials.append("Risk for Deficit Fluid Volume (due to fever, sweating, and reduced intake)")
        potentials.append("Risk for Activity Intolerance (due to weakness from illness)")

    if "sickle cell" in condition_lower or "sickle" in condition_lower:
        potentials.append("Risk for Pain (vaso-occlusive crisis)")
        potentials.append("Risk for Impaired Skin Integrity (due to poor circulation)")
        potentials.append("Risk for Infection (functional asplenia)")

    # Problem-based risks
    if "palpitation" in str(actual_problems).lower() or "chest pain" in str(actual_problems).lower():
        if "Decreased Cardiac Output" not in str(potentials):
            potentials.append("Risk for Decreased Cardiac Output (if symptoms indicate cardiac strain)")

    if "fever" in str(actual_problems).lower() or "high temperature" in str(actual_problems).lower():
        potentials.append("Risk for Deficit Fluid Volume (due to increased fluid loss from fever)")

    if "immobility" in str(actual_problems).lower() or "difficulty walking" in str(actual_problems).lower():
        potentials.append("Risk for Impaired Skin Integrity (due to prolonged pressure)")
        potentials.append("Risk for Deep Vein Thrombosis (due to decreased mobility)")

    if "nausea" in str(actual_problems).lower() or "vomiting" in str(actual_problems).lower():
        potentials.append("Risk for Deficit Fluid Volume (due to active fluid loss)")
        potentials.append("Risk for Imbalanced Nutrition: Less Than Body Requirements")

    if not potentials:
        potentials.append("(Assess for potential complications based on the patient's specific condition and risk factors.)")

    return "\n".join(f"- {p}" for p in potentials)


def _build_priority_summary(problems: List[str], nanda: List[Dict]) -> str:
    """Build a priority summary for the problems section."""
    if not problems:
        return "(Prioritise problems using Maslow's Hierarchy of Needs and the ABC framework.)"

    if not nanda:
        return f"Identified {len(problems)} problem(s) from assessment data. Prioritise using clinical urgency (ABC: Airway, Breathing, Circulation) and Maslow's Hierarchy of Needs."

    priority_parts = []
    for i, d in enumerate(nanda):
        priority_parts.append(f"{i+1}. {d['diagnosis']} ({d['priority_hint']} priority)")

    return "Identified problems prioritised according to clinical urgency (ABC framework) and Maslow's Hierarchy of Needs:\n" + "\n".join(f"- {p}" for p in priority_parts)
