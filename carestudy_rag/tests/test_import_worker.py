import os
import sys
import unittest

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
