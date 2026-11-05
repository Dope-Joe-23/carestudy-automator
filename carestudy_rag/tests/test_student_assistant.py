"""Tests for source-grounded student chat without model or network calls."""

import base64
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import student_assistant as assistant  # noqa: E402
from care_study_review_rubric import (  # noqa: E402
    CARE_STUDY_CADRE_PROFILES,
    CARE_STUDY_REVIEW_RUBRIC,
    RM_CARE_STUDY_REVIEW_RUBRIC_DRAFT,
    public_care_study_cadre_profiles,
)
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

    def test_long_document_review_includes_full_text_and_revision_guidance(self):
        index = SimpleIndex()
        document = ("Chapter 1: assessment findings.\n" * 1_600).encode("utf-8")
        content = base64.b64encode(document).decode("ascii")

        with mock.patch.object(assistant, "_chat_model", return_value="Review complete.") as model:
            assistant.answer_student_question(
                "Review this care study for consistency across chapters.",
                [],
                index,
                {"filename": "care-study.txt", "content": content},
            )

        prompt = model.call_args.args[1]
        self.assertIn("The full extracted document is included for this review.", prompt)
        self.assertIn("Chapter 1: assessment findings.", prompt)
        self.assertIn("preserve all supported patient facts", model.call_args.args[0])
        self.assertIn("Chapter 1 — Assessment", model.call_args.args[0])
        self.assertIn("Chapter 2 — Analysis of Data", model.call_args.args[0])
        self.assertIn("Chapter 3 — Planning", model.call_args.args[0])
        self.assertIn("Chapter 4 — Implementation", model.call_args.args[0])
        self.assertIn("Chapter 5 — Evaluation", model.call_args.args[0])
        self.assertIn("Chapter 6 — Summary, conclusion, and bibliography", model.call_args.args[0])
        self.assertIn('status for Chapters 1-6 as "findings"', model.call_args.args[0])

    def test_rubric_covers_template_chapters_and_evidence_chain(self):
        for chapter in range(1, 7):
            self.assertIn(f"Chapter {chapter} —", CARE_STUDY_REVIEW_RUBRIC)
        for section in ("1.1", "1.11", "2.1", "2.5", "3.1", "3.2", "4.1", "4.3", "5.1", "5.3", "6.1", "6.3"):
            self.assertIn(section, CARE_STUDY_REVIEW_RUBRIC)
        self.assertIn("assessment evidence -> problems and", CARE_STUDY_REVIEW_RUBRIC)
        self.assertIn("strengths -> nursing diagnoses", CARE_STUDY_REVIEW_RUBRIC)

    def test_only_the_educator_reviewed_cadre_profile_is_available(self):
        public_profiles = public_care_study_cadre_profiles()
        self.assertEqual(
            [profile["id"] for profile in public_profiles],
            list(CARE_STUDY_CADRE_PROFILES),
        )
        self.assertEqual(
            [profile["id"] for profile in public_profiles if profile["status"] == "available"],
            ["registered_general_nurse"],
        )
        self.assertEqual(
            assistant._review_rubric_for_cadre("registered_general_nurse"),
            CARE_STUDY_REVIEW_RUBRIC,
        )
        for profile_id in ("registered_midwife", "public_health_nurse", "mental_health_nurse", "unknown"):
            with self.subTest(profile_id=profile_id), self.assertRaises(ValueError):
                assistant._review_rubric_for_cadre(profile_id)

    def test_rm_draft_rubric_is_phase_specific_but_not_usable_yet(self):
        rm_profile = CARE_STUDY_CADRE_PROFILES["registered_midwife"]
        self.assertEqual(rm_profile["status"], "in_development")
        self.assertEqual(rm_profile["review_rubric"], RM_CARE_STUDY_REVIEW_RUBRIC_DRAFT)
        for phase in (
            "Client and pregnancy assessment",
            "Antenatal care",
            "Labour and delivery",
            "Puerperium and postnatal care",
            "Summary, conclusion, references, appendices",
            "Cross-phase consistency",
        ):
            self.assertIn(phase, RM_CARE_STUDY_REVIEW_RUBRIC_DRAFT)
        self.assertIn("NOT APPROVED", RM_CARE_STUDY_REVIEW_RUBRIC_DRAFT)
        with self.assertRaises(ValueError):
            assistant._review_rubric_for_cadre("registered_midwife")

    def test_review_rubric_is_not_added_to_non_review_document_questions(self):
        with mock.patch.object(assistant, "_chat_model", return_value="Here is a summary.") as model:
            assistant.answer_student_question(
                "Summarize this document.",
                [],
                SimpleIndex(),
                {
                    "filename": "care-study.txt",
                    "content": base64.b64encode(b"Chapter 1: assessment.").decode("ascii"),
                },
            )

        self.assertNotIn("CARE-STUDY REVIEW STANDARD", model.call_args.args[0])

    def test_long_document_summary_keeps_excerpt_and_discloses_truncation(self):
        index = SimpleIndex()
        document = ("Course reading about nursing care.\n" * 1_600).encode("utf-8")
        content = base64.b64encode(document).decode("ascii")

        with mock.patch.object(assistant, "_chat_model", return_value="Summary.") as model:
            assistant.answer_student_question(
                "Summarize this document.",
                [],
                index,
                {"filename": "course-reading.txt", "content": content},
            )

        self.assertIn("Only the first 35,000 characters are included", model.call_args.args[1])

    def test_document_review_removes_citations_without_returned_sources(self):
        answer = "This is a concern [1]. The student should confirm the detail [2]."
        self.assertEqual(
            assistant._remove_unverified_citations(answer, 0),
            "This is a concern . The student should confirm the detail .",
        )

    def test_document_review_keeps_only_citations_that_match_returned_sources(self):
        answer = "This point is supported [1], but not this one [2]."
        self.assertEqual(
            assistant._remove_unverified_citations(answer, 1),
            "This point is supported [1], but not this one .",
        )

    def test_irrelevant_reference_is_not_cited_and_library_gap_is_disclosed(self):
        index = SimpleIndex()
        index.build([
            {
                "text": (
                    "Pain can be assessed using verbal reports and nonverbal "
                    "indicators. Cultural considerations are important in pain "
                    "management."
                ),
                "heading": "Pain assessment",
                "source": "openrn_comfort.txt",
                "citation": {
                    "label": "Open RN (2024)",
                    "inText": "(Open RN, 2024)",
                },
            }
        ])

        with mock.patch.object(
            assistant, "_chat_model", return_value="Pharmacokinetics describes drug movement."
        ) as model:
            result = assistant.answer_student_question(
                "Explain pharmacokinetics.",
                [],
                index,
            )

        self.assertEqual(result["references"], [])
        self.assertIn("No approved source passages were retrieved.", model.call_args.args[1])
        self.assertNotIn("openrn_comfort.txt", model.call_args.args[1])
        self.assertIn("not been verified against the library", result["answer"])
        self.assertIn("Pharmacokinetics describes drug movement.", result["answer"])

    def test_web_search_results_are_numbered_and_returned_as_references(self):
        with mock.patch.object(assistant, "_chat_model", return_value="The source describes ADME [1].") as model:
            result = assistant.answer_student_question(
                "Explain pharmacokinetics.",
                [],
                SimpleIndex(),
                web_sources=[{
                    "title": "Pharmacokinetics overview",
                    "url": "https://example.org/pharmacokinetics",
                    "snippet": "Pharmacokinetics describes absorption, distribution, metabolism, and excretion.",
                    "date": "2026-10-01",
                }],
            )

        self.assertEqual(result["references"][0]["url"], "https://example.org/pharmacokinetics")
        self.assertIn("[1] Pharmacokinetics overview", model.call_args.args[1])
        self.assertIn("WEB SEARCH RESULTS", model.call_args.args[1])
        self.assertNotIn("not been verified against the library", result["answer"])

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
