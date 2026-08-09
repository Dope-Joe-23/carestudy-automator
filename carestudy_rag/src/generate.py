"""
Draft one care-study section from the student's own patient notes,
using retrieved template examples (style) and reference material (facts).

Usage:
    python src/generate.py --heading "1.2 Family's Medical/Surgical History" \
        --notes notes.txt

Requires env var ANTHROPIC_API_KEY.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from retrieval import SimpleIndex

TEMPLATE_INDEX_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "template_index.pkl")
REFERENCE_INDEX_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "reference_index.pkl")

SYSTEM_PROMPT = """You are drafting one section of a nursing patient/family care study, \
a standard clinical education assignment. You will be given:
1. The section heading to write.
2. The STUDENT'S OWN notes about their real patient for this section (the only \
source of patient-specific facts).
3. Example passages from past care studies, showing the expected structure, tone, \
and level of detail for this kind of section.
4. Reference material (textbook/formulary excerpts) for grounding any general \
clinical facts (drug info, pathophysiology, standard interventions).

Rules:
- Every patient-specific fact (history, vitals, findings, care given) must come \
from the student's notes. Never invent patient details that are not in the notes.
- General clinical facts (drug classifications, normal ranges, standard nursing \
interventions) should be grounded in the reference material provided. If the \
reference material doesn't cover something, say so rather than guessing.
- Match the structure, heading format, and academic tone shown in the example \
passages.
- If the student's notes are too thin to write a credible section, say exactly \
what additional information is needed instead of filling gaps with invention.
"""


def build_prompt(heading: str, patient_notes: str, template_examples, reference_chunks) -> str:
    examples_text = "\n\n---\n\n".join(
        f"[Example from {c.source}]\n{c.text}" for c in template_examples
    ) or "(no template examples found)"

    reference_text = "\n\n---\n\n".join(
        f"[Reference: {c.source}]\n{c.text}" for c in reference_chunks
    ) or "(no reference material found for this topic)"

    return f"""SECTION TO WRITE: {heading}

STUDENT'S PATIENT NOTES (the only source of patient-specific facts):
{patient_notes}

EXAMPLE PASSAGES (structure/style reference only, not this patient's facts):
{examples_text}

REFERENCE MATERIAL (for grounding general clinical facts):
{reference_text}

Write the section now, following the rules in the system prompt."""


def draft_section(heading: str, patient_notes: str, k_template: int = 3, k_reference: int = 4) -> str:
    if not patient_notes.strip():
        return ("No patient notes were provided for this section. Add the student's "
                "actual assessment/observation notes before drafting — nothing will "
                "be invented on their behalf.")

    template_index = SimpleIndex()
    reference_index = SimpleIndex()

    template_examples, reference_chunks = [], []
    if os.path.exists(TEMPLATE_INDEX_PATH):
        template_index.load(TEMPLATE_INDEX_PATH)
        template_examples = template_index.query(heading, k=k_template)
    if os.path.exists(REFERENCE_INDEX_PATH):
        reference_index.load(REFERENCE_INDEX_PATH)
        reference_chunks = reference_index.query(patient_notes, k=k_reference)

    prompt = build_prompt(heading, patient_notes, template_examples, reference_chunks)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return ("[DRY RUN - no ANTHROPIC_API_KEY set]\n\n"
                "Retrieved template examples:\n" +
                "\n".join(f"- {c.heading} ({c.source}, score={c.score:.2f})" for c in template_examples) +
                "\n\nRetrieved reference chunks:\n" +
                "\n".join(f"- {c.heading} ({c.source}, score={c.score:.2f})" for c in reference_chunks) +
                "\n\nSet ANTHROPIC_API_KEY to generate the actual drafted text.")

    import anthropic
    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1500,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(block.text for block in response.content if block.type == "text")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--heading", required=True)
    parser.add_argument("--notes", help="Path to a text file with the student's patient notes")
    parser.add_argument("--stdin", action="store_true", help="Read patient notes from stdin instead of a file")
    args = parser.parse_args()

    if args.stdin:
        notes = sys.stdin.read()
    elif args.notes:
        with open(args.notes) as f:
            notes = f.read()
    else:
        parser.error("provide --notes FILE or --stdin")

    print(draft_section(args.heading, notes))
