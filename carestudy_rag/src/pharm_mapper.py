"""Pharmacology table recommendations for care study section 2.2.

Given the drug names collected in Chapter 1 (regular medications, treatment
given, admission treatment), produce a proposed pharmacology table row per
drug:

    [name, class, dose/route/frequency, indication, side effects, nursing responsibility]

Two layers, mirroring nanda_mapper.py:

1. A bundled WHO Model Formulary snapshot (data/reference/formulary_*.txt)
   parsed for uses, dose, and adverse effects — deterministic, citable, and
   free of hallucinated doses.
2. An alias table that maps brand names and spelling variants onto the
   bundled monographs, plus a recognition list for common drugs that are NOT
   bundled so the caller can flag them for review instead of silently
   inventing monograph data for them.
"""

from __future__ import annotations

import os
import re
from typing import Dict, List

FORMULARY_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "reference")

# Chapter 1 fields that may name the patient's drugs, in priority order.
DRUG_FIELDS = (
    "treatmentGivenList",
    "medications",
    "treatmentStarted",
    "treatment",
    "treatmentComparison",
    "drugs",
)

# Alias -> bundled formulary file stem (formulary_<stem>.txt). Word-boundary
# matched, case-insensitive.
FORMULARY_ALIASES: Dict[str, List[str]] = {
    "paracetamol": ["paracetamol", "acetaminophen", "panadol", "efpac", "doliprane"],
    "amoxicillin": ["amoxicillin", "amoxil"],
    "ceftriaxone": ["ceftriaxone", "rocephin"],
    "artemether_lumefantrine": [
        "artemether", "lumefantrine", "coartem", "artemether-lumefantrine",
        "artemether/lumefantrine", "artemether + lumefantrine", "lonart", "amatem",
    ],
    "artesunate": ["artesunate"],
    "quinine": ["quinine"],
    "metronidazole": ["metronidazole", "flagyl"],
    "gentamicin": ["gentamicin"],
    "ciprofloxacin": ["ciprofloxacin", "cipro"],
    "cloxacillin": ["cloxacillin"],
    "doxycycline": ["doxycycline"],
    "cotrimoxazole": ["cotrimoxazole", "co-trimoxazole", "sulfamethoxazole", "trimethoprim", "septrin", "bactrim"],
    "ibuprofen": ["ibuprofen", "brufen"],
    "metoclopramide": ["metoclopramide"],
    "nifedipine": ["nifedipine", "adalat"],
    "atenolol": ["atenolol", "tenormin"],
    "enalapril": ["enalapril"],
    "hydrochlorothiazide": ["hydrochlorothiazide", "hctz"],
    "methyldopa": ["methyldopa", "aldomet"],
    "salbutamol": ["salbutamol", "ventolin"],
    "dexamethasone": ["dexamethasone"],
    "prednisolone": ["prednisolone"],
    "hydrocortisone": ["hydrocortisone"],
    "diazepam": ["diazepam", "valium"],
    "carbamazepine": ["carbamazepine", "tegretol"],
    "phenytoin": ["phenytoin", "epanutin"],
    "magnesium_sulfate": ["magnesium sulfate", "magnesium sulphate"],
    "ferrous_salt": ["ferrous", "fefol"],
    "morphine": ["morphine"],
    "metformin": ["metformin", "glucophage"],
    "furosemide": ["furosemide", "lasix"],
    "insulin": ["insulin", "actrapid", "mixtard", "insulatard"],
    "folic_acid": ["folic acid", "folic", "folate"],
}

# Common drugs that are recognised but NOT bundled: flagged for review rather
# than filled from invented monograph data.
KNOWN_UNBUNDLED = [
    "amlodipine", "diclofenac", "omeprazole", "tramadol", "azithromycin",
    "lisinopril", "glibenclamide", "spironolactone", "cefuroxime", "orphenedol",
    "vitamin", "pantoprazole", "esomyx", "sertraline", "fluoxetine",
]

CLASS_MAP: Dict[str, str] = {
    "paracetamol": "Non-opioid analgesic and antipyretic",
    "amoxicillin": "Beta-lactam antibiotic (aminopenicillin)",
    "ceftriaxone": "Third-generation cephalosporin antibiotic",
    "artemether_lumefantrine": "Antimalarial (artemisinin-based combination therapy)",
    "artesunate": "Antimalarial (artemisinin derivative)",
    "quinine": "Antimalarial (alkaloid)",
    "metronidazole": "Antibacterial and antiprotozoal (nitroimidazole)",
    "gentamicin": "Aminoglycoside antibiotic",
    "ciprofloxacin": "Fluoroquinolone antibiotic",
    "cloxacillin": "Beta-lactam antibiotic (penicillinase-resistant penicillin)",
    "doxycycline": "Tetracycline antibiotic",
    "cotrimoxazole": "Sulfonamide combination antibacterial",
    "ibuprofen": "Non-steroidal anti-inflammatory analgesic",
    "metoclopramide": "Antiemetic (dopamine antagonist)",
    "nifedipine": "Calcium-channel blocker (dihydropyridine)",
    "atenolol": "Beta-blocker (cardioselective)",
    "enalapril": "ACE inhibitor",
    "hydrochlorothiazide": "Thiazide diuretic",
    "methyldopa": "Centrally acting antihypertensive",
    "salbutamol": "Short-acting beta-2 agonist bronchodilator",
    "dexamethasone": "Corticosteroid (glucocorticoid)",
    "prednisolone": "Corticosteroid (glucocorticoid)",
    "hydrocortisone": "Corticosteroid (glucocorticoid + mineralocorticoid)",
    "diazepam": "Benzodiazepine (anxiolytic, anticonvulsant)",
    "carbamazepine": "Anticonvulsant (tricyclic)",
    "phenytoin": "Anticonvulsant (hydantoin)",
    "magnesium_sulfate": "Anticonvulsant for severe pre-eclampsia/eclampsia; electrolyte supplement",
    "ferrous_salt": "Oral iron supplement (haematinic)",
    "morphine": "Opioid analgesic",
    "metformin": "Biguanide oral antidiabetic",
    "furosemide": "Loop diuretic",
    "insulin": "Insulin (antidiabetic hormone preparation)",
    "folic_acid": "Vitamin B9 (folic acid) supplement",
}

# Expert nursing hints for the bundled drugs; the generic template is the
# fallback for anything without a hint.
NURSING_HINTS: Dict[str, str] = {
    "paracetamol": "Administer exactly as prescribed; do not exceed the maximum daily dose; monitor temperature and pain relief; educate the patient on the danger of overdosage to the liver.",
    "amoxicillin": "Check for penicillin allergy before the first dose; complete the prescribed course; monitor for rash, diarrhoea, and hypersensitivity reactions.",
    "ceftriaxone": "Check for cephalosporin/penicillin allergy; administer as prescribed; monitor injection site, renal function, and for hypersensitivity reactions.",
    "artemether_lumefantrine": "Give with fatty food or milk to improve absorption; complete the full six-dose course; monitor for dizziness, anorexia, and palpitations; report vomiting within 30 minutes of a dose.",
    "artesunate": "Administer as prescribed (IV or oral per phase of treatment); monitor temperature and parasite response; watch for haemolysis and hypersensitivity; follow with oral ACT to complete treatment.",
    "quinine": "Monitor blood glucose (quinine causes hypoglycaemia), hearing (tinnitus), and ECG during infusion; infuse slowly in dextrose; educate on cinchonism symptoms.",
    "metronidazole": "Warn against alcohol during and 48 hours after treatment (disulfiram reaction); give with or after food; complete the course; monitor for metallic taste, nausea, and neuropathy.",
    "gentamicin": "Monitor renal function, fluid balance, and hearing/vestibular symptoms; ensure hydration; administer as prescribed over the correct duration; watch for ototoxicity and nephrotoxicity.",
    "ciprofloxacin": "Give with plenty of water; avoid antacids, milk, and iron within 2 hours of a dose; monitor for tendon pain, photosensitivity, and CNS effects; complete the course.",
    "cloxacillin": "Check for penicillin allergy; administer on an empty stomach for best absorption; complete the full course; monitor for hypersensitivity and gastrointestinal upset.",
    "doxycycline": "Give with plenty of water in an upright position; avoid antacids, iron, and dairy within 2 hours; counsel on sun protection; complete the full course.",
    "cotrimoxazole": "Monitor for rash and signs of blood dyscrasias (sore throat, fever); ensure adequate fluid intake; check potassium in renal impairment; ask about sulfa allergy before the first dose.",
    "ibuprofen": "Give with or after food; monitor for gastrointestinal upset, bleeding, and renal function; avoid combining with other NSAIDs; caution in asthma and hypertension.",
    "metoclopramide": "Give 30 minutes before meals; monitor for drowsiness and extrapyramidal effects (tremor, rigidity); limit duration of use; caution in young adults.",
    "nifedipine": "Monitor blood pressure, heart rate, and for ankle oedema, flushing, and headache; avoid grapefruit juice; caution with sublingual use in severe hypotension.",
    "atenolol": "Monitor pulse and blood pressure before dosing (withhold if bradycardic per protocol); never stop abruptly; monitor blood glucose in diabetics; watch for fatigue and cold extremities.",
    "enalapril": "Monitor blood pressure, renal function, and serum potassium; watch for persistent dry cough and first-dose hypotension; counsel on rising slowly.",
    "hydrochlorothiazide": "Monitor electrolytes (especially potassium), blood pressure, and fluid balance; give in the morning; watch for dehydration, gout flares, and raised glucose.",
    "methyldopa": "Monitor blood pressure and liver function; watch for drowsiness, dizziness, and depression; safe in pregnancy; never stop abruptly.",
    "salbutamol": "Teach correct inhaler or nebuliser technique; monitor pulse (tachycardia), tremor, and symptom relief; track frequency of rescue use and escalate per plan if worsening.",
    "dexamethasone": "Administer with food in the morning where possible; monitor blood glucose, blood pressure, and for signs of infection; never stop abruptly; educate on steroid side effects.",
    "prednisolone": "Give with food in the morning; monitor weight, blood glucose, blood pressure, and mood; taper as prescribed; educate on infection risk and bone health during long courses.",
    "hydrocortisone": "Administer as prescribed; monitor blood glucose, blood pressure, electrolytes, and fluid balance; watch for signs of infection; follow stress-dosing guidance if applicable.",
    "diazepam": "Monitor level of consciousness, respiration, and blood pressure; ensure fall precautions and a call bell in reach; avoid alcohol; watch for dependence with prolonged use.",
    "carbamazepine": "Monitor for rash, drowsiness, ataxia, and hyponatraemia; check blood counts and liver function; avoid grapefruit juice; counsel on consistent dosing and sun protection.",
    "phenytoin": "Monitor therapeutic levels, gum hyperplasia (encourage dental hygiene), ataxia, and nystagmus; give consistently with food; avoid abrupt withdrawal.",
    "magnesium_sulfate": "Monitor reflexes, respiratory rate, urine output, and serum magnesium before each dose; have calcium gluconate available as antidote; monitor fetal heart rate where relevant.",
    "ferrous_salt": "Give on an empty stomach with vitamin C-rich juice for absorption (or with food if gastric upset); avoid tea and milk around the dose; expect dark stools; monitor haemoglobin.",
    "morphine": "Monitor respiratory rate, sedation, blood pressure, and pain relief; have naloxone available; ensure regular assessment for constipation; educate on dependence and safe storage.",
    "metformin": "Give with meals to reduce gastrointestinal upset; monitor blood glucose and renal function; withhold before contrast imaging as advised; educate on signs of lactic acidosis.",
    "furosemide": "Monitor daily weight, urine output, blood pressure, and electrolytes (especially potassium); administer in the morning to avoid nocturia.",
    "insulin": "Rotate injection sites; monitor blood glucose for hypoglycaemia; ensure food is taken after administration; store unopened insulin in a refrigerator.",
    "folic_acid": "Administer as prescribed, usually daily; monitor haemoglobin response; educate on dietary sources of folate.",
}

_DISPLAY_NAMES: Dict[str, str] = {
    "artemether_lumefantrine": "Artemether + lumefantrine",
    "folic_acid": "Folic acid",
    "cotrimoxazole": "Sulfamethoxazole + trimethoprim (cotrimoxazole)",
    "magnesium_sulfate": "Magnesium sulfate",
    "ferrous_salt": "Ferrous salt (oral iron)",
}

_SECTION_RE = re.compile(
    r"^(Uses|Precautions|Dose|Adverse effects?|Contraindications)\s*:\s*(.*)$",
    re.IGNORECASE,
)
_MAX_ROWS = 12


def _normalise_key(label: str) -> str:
    label = label.lower().strip()
    if label.startswith("adverse"):
        return "adverse effects"
    return label


def _parse_monograph(text: str) -> Dict[str, str]:
    """Extract the Uses / Precautions / Dose / Adverse effects sections.

    Monograph text is hard-wrapped, so each section is the label's remainder
    plus all following lines until the next label or a 'NOTE.' marker, joined
    and whitespace-collapsed.
    """
    sections: Dict[str, List[str]] = {}
    current: str | None = None

    def _seal(key: str | None) -> None:
        if key is not None and sections.get(key):
            sections[key] = " ".join(" ".join(sections[key]).split())

    for raw_line in text.splitlines():
        line = raw_line.strip()
        match = _SECTION_RE.match(line)
        if match:
            _seal(current)
            current = _normalise_key(match.group(1))
            sections.setdefault(current, [])
            if match.group(2):
                sections[current].append(match.group(2))
            continue
        if current is None:
            continue
        if line.startswith("NOTE.") or line.startswith("WARNING"):
            _seal(current)
            current = None
            continue
        if line:
            sections[current].append(line)
    _seal(current)
    return {key: value for key, value in sections.items() if value}


def _truncate(text: str, limit: int) -> str:
    """Cut to the limit without splitting a word — break on ; or . or space."""
    if len(text) <= limit:
        return text
    cut = text[:limit]
    for marker in ("; ", ". "):
        idx = cut.rfind(marker)
        if idx > limit // 2:
            return cut[: idx + 1].rstrip()
    return cut[: cut.rfind(" ")].rstrip()


def _adult_dose(dose_text: str, limit: int = 220) -> str:
    """Prefer the adult dose paragraph; fall back to the start of the section."""
    if not dose_text:
        return ""
    match = re.search(r"ADULT\s*,?\s*(.*?)(?:;\s*CHILD|;\s*INFANT|NOTE\.|$)", dose_text, re.DOTALL)
    chosen = match.group(1) if match else dose_text
    chosen = " ".join(chosen.split())
    # Drop a leading indication echo ('Mild to moderate pain, pyrexia, by mouth')
    chosen = re.sub(r"^.*?,\s*(?=(by mouth|by rectum|by deep|intramuscular|intravenous|subcutaneous|orally|IV|IM))", "", chosen, count=1)
    # 'ADULT and CHILD over 12 years…' dose criteria are noise for an adult row.
    chosen = re.sub(r"^and\s+CHILD\s+over[^,]*,\s*", "", chosen, count=1)
    return _truncate(chosen.strip(" ,;"), limit)


def _load_monograph(stem: str) -> Dict[str, str] | None:
    path = os.path.join(FORMULARY_DIR, f"formulary_{stem}.txt")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as handle:
        return _parse_monograph(handle.read())


def _build_nursing(stem: str, sections: Dict[str, str]) -> str:
    hint = NURSING_HINTS.get(stem)
    if hint:
        return hint
    parts = []
    if sections.get("precautions"):
        parts.append(f"Observe precautions in {sections['precautions'][:120]}.")
    if sections.get("adverse effects"):
        parts.append(f"Monitor for {sections['adverse effects'][:100]}.")
    parts.append("Administer exactly as prescribed; document dose, route, and time.")
    return " ".join(parts)[:260]


def _extract_drug_names(chapter1_fields: Dict[str, str]) -> List[str]:
    """Collect drug-name-ish fragments from the Chapter 1 medication fields."""
    blobs: List[str] = []
    for field in DRUG_FIELDS:
        value = str(chapter1_fields.get(field, "") or "").strip()
        if value:
            blobs.append(value)
    names: List[str] = []
    seen = set()

    def add(name: str) -> None:
        name = name.strip(" .;:-*0123456789\t")
        key = name.lower()
        if 2 < len(name) <= 60 and key not in seen and not key.startswith("e.g"):
            seen.add(key)
            names.append(name)

    for blob in blobs:
        for fragment in re.split(r"[\n;]+", blob):
            fragment = fragment.strip()
            if not fragment:
                continue
            # 'Tablet: 100-500 mg' style lines are not drug names.
            if re.match(r"^(tab|cap|syr|inj)\b", fragment, re.I) and ":" in fragment:
                fragment = fragment.split(":", 1)[1].strip()
            # Drop trailing schedule/noise tokens so unmatched names read clean.
            fragment = re.sub(
                r"\s*\b(withheld|withheld|prn|nocte|stat|mane|as prescribed|as needed)\b\s*$",
                "", fragment, flags=re.IGNORECASE,
            ).strip(" ,.-")
            add(fragment)
    return names[:_MAX_ROWS]


def build_pharmacology_rows(chapter1_fields: Dict[str, str]) -> Dict[str, object]:
    """Propose section 2.2 pharmacology rows from the Chapter 1 drug fields.

    Returns {"rows": [[name, class, dose, indication, sideEffects, nursing], ...],
    "unmatched": [names with no bundled monograph], "note": str}.
    """
    text = " ".join(
        str(chapter1_fields.get(field, "") or "")
        for field in DRUG_FIELDS
    ).lower()

    rows: List[List[str]] = []
    unmatched: List[str] = []
    seen_stems: set = set()
    matched_aliases: List[str] = []

    # 1. Alias-match the bundled monographs (most reliable first).
    for stem, aliases in FORMULARY_ALIASES.items():
        for alias in aliases:
            if re.search(rf"\b{re.escape(alias)}\b", text):
                if stem in seen_stems:
                    break
                sections = _load_monograph(stem)
                if not sections:
                    break
                seen_stems.add(stem)
                matched_aliases.extend(aliases)
                display = _DISPLAY_NAMES.get(stem, stem.replace("_", " ").capitalize())
                rows.append([
                    display,
                    CLASS_MAP.get(stem, ""),
                    _adult_dose(sections.get("dose", "")),
                    _truncate(sections.get("uses", ""), 200),
                    _truncate(sections.get("adverse effects", ""), 200),
                    _build_nursing(stem, sections),
                ])
                break

    # 2. Name the drugs we recognised but cannot fill from the formulary.
    for drug in KNOWN_UNBUNDLED:
        if re.search(rf"\b{re.escape(drug)}\b", text) and len(unmatched) < 8:
            unmatched.append(drug.capitalize())

    # 3. Anything left that looks like a named drug but matched nothing.
    for name in _extract_drug_names(chapter1_fields):
        lowered = name.lower()
        if len(unmatched) >= 8:
            break
        if any(alias in lowered for alias in matched_aliases):
            continue
        if any(lowered in row[0].lower() or row[0].lower() in lowered for row in rows):
            continue
        if any(drug in lowered or lowered in drug for drug in KNOWN_UNBUNDLED):
            continue
        # Skip fragments that are clearly not drug names.
        if re.search(r"\b(patient|daily|twice|times|admitted|complain|mg\b|ml\b)", lowered):
            continue
        unmatched.append(name)

    return {
        "rows": rows[:_MAX_ROWS],
        "unmatched": unmatched,
        "note": (
            "Rows are grounded in the bundled WHO Model Formulary (2008). "
            "Drugs listed as unmatched have no bundled monograph — verify their "
            "details against a current formulary before use."
        ),
    }


if __name__ == "__main__":
    import json
    import sys

    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    demo = {
        "treatmentGivenList": "Artemether/lumefantrine (Coartem) tablets; Paracetamol 1 g three times daily; IV Ceftriaxone 1 g daily",
        "medications": "Amlodipine 5 mg daily",
    }
    print(json.dumps(build_pharmacology_rows(demo), indent=1, ensure_ascii=False))
