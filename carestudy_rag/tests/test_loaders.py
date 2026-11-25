import os
import sys
import tempfile
import unittest

from docx import Document

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from loaders import load_as_text


class LoadAsTextTests(unittest.TestCase):
    def test_docx_table_extraction_deduplicates_horizontally_merged_cells(self):
        document = Document()
        table = document.add_table(rows=2, cols=3)
        table.cell(0, 0).merge(table.cell(0, 2)).text = "Date/Time"
        for index, value in enumerate(("28/07/2026", "Nursing diagnosis", "Goal met")):
            table.cell(1, index).text = value

        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "merged-table.docx")
            document.save(path)
            text = load_as_text(path)

        self.assertIn("DOCX table 1, row 1: Date/Time", text)
        self.assertIn(
            "DOCX table 1, row 2: 28/07/2026 | Nursing diagnosis | Goal met",
            text,
        )

    def test_docx_table_cell_line_breaks_do_not_split_extracted_rows(self):
        document = Document()
        table = document.add_table(rows=2, cols=2)
        table.cell(0, 0).text = "Diagnosis"
        table.cell(0, 1).text = "Evaluation"
        table.cell(1, 0).text = "Acute pain"
        table.cell(1, 1).text = "Goal met\nPain reduced"

        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "multiline-cell.docx")
            document.save(path)
            text = load_as_text(path)

        self.assertIn(
            "DOCX table 1, row 2: Acute pain | Goal met Pain reduced",
            text,
        )


if __name__ == "__main__":
    unittest.main()
