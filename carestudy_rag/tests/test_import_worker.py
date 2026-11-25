import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from import_worker import import_study_with_fields


class ImportStudyWithFieldsTests(unittest.TestCase):
    def test_keeps_chapter_introduction_out_of_previous_section(self):
        validation = "The data used in this care study has undergone comprehensive validation."
        chapter_intro = (
            "As outlined by Hellman (2024), data analysis is the step in the nursing process.\n"
            "This chapter involves comparing data with established standards."
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
            f"{chapter_intro}\n"
            "2.1 Comparison of Data with Standards\n"
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
        self.assertIn("2.1.1 Diagnostic Investigations", comparison_section["draft"])
        self.assertIn("Microscopy | Blood Film requested", comparison_section["draft"])

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
