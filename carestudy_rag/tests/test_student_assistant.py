"""Tests for source-grounded student chat without model or network calls."""

import base64
from io import BytesIO
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import student_assistant as assistant  # noqa: E402
from docx import Document  # noqa: E402
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

    def test_docx_attachment_text_is_included_in_review_prompt(self):
        document = Document()
        document.add_heading("Case Study Chapter 1", level=1)
        document.add_paragraph("CASE_STUDY_DOCX_MARKER: client reports persistent fatigue.")
        document.add_paragraph("The care plan documents a rest intervention.")
        buffer = BytesIO()
        document.save(buffer)
        attachment = {
            "filename": "CASE STUDY.docx",
            "content": base64.b64encode(buffer.getvalue()).decode("ascii"),
        }

        with mock.patch.object(assistant, "_chat_model", return_value="Review complete.") as model:
            assistant.answer_student_question(
                "Review this case study for consistency.",
                [],
                SimpleIndex(),
                attachment,
            )

        prompt = model.call_args.args[1]
        self.assertIn("STUDENT-UPLOADED FILES (1 total", prompt)
        self.assertIn("STUDENT-UPLOADED FILE 1 OF 1 — CASE STUDY.docx", prompt)
        self.assertIn("CASE_STUDY_DOCX_MARKER: client reports persistent fatigue.", prompt)
        self.assertIn("The care plan documents a rest intervention.", prompt)

    def test_uploaded_document_is_separated_from_retrieved_library_sources(self):
        index = SimpleIndex()
        index.build([
            {
                "text": "The nursing process is a framework for assessment, diagnosis, planning, implementation, and evaluation.",
                "heading": "Nursing process",
                "source": "openrn_nursing_process.txt",
                "citation": {
                    "label": "Open RN Nursing Fundamentals",
                    "inText": "(Open RN Nursing Fundamentals)",
                    "url": "https://example.org/openrn",
                },
            },
            {
                "text": "Malaria is caused by parasites and may present with fever, chills, and headache.",
                "heading": "Malaria",
                "source": "who_malaria.txt",
                "citation": {
                    "label": "WHO Malaria Fact Sheet",
                    "inText": "(WHO Malaria Fact Sheet)",
                    "url": "https://example.org/who-malaria",
                },
            },
        ])
        attachment = {
            "filename": "case-study.txt",
            "content": base64.b64encode(
                b"Chapter I: The client was admitted with malaria."
            ).decode("ascii"),
        }

        with mock.patch.object(assistant, "_chat_model", return_value="Review complete.") as model:
            result = assistant.answer_student_question(
                "Review this malaria case study and nursing process using relevant background sources.",
                [],
                index,
                attachment,
            )

        system_prompt, review_prompt = model.call_args.args[:2]
        self.assertIn("The STUDENT-UPLOADED FILES section is the complete set", system_prompt)
        self.assertIn("STUDENT-UPLOADED FILES (1 total", review_prompt)
        self.assertIn("STUDENT-UPLOADED FILE 1 OF 1 — case-study.txt", review_prompt)
        self.assertIn("The client was admitted with malaria.", review_prompt)
        self.assertIn(
            "REFERENCE LIBRARY EXCERPTS (retrieved separately; these were not uploaded by the student)",
            review_prompt,
        )
        library_section = review_prompt.split(
            "REFERENCE LIBRARY EXCERPTS (retrieved separately; these were not uploaded by the student):\n",
            1,
        )[1].split("\n\nLATEST QUESTION:", 1)[0]
        self.assertNotIn("case-study.txt", library_section)
        self.assertIn("WHO Malaria Fact Sheet", review_prompt)
        self.assertIn("Open RN Nursing Fundamentals", review_prompt)
        self.assertEqual(
            {reference["label"] for reference in result["references"]},
            {"case-study.txt", "Open RN Nursing Fundamentals", "WHO Malaria Fact Sheet"},
        )

    def test_document_review_does_not_add_unrequested_library_sources(self):
        index = SimpleIndex()
        index.build([
            {
                "text": "The nursing process is a framework for assessment and care planning.",
                "heading": "Nursing process",
                "source": "openrn_nursing_process.txt",
                "citation": {
                    "label": "Open RN Nursing Fundamentals",
                    "inText": "(Open RN Nursing Fundamentals)",
                    "url": "https://example.org/openrn",
                },
            }
        ])
        attachment = {
            "filename": "case-study.txt",
            "content": base64.b64encode(b"Chapter I: the documented assessment.").decode("ascii"),
        }

        with mock.patch.object(assistant, "_chat_model", return_value="Review complete.") as model:
            assistant.answer_student_question(
                "Review this case study for internal consistency.",
                [],
                index,
                attachment,
            )

        prompt = model.call_args.args[1]
        self.assertIn("STUDENT-UPLOADED FILES (1 total", prompt)
        self.assertIn("No approved source passages were retrieved.", prompt)
        self.assertNotIn("Open RN Nursing Fundamentals", prompt)

    def test_document_summary_includes_full_text_not_only_first_excerpt(self):
        document_text = "CASE_STUDY_SUMMARY_MARKER " + ("assessment details. " * 2_000)
        attachment = {
            "filename": "case-study.txt",
            "content": base64.b64encode(document_text.encode("utf-8")).decode("ascii"),
        }
        with mock.patch.object(assistant, "_chat_model", return_value="Summary.") as model:
            assistant.answer_student_question(
                "Summarize the attached document.",
                [],
                SimpleIndex(),
                attachment,
            )

        prompt = model.call_args.args[1]
        self.assertIn("[The full extracted document is included for this summary or review.]", prompt)
        self.assertIn("assessment details. ", prompt[35_000:])

    def test_multiple_attachments_are_included_and_citable(self):
        attachments = [
            {
                "filename": "assessment.txt",
                "content": base64.b64encode(b"Assessment findings include fatigue.").decode("ascii"),
            },
            {
                "filename": "care-plan.md",
                "content": base64.b64encode(b"The care plan documents a rest intervention.").decode("ascii"),
            },
        ]
        with mock.patch.object(assistant, "_chat_model", return_value="Review complete.") as model:
            result = assistant.answer_student_question(
                "Check fatigue assessment and rest intervention for consistency.",
                [],
                SimpleIndex(),
                attachments,
            )

        prompt = model.call_args.args[1]
        self.assertIn("STUDENT-UPLOADED FILE 1 OF 2 — assessment.txt", prompt)
        self.assertIn("STUDENT-UPLOADED FILE 2 OF 2 — care-plan.md", prompt)
        self.assertIn("Assessment findings include fatigue.", prompt)
        self.assertIn("The care plan documents a rest intervention.", prompt)
        self.assertEqual(
            {reference["label"] for reference in result["references"]},
            {"assessment.txt", "care-plan.md"},
        )

    def test_attachment_check_flags_reference_material_without_blocking_review(self):
        content = base64.b64encode(
            b"Learning objectives: describe the nursing process. Textbook chapter about assessment."
        ).decode("ascii")

        with mock.patch.object(assistant, "_chat_model", return_value="I reviewed the uploaded text.") as model:
            result = assistant.answer_student_question(
                "Review my care study for consistency.",
                [],
                SimpleIndex(),
                {"filename": "fundamentals.txt", "content": content},
            )

        self.assertIn("ATTACHMENT TYPE CHECK (heuristic, may be wrong)", model.call_args.args[1])
        self.assertIn("I’ll base this response on its actual contents", result["answer"])
        self.assertIn("fundamentals.txt", result["answer"])

    def test_care_study_marker_is_not_flagged_as_non_care_study(self):
        content = base64.b64encode(
            b"Care Study: patient particulars, assessment, nursing diagnosis, and nursing care plan."
        ).decode("ascii")

        with mock.patch.object(assistant, "_chat_model", return_value="Review complete.") as model:
            result = assistant.answer_student_question(
                "Review my care study for consistency.",
                [],
                SimpleIndex(),
                {"filename": "case-study.txt", "content": content},
            )

        self.assertNotIn("ATTACHMENT TYPE CHECK", model.call_args.args[1])
        self.assertNotIn("Attachment check:", result["answer"])

    def test_long_document_review_includes_full_text_and_revision_guidance(self):
        index = SimpleIndex()
        document = ("Chapter 1: assessment findings.\n" * 5_000).encode("utf-8")
        content = base64.b64encode(document).decode("ascii")

        with mock.patch.object(assistant, "_chat_model", return_value="Review complete.") as model:
            assistant.answer_student_question(
                "Review this care study for consistency across chapters.",
                [],
                index,
                {"filename": "care-study.txt", "content": content},
            )

        prompt = model.call_args.args[1]
        self.assertIn("The full extracted document is included for this summary or review.", prompt)
        self.assertIn("Chapter 1: assessment findings.", prompt)
        self.assertIn("preserve all supported patient facts", model.call_args.args[0])
        self.assertIn("Chapter 1 — Assessment", model.call_args.args[0])
        self.assertIn("Chapter 2 — Analysis of Data", model.call_args.args[0])
        self.assertIn("Chapter 3 — Planning", model.call_args.args[0])
        self.assertIn("Chapter 4 — Implementation", model.call_args.args[0])
        self.assertIn("Chapter 5 — Evaluation", model.call_args.args[0])
        self.assertIn("Chapter 6 — Summary, conclusion, and bibliography", model.call_args.args[0])
        self.assertIn('status for Chapters 1-6 as "findings"', model.call_args.args[0])

    def test_document_over_100000_characters_is_included_in_review(self):
        document = ("Long chapter content. " * 6_000).encode("utf-8")
        content = base64.b64encode(document).decode("ascii")

        with mock.patch.object(assistant, "_chat_model", return_value="Review complete.") as model:
            assistant.answer_student_question(
                "Review this chapter for consistency.",
                [],
                SimpleIndex(),
                {"filename": "long-chapter.txt", "content": content},
            )

        prompt = model.call_args.args[1]
        self.assertIn("The full extracted document is included for this summary or review.", prompt)
        self.assertIn("Long chapter content.", prompt)

    def test_combined_attachment_text_limit_is_enforced(self):
        attachments = [
            {
                "filename": f"chapter-{index}.txt",
                "content": base64.b64encode(("Chapter content. " * 8_000).encode("utf-8")).decode("ascii"),
            }
            for index in (1, 2)
        ]

        with self.assertRaisesRegex(ValueError, "ATTACHMENT_TOO_LARGE"):
            assistant.answer_student_question(
                "Review these chapters for consistency.",
                [],
                SimpleIndex(),
                attachments,
            )

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

    def test_long_document_summary_includes_full_text(self):
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

        self.assertIn(
            "The full extracted document is included for this summary or review.",
            model.call_args.args[1],
        )
        self.assertIn(document.decode("utf-8")[-1_000:], model.call_args.args[1])

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
        self.assertTrue(result["answer"].startswith("Pharmacokinetics describes"))
        self.assertIn("Pharmacokinetics describes drug movement.", result["answer"])

    def test_carestudy_workflow_question_returns_product_steps_without_retrieval(self):
        index = SimpleIndex()
        with (
            mock.patch.object(index, "query", side_effect=AssertionError("retrieval should be skipped")),
            mock.patch.object(assistant, "_chat_model") as model,
        ):
            result = assistant.answer_student_question(
                "How do I start a nursing care (case) study?",
                [],
                index,
            )

        model.assert_not_called()
        self.assertEqual(result["references"], [])
        self.assertTrue(result["answer"].startswith("Absolutely—we can take it one step at a time."))
        self.assertIn("assignment brief or marking guide", result["answer"])
        self.assertIn("patient-identifying details removed", result["answer"])
        self.assertIn("My care study projects", result["answer"])
        self.assertIn("Place an order", result["answer"])
        self.assertNotIn("reference library", result["answer"])
        self.assertNotIn("general educational information", result["answer"])

    def test_feeling_daunted_about_starting_care_study_gets_supportive_first_step(self):
        index = SimpleIndex()
        with (
            mock.patch.object(index, "query", side_effect=AssertionError("retrieval should be skipped")),
            mock.patch.object(assistant, "_chat_model") as model,
        ):
            result = assistant.answer_student_question(
                "I feel daunted about starting my care study.",
                [],
                index,
            )

        model.assert_not_called()
        self.assertTrue(result["answer"].startswith("Absolutely—we can take it one step at a time."))
        self.assertIn("Which one are you working on?", result["answer"])

    def test_explicit_car_study_question_is_not_routed_to_carestudy_workflow(self):
        with mock.patch.object(
            assistant, "_chat_model", return_value="A car study could compare vehicle types."
        ) as model:
            result = assistant.answer_student_question(
                "How do I start a car study?",
                [],
                SimpleIndex(),
            )

        self.assertIn("LATEST QUESTION:\nHow do I start a car study?", model.call_args.args[1])
        self.assertNotIn("Place an order", result["answer"])

    def test_no_source_prompt_requests_concise_relevant_assignment_help(self):
        with mock.patch.object(
            assistant, "_chat_model", return_value="Share the assignment brief and I can help outline it."
        ) as model:
            result = assistant.answer_student_question(
                "Help me plan the opening of my care study.",
                [],
                SimpleIndex(),
            )

        system_prompt = model.call_args.args[0]
        self.assertIn("Do not generate a generic study checklist", system_prompt)
        self.assertIn("ask one focused clarifying question", system_prompt)
        self.assertTrue(result["answer"].startswith("Share the assignment brief"))
        self.assertIn("has not been verified against the library", result["answer"])
        self.assertNotIn("consult your assigned textbook or an educator", result["answer"])
        self.assertIn("Share the assignment brief", result["answer"])

    def test_all_no_source_answers_start_with_useful_information(self):
        answer = "Pharmacokinetics describes how the body absorbs, distributes, metabolizes, and excretes a medicine."
        with mock.patch.object(assistant, "_chat_model", return_value=answer) as model:
            result = assistant.answer_student_question(
                "What does pharmacokinetics mean?",
                [],
                SimpleIndex(),
            )

        self.assertIn("Give the user useful, directly relevant information first.", model.call_args.args[0])
        self.assertIn("Do not start by saying that the library found no evidence", model.call_args.args[0])
        self.assertTrue(result["answer"].startswith(answer))
        self.assertIn("Note: This answer has not been verified against the library.", result["answer"])

    def test_care_study_is_not_contrasted_with_unrelated_topics(self):
        index = SimpleIndex()
        with (
            mock.patch.object(index, "query", side_effect=AssertionError("retrieval should be skipped")),
            mock.patch.object(assistant, "_chat_model") as model,
        ):
            result = assistant.answer_student_question(
                "What is a carestudy?",
                [],
                index,
            )

        model.assert_not_called()
        self.assertTrue(result["answer"].startswith(
            "In nursing education, a care study (also written “carestudy”)"
        ))
        self.assertIn("check your course handbook", result["answer"])
        self.assertIn("has not been verified against the library", result["answer"])
        self.assertNotIn("reference library did not retrieve", result["answer"].lower())
        self.assertNotIn("car or vehicle", result["answer"].lower())
        self.assertEqual(result["references"], [])

    def test_care_study_definition_with_source_request_uses_retrieval(self):
        with mock.patch.object(
            assistant, "_chat_model", return_value="A care study documents a patient's health situation [1]."
        ) as model:
            result = assistant.answer_student_question(
                "What is a care study? Please give sources.",
                [],
                SimpleIndex(),
            )

        self.assertIn("REFERENCE LIBRARY EXCERPTS", model.call_args.args[1])
        self.assertIn("LATEST QUESTION:\nWhat is a care study? Please give sources.", model.call_args.args[1])
        self.assertIn("has not been verified against the library", result["answer"])

    def test_no_source_clinical_prompt_retains_safety_boundaries(self):
        with mock.patch.object(
            assistant, "_chat_model", return_value="Please consult your clinical educator."
        ) as model:
            assistant.answer_student_question(
                "What treatment should I give for these symptoms?",
                [],
                SimpleIndex(),
            )

        self.assertIn("must not diagnose, prescribe", model.call_args.args[0])

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
