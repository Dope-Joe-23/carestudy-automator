"""Nursing care-plan generation for Chapter 3 (Planning).

Built from the school's sample care studies (Halima/HPT, Joe's/sickle-cell,
Sharifa's) and the nursing-process grammar they follow:

- NURSING ORDERS: 5-8 discrete, action-oriented, imperative activities
  ("Assess pain level using the 0-10 pain scale") — what the nurse PLANS to do.
- NURSING INTERVENTIONS: the same activities mirrored one-to-one in the past
  tense ("Pain level was assessed using the 0-10 pain scale") — what WAS done —
  enriched with the patient's actual prescribed drugs where recorded.
- OBJECTIVES: SMART — "Patient will ... within <time> as evidenced by;
  A) patient verbalising ... B) nurse observing ...".

The deterministic library output is used twice (mirroring chapter2 flow):
as grounding material for the LLM prompt, and as a cell-by-cell fallback when
the model call fails or returns an unusable shape.
"""

from __future__ import annotations

import json
import re
import sys
from typing import Dict, List, Optional, Tuple

from draft_worker import _chat_model  # reuse the model gateway with fallbacks

# ---------------------------------------------------------------------------
# Diagnosis-family order library
# ---------------------------------------------------------------------------
# Each family maps a diagnosis to (orders, interventions, objective builder).
# Orders are imperative activities drawn from the sample studies' vocabulary.
# Interventions are written as past-tense templates ({d} = diagnosis phrase);
# when the student recorded a matching drug the medication line replaces the
# generic "Prescribed medication was administered" template.

# (family_key, matcher) — first match wins.
_FAMILY_MATCHERS: List[Tuple[str, "re.Pattern[str]"]] = [
    ("pain", re.compile(r"pain|headache|chest pain|discomfort", re.I)),
    ("sleep", re.compile(r"sleep|insomnia|rest", re.I)),
    ("knowledge", re.compile(r"knowledge|educat|understand", re.I)),
    ("falls", re.compile(r"fall|dizz|mobility|activity intolerance|ambulat", re.I)),
    ("cardiac", re.compile(r"cardiac output|palpitation|heart rate|dysrhythm", re.I)),
    ("fluid", re.compile(r"fluid|hydrat|dehydrat|volume", re.I)),
    ("hyperthermia", re.compile(r"hyperthermia|fever|temperature", re.I)),
    ("breathing", re.compile(r"gas exchange|airway|breathing|respirat|oxygen", re.I)),
    ("self_care", re.compile(r"self[- ]care|hygiene|grooming", re.I)),
    ("nutrition", re.compile(r"nutrition|diet|feeding|weight", re.I)),
    ("anxiety", re.compile(r"anxiety|fear|coping", re.I)),
    ("renal", re.compile(r"renal|kidney|urinary", re.I)),
    ("perfusion", re.compile(r"perfusion|tissue|stroke|cerebrovasc", re.I)),
    ("infection", re.compile(r"infection|immunity", re.I)),
    ("skin", re.compile(r"skin|integrity|pressure|sore", re.I)),
    ("elimination", re.compile(r"constipation|bowel|elimination|urin", re.I)),
]

# Validating a risk diagnosis for a monitorable family: risk rows lean on
# observation + safety orders rather than curative ones, so the library keeps
# risk-specific phrasing where it matters.
_RISK_RX = re.compile(r"\brisk\b", re.I)

ORDERS_LIBRARY: Dict[str, List[str]] = {
    "pain": [
        "Reassure patient that the pain will be relieved with the nursing measures that will be put in place.",
        "Assess pain level using the pain scale (0–10) including onset, location, character, and aggravating factors.",
        "Let patient assume a position of comfort of choice.",
        "Check and record vital signs to serve as baseline data for future comparison.",
        "Give diversional therapy to take patient's mind off the pain.",
        "Nurse patient in a calm, quiet environment and restrict visitors.",
        "Administer prescribed analgesic as ordered and evaluate its effect.",
    ],
    "sleep": [
        "Reassure patient that adequate rest and sleep will be ensured.",
        "Reduce noise on the ward — lower television/radio volume and speak quietly.",
        "Restrict visitors during the day to enhance rest.",
        "Organise nursing care activities so they do not interrupt patient's sleep.",
        "Educate patient on the importance of rest and sleep.",
        "Ensure patient takes a warm bath before bed and limit evening fluids.",
    ],
    "knowledge": [
        "Assess patient's interest in learning and current knowledge about the condition.",
        "Reduce environmental distractions while educating patient.",
        "Explain the disease condition, its causes, signs and symptoms, and preventive measures in simple language.",
        "Allow time for questions and clarification, and provide feedback.",
        "Ask patient to demonstrate understanding (teach-back) of the information given.",
        "Provide health education materials patient can refer to later.",
    ],
    "falls": [
        "Reassure patient that safety measures will be put in place to allay fears and anxiety.",
        "Monitor vital signs, especially blood pressure, every 4 hours.",
        "Raise bedside rails and keep the bed in its lowest position.",
        "Keep patient's personal items within easy reach.",
        "Assist patient with daily activities such as ambulating and changing positions slowly.",
        "Switch on adequate lighting and keep the floor clear and dry.",
    ],
    "cardiac": [
        "Reassure patient to allay anxiety that worsens palpitations.",
        "Monitor vital signs — pulse rate, rhythm, and blood pressure — every 4 hours and record.",
        "Educate patient to avoid stimulants such as caffeine and energy drinks.",
        "Teach patient relaxation techniques such as deep breathing and meditation.",
        "Encourage patient to have adequate rest between activities.",
        "Administer prescribed cardiac medication as ordered and observe its effect.",
    ],
    "fluid": [
        "Reassure patient that measures will be put in place to restore hydration.",
        "Assess and record patient's hydration status — skin turgor, mucus membranes, and urine output.",
        "Encourage patient to take oral fluids as tolerated and record intake and output.",
        "Serve intravenous fluids as prescribed and regulate the rate.",
        "Educate patient and family on the signs of dehydration to report, such as dry mouth and dark urine.",
        "Weigh patient daily at the same time to monitor fluid balance.",
    ],
    "hyperthermia": [
        "Reassure patient that the temperature will be brought down to normal.",
        "Monitor and record patient's temperature every 4 hours.",
        "Ensure adequate ventilation — open windows, remove excess clothing, and use a fan.",
        "Perform tepid sponging to promote heat loss by conduction.",
        "Encourage patient to consume mild-cold fluids to replace losses.",
        "Administer prescribed antipyretic as ordered and evaluate its effect.",
    ],
    "breathing": [
        "Reassure patient that breathing will be eased with the measures put in place.",
        "Assess respiratory rate, depth, and effort of breathing regularly and record.",
        "Assist patient into a breathing-supporting position such as semi-Fowler's position.",
        "Remove all tight clothing at the chest and neck.",
        "Monitor oxygen saturation and administer prescribed oxygen as ordered.",
        "Educate patient on proper breathing technique (diaphragmatic breathing).",
    ],
    "self_care": [
        "Assess for factors that interfere with patient's ability to perform self-care, such as weakness and fatigue.",
        "With patient, develop a realistic plan for meeting daily physical needs.",
        "Encourage maximum independence within activity restrictions.",
        "Assist patient with self-care activities such as bathing, grooming, and dressing as needed.",
        "Keep patient's supplies and personal items within easy reach.",
        "Provide assistive devices such as a walker or bedpan where necessary.",
    ],
    "nutrition": [
        "Assess patient's nutritional status using weight, BMI, and dietary history.",
        " Educate patient on a nutritious diet rich in the required nutrients.",
        "Encourage patient to eat small, frequent meals as tolerated.",
        "Provide oral care before meals to enhance appetite.",
        "Involve the dietitian or family in meal planning and serving.",
        "Monitor and record patient's weight and intake regularly.",
    ],
    "anxiety": [
        "Reassure patient that the condition is being managed by competent health personnel.",
        "Establish a trusting relationship by listening attentively to patient's concerns.",
        "Encourage patient to verbalise feelings and identify sources of anxiety.",
        "Teach patient relaxation techniques such as deep breathing exercises.",
        "Keep the environment calm and minimise stressful stimuli.",
        "Provide accurate information about the condition and its care to reduce fear of the unknown.",
    ],
    "renal": [
        "Reassure patient that kidney function will be closely monitored.",
        "Monitor and record fluid intake and output, noting urine colour and volume.",
        "Monitor blood pressure and report readings outside the ordered target range.",
        "Educate patient to report early signs of urinary problems such as painful urination or reduced urine.",
        "Encourage adequate fluid intake as permitted and a low-salt diet as ordered.",
        "Administer prescribed medication as ordered and observe for side effects.",
    ],
    "perfusion": [
        "Reassure patient that measures to maintain good circulation will be put in place.",
        "Assess cardiovascular status — capillary refill, pulse rate and rhythm, and skin colour — and record.",
        "Encourage patient to avoid a sedentary lifestyle and do passive exercises in bed.",
        "Educate patient to report early warning signs such as numbness, weakness, or severe headache.",
        "Maintain patient's hydration status to support blood volume.",
        "Administer prescribed medication as ordered and observe its effect.",
    ],
    "infection": [
        "Reassure patient that the infection will be managed with the treatment plan.",
        "Monitor and record vital signs, especially temperature, every 4 hours.",
        "Observe strict aseptic technique during all nursing procedures.",
        "Educate patient and family on hand hygiene and infection-prevention practices.",
        "Encourage patient to take a well-balanced diet to boost immunity.",
        "Administer prescribed antibiotics as ordered and complete the full course.",
    ],
    "skin": [
        "Assess patient's skin, especially pressure areas, at least every shift and record.",
        "Change patient's position every two hours and support with pillows.",
        "Keep patient's skin clean and dry, and apply prescribed creams or lotions.",
        "Provide a well-padded, pressure-relieving mattress or air ring.",
        "Educate patient and family on the importance of position changes.",
        "Ensure adequate nutrition and hydration to support skin integrity.",
    ],
    "elimination": [
        "Assess patient's usual bowel and bladder pattern and record deviations.",
        "Encourage patient to take plenty of fluids and a fibre-rich diet as permitted.",
        "Assist patient to the toilet or provide a bedpan/urinal at requested times.",
        "Encourage patient to ambulate or do passive exercises to promote peristalsis.",
        "Educate patient on avoiding straining and the use of laxatives only as ordered.",
        "Administer prescribed medication such as stool softeners as ordered.",
    ],
}

# Generic fallback for diagnoses outside every family (kept action-oriented).
GENERIC_ORDERS: List[str] = [
    "Reassure patient that measures will be put in place to address the condition.",
    "Assess and record patient's status (vital signs and related findings) every 4 hours.",
    "Assist patient with activities of daily living as needed.",
    "Educate patient and family on the condition and self-care measures.",
    "Provide a calm environment and adequate rest between nursing activities.",
    "Administer prescribed medication as ordered and observe its effect.",
    "Evaluate patient's response to care at each review and report changes promptly.",
]

# ---------------------------------------------------------------------------
# Interventions — past-tense mirrors of the orders, per family. Kept in the
# same order as ORDERS_LIBRARY so each intervention reflects its order.
# ---------------------------------------------------------------------------

INTERVENTIONS_LIBRARY: Dict[str, List[str]] = {
    "pain": [
        "Patient was reassured that the pain will be relieved with the nursing measures put in place.",
        "Pain level was assessed using the 0–10 pain scale, including onset, location, and character.",
        "Patient was allowed to assume a position of comfort of choice.",
        "Vital signs were checked and recorded to serve as baseline data for future comparison.",
        "Diversional therapy was given to take patient's mind off the pain.",
        "Patient was nursed in a calm, quiet environment and visitors were restricted.",
        "{medication} was administered as prescribed and its effect was evaluated.",
    ],
    "sleep": [
        "Patient was reassured that adequate rest and sleep will be ensured.",
        "Noise was reduced — the television and radio were switched off and staff spoke quietly.",
        "Visitors were restricted during the day to allow enough rest.",
        "Nursing care activities were organised so they did not interrupt patient's sleep.",
        "Patient was educated on the importance of rest and sleep.",
        "A warm bath was ensured before bed and evening fluids were limited.",
    ],
    "knowledge": [
        "Patient's interest in learning and current knowledge about the condition were assessed.",
        "Environmental distractions were reduced while patient was being educated.",
        "The disease condition, its causes, signs and symptoms, and preventive measures were explained in simple language.",
        "Enough time was allowed for questions and clarification, and feedback was provided.",
        "Patient's understanding was confirmed through teach-back of the information given.",
        "Health education materials were provided for patient's later reference.",
    ],
    "falls": [
        "Patient was reassured that safety measures had been put in place to allay fears and anxiety.",
        "Vital signs, especially blood pressure, were monitored every 4 hours and recorded.",
        "Bedside rails were raised and the bed kept in its lowest position to prevent falls.",
        "Patient's personal items were kept within easy reach.",
        "Patient was assisted with daily activities and to change positions slowly.",
        "Adequate lighting was provided and the floor kept clear and dry.",
    ],
    "cardiac": [
        "Patient was reassured to allay anxiety that worsens palpitations.",
        "Vital signs — pulse rate, rhythm, and blood pressure — were monitored every 4 hours and recorded.",
        "Patient was educated to avoid stimulants such as caffeine and energy drinks.",
        "Relaxation techniques such as deep breathing and meditation were taught.",
        "Patient was encouraged to rest adequately between activities.",
        "{medication} was administered as prescribed and its effect observed.",
    ],
    "fluid": [
        "Patient was reassured that measures had been put in place to restore hydration.",
        "Patient's hydration status — skin turgor, mucus membranes, and urine output — was assessed and recorded.",
        "Patient was encouraged to take oral fluids as tolerated, and intake and output were recorded.",
        "Intravenous fluids were served as prescribed and the rate regulated.",
        "Patient and family were educated on the signs of dehydration to report, such as dry mouth and dark urine.",
        "Patient was weighed daily at the same time to monitor fluid balance.",
    ],
    "hyperthermia": [
        "Patient was reassured that the temperature will be brought down to normal.",
        "Patient's temperature was monitored and recorded every 4 hours.",
        "Adequate ventilation was ensured — windows opened, excess clothing removed, and a fan provided.",
        "Patient was tepid sponged to promote heat loss by conduction.",
        "Patient was encouraged to consume mild-cold fluids to replace losses.",
        "{medication} was administered as prescribed and the temperature response was evaluated.",
    ],
    "breathing": [
        "Patient was reassured that breathing will be eased with the measures put in place.",
        "Respiratory rate, depth, and effort of breathing were assessed regularly and recorded.",
        "Patient was assisted into a breathing-supporting position (semi-Fowler's position).",
        "All tight clothing at the chest and neck were removed to ease breathing.",
        "Oxygen saturation was monitored and prescribed oxygen administered as ordered.",
        "Patient was taught proper breathing technique using the diaphragm and abdominal muscles.",
    ],
    "self_care": [
        "Factors that interfered with patient's ability to perform self-care, such as weakness and fatigue, were assessed.",
        "A realistic plan for meeting daily physical needs was developed with patient.",
        "Patient was encouraged to be as independent as possible within activity restrictions.",
        "Patient was assisted with self-care activities such as bathing, grooming, and dressing as needed.",
        "Patient's supplies and personal items were kept within easy reach.",
        "Assistive devices such as a walker or bedpan were provided where necessary.",
    ],
    "nutrition": [
        "Patient's nutritional status was assessed using weight, BMI, and dietary history.",
        "Patient was educated on a nutritious diet rich in the required nutrients.",
        "Patient was encouraged to eat small, frequent meals as tolerated.",
        "Oral care was provided before meals to enhance appetite.",
        "The dietitian or family was involved in meal planning and serving.",
        "Patient's weight and intake were monitored and recorded regularly.",
    ],
    "anxiety": [
        "Patient was reassured that the condition was being managed by competent health personnel.",
        "A trusting relationship was established by listening attentively to patient's concerns.",
        "Patient was encouraged to verbalise feelings and identify sources of anxiety.",
        "Relaxation techniques such as deep breathing exercises were taught.",
        "The environment was kept calm and stressful stimuli minimised.",
        "Accurate information about the condition and its care was provided to reduce fear of the unknown.",
    ],
    "renal": [
        "Patient was reassured that kidney function will be closely monitored.",
        "Fluid intake and output were monitored and recorded, noting urine colour and volume.",
        "Blood pressure was monitored and readings outside the target range were reported.",
        "Patient was educated to report early signs of urinary problems such as painful or reduced urination.",
        "Adequate fluid intake and a low-salt diet were encouraged as permitted.",
        "{medication} was administered as ordered and observed for side effects.",
    ],
    "perfusion": [
        "Patient was reassured that measures to maintain good circulation had been put in place.",
        "Cardiovascular status — capillary refill, pulse rate and rhythm, and skin colour — was assessed and recorded.",
        "Patient was encouraged to avoid a sedentary lifestyle and do passive exercises in bed.",
        "Patient was educated to report early warning signs such as numbness, weakness, or severe headache.",
        "Patient's hydration status was maintained to support blood volume.",
        "{medication} was administered as prescribed and its effect observed.",
    ],
    "infection": [
        "Patient was reassured that the infection will be managed with the treatment plan.",
        "Vital signs, especially temperature, were monitored and recorded every 4 hours.",
        "Strict aseptic technique was observed during all nursing procedures.",
        "Patient and family were educated on hand hygiene and infection-prevention practices.",
        "Patient was encouraged to eat a well-balanced diet to boost immunity.",
        "{medication} was administered as ordered and the full course was completed.",
    ],
    "skin": [
        "Patient's skin, especially pressure areas, was assessed at least every shift and recorded.",
        "Patient's position was changed every two hours with pillows for support.",
        "Patient's skin was kept clean and dry, and prescribed creams or lotions applied.",
        "A well-padded, pressure-relieving mattress or air ring was provided.",
        "Patient and family were educated on the importance of frequent position changes.",
        "Adequate nutrition and hydration were ensured to support skin integrity.",
    ],
    "elimination": [
        "Patient's usual bowel and bladder pattern was assessed and deviations recorded.",
        "Plenty of fluids and a fibre-rich diet were encouraged as permitted.",
        "Patient was assisted to the toilet or provided with a bedpan or urinal at requested times.",
        "Patient was encouraged to ambulate or do passive exercises to promote peristalsis.",
        "Patient was educated on avoiding straining and on using laxatives only as ordered.",
        "{medication} such as stool softeners was administered as ordered.",
    ],
}

GENERIC_INTERVENTIONS: List[str] = [
    "Patient was reassured that measures had been put in place to address the condition.",
    "Patient's status (vital signs and related findings) was assessed and recorded every 4 hours.",
    "Patient was assisted with activities of daily living as needed.",
    "Patient and family were educated on the condition and self-care measures.",
    "A calm environment and adequate rest were provided between nursing activities.",
    "{medication} was administered as ordered and its effect observed.",
    "Patient's response to care was evaluated at each review and changes reported promptly.",
]

# ---------------------------------------------------------------------------
# Objective (SMART) builder
# ---------------------------------------------------------------------------

# Evidence pairs (patient verbalisation, nurse observation) per family.
_EVIDENCE: Dict[str, Tuple[str, str]] = {
    "pain": ("patient verbalising relief from the pain", "nurse observing a relaxed facial expression and comfortable posture"),
    "sleep": ("patient verbalising sleeping well for 6–8 hours", "nurse observing patient resting calmly at night"),
    "knowledge": ("patient correctly stating the causes, signs and symptoms of the condition", "nurse observing patient demonstrate understanding through teach-back"),
    "falls": ("patient verbalising absence of dizziness", "nurse observing patient move about safely without falling"),
    "cardiac": ("patient verbalising absence of palpitations", "nurse recording a pulse rate within the normal range"),
    "fluid": ("patient taking fluids willingly", "nurse observing good skin turgor and moist mucus membranes"),
    "hyperthermia": ("patient verbalising absence of body hotness and shivering", "nurse recording a temperature within 36.2–37.2 °C"),
    "breathing": ("patient verbalising easier breathing", "nurse recording normal oxygen saturation (95–100%)"),
    "self_care": ("patient verbalising ability to perform self-care", "nurse observing patient carry out self-care activities within restrictions"),
    "nutrition": ("patient verbalising improved appetite", "nurse observing patient finishing meals and gaining weight"),
    "anxiety": ("patient verbalising reduced worry", "nurse observing patient appearing calm and resting comfortably"),
    "renal": ("patient reporting normal urination without pain", "nurse recording urine output within the expected range"),
    "perfusion": ("patient verbalising absence of numbness or weakness", "nurse recording capillary refill under 3 seconds"),
    "infection": ("patient verbalising feeling better", "nurse recording a temperature within the normal range"),
    "skin": ("patient verbalising absence of pain at pressure areas", "nurse observing intact skin without redness or breakdown"),
    "elimination": ("patient verbalising a return to the usual elimination pattern", "nurse observing a soft, formed stool or normal voiding"),
}

_GENERIC_EVIDENCE: Tuple[str, str] = (
    "patient verbalising improvement in the condition",
    "nurse observing and recording the expected clinical findings",
)

# A realistic review window per family (samples use 30 minutes to 72 hours).
_GOAL_WINDOW: Dict[str, str] = {
    "pain": "within 30 minutes to 1 hour",
    "sleep": "within 24 hours",
    "knowledge": "within 2 hours",
    "falls": "within 24 hours",
    "cardiac": "within 24 hours",
    "fluid": "within 24 hours",
    "hyperthermia": "within 24 hours",
    "breathing": "within 72 hours",
    "self_care": "within 24 hours",
    "nutrition": "within 72 hours",
    "anxiety": "within 24 hours",
    "renal": "within 24 hours",
    "perfusion": "throughout the duration of hospitalisation",
    "infection": "within 48–72 hours",
    "skin": "throughout the duration of hospitalisation",
    "elimination": "within 24 hours",
}

# Short desired-outcome phrases per family (used in the objective sentence).
_GOAL_OUTCOME: Dict[str, str] = {
    "pain": "be relieved of the pain",
    "sleep": "have adequate rest and sleep",
    "knowledge": "express understanding of the condition",
    "falls": "remain free from falls",
    "cardiac": "maintain a normal cardiac output",
    "fluid": "attain and maintain normal hydration",
    "hyperthermia": "attain a normal body temperature",
    "breathing": "attain optimal gaseous exchange",
    "self_care": "perform self-care activities within physical limitations",
    "nutrition": "attain and maintain adequate nutrition",
    "anxiety": "report a reduced level of anxiety",
    "renal": "maintain normal kidney function",
    "perfusion": "maintain optimal tissue perfusion",
    "infection": "be free from signs of infection",
    "skin": "maintain intact skin integrity",
    "elimination": "attain a normal elimination pattern",
}


# Risk-diagnosis phrasing for the prevention-focused opening order.
RISK_NOUNS: Dict[str, str] = {
    "pain": "severe pain",
    "sleep": "sleep-pattern disturbance",
    "knowledge": "knowledge deficit",
    "falls": "falls",
    "cardiac": "decreased cardiac output",
    "fluid": "fluid volume deficit",
    "hyperthermia": "hyperthermia",
    "breathing": "impaired gaseous exchange",
    "self_care": "self-care deficit",
    "nutrition": "nutritional deficiency",
    "anxiety": "excessive anxiety",
    "renal": "impaired renal function",
    "perfusion": "ineffective tissue perfusion",
    "infection": "infection",
    "skin": "impaired skin integrity",
    "elimination": "elimination problems",
}


def _match_family(diagnosis: str) -> str:
    for family, pattern in _FAMILY_MATCHERS:
        if pattern.search(diagnosis):
            return family
    return "generic"


def _is_risk(diagnosis: str) -> bool:
    return bool(_RISK_RX.search(diagnosis))


def _pick_medication(drugs: List[str], family: str) -> Optional[str]:
    """Pick the drug most relevant to a family, preferring recorded data."""
    family_drug_rx = {
        "pain": re.compile(r"analg|diclofenac|ibuprofen|paracetamol|tramadol|pirin|aspirin|morphine|piroxicam", re.I),
        "cardiac": re.compile(r"amlodipine|nifedipine|lisinopril|hydralazine|bendro|lasix|furosemide|atenolol|methyldopa|captopril", re.I),
        "hyperthermia": re.compile(r"paracetamol|ibuprofen|diclofenac|aspirin", re.I),
        "fluid": re.compile(r"normal saline|dns|dextrose|ringer|hartmann", re.I),
        "infection": re.compile(r"cef|amox|azithro|gentamicin|metronidazole|cipro|penicillin|antibiot", re.I),
        "renal": re.compile(r"lasix|furosemide|mannitol", re.I),
        "perfusion": re.compile(r"hydroxyurea|aspirin|heparin|pentoxifylline", re.I),
        "elimination": re.compile(r"lactulose|bisacodyl|liquid paraffin|stool softener", re.I),
        "breathing": re.compile(r"salbutamol|oxygen|aminophylline|prednis", re.I),
        "skin": re.compile(r"silver|povidone|cream|ointment|dressing", re.I),
    }
    rx = family_drug_rx.get(family)
    if rx:
        for drug in drugs:
            if rx.search(drug):
                return drug.strip()
    return drugs[0].strip() if drugs else None


def _orders_for(diagnosis: str) -> List[str]:
    family = _match_family(diagnosis)
    if family == "generic":
        return list(GENERIC_ORDERS)
    orders = list(ORDERS_LIBRARY[family])
    # Risk diagnoses: swap the curative opening for a prevention-focused one.
    if _is_risk(diagnosis) and orders:
        risk_noun = RISK_NOUNS.get(family, "the condition")
        orders[0] = (
            f"Reassure patient that preventive measures will be put in place to "
            f"avert {risk_noun}."
        )
    return orders


def _interventions_for(diagnosis: str, drugs: List[str]) -> List[str]:
    family = _match_family(diagnosis)
    templates = INTERVENTIONS_LIBRARY.get(family, GENERIC_INTERVENTIONS)
    medication = _pick_medication(drugs, family)
    rendered: List[str] = []
    for template in templates:
        if "{medication}" in template:
            if medication:
                rendered.append(template.format(medication=medication))
            else:
                rendered.append(
                    "Prescribed medication was administered as ordered and its effect was evaluated."
                )
        else:
            rendered.append(template)
    return rendered


def _objective_for(diagnosis: str) -> str:
    family = _match_family(diagnosis)
    outcome = _GOAL_OUTCOME.get(family, "show improvement in the condition")
    window = _GOAL_WINDOW.get(family, "within 24 hours")
    verbal, observe = _EVIDENCE.get(family, _GENERIC_EVIDENCE)
    return (
        f"Patient will {outcome} {window} as evidenced by: "
        f"A) {verbal}; B) {observe}."
    )


def _format_numbered(items: List[str]) -> str:
    return " ".join(f"{index + 1}) {item}" for index, item in enumerate(items))


# ---------------------------------------------------------------------------
# Rule-based plan (deterministic, no model call)
# ---------------------------------------------------------------------------

def build_care_plan_from_diagnoses(
    diagnoses: List[str],
    drugs: Optional[List[str]] = None,
) -> List[dict]:
    """Build one care-plan row per diagnosis with orders/interventions/objective.

    Returns rows shaped like the 3.2 grid: [date, diagnosis, objective, orders,
    interventions, evaluationDate, evaluation, rationale].
    """
    drugs = [d for d in (drugs or []) if isinstance(d, str) and d.strip()]
    rows: List[dict] = []
    for diagnosis in diagnoses:
        diagnosis = diagnosis.strip()
        if not diagnosis:
            continue
        orders = _orders_for(diagnosis)
        interventions = _interventions_for(diagnosis, drugs)
        rows.append({
            "diagnosis": diagnosis,
            "objective": _objective_for(diagnosis),
            "orders": _format_numbered(orders),
            "interventions": _format_numbered(interventions),
            "evaluation": "Pending implementation and patient response.",
            "rationale": (
                f"Orders direct the planned activities toward the objective, and the "
                f"interventions record that each activity was carried out, supporting "
                f"timely reassessment of {diagnosis} against the outcome criteria."
            ),
        })
    return rows


# ---------------------------------------------------------------------------
# LLM polish (grounded in the rule result, with per-cell fallback)
# ---------------------------------------------------------------------------

_CARE_PLAN_SYSTEM = (
    "You are a nursing tutor helping a student write the nursing care plan of a "
    "patient/family care study following NMC Ghana standards. You never invent "
    "patient facts. Follow the care-plan grammar exactly: NURSING ORDERS are 5-8 "
    "discrete, action-oriented, imperative activities the nurse plans to do "
    "(e.g. 'Assess pain level using the 0-10 pain scale', 'Raise bedside rails', "
    "'Administer prescribed analgesic') — never 'monitor the response and "
    "escalate deterioration'. NURSING INTERVENTIONS mirror the orders one-to-one "
    "in the PAST TENSE as finished activities ('Pain level was assessed using the "
    "0-10 pain scale'), naming the patient's recorded drugs with doses where "
    "provided. OBJECTIVES are SMART: 'Patient will ... within <time> as evidenced "
    "by; A) patient verbalising ... B) nurse observing ...'."
)


def _exemplar_block_for(diagnoses: List[str]) -> str:
    """Retrieve similar real care-plan rows from the school's samples to use as
    few-shot examples — this is what lets the AI handle ANY diagnosis, common
    or not, in the authentic local style. Returns '' when the exemplar index
    is unavailable (fresh deploys); the order library remains the fallback."""
    try:
        from care_plan_exemplars import format_exemplar_block, get_exemplar_index
    except Exception:
        return ""
    try:
        index = get_exemplar_index()
    except Exception:
        return ""
    exemplars: List[dict] = []
    seen: set = set()
    for diagnosis in diagnoses:
        for hit in index.query(diagnosis, k=2):
            key = hit["diagnosis"].lower()
            if key in seen:
                continue
            seen.add(key)
            exemplars.append(hit)
    return format_exemplar_block(exemplars[:3])


def _care_plan_with_llm(
    diagnoses: List[str],
    drugs: List[str],
    patient_context: str,
    rules_rows: List[dict],
) -> List[dict]:
    by_diagnosis = {row["diagnosis"].lower(): row for row in rules_rows}
    by_diagnosis = {row["diagnosis"].lower(): row for row in rules_rows}
    plan = []
    for row in rules_rows:
        plan.append({
            "diagnosis": row["diagnosis"],
            "objective": row["objective"],
            "orders": row["orders"],
            "interventions": row["interventions"],
        })
    exemplar_block = _exemplar_block_for(diagnoses)
    exemplar_section = (
        "\n\nREAL CARE-PLAN ROWS FROM PAST SAMPLE STUDIES (same school's style — "
        "imitate their phrasing, level of detail, and numbering for diagnoses "
        "similar to the ones you are writing; adapt the clinical content to THIS "
        "patient):\n"
        + exemplar_block
        if exemplar_block
        else ""
    )
    prompt = (
        "Refine this nursing care plan for this specific patient. Keep the same "
        "diagnoses and the same number of rows.\n\n"
        "RULE-BASED DRAFT (correct grammar — improve specificity and fit to the "
        "patient, do not change the structure):\n"
        + json.dumps(plan, indent=2)
        + exemplar_section
        + "\n\nPATIENT RECORDED MEDICATIONS (use the exact names/doses in the "
        "interventions where relevant; if empty, keep the generic "
        "'Prescribed medication was administered ...' form):\n"
        + ("; ".join(drugs) if drugs else "(none recorded)")
        + "\n\nPATIENT CONTEXT (Chapter 1 findings you may reference):\n"
        + (patient_context or "(none)")
        + "\n\nReturn ONLY JSON: {\"rows\": [{\"diagnosis\": str, \"objective\": "
          "str, \"orders\": str, \"interventions\": str}]}. orders and "
          "interventions are numbered activity lists like '1) ... 2) ...' with "
          "5-8 items each; interventions in past tense."
    )
    answer = _chat_model(_CARE_PLAN_SYSTEM, prompt, max_tokens=8000, label="care plan recommendations")
    # Isolate the JSON payload (some models wrap it in prose or fences).
    start = answer.find("{")
    end = answer.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("model response contained no JSON object")
    parsed = json.loads(answer[start:end + 1])
    model_rows = parsed.get("rows")
    if not isinstance(model_rows, list) or not model_rows:
        raise ValueError("model response contained no rows")

    merged: List[dict] = []
    for rule_row in rules_rows:
        key = rule_row["diagnosis"].lower()
        model_row = next(
            (r for r in model_rows
             if isinstance(r, dict) and str(r.get("diagnosis", "")).strip().lower() == key),
            None,
        )
        def _usable(value: object) -> Optional[str]:
            if isinstance(value, str) and len(value.strip()) >= 80:
                return value.strip()
            return None
        def _pick(model_value: object, fallback: str) -> str:
            if model_row:
                return _usable(model_value) or fallback
            return fallback
        merged.append({
            "diagnosis": rule_row["diagnosis"],
            "objective": _pick(model_row.get("objective") if model_row else None, rule_row["objective"]),
            "orders": _pick(model_row.get("orders") if model_row else None, rule_row["orders"]),
            "interventions": _pick(model_row.get("interventions") if model_row else None, rule_row["interventions"]),
            "evaluation": rule_row["evaluation"],
            "rationale": rule_row["rationale"],
        })
    return merged


def generate_care_plan_recommendations(
    diagnoses: List[str],
    drugs: Optional[List[str]] = None,
    patient_context: str = "",
) -> dict:
    """Personalised Chapter 3 care-plan recommendations via LLM, grounded in the
    order library. Mirrors generate_chapter2_recommendations: the deterministic
    library output grounds the prompt and serves as the cell-by-cell fallback,
    so the frontend always receives the same shape."""
    clean = [d.strip() for d in diagnoses if isinstance(d, str) and d.strip()]
    if not clean:
        raise ValueError("no diagnoses provided")
    rules_rows = build_care_plan_from_diagnoses(clean, drugs)
    try:
        rows = _care_plan_with_llm(clean, drugs or [], patient_context, rules_rows)
    except Exception as exc:
        print(
            f"[worker] care plan recommendations: model call failed, using library output: {exc}",
            file=sys.stderr, flush=True,
        )
        rows = rules_rows
    return {"rows": rows}
