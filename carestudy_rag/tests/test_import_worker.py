import json
import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from import_worker import import_study_with_fields


class ImportStudyWithFieldsTests(unittest.TestCase):
    def test_routes_unheaded_objectives_and_docx_care_plan_tables_separately(self):
        objectives = (
            "Patient and family care objectives or outcome criteria refer to goals "
            "the nurse aims to achieve after interventions."
        )
        table_header = (
            "DOCX table 13, row 1: Date/Time | Nursing Diagnosis | Objective/Outcome Criteria | "
            "Nursing Orders | Nursing Interventions | Evaluation"
        )
        table_row = (
            "DOCX table 13, row 2: 28/07/2026 9:10 a.m. | Risk for deficient fluid volume | "
            "Maintain fluid balance | Monitor intake and output | Encourage oral fluids | Goal met"
        )
        result = import_study_with_fields(f"{objectives}\n{table_header}\n{table_row}")

        self.assertEqual(result["importMode"], "deterministic")
        planning = next(chapter for chapter in result["chapters"] if chapter["name"] == "Planning")
        sections = {section["sectionId"]: section for section in planning["sections"]}
        self.assertIn(objectives, sections["3.1"]["draft"])
        self.assertNotIn("DOCX table", sections["3.1"]["draft"])
        self.assertIn(table_header, sections["3.2"]["draft"])
        self.assertIn("Risk for deficient fluid volume", sections["3.2"]["draft"])

    def test_extracts_care_plan_docx_rows_into_eight_column_schema(self):
        header = (
            "Date/Time | Nursing Diagnosis | Objective/Outcome Criteria | Nursing Orders | "
            "Nursing Interventions | Evaluation"
        )
        raw_text = (
            "3.2 Nursing Care Plan\n"
            f"DOCX table 13, row 1: {header}\n"
            "DOCX table 13, row 2: 28/07/2026\n"
            "9:10 a.m. | Risk for deficient fluid volume | Maintain fluid balance | "
            "Monitor intake and output | Encourage oral fluids | Goal met\n"
            f"DOCX table 14, row 1: {header}\n"
            "DOCX table 14, row 2: 29/07/2026 | Acute pain | Patient will report reduced pain | "
            "Assess pain regularly | Administer prescribed analgesia | Pain reduced"
        )

        result = import_study_with_fields(raw_text)

        planning = next(chapter for chapter in result["chapters"] if chapter["name"] == "Planning")
        care_plan = next(section for section in planning["sections"] if section["sectionId"] == "3.2")
        self.assertEqual(len(care_plan["rows"]), 2)
        self.assertTrue(all(len(row) == 8 for row in care_plan["rows"]))
        self.assertEqual(care_plan["rows"][0][0], "28/07/2026\n9:10 a.m.")
        self.assertEqual(care_plan["rows"][0][1], "Risk for deficient fluid volume")
        self.assertEqual(care_plan["rows"][0][3], "Monitor intake and output")
        self.assertEqual(care_plan["rows"][0][4], "Encourage oral fluids")
        self.assertEqual(care_plan["rows"][0][5], "")
        self.assertEqual(care_plan["rows"][0][6], "Goal met")

    def test_extracts_pharmacology_docx_rows_into_six_column_schema(self):
        raw_text = (
            "2.2 Pharmacology of Drugs Prescribed\n"
            "DOCX table 4, row 1: Drug | Classification | Dose, Route & Frequency | "
            "Indication | Side Effects | Nursing Responsibilities\n"
            "DOCX table 4, row 2: Artemether | Antimalarial | 80 mg IM daily | Malaria | "
            "Nausea | Monitor response and adverse effects"
        )

        result = import_study_with_fields(raw_text)

        pharmacology = next(
            section
            for chapter in result["chapters"]
            for section in chapter["sections"]
            if section["sectionId"] == "2.2"
        )
        self.assertEqual(
            pharmacology["rows"],
            [[
                "Artemether",
                "Antimalarial",
                "80 mg IM daily",
                "Malaria",
                "Nausea",
                "Monitor response and adverse effects",
            ]],
        )

    def test_extracts_markdown_pharmacology_rows(self):
        raw_text = (
            "2.2 Pharmacology of Drugs Prescribed\n"
            "| Drug | Class | Dose | Indication |\n"
            "| --- | --- | --- | --- |\n"
            "| Artemether | Antimalarial | 80 mg IM daily | Malaria |\n"
        )

        result = import_study_with_fields(raw_text)

        pharmacology = next(
            section
            for chapter in result["chapters"]
            for section in chapter["sections"]
            if section["sectionId"] == "2.2"
        )
        self.assertEqual(
            pharmacology["rows"],
            [["Artemether", "Antimalarial", "80 mg IM daily", "Malaria", "", ""]],
        )

    def test_extracts_home_visit_docx_rows_into_five_column_schema(self):
        raw_text = (
            "4.3 Follow-up / Home Visit / Continuity of Care\n"
            "DOCX table 9, row 1: Date / Visit | Objectives | Assessment & Findings | "
            "Health Education | Outcome / Continuity\n"
            "DOCX table 9, row 2: Visit 1 | Assess home environment | Client stable | "
            "Medication adherence | Referred to community nurse"
        )

        result = import_study_with_fields(raw_text)

        home_visits = next(
            section
            for chapter in result["chapters"]
            for section in chapter["sections"]
            if section["sectionId"] == "4.3"
        )
        self.assertEqual(
            home_visits["rows"],
            [[
                "Visit 1",
                "Assess home environment",
                "Client stable",
                "Medication adherence",
                "Referred to community nurse",
            ]],
        )

    def test_maps_recommendation_inputs_from_labeled_analysis_and_care_notes(self):
        raw_text = (
            "2.1 Comparison of Data with Standards\n"
            "List of treatment/medications given to patient: IV Artemether 80 mg daily.\n"
            "2.3 Patient Health Problems\n"
            "Actual health problems: Acute pain at the incision site.\n"
            "Potential health problems: Risk of infection.\n"
            "Prioritisation of problems: 1. Acute pain; 2. Risk of infection.\n"
            "2.4 Patient/Family Strengths\n"
            "General strengths: Family is supportive.\n"
            "Specific strengths: Patient is willing to follow treatment.\n"
            "2.5 Nursing Diagnoses\n"
            "Nursing diagnoses: Acute pain related to tissue injury.\n"
            "Prioritisation of diagnoses: 1. Acute pain related to tissue injury.\n"
            "4.1 Summary of the Actual Nursing Care\n"
            "Care actually given: Vital signs monitored and medication administered.\n"
            "Health education given: Medication adherence explained.\n"
            "Family involvement: Family participated in care.\n"
            "4.2 Preparation of Patient and Family for Discharge and Rehabilitation\n"
            "Discharge health education: Warning signs and follow-up explained.\n"
            "Date of discharge: 2026-09-10\n"
            "Review date: 2026-09-17\n"
        )

        result = import_study_with_fields(raw_text)
        mapped = {
            section["sectionId"]: section["fields"]
            for chapter in result["chapters"]
            for section in chapter["sections"]
        }

        self.assertEqual(mapped["2.3"]["healthProblems"], "Acute pain at the incision site.")
        self.assertEqual(
            mapped["2.1"]["treatmentGivenList"],
            "IV Artemether 80 mg daily.",
        )
        self.assertEqual(mapped["2.3"]["potentialProblems"], "Risk of infection.")
        self.assertEqual(mapped["2.3"]["problemPriority"], "1. Acute pain; 2. Risk of infection.")
        self.assertEqual(mapped["2.4"]["generalStrengths"], "Family is supportive.")
        self.assertEqual(mapped["2.4"]["strengths"], "Patient is willing to follow treatment.")
        self.assertEqual(mapped["2.5"]["nursingDiagnoses"], "Acute pain related to tissue injury.")
        self.assertEqual(mapped["2.5"]["diagnosisPriority"], "1. Acute pain related to tissue injury.")
        self.assertIn("Vital signs monitored", mapped["4.1"]["careGiven"])
        self.assertEqual(mapped["4.1"]["healthEducation"], "Medication adherence explained.")
        self.assertEqual(mapped["4.1"]["familyInvolvement"], "Family participated in care.")
        self.assertEqual(mapped["4.2"]["dischargeEducation"], "Warning signs and follow-up explained.")
        self.assertEqual(mapped["4.2"]["dischargeDate"], "2026-09-10")
        self.assertEqual(mapped["4.2"]["reviewDate"], "2026-09-17")

    def test_maps_health_problems_and_diagnoses_from_table_columns(self):
        raw_text = (
            "2.3 Patient Health Problems\n"
            "DOCX table 2, row 1: Actual health problems | Potential health problems | Priority\n"
            "DOCX table 2, row 2: Acute pain | Risk of infection | 1. Acute pain\n"
            "2.5 Nursing Diagnoses\n"
            "DOCX table 5, row 1: Nursing Diagnoses | Prioritisation of Diagnoses\n"
            "DOCX table 5, row 2: Acute pain related to tissue injury | 1. Acute pain"
        )

        result = import_study_with_fields(raw_text)
        mapped = {
            section["sectionId"]: section["fields"]
            for chapter in result["chapters"]
            for section in chapter["sections"]
        }

        self.assertEqual(mapped["2.3"]["healthProblems"], "Acute pain")
        self.assertEqual(mapped["2.3"]["potentialProblems"], "Risk of infection")
        self.assertEqual(mapped["2.3"]["problemPriority"], "1. Acute pain")
        self.assertEqual(
            mapped["2.5"]["nursingDiagnoses"],
            "Acute pain related to tissue injury",
        )
        self.assertEqual(mapped["2.5"]["diagnosisPriority"], "1. Acute pain")

    def test_uses_section_narrative_as_primary_recommendation_input_when_unlabeled(self):
        health_problem = "The patient reported severe pain at the surgical site."
        diagnosis = "Acute pain related to tissue injury as evidenced by guarding."
        care_given = "Vital signs were monitored and prescribed treatment was administered."
        discharge = "The patient and family were taught warning signs and medication adherence."
        raw_text = (
            f"2.3 Patient Health Problems\n{health_problem}\n"
            f"2.5 Nursing Diagnoses\n{diagnosis}\n"
            f"4.1 Summary of the Actual Nursing Care\n{care_given}\n"
            f"4.2 Preparation of Patient and Family for Discharge and Rehabilitation\n{discharge}"
        )

        result = import_study_with_fields(raw_text)
        mapped = {
            section["sectionId"]: section["fields"]
            for chapter in result["chapters"]
            for section in chapter["sections"]
        }

        self.assertEqual(mapped["2.3"]["healthProblems"], health_problem)
        self.assertEqual(mapped["2.5"]["nursingDiagnoses"], diagnosis)
        self.assertEqual(mapped["4.1"]["careGiven"], care_given)
        self.assertEqual(mapped["4.2"]["dischargeEducation"], discharge)

    @patch("import_worker._deterministic_import", return_value=None)
    @patch(
        "import_worker._candidate_models",
        return_value=[SimpleNamespace(label="test-model")],
    )
    @patch(
        "import_worker._chat_model",
        return_value=json.dumps(
            {
                "chapters": [
                    {
                        "name": "Analysis of Data",
                        "sections": [
                            {
                                "sectionId": "2.5",
                                "heading": "Nursing Diagnoses",
                                "fields": {},
                                "draft": "Nursing diagnoses: Acute pain related to tissue injury.",
                            },
                            {
                                "sectionId": "2.2",
                                "heading": "Pharmacology",
                                "fields": {},
                                "draft": (
                                    "DOCX table 4, row 1: Drug | Class | Dose | Indication\n"
                                    "DOCX table 4, row 2: Artemether | Antimalarial | 80 mg | Malaria"
                                ),
                            },
                        ],
                    }
                ]
            }
        ),
    )
    def test_enriches_ai_import_fields_and_rows_locally(self, *_mocks):
        result = import_study_with_fields("unheaded imported study content")
        sections = {
            section["sectionId"]: section
            for chapter in result["chapters"]
            for section in chapter["sections"]
        }

        self.assertEqual(
            sections["2.5"]["fields"]["nursingDiagnoses"],
            "Acute pain related to tissue injury.",
        )
        self.assertEqual(
            sections["2.2"]["rows"],
            [["Artemether", "Antimalarial", "80 mg", "Malaria", "", ""]],
        )

    def test_keeps_chapter_introduction_out_of_previous_section(self):
        validation = "The data used in this care study has undergone comprehensive validation."
        chapter_intro = (
            "As outlined by Hellman (2024), data analysis is the step in the nursing process.\n"
            "This chapter involves comparing data with established standards."
        )
        section_lead_in = (
            "In this section, the patient's data is compared with the standard as presented "
            "in the literature review."
        )
        investigation = (
            "2.1.1 Diagnostic Investigations\n"
            "Diagnostic tests recommended for the patient include:\n"
            "Full Blood Count (FBC)\n"
            "Table 1: Comparison of investigations\n"
            "Microscopy | Blood Film requested"
        )
        raw_text = (
            "CHAPTER ONE\nASSESSMENT\n"
            f"1.11 Validation of Data\n{validation}\n"
            "CHAPTER TWO\nANALYSIS OF DATA\n"
            f"{chapter_intro}\n{section_lead_in}\n"
            f"{investigation}\n"
        )

        result = import_study_with_fields(raw_text)

        self.assertEqual(result["importMode"], "deterministic")
        chapters = {chapter["name"]: chapter for chapter in result["chapters"]}
        assessment = chapters["Assessment"]
        analysis = chapters["Analysis of Data"]
        validation_section = next(section for section in assessment["sections"] if section["sectionId"] == "1.11")
        comparison_section = next(section for section in analysis["sections"] if section["sectionId"] == "2.1")

        self.assertEqual(analysis["intro"], chapter_intro)
        self.assertEqual(validation_section["draft"], validation)
        self.assertIn(section_lead_in, comparison_section["draft"])
        self.assertIn("2.1.1 Diagnostic Investigations", comparison_section["draft"])
        self.assertIn("Microscopy | Blood Film requested", comparison_section["draft"])

    def test_preserves_section_lead_in_before_first_nested_heading(self):
        section_lead_in = (
            "In this section, the patient's data is compared with the standard as presented "
            "in the literature review."
        )
        raw_text = (
            f"{section_lead_in}\n"
            "2.1.1 Diagnostic Investigations\n"
            "Blood Film for Malaria Parasites\n"
            "DOCX table 3, row 1: Investigation from Literature Review | Patient's Ordered Investigations\n"
            "DOCX table 3, row 2: Microscopy | Blood Film for Malaria Parasites requested for patient\n"
            "2.1.2 Comments on Diagnostic Investigation\n"
            "The investigations requested were appropriate.\n"
            "DOCX table 4, row 1: Date | Specimen | Investigation | Result\n"
            "2.2 Comparison of Clinical Manifestations\n"
            "The patient's symptoms were compared with literature."
        )

        result = import_study_with_fields(raw_text)

        self.assertEqual(result["importMode"], "deterministic")
        mapped = {
            section["sectionId"]: section
            for chapter in result["chapters"]
            for section in chapter["sections"]
        }
        self.assertIn(section_lead_in, mapped["2.1"]["draft"])
        self.assertIn("2.1.1 Diagnostic Investigations", mapped["2.1"]["draft"])
        self.assertIn("DOCX table 3, row 2", mapped["2.1"]["draft"])
        self.assertIn("2.1.2 Comments on Diagnostic Investigation", mapped["2.1"]["draft"])
        self.assertIn("DOCX table 4, row 1", mapped["2.1"]["draft"])
        self.assertEqual(
            mapped["2.2"]["draft"],
            "The patient's symptoms were compared with literature.",
        )

    def test_assigns_section_lead_in_to_following_canonical_section(self):
        cases = (
            ("2.1", "2.2.1", "2.2"),
            ("3.1", "3.2.1", "3.2"),
            ("4.1", "4.2.1", "4.2"),
            ("5.1", "5.2.1", "5.2"),
        )
        for previous_section, nested_heading, target_section in cases:
            with self.subTest(target_section=target_section):
                lead_in = f"In this section, chapter {target_section[0]} content is discussed."
                result = import_study_with_fields(
                    f"{previous_section} Previous section\n"
                    f"Existing content for {previous_section}.\n"
                    f"{lead_in}\n"
                    f"{nested_heading} Section details\n"
                    f"Content for {target_section}."
                )

                mapped = {
                    section["sectionId"]: section["draft"]
                    for chapter in result["chapters"]
                    for section in chapter["sections"]
                }
                self.assertEqual(result["importMode"], "deterministic")
                self.assertNotIn(lead_in, mapped[previous_section])
                self.assertIn(lead_in, mapped[target_section])
                self.assertIn(f"Content for {target_section}.", mapped[target_section])

    def test_routes_misnumbered_chapter_two_content_by_section_meaning(self):
        raw_text = (
            "In this section, patient data is compared with literature.\n"
            "2.1.1 Diagnostic Investigations\n"
            "Blood Film for Malaria Parasites.\n"
            "2.1.2 Comments on Diagnostic Investigation\n"
            "The requested investigations were appropriate.\n"
            "2.2 Pharmacology of Drugs Prescribed\n"
            "The actual cause of malaria is infection with Plasmodium parasites transmitted by mosquitoes.\n"
            "2.3 Patient Health Problems\n"
            "Table 3: Comparison of Clinical Features in Literature to those Exhibited by Patient\n"
            "2.3.1 Comments on Clinical Features\n"
            "The patient exhibited fever and chills.\n"
            "2.4 Patient/Family Strengths\n"
            "28/07/2026\nIV Paracetamol 1g 8hourly.\n"
            "Table 4: Comparison of Treatment in Literature to Treatment Given to Patient\n"
            "2.4.1 Comments on Medical Treatment\n"
            "Antimalarial therapy was administered.\n"
            "Table 5: Pharmacology of Drugs\n"
            "DOCX table 7, row 1: Date | Drug | Dose | Classification\n"
            "DOCX table 7, row 2: 28/07/2026 | Artemether | 80 mg IM daily | Antimalarial\n"
            "2.5 Nursing Diagnosis\n"
            "The patient did not develop major complications during admission.\n"
            "2.6 Patient and Family Strengths\n"
            "The family provided emotional support.\n"
            "2.7 Patient/Family Health Problems\n"
            "The patient complained of nausea and vomiting.\n"
            "2.8 Nursing Diagnosis\n"
            "Risk for deficient fluid volume related to vomiting."
        )

        result = import_study_with_fields(raw_text)

        self.assertEqual(result["importMode"], "deterministic")
        mapped = {
            section["sectionId"]: section
            for chapter in result["chapters"]
            for section in chapter["sections"]
        }
        self.assertIn("The actual cause of malaria", mapped["2.1"]["draft"])
        self.assertIn("Comparison of Clinical Features", mapped["2.1"]["draft"])
        self.assertIn("Comparison of Treatment", mapped["2.1"]["draft"])
        self.assertIn("major complications", mapped["2.1"]["draft"])
        self.assertNotIn("DOCX table 7", mapped["2.1"]["draft"])
        self.assertIn("DOCX table 7", mapped["2.2"]["draft"])
        self.assertEqual(
            mapped["2.2"]["rows"],
            [["Artemether", "Antimalarial", "80 mg IM daily", "", "", ""]],
        )
        self.assertIn("family provided emotional support", mapped["2.4"]["draft"])
        self.assertIn("complained of nausea", mapped["2.3"]["draft"])
        self.assertIn("Risk for deficient fluid volume", mapped["2.5"]["draft"])

    def test_reads_markdown_numbered_chapter_intro(self):
        raw_text = (
            "### 2.0 Introduction\n"
            "This chapter compares patient data with established standards.\n"
            "### 2.1 Comparison of Data with Standards\n"
            "Documented comparison text.\n"
        )

        result = import_study_with_fields(raw_text)

        analysis = next(chapter for chapter in result["chapters"] if chapter["name"] == "Analysis of Data")
        comparison = next(section for section in analysis["sections"] if section["sectionId"] == "2.1")
        self.assertEqual(analysis["intro"], "This chapter compares patient data with established standards.")
        self.assertEqual(comparison["draft"], "Documented comparison text.")

    def test_maps_late_chapters_in_documents_longer_than_80k(self):
        raw_text = (
            "1.1 Patient's Particulars\nPatient details recorded.\n"
            + ("Existing study content. " * 4_000)
            + "\n3.2 Nursing Care Plan\nDocumented care-plan content.\n"
        )

        result = import_study_with_fields(raw_text)

        self.assertEqual(result["importMode"], "deterministic")
        mapped = {
            section["sectionId"]: section
            for chapter in result["chapters"]
            for section in chapter["sections"]
        }
        self.assertIn("1.1", mapped)
        self.assertEqual(mapped["3.2"]["draft"], "Documented care-plan content.")


if __name__ == "__main__":
    unittest.main()
