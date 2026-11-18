"""Tests for unpaid student document page-image previews."""

import base64
import os
import sys
import unittest
from io import BytesIO

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from PIL import Image  # noqa: E402
from render_student_document_preview import (  # noqa: E402
    _document_blocks,
    _inline_spans,
    _split_chapter_front_matter,
    render_document_preview,
)


class StudentDocumentPreviewTests(unittest.TestCase):
    def test_preview_renders_long_chapter_as_watermarked_png_pages(self):
        content = (
            "CHAPTER ONE\n## 1.1 Assessment\n\n"
            + ("The client described the symptoms during assessment. " * 1_071)
        )

        pages = render_document_preview("Chapter 1 - Assessment", content)

        self.assertGreater(len(pages), 1)
        self.assertTrue(all(page.startswith("data:image/png;base64,") for page in pages))
        for page in pages:
            image_data = base64.b64decode(page.split(",", 1)[1])
            self.assertTrue(image_data.startswith(b"\x89PNG\r\n\x1a\n"))
            self.assertNotIn(b"The client described the symptoms", image_data)
            with Image.open(BytesIO(image_data)) as image:
                self.assertEqual(image.size, (816, 1056))

    def test_preview_rejects_empty_or_oversized_content(self):
        with self.assertRaisesRegex(ValueError, "required"):
            render_document_preview("Chapter 1", " ")
        with self.assertRaisesRegex(ValueError, "too large"):
            render_document_preview("Chapter 1", "x" * 100_001)

    def test_chapter_heading_and_title_are_separated_from_section_content(self):
        content = (
            "CHAPTER ONE: ASSESSMENT OF PATIENT AND FAMILY\n\n"
            "## 1.0 Introduction\n\n"
            "The chapter body."
        )

        heading, title, body = _split_chapter_front_matter(
            "Chapter 1 — Assessment of Patient and Family",
            content,
        )

        self.assertEqual(heading, "CHAPTER ONE:")
        self.assertEqual(title, "ASSESSMENT OF PATIENT AND FAMILY")
        self.assertEqual(body, "## 1.0 Introduction\n\nThe chapter body.")
        self.assertEqual(_document_blocks(body)[0][0], "heading-2")

    def test_preview_uses_document_heading_instead_of_chapter_name(self):
        content = (
            "CHAPTER ONE: ASSESSMENT OF PATIENT AND FAMILY\n\n"
            "## 1.0 Introduction\n\nThe chapter body."
        )

        first = render_document_preview("Chapter 1 — Old label", content)
        second = render_document_preview("Chapter 1 — Different label", content)

        self.assertEqual(first, second)

    def test_normalized_front_matter_is_removed_before_rendering_the_body(self):
        content = (
            "<!-- align:center -->\n"
            "# **CHAPTER ONE:**\n\n"
            "<!-- align:center -->\n"
            "**ASSESSMENT OF PATIENT AND FAMILY**\n\n"
            "## 1.0 Introduction\n\nThe chapter body."
        )

        heading, title, body = _split_chapter_front_matter(
            "Chapter 1 — Assessment of Patient and Family",
            content,
        )

        self.assertEqual(heading, "CHAPTER ONE:")
        self.assertEqual(title, "ASSESSMENT OF PATIENT AND FAMILY")
        self.assertEqual(body, "## 1.0 Introduction\n\nThe chapter body.")

    def test_tables_and_inline_styles_are_rendered_as_structured_content(self):
        table_content = (
            "## 1.1 Assessment\n\n"
            "| Finding | Notes |\n"
            "| :--- | ---: |\n"
            "| **bold** | <mark>highlighted</mark> |\n"
            + "".join(f"| Row {index} | clinical observation |\n" for index in range(35))
        )

        blocks = _document_blocks(table_content)
        table = next(block for kind, block in blocks if kind == "table")
        spans = _inline_spans(
            "**bold** <mark>highlighted</mark> <u>underlined</u> "
            "==legacy highlight== ++legacy underline++ ~~removed~~"
        )
        styles = {style for _, style in spans}

        self.assertEqual(table["alignments"], ["left", "right"])
        self.assertEqual(table["header"], ["Finding", "Notes"])
        self.assertIn(frozenset({"bold"}), styles)
        self.assertIn(frozenset({"highlight"}), styles)
        self.assertIn(frozenset({"underline"}), styles)
        self.assertIn(frozenset({"strike"}), styles)
        self.assertGreater(
            len(render_document_preview("Chapter 1 - Assessment", table_content)),
            1,
        )


if __name__ == "__main__":
    unittest.main()
