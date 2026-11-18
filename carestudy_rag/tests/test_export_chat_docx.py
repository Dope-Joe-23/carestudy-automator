"""Tests for student document-work Word export."""

import os
import sys
import unittest
from io import BytesIO

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from docx import Document  # noqa: E402
from docx.enum.text import WD_ALIGN_PARAGRAPH  # noqa: E402
from docx.shared import Inches, Pt  # noqa: E402
from export_chat_docx import export_document_work_docx  # noqa: E402
from export_docx import Theme  # noqa: E402


class DocumentWorkExportTests(unittest.TestCase):
    def test_general_docx_theme_defaults_to_double_spacing(self):
        self.assertEqual(Theme().line_spacing, 2.0)

    def test_export_uses_studio_document_defaults_and_avoids_duplicate_chapter_heading(self):
        output = export_document_work_docx(
            "source-file-name",
            [
                {
                    "name": "Chapter 1 - Assessment",
                    "content": (
                        "<!-- align:center -->\n"
                        "# **CHAPTER ONE:**\n\n"
                        "<!-- align:center -->\n"
                        "**ASSESSMENT OF PATIENT AND FAMILY**\n\n"
                        "## 1.1 Assessment\n\nThe chapter body."
                    ),
                },
            ],
        )
        document = Document(BytesIO(output))

        self.assertEqual(document.core_properties.title, "source-file-name")
        self.assertEqual(document.sections[0].top_margin, Inches(1))
        self.assertEqual(document.sections[0].bottom_margin, Inches(1))
        self.assertEqual(document.sections[0].left_margin, Inches(1))
        self.assertEqual(document.sections[0].right_margin, Inches(1))
        self.assertEqual([paragraph.text for paragraph in document.paragraphs], [
            "CHAPTER ONE:",
            "ASSESSMENT OF PATIENT AND FAMILY",
            "1.1 Assessment",
            "The chapter body.",
        ])
        chapter_heading, chapter_title, section_heading, body = document.paragraphs
        self.assertEqual(chapter_heading.alignment, WD_ALIGN_PARAGRAPH.CENTER)
        self.assertTrue(chapter_heading.runs[0].bold)
        self.assertEqual(chapter_heading.runs[0].font.name, "Times New Roman")
        self.assertEqual(chapter_heading.runs[0].font.size, Pt(14))
        self.assertEqual(chapter_title.alignment, WD_ALIGN_PARAGRAPH.CENTER)
        self.assertTrue(chapter_title.runs[0].bold)
        self.assertEqual(section_heading.style.name, "Heading 2")
        self.assertTrue(section_heading.style.font.bold)
        self.assertEqual(section_heading.runs[0].font.size, Pt(12))
        self.assertEqual(body.alignment, WD_ALIGN_PARAGRAPH.JUSTIFY)
        self.assertEqual(body.paragraph_format.line_spacing, 2)
        self.assertEqual(body.runs[0].font.name, "Times New Roman")
        self.assertEqual(body.runs[0].font.size, Pt(12))

    def test_export_preserves_chapter_formatting_and_inline_toolbar_marks(self):
        output = export_document_work_docx(
            "Care study",
            [
                {
                    "name": "Chapter 1 — Assessment",
                    "content": "**Bold** ++underlined++ ~~removed~~ ==highlighted==",
                    "formatting": {
                        "fontFamily": "Georgia",
                        "fontSize": 12,
                        "lineSpacing": 2,
                        "indent": 0.25,
                        "alignment": "center",
                        "bottomMargin": 1.25,
                    },
                },
            ],
        )
        document = Document(BytesIO(output))

        self.assertEqual(document.sections[0].bottom_margin, Inches(1.25))
        paragraph = document.paragraphs[-1]
        self.assertEqual(paragraph.alignment, WD_ALIGN_PARAGRAPH.CENTER)
        self.assertEqual(paragraph.paragraph_format.line_spacing, 2)
        self.assertEqual(paragraph.paragraph_format.first_line_indent, Inches(0.25))
        self.assertEqual(paragraph.runs[0].font.name, "Georgia")
        self.assertEqual(paragraph.runs[0].font.size, Pt(12))
        self.assertEqual([run.text for run in paragraph.runs], [
            "Bold",
            " ",
            "underlined",
            " ",
            "removed",
            " ",
            "highlighted",
        ])
        self.assertTrue(paragraph.runs[0].bold)
        self.assertTrue(paragraph.runs[2].underline)
        self.assertTrue(paragraph.runs[4].font.strike)
        self.assertIsNotNone(paragraph.runs[6].font.highlight_color)


if __name__ == "__main__":
    unittest.main()
