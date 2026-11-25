import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from import_worker import import_study_with_fields


class ImportStudyWithFieldsTests(unittest.TestCase):
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
