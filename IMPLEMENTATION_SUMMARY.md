# Chapter 2 Section Draft Mechanism — Implementation Summary

## Problem Statement
The original system drafted Chapter 2 sections (problems, strengths, nursing diagnoses) as flowing narrative prose in a single combined section (2.3 Health Needs Identified). This did not match the NMC standard format seen in sample care studies.

## NMC Standard Format (from sample care studies)
The NMC standard separates Chapter 2 into three distinct bulleted sections:

### 2.3 Health Problems Identified
- Simple bulleted list of actual problems from patient assessment
- No analysis or prose — just the problems as observed
- Example from sample: "- Patient complained of dizziness", "- Patient had general body weakness"

### 2.4 Patient/Family Strengths
- Bulleted list of strengths that counter the identified problems
- Each strength mapped to a specific problem
- Example from sample: "- Patient is able to anticipate the onset of dizziness", "- Patient is willing to learn about hypertension"

### 2.5 Nursing Diagnoses (NANDA-I)
- Bulleted list in NANDA-I PES format: "Diagnosis related to etiology as evidenced by signs/symptoms"
- Example from sample: "- Risk for fall related to dizziness", "- Acute pain (headache) related to cerebrovascular resistance"

## Solution Implemented

### 1. Split Section 2.3 into Three Sections (`carestudy_rag/src/template.py`)
- **2.3 Health Problems Identified** — fields for actual problems, potential problems, priority
- **2.4 Patient/Family Strengths** — fields for general strengths and specific strengths mapped to problems
- **2.5 Nursing Diagnoses (NANDA-I)** — fields for NANDA-I diagnoses and priority ranking

### 2. Created NANDA-I Diagnosis Mapping System (`carestudy_rag/src/nanda_mapper.py`)
A comprehensive mapping system that:
- Maps 60+ common patient problems/symptoms to appropriate NANDA-I nursing diagnoses
- Generates complete PES-format diagnosis statements with related factors and defining characteristics
- Prioritizes diagnoses using ABC framework and Maslow's Hierarchy of Needs
- Auto-suggests corresponding patient strengths for each identified problem
- Extracts problems directly from Chapter 1 data fields (presenting symptoms, associated symptoms, physical findings, emotional response, understanding)

### 3. Updated Import Worker (`carestudy_rag/src/import_worker.py`)
- Updated SECTION_ID_MAP to reflect new section names:
  - `2.3`: "Health Problems Identified"
  - `2.4`: "Patient/Family Strengths"
  - `2.5`: "Nursing Diagnoses (NANDA-I)"
- Updated SECTION_FIELDS to match new field structure

### 4. Key Automation Features

#### Problems Auto-Extraction from Chapter 1
The system can automatically extract health problems from Chapter 1 fields:
- `presentingSymptoms` — primary symptoms from history
- `associatedSymptoms` — secondary symptoms
- `physicalFindings` — objective assessment findings
- `emotionalResponse` — psychological issues (anxiety, fear)
- `understanding` — knowledge deficit detection

#### NANDA-I Diagnosis Auto-Recommendation
Given extracted problems, the system suggests:
- Appropriate NANDA-I diagnosis label
- Related factors (etiology)
- Defining characteristics (as evidenced by)
- Priority level (high/medium/low)

#### Strengths Auto-Recommendation
For each identified problem, the system recommends 1-2 specific strengths:
- Direct counter-measures to the problem
- Patient abilities that mitigate the issue
- General strengths for overall support

## Example: Hypertension Patient (Mrs. T.T)

### Input (from Chapter 1):
- Presenting symptoms: palpitation, dizziness, fatigue, headache, general body weakness
- Associated symptoms: anxiety, insomnia, little knowledge of hypertension
- Emotional response: anxious about outcome

### Automated Output:

**Section 2.3 - Health Problems Identified:**
```
- palpitation
- dizziness
- fatigue
- headache
- general body weakness
- insomnia
- hypertension
- anxiety
- little knowledge
```

Potential Problems:
```
- Risk for Decreased Cardiac Output (if blood pressure remains uncontrolled)
- Risk for Impaired Renal Function (hypertension is a risk factor for kidney damage)
```

**Section 2.4 - Patient/Family Strengths:**
General:
```
- Patient is compliant with prescribed medications
- Patient has supportive family members who assist with care
```

Specific (mapped to problems):
```
- Patient is able to anticipate the onset of dizziness
- Patient can perform minor activities independently
- Patient is able to doze off in a quiet environment
- Patient is willing to learn about the condition
```

**Section 2.5 - Nursing Diagnoses (NANDA-I):**
```
- Decreased Cardiac Output related to altered heart rate and rhythm as evidenced by patient report of palpitations.
- Risk for Falls related to vestibular dysfunction or orthostatic hypotension as evidenced by patient report of dizziness.
- Activity Intolerance related to imbalance between oxygen supply and demand as evidenced by patient report of exhaustion.
- Acute Pain related to increased cerebrovascular resistance as evidenced by patient report of headache.
- Disturbed Sleep Pattern related to environmental change, anxiety, or discomfort as evidenced by patient report of difficulty sleeping.
- Anxiety related to unfamiliarity with condition, threat to health status, or uncertain prognosis as evidenced by patient report of worry.
- Deficient Knowledge related to lack of exposure to information about the condition as evidenced by patient verbalizes inaccurate understanding.
```

Priority: 1. Decreased Cardiac Output (high), 2. Risk for Falls (high), 3. Activity Intolerance (medium), 4. Acute Pain (medium), 5. Disturbed Sleep Pattern (medium), 6. Anxiety (low), 7. Deficient Knowledge (low)

## Files Modified
### Chapter 2 Section Restructuring
1. `carestudy_rag/src/template.py` — Split section 2.3 into three separate sections (2.3, 2.4, 2.5); **RESTRUCTURED section 2.1** with proper NMC format fields
2. `carestudy_rag/src/import_worker.py` — Updated SECTION_ID_MAP and SECTION_FIELDS for all Chapter 2 sections
3. `carestudy_rag/src/nanda_mapper.py` — **NEW FILE** — NANDA-I mapping, strengths recommendation, AND comparison section automation

### Frontend Updates
4. `artifacts/carestudy-assistant/src/lib/template.ts` — Updated 2.1 fields to match NMC standard; already had 2.3, 2.4, 2.5 separate

## NMC Standard for Section 2.1 Comparison of Data with Standards
The NMC standard structure (from sample studies like Halima's, Joe's, Amanda's):

```
2.1 Comparison of Data with Standards
├── Definition intro (with citation, e.g. Bolboacă, 2019)
├── A. Diagnostic Investigations
│   ├── List of investigations carried out on patient
│   ├── TABLE: Comparison of Diagnostic Tests (Patient | Literature | Comments)
│   ├── TABLE: Diagnostic Investigations with Interpretation
│   └── COMMENT: % of tests matching literature (e.g. "About 67% of diagnostic tests were carried out")
├── B. Causes
│   ├── Literature causes (from 1.10)
│   └── Patient's contributing factors (from Chapter 1 socio-economic, diet, habits)
├── C. Clinical Features
│   ├── TABLE: Clinical Features comparison (Feature | Patient | Literature | Present/Absent)
│   └── COMMENT: % of features exhibited (e.g. "Patient exhibited about 57% of signs and symptoms")
├── D. Treatment
│   ├── List of drugs/treatment given
│   ├── TABLE: Treatment comparison (Treatment given | Standard treatment | Comments)
│   └── COMMENT: % of drugs from literature (e.g. "About 75% of drugs found in literature were given")
└── E. Complications
    ├── Literature complications list
    └── Patient status (present/absent with explanation)
```

## Issues Fixed in 2.1
**Before (incorrect):**
- Only 3 textarea fields (featuresComparison, testsComparison, treatmentComparison)
- No table structure
- No subsections (Causes, Clinical Features, Treatment, Complications)
- No % match commentary
- No interpretation table

**After (NMC standard):**
- 10 fields covering all subsections
- Table-ready data for clinical features and treatment
- % match commentary for tests and clinical features
- Causes comparison with patient-specific factors
- Complications status with explanation

## Usage
The nanda_mapper module can be used in two ways:

### 1. Direct Function Calls
```python
from src.nanda_mapper import (
    extract_problems_from_chapter1,
    suggest_nanda_diagnoses,
    suggest_strengths_for_problems,
    build_chapter2_analysis_from_chapter1,
)

# Extract problems from Chapter 1 data
problems = extract_problems_from_chapter1(chapter1_fields)

# Get NANDA-I diagnoses
diagnoses = suggest_nanda_diagnoses(problems)

# Get strengths
strengths = suggest_strengths_for_problems(problems)

# Or get everything at once
result = build_chapter2_analysis_from_chapter1(chapter1_fields, condition="Hypertension")
```

### 2. Integration with generate.py
The nanda_mapper can be integrated into the draft_section workflow to provide auto-suggested content for sections 2.3, 2.4, and 2.5 based on Chapter 1 data.

## Benefits
1. **NMC Compliance** — Output now matches the bulleted format seen in sample care studies
2. **Seamless Automation** — Problems pulled from Chapter 1; diagnoses and strengths auto-suggested
3. **NANDA-I Standards** — Diagnoses follow proper PES format with related factors and defining characteristics
4. **Coherent Flow** — Each section is independent yet connected through the underlying problem→diagnosis→strength logic
5. **No Prose/Analysis in Problems** — Problems are listed, not analyzed (matching NMC standard)
