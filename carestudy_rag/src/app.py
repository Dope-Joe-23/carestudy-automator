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

st.set_page_config(page_title="Care Study Drafting Assistant", layout="wide")
st.title("📋 Patient/Family Care Study — Drafting Assistant")
st.caption(
    "This tool drafts wording from *your own* patient notes. It does not invent "
    "patient facts — sections with no notes will not be written."
)

if not os.environ.get("ANTHROPIC_API_KEY"):
    st.warning(
        "ANTHROPIC_API_KEY is not set in this environment. The app will run in "
        "dry-run mode (shows retrieval only, no drafted text). "
        "Set it with: export ANTHROPIC_API_KEY=sk-ant-..."
    )

SECTIONS = {
    "Chapter 1: Assessment": [
        "1.1 Patient's Particulars",
        "1.2 Family's Medical/Surgical History",
        "1.3 Family's Socio-Economic History",
        "1.4 Patient's Developmental History",
        "1.5 Patient's Past Medical/Surgical History",
        "1.6 Present Medical/Surgical History",
    ],
    "Chapter 2: Analysis of Data": [
        "2.1 Comparison of Data with Standards",
        "2.2 Pharmacology of Drugs Prescribed",
        "2.3 Health Needs Identified",
    ],
    "Chapter 3: Planning": [
        "3.1 Objectives for Patient/Family Care",
        "3.2 Nursing Care Plan",
    ],
    "Chapter 4: Implementation": [
        "4.1 Summary of the Actual Nursing Care",
    ],
    "Chapter 5: Evaluation": [
        "5.1 Statement of Evaluation",
    ],
    "Chapter 6: Summary and Conclusion": [
        "6.1 Summary",
        "6.2 Conclusion",
    ],
}

tabs = st.tabs(list(SECTIONS.keys()))

for tab, chapter_name in zip(tabs, SECTIONS.keys()):
    with tab:
        for heading in SECTIONS[chapter_name]:
            with st.expander(heading, expanded=False):
                notes = st.text_area(
                    "Your patient notes for this section",
                    key=f"notes_{heading}",
                    height=120,
                    placeholder="e.g. Patient is 49yo farmer, admitted 14/11, vitals: T35.5 P64 R20 BP120/70 ...",
                )
                if st.button("Draft this section", key=f"btn_{heading}"):
                    with st.spinner("Retrieving examples and drafting..."):
                        result = draft_section(heading, notes)
                    st.markdown("**Draft:**")
                    st.write(result)
