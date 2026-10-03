"""
Unit tests for the PDF -> question-card extractor (quiz_extract.py).

These cover the two pure helpers (``_parse_bank``, ``_normalize_card``) plus
``_dedupe_ids``, and end-to-end ``extract_questions_from_pdf`` /
``extract_questions_from_document`` tests with the model call patched out, so
the suite needs no API key and no network.

Run from the repository root::

    python -m unittest discover -s carestudy_rag/tests -v
"""
import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import quiz_extract as q  # noqa: E402


def _card(**overrides) -> dict:
    """A minimal structurally-valid model card, with overrides applied."""
    card = {
        "topic": "Sepsis",
        "level": "Undergraduate",
        "title": "Early signs of sepsis",
        "question": "Which finding is an early sign of sepsis?",
        "options": ["Tachypnoea", "Bradycardia", "Hypertension", "Oliguria"],
        "correctOptionIndex": 0,
        "rationale": "Tachypnoea is an early compensatory sign.",
        "sourceTitle": "WHO sepsis note",
        "sourceUrl": "https://www.who.int/sepsis",
        "learningObjective": "Identify early signs of sepsis",
        "visualBrief": "A nurse checking a patient's respiration rate",
    }
    card.update(overrides)
    return card


class ParseBankTests(unittest.TestCase):
    def test_bare_json_object(self):
        raw = json.dumps({"questions": [_card(), _card(title="Second")]})
        self.assertEqual(len(q._parse_bank(raw)), 2)

    def test_fenced_json(self):
        raw = '```json\n{"questions": [%s]}\n```' % json.dumps(_card())
        self.assertEqual(len(q._parse_bank(raw)), 1)

    def test_prose_wrapped_json(self):
        raw = "Sure! Here are the cards:\n" + json.dumps({"questions": [_card()]}) + "\nHope that helps."
        self.assertEqual(len(q._parse_bank(raw)), 1)

    def test_non_dict_entries_are_dropped(self):
        raw = json.dumps({"questions": [_card(), "nope", 42, None]})
        self.assertEqual(len(q._parse_bank(raw)), 1)

    def test_missing_braces_raises(self):
        with self.assertRaises(RuntimeError):
            q._parse_bank("there is no json here")

    def test_no_questions_array_raises(self):
        with self.assertRaises(RuntimeError):
            q._parse_bank(json.dumps({"cards": [_card()]}))

    def test_questions_not_a_list_raises(self):
        with self.assertRaises(RuntimeError):
            q._parse_bank(json.dumps({"questions": "oops"}))


class NormalizeCardTests(unittest.TestCase):
    BASE = dict(
        default_topic="General nursing",
        default_level="Undergraduate",
        default_source_title="module-3.pdf",
        default_source_url="",
        source_kind_hint="pdf-module-3",
    )

    def norm(self, item, index=0, **overrides):
        args = {**self.BASE, **overrides}
        return q._normalize_card(item, index, **args)

    def test_valid_card_is_kept(self):
        card = self.norm(_card())
        self.assertIsNotNone(card)
        self.assertEqual(card["sourceKind"], "url")
        self.assertEqual(card["sourceUrl"], "https://www.who.int/sepsis")
        self.assertEqual(card["options"], ["Tachypnoea", "Bradycardia", "Hypertension", "Oliguria"])
        self.assertEqual(card["reviewStatus"], "draft")

    def test_id_is_slugged_and_indexed(self):
        card = self.norm(_card(), index=2)
        self.assertEqual(card["id"], "pdf-module-3-early-signs-of-sepsis-3")

    def test_admin_source_url_wins_and_marks_url(self):
        card = self.norm(_card(sourceUrl=""), default_source_url="https://example.org/source.pdf")
        self.assertEqual(card["sourceKind"], "url")
        self.assertEqual(card["sourceUrl"], "https://example.org/source.pdf")

    def test_missing_url_falls_back_to_document_reference(self):
        card = self.norm(_card(sourceUrl=""))
        self.assertEqual(card["sourceKind"], "document")
        self.assertEqual(card["sourceUrl"], "module-3.pdf")

    def test_invalid_model_url_is_treated_as_document(self):
        card = self.norm(_card(sourceUrl="not a url"))
        self.assertEqual(card["sourceKind"], "document")

    def test_admin_source_ignored_when_not_absolute(self):
        # A non-absolute "sourceUrl" from the admin must not be treated as a link.
        card = self.norm(_card(sourceUrl=""), default_source_url="ftp://nope")
        self.assertEqual(card["sourceKind"], "document")

    def test_missing_question_is_dropped(self):
        self.assertIsNone(self.norm(_card(question="   ")))

    def test_wrong_option_count_is_dropped(self):
        self.assertIsNone(self.norm(_card(options=["a", "b", "c"])))
        self.assertIsNone(self.norm(_card(options=["a", "b", "c", "d", "e"])))

    def test_blank_option_is_dropped(self):
        self.assertIsNone(self.norm(_card(options=["a", "b", "c", "   "])))

    def test_out_of_range_index_is_dropped(self):
        self.assertIsNone(self.norm(_card(correctOptionIndex=4)))
        self.assertIsNone(self.norm(_card(correctOptionIndex=-1)))

    def test_non_integer_index_is_dropped(self):
        self.assertIsNone(self.norm(_card(correctOptionIndex="zero")))
        self.assertIsNone(self.norm(_card(correctOptionIndex=None)))

    def test_options_are_trimmed(self):
        card = self.norm(_card(options=[" a ", "b", " c", "d "]))
        self.assertEqual(card["options"], ["a", "b", "c", "d"])

    def test_defaults_fill_blank_text_fields(self):
        card = self.norm(
            _card(topic="", level="", title="", rationale="", learningObjective="", visualBrief="")
        )
        self.assertEqual(card["topic"], "General nursing")
        self.assertEqual(card["level"], "Undergraduate")
        self.assertTrue(card["title"])
        self.assertTrue(card["rationale"])
        self.assertTrue(card["learningObjective"])
        self.assertTrue(card["visualBrief"])
        self.assertIn("General nursing", card["visualBrief"])

    def test_title_falls_back_to_question_prefix(self):
        long_question = "Q" * 100
        card = self.norm(_card(title="", question=long_question))
        self.assertEqual(card["title"], long_question[:70])


class DedupeIdsTests(unittest.TestCase):
    def test_duplicate_ids_get_suffixes(self):
        cards = [{"id": "pdf-doc-same-1"}, {"id": "pdf-doc-same-1"}, {"id": "pdf-doc-same-1"}]
        ids = [c["id"] for c in q._dedupe_ids(cards)]
        self.assertEqual(ids, ["pdf-doc-same-1", "pdf-doc-same-1-2", "pdf-doc-same-1-3"])
        self.assertEqual(len(set(ids)), 3)


class ValidUrlTests(unittest.TestCase):
    def test_accepts_absolute_http_urls(self):
        self.assertTrue(q._valid_absolute_url("https://who.int/x"))
        self.assertTrue(q._valid_absolute_url("http://localhost:5000/y"))

    def test_rejects_non_urls(self):
        for value in ("", "module-3.pdf", "ftp://who.int", "www.who.int", "javascript:alert(1)"):
            self.assertFalse(q._valid_absolute_url(value), value)


class ExtractQuestionsTests(unittest.TestCase):
    """End-to-end with the model call patched out (no network, no API key)."""

    def test_empty_pdf_raises(self):
        with self.assertRaises(RuntimeError):
            q.extract_questions_from_pdf("")

    def test_returns_only_usable_cards(self):
        raw = json.dumps(
            {
                "questions": [
                    _card(),
                    {"question": "Bad", "options": ["a", "b"], "correctOptionIndex": 0},
                ]
            }
        )
        with mock.patch.object(q, "_chat_model", return_value=raw):
            result = q.extract_questions_from_pdf("JVBERi0xLjQK", filename="module-3.pdf")
        self.assertEqual(len(result["questions"]), 1)
        self.assertEqual(result["questions"][0]["sourceKind"], "url")

    def test_all_unusable_cards_raises(self):
        raw = json.dumps({"questions": [{"question": "Bad", "options": ["a"], "correctOptionIndex": 0}]})
        with mock.patch.object(q, "_chat_model", return_value=raw):
            with self.assertRaises(RuntimeError):
                q.extract_questions_from_pdf("JVBERi0xLjQK", filename="module-3.pdf")

    def test_document_source_when_no_url_provided(self):
        raw = json.dumps({"questions": [_card(sourceUrl="")]})
        with mock.patch.object(q, "_chat_model", return_value=raw):
            result = q.extract_questions_from_pdf("JVBERi0xLjQK", filename="module-3.pdf")
        card = result["questions"][0]
        self.assertEqual(card["sourceKind"], "document")
        self.assertEqual(card["sourceUrl"], "module-3.pdf")

    def test_source_url_argument_is_applied(self):
        raw = json.dumps({"questions": [_card(sourceUrl="")]})
        with mock.patch.object(q, "_chat_model", return_value=raw):
            result = q.extract_questions_from_pdf(
                "JVBERi0xLjQK",
                filename="module-3.pdf",
                source_url="https://example.org/module-3.pdf",
            )
        card = result["questions"][0]
        self.assertEqual(card["sourceKind"], "url")
        self.assertEqual(card["sourceUrl"], "https://example.org/module-3.pdf")

    def test_cards_are_capped(self):
        raw = json.dumps({"questions": [_card(title=f"Card {i}") for i in range(q.MAX_CARDS + 10)]})
        with mock.patch.object(q, "_chat_model", return_value=raw):
            result = q.extract_questions_from_pdf("JVBERi0xLjQK", filename="module-3.pdf")
        self.assertEqual(len(result["questions"]), q.MAX_CARDS)


class DocumentKindTests(unittest.TestCase):
    """PDF uses a native document block; Word is flattened to a text prompt."""

    def test_unsupported_kind_raises(self):
        with self.assertRaises(RuntimeError):
            q.extract_questions_from_document("abc", kind="txt", filename="notes.txt")

    def test_empty_content_raises(self):
        with self.assertRaises(RuntimeError):
            q.extract_questions_from_document("", kind="docx", filename="a.docx")

    def test_pdf_uses_document_block(self):
        raw = json.dumps({"questions": [_card()]})
        seen = {}

        def fake_chat(system, prompt, **kwargs):
            seen["document"] = kwargs.get("document")
            seen["prompt"] = prompt
            return raw

        with mock.patch.object(q, "_chat_model", side_effect=fake_chat):
            result = q.extract_questions_from_document("JVBERi0xLjQK", kind="pdf", filename="module-3.pdf")
        self.assertEqual(seen["document"]["media_type"], "application/pdf")
        self.assertEqual(seen["document"]["data"], "JVBERi0xLjQK")
        self.assertEqual(result["questions"][0]["id"][:4], "pdf-")

    def test_docx_is_flattened_to_a_text_prompt(self):
        raw = json.dumps({"questions": [_card(sourceUrl="")]})
        seen = {}

        def fake_chat(system, prompt, **kwargs):
            seen["document"] = kwargs.get("document")
            seen["prompt"] = prompt
            return raw

        with mock.patch.object(q, "_chat_model", side_effect=fake_chat), mock.patch.object(
            q, "_docx_to_text", return_value="Sepsis is a life-threatening response to infection."
        ):
            result = q.extract_questions_from_document("UEsDBAoAAAAA", kind="docx", filename="module-3.docx")
        # No document block for Word — the text travels in the prompt instead.
        self.assertIsNone(seen["document"])
        self.assertIn("DOCUMENT TEXT", seen["prompt"])
        self.assertIn("life-threatening", seen["prompt"])
        self.assertEqual(result["questions"][0]["id"][:5], "docx-")

    def test_empty_docx_text_raises(self):
        with mock.patch.object(q, "_chat_model", return_value="{}"), mock.patch.object(
            q, "_docx_to_text", return_value="   "
        ):
            with self.assertRaises(RuntimeError):
                q.extract_questions_from_document("UEsDBAoAAAAA", kind="docx", filename="a.docx")


if __name__ == "__main__":
    unittest.main()
