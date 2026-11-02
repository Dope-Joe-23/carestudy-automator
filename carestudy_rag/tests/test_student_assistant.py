"""Tests for source-grounded student chat without model or network calls."""

import base64
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import student_assistant as assistant  # noqa: E402
from retrieval import SimpleIndex  # noqa: E402


class StudentAssistantTests(unittest.TestCase):
    def test_answer_includes_cited_retrieved_reference(self):
        index = SimpleIndex()
        index.build([
            {
                "text": "The nursing process includes assessment, diagnosis, planning, implementation, and evaluation.",
                "heading": "Nursing process",
                "source": "openrn_nursing_process.txt",
                "citation": {
                    "label": "Open RN (2024)",
                    "inText": "(Open RN, 2024)",
                    "url": "https://example.org/nursing-process",
                },
            }
        ])

        with mock.patch.object(assistant, "_chat_model", return_value="The nursing process has five steps [1].") as model:
            result = assistant.answer_student_question(
                "What are the steps in the nursing process?",
                [],
                index,
            )

        self.assertEqual(result["references"][0]["label"], "Open RN (2024)")
        self.assertIn("[1] Open RN (2024)", model.call_args.args[1])
        self.assertEqual(result["answer"], "The nursing process has five steps [1].")

    def test_text_attachment_becomes_a_citable_source(self):
        index = SimpleIndex()
        content = base64.b64encode(b"Course notes explain wound assessment.").decode("ascii")

        with mock.patch.object(assistant, "_chat_model", return_value="The notes cover wound assessment [1]."):
            result = assistant.answer_student_question(
                "Summarize these notes.",
                [],
                index,
                {"filename": "wound-notes.txt", "content": content},
            )

        self.assertEqual(result["references"][0]["label"], "wound-notes.txt")

    def test_unsupported_attachment_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Supported attachments"):
            assistant.answer_student_question(
                "Review this file.",
                [],
                SimpleIndex(),
                {"filename": "image.png", "content": "aW1hZ2U="},
            )


if __name__ == "__main__":
    unittest.main()
