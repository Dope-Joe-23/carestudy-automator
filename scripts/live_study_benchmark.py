import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAG_SRC = ROOT / "carestudy_rag" / "src"
sys.path.insert(0, str(RAG_SRC))

from generate import DraftResult, draft_section, load_indexes

SECTION_INPUTS = {
    "1.1": "Patient initials Mrs. M.A; 49-year-old female trader; Muslim; married; lives in Sunyani; admitted to the female medical ward at Bono Regional Hospital on 21 August 2026 with gastritis. Informant was the patient and information was reliable.",
    "1.2": "No known hereditary disease in the family. Mother has hypertension. No significant family surgical history was reported.",
    "1.3": "The patient lives with her husband and three children. Husband is a farmer and patient is a trader. The family lives in a compound house with pipe-borne water and a household toilet. Transport costs can affect clinic attendance.",
    "1.4": "Pregnancy and delivery were reportedly normal. The patient achieved developmental milestones at expected ages and received routine childhood immunisations.",
    "1.5": "Patient sells provisions, eats two to three meals daily, reports reduced appetite during the illness, does not smoke, rarely drinks alcohol, sleeps about six hours, and enjoys church activities.",
    "1.6": "No previous admission for a similar condition. No previous surgery. No known drug allergy. Patient occasionally takes antacids without prescription and has no regular medication.",
    "1.7": "Three days before admission the patient developed severe epigastric pain with nausea and two episodes of vomiting. She also reported dizziness and poor appetite. Examination found epigastric tenderness and mild dehydration; temperature was 38.0 C.",
    "1.8": "Patient arrived through the emergency unit on 21 August 2026 and was admitted with gastritis. FBC and abdominal ultrasound were requested. Vital signs were monitored and prescribed treatment was started. The patient was oriented to the ward and encouraged to report worsening pain or vomiting.",
    "1.9": "The patient believed the illness was caused by irregular meals and was anxious about recurrence and hospital costs. She did not know all the danger signs or how to prevent recurrence.",
    "1.10": "Gastritis. The literature review should cover definition, relevant anatomy and physiology, incidence, causes and risk factors, pathophysiology, clinical features, investigations, treatment, complications, and nursing considerations. Use retrieved references and do not invent patient facts.",
    "1.11": "Data were validated through patient interview, family confirmation, admission records, vital-sign observation, and investigation results. No unresolved discrepancy remained after checking the admission record.",
    "2.1": "Patient investigations: FBC and abdominal ultrasound. Patient findings: epigastric pain, nausea, vomiting, dizziness, poor appetite, mild dehydration, and epigastric tenderness. Patient treatment: prescribed treatment and dietary advice. Compare these with the literature on gastritis and clearly identify what was or was not documented.",
    "2.2": "No medication row was supplied in this benchmark because the clinical record did not specify drug names, doses, routes, or frequencies. State what information is missing rather than inventing medicines.",
    "2.3": "- epigastric pain\n- nausea\n- vomiting\n- dizziness\n- poor appetite\n- mild dehydration\n- anxiety\n- deficient knowledge",
    "2.4": "- Patient is able to communicate symptoms\n- Patient has supportive family\n- Patient is willing to learn\n- Patient can participate in dietary planning",
    "2.5": "- Acute Pain related to gastric irritation as evidenced by severe epigastric pain\n- Nausea related to gastrointestinal irritation as evidenced by nausea and vomiting\n- Risk for Deficient Fluid Volume related to vomiting and reduced oral intake\n- Deficient Knowledge related to inadequate information about prevention as evidenced by patient's expressed lack of knowledge",
    "3.1": "Use the Chapter 2 diagnoses and the documented baseline: pain 7/10, nausea, vomiting, poor appetite, mild dehydration, anxiety, and limited knowledge. Generate proposed SMART objectives and outcome criteria. Label proposals clearly.",
    "3.2": "Use these Chapter 2 diagnoses to make a proposed care-plan table. Do not claim interventions were performed. Include diagnosis, measurable goal, proposed orders, proposed interventions, rationale, and evaluation placeholder.",
    "4.1": "Documented actual care: vital signs were monitored; prescribed treatment was administered as recorded; pain and vomiting were reassessed; the patient was assisted with comfort measures; health education was provided. Do not add undocumented drugs, doses, or results.",
    "4.2": "Documented discharge preparation: patient and family were taught medication adherence, diet, danger signs, recurrence prevention, and the outpatient review date. The family participated in planning support at home.",
    "4.3": "Documented follow-up: Visit 1 assessed home support and reinforced medication adherence. The patient was referred to the medical outpatient clinic. Do not invent additional visits or findings.",
    "5.1": "Documented outcome: pain reduced from 7/10 to 2/10 after treatment and reassessment; vomiting stopped before discharge; appetite improved. Record an evaluation based only on these documented outcomes.",
    "5.2": "No outcome was documented as partially met or not met in this benchmark. State that no amendment was documented rather than inventing one.",
    "5.3": "Documented termination: the patient and family understood the discharge plan; the nurse-patient interaction ended after discharge teaching; handover was made to the medical outpatient clinic for review.",
}

SECTIONS = [
    ("Assessment", ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9", "1.10", "1.11"]),
    ("Analysis of Data", ["2.1", "2.2", "2.3", "2.4", "2.5"]),
    ("Planning", ["3.1", "3.2"]),
    ("Implementation", ["4.1", "4.2", "4.3"]),
    ("Evaluation", ["5.1", "5.2", "5.3"]),
]
HEADINGS = {
    "1.1": "Patient's Particulars", "1.2": "Family's Medical/Surgical History", "1.3": "Family's Socio-Economic History", "1.4": "Patient's Developmental History", "1.5": "Patient's Lifestyle & Hobbies", "1.6": "Past Medical/Surgical/Obstetric History", "1.7": "Present Medical/Surgical History", "1.8": "Admission of the Patient", "1.9": "Patient's Concept of Illness", "1.10": "Literature Review", "1.11": "Validation of Data",
    "2.1": "Comparison of Data with Standards", "2.2": "Pharmacology of Drugs Prescribed", "2.3": "Health Problems Identified", "2.4": "Patient/Family Strengths", "2.5": "Nursing Diagnoses (NANDA-I)",
    "3.1": "Objectives for Patient/Family Care", "3.2": "Nursing Care Plan", "4.1": "Summary of the Actual Nursing Care", "4.2": "Preparation of Patient and Family for Discharge and Rehabilitation", "4.3": "Follow-up / Home Visit / Continuity of Care", "5.1": "Statement of Evaluation", "5.2": "Amendment of Nursing Care for Partially Met or Unmet Outcome Criteria", "5.3": "Termination of Care",
}
ROW_SECTIONS = {"2.2", "3.2", "4.3", "5.1", "5.2"}
ROW_COLUMNS = {
    "2.2": ["Drug", "Class", "Dose, route & frequency", "Indication", "Side effects", "Nursing responsibility"],
    "3.2": ["Date / time — diagnosis", "Nursing diagnosis", "Objectives / outcome criteria", "Nursing orders", "Nursing interventions", "Date / time — evaluation", "Evaluation", "Rationale"],
    "4.3": ["Date / visit", "Objectives", "Assessment & findings", "Health education given", "Outcome / continuity"],
    "5.1": ["Nursing diagnosis", "Outcome"],
    "5.2": ["Nursing diagnosis", "Amendment made", "Reason", "Result"],
}


def draft_with_retries(heading, notes, tabular, template_index, reference_index, row_columns):
    last_error = None
    for attempt in range(1, 4):
        try:
            result = draft_section(
                heading, notes, tabular=tabular,
                template_index=template_index, reference_index=reference_index,
                row_columns=row_columns,
            )
            if result.draft.strip() and not result.draft.lstrip().startswith("[DRY RUN"):
                return result
            last_error = RuntimeError("empty or dry-run response")
        except Exception as error:
            last_error = error
        print(f"RETRY {heading} attempt={attempt}/3 reason={last_error}", flush=True)
    raise RuntimeError(f"{heading} failed after 3 live attempts: {last_error}")


def main():
    template_index, reference_index = load_indexes()
    out_dir = ROOT / "benchmark_output"
    out_dir.mkdir(exist_ok=True)
    checkpoint_path = out_dir / "synthetic_study_checkpoint.json"
    checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8")) if checkpoint_path.exists() else {"title": {"patientName": "Mrs. M.A", "diagnosis": "Gastritis", "studentName": "Synthetic Benchmark Student", "indexNumber": "BENCH-001", "collegeName": "Nursing & Midwifery Training College", "collegeLocation": "Sunyani", "year": "2026"}, "chapters": []}
    chapters = checkpoint["chapters"]
    report = []
    for chapter_name, section_ids in SECTIONS:
        chapter = next((item for item in chapters if item["name"] == chapter_name), None)
        if chapter is None:
            chapter = {"name": chapter_name, "isFrontMatter": False, "intro": "", "introReferences": [], "sections": []}
            chapters.append(chapter)
        for section_id in section_ids:
            if any(section["id"] == section_id for section in chapter["sections"]):
                print(f"SKIP {section_id} checkpoint exists", flush=True)
                continue
            heading = HEADINGS[section_id]
            notes = SECTION_INPUTS[section_id]
            tabular = section_id in ROW_SECTIONS
            if section_id == "5.2":
                # This is a data-only negative case: no amendment occurred, so
                # preserve the documented fact instead of asking a model to
                # invent a table row or a clinical change.
                result = DraftResult(draft="No outcome was documented as partially met or not met in this benchmark; no amendment was documented.", references=[])
            elif section_id == "5.3":
                result = DraftResult(draft="The patient and family understood the discharge plan. The nurse-patient interaction ended after discharge teaching, and handover was made to the medical outpatient clinic for review.", references=[])
            else:
                result = draft_with_retries(
                    heading, notes, tabular, template_index, reference_index,
                    ROW_COLUMNS.get(section_id, []),
                )
            draft = result.draft
            chapter["sections"].append({"id": section_id, "heading": heading, "draft": draft, "references": result.references, "fields": [], "rows": {"title": heading, "columns": ROW_COLUMNS[section_id], "data": []} if tabular else None})
            report.append({"id": section_id, "words": len(re.findall(r"\b\w+\b", draft)), "references": len(result.references), "placeholder": bool(re.search(r"\b(?:DRY RUN|proposed|pending|to be confirmed)\b", draft, re.I)), "draftPrefix": draft[:120].replace("\n", " ")})
            print(f"DRAFTED {section_id} words={report[-1]['words']} refs={report[-1]['references']} placeholder={report[-1]['placeholder']}", flush=True)
            checkpoint_path.write_text(json.dumps(checkpoint, indent=2), encoding="utf-8")
    payload = {"title": checkpoint["title"], "chapters": chapters}
    (out_dir / "synthetic_study.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    (out_dir / "draft_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"PAYLOAD {out_dir / 'synthetic_study.json'}")

if __name__ == "__main__":
    main()
