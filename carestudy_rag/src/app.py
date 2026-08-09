"""
Streamlit UI for drafting a care study, section by section.

Run:
    streamlit run src/app.py
"""
import os
import sys

import streamlit as st

sys.path.insert(0, os.path.dirname(__file__))
from generate import draft_section
from template import CHAPTERS, SECTIONS

st.set_page_config(page_title="Care Study Drafting Assistant", layout="wide")

st.title("📋 Patient/Family Care Study — Drafting Assistant")
st.caption(
    "Every section opens with the exact fields a care study should collect "
    "(shaped from eight sample care studies). Fill what you know, then draft — "
    "the tool never invents patient facts: sections with no input are not written."
)

if not os.environ.get("ANTHROPIC_API_KEY"):
    st.warning(
        "ANTHROPIC_API_KEY is not set in this environment. The app will run in "
        "dry-run mode (shows retrieval only, no drafted text). "
        "Set it with: export ANTHROPIC_API_KEY=sk-ant-..."
    )


def render_field(heading, field, container=None):
    """Render one template field, persisted in session state."""
    key = f"f_{heading}_{field['id']}"
    ftype = field["type"]
    help_text = field["hint"] or None
    target = container if container is not None else st
    label = field["label"] + (" *" if field.get("required") else "")

    if ftype == "textarea":
        target.text_area(
            label, key=key, height=84,
            placeholder=field["placeholder"], help=help_text,
        )
    elif ftype == "select":
        options = [""] + field["options"]
        target.selectbox(
            label, options, key=key, help=help_text,
        )
    else:
        target.text_input(
            label, key=key, placeholder=field["placeholder"], help=help_text,
        )


def render_section_fields(heading):
    """Two-column layout: wide fields (textarea/select) full width, others paired."""
    fields = SECTIONS[heading]["fields"]
    pending = []
    for field in fields:
        if field["type"] in ("textarea", "select"):
            if pending:
                col1, _ = st.columns(2)
                render_field(heading, pending.pop(0), col1)
            render_field(heading, field)
        else:
            pending.append(field)
            if len(pending) == 2:
                col1, col2 = st.columns(2)
                render_field(heading, pending[0], col1)
                render_field(heading, pending[1], col2)
                pending = []
    if pending:
        col1, _ = st.columns(2)
        render_field(heading, pending.pop(0), col1)


def render_section_rows(heading):
    rows = SECTIONS[heading]["rows"]
    st.markdown(f"**{rows['title']}** — one entry per drug / care plan item")
    st.caption("Columns: " + " · ".join(rows["columns"]))
    for i in range(1, rows["slots"] + 1):
        st.text_area(
            f"Entry {i}", key=f"r_{heading}_{i}", height=62,
            placeholder=" | ".join(rows["columns"]),
        )


def compose_notes(heading, free_notes):
    """Turn filled template fields + free notes into the input for drafting."""
    lines = []
    section = SECTIONS[heading]
    for field in section["fields"]:
        value = st.session_state.get(f"f_{heading}_{field['id']}", "").strip()
        if value:
            lines.append(f"{field['label']}: {value}")
    rows = section.get("rows")
    if rows:
        for i in range(1, rows["slots"] + 1):
            value = st.session_state.get(f"r_{heading}_{i}", "").strip()
            if value:
                lines.append(f"{rows['title']} — entry {i}: {value}")
    notes = (free_notes or "").strip()
    if notes:
        lines.append(f"Free-form clinical notes:\n{notes}")
    return "\n".join(lines)


tabs = st.tabs([f"Chapter {i + 1}: {name}" for i, (name, _) in enumerate(CHAPTERS)])

for tab, (chapter_name, headings) in zip(tabs, CHAPTERS):
    with tab:
        for heading in headings:
            section = SECTIONS[heading]
            with st.expander(f"{heading} — {section['blurb']}", expanded=False):
                st.markdown("**What to collect**")
                if section["fields"]:
                    render_section_fields(heading)
                if section.get("rows"):
                    render_section_rows(heading)

                required_missing = [
                    f["label"] for f in section["fields"]
                    if f.get("required") and not st.session_state.get(f"f_{heading}_{f['id']}", "").strip()
                ]
                if required_missing:
                    st.caption("⚠️ Required fields missing: " + ", ".join(required_missing))

                free_notes = st.text_area(
                    "Your own clinical notes (free text)",
                    key=f"notes_{heading}",
                    height=110,
                    placeholder="Anything else you observed, heard, measured, or were told…",
                )

                if st.button("Draft this section", key=f"btn_{heading}"):
                    composed = compose_notes(heading, free_notes)
                    if not composed.strip():
                        st.info("Nothing to work with yet — fill in a few fields or add notes, then draft.")
                    else:
                        with st.spinner("Retrieving examples and drafting..."):
                            result = draft_section(heading, composed)
                        st.markdown("**Draft**")
                        st.code(result)
