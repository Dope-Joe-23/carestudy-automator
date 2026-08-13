"""
Build a standard patient/family care study Word document (.docx) from study
JSON, matching the Nursing & Midwifery Council of Ghana format used by the
sample care studies in data/templates/ (title page, chapters, numbered
sections, drug/care-plan tables).

Usage:
    python src/export_docx.py < study.json > care_study.docx

Reads a JSON object on stdin with the shape:

    {
      "title": {
        "patientName": "MRS. P.A",
        "diagnosis": "SICKLE CELL-ACUTE CHEST SYNDROME",
        "studentName": "DRAMANI ZENABU",
        "indexNumber": "...",
        "collegeName": "NURSING AND MIDWIFERY TRAINING COLLEGE",
        "collegeLocation": "SEIKWA",
        "year": "2023"
      },
      "chapters": [
        {
          "name": "Assessment",
          "intro": "This chapter opens with... (optional, rendered under the heading)",
          "introReferences": [{"label": "...", "inText": "(Wikipedia: X, 2026)", "url": "..."}],
          "sections": [
            {
              "id": "1.1",
              "heading": "Patient's Particulars",
              "draft": "**1.1 Patient's Particulars**  The patient ...",
              "references": [
                {"label": "Wikipedia contributors. (2026). Pneumonia. ...", "inText": "(Wikipedia: Pneumonia, 2026)", "url": "https://en.wikipedia.org/wiki/Pneumonia"}
              ],
              "fields": [{"label": "Age", "value": "10 years"}],
              "rows": {
                "title": "Prescribed drugs",
                "columns": ["Drug", "Class"],
                "data": [["Ceftriaxone", "3rd-gen cephalosporin"]]
              }
            }
          ]
        }
      ]
    }

Draft text may contain light markdown (**bold**, *italic*, "- " bullets and
"1. " numbered lines), which is converted to proper Word formatting.

The optional "scope" key controls how much of the study is rendered:
    {"type": "full"}                            (default) title page + TOC + all chapters
    {"type": "chapter", "chapterIndex": 0}      one chapter (heading + its sections)
    {"type": "section", "chapterIndex": 0, "sectionIndex": 1}
                                                  a single section only
"""
import argparse
import io
import json
import re
import sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt

BODY_FONT = "Times New Roman"
BODY_SIZE = Pt(12)
ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]

# Inline markdown tokens we translate into Word runs.
INLINE_RE = re.compile(r"(<sup>[^<]*</sup>|\*\*[^*]+\*\*|\*[^*]+\*)")
BULLET_RE = re.compile(r"^\s*[-•]\s+")
NUMBER_RE = re.compile(r"^\s*\d+[.)]\s+")
# Markdown pipe tables that can sneak into drafts (e.g. "| Item | Detail |").
TABLE_ROW_RE = re.compile(r"^\s*\|")
SEPARATOR_RE = re.compile(r"^:?-{2,}:?$")
EMPHASIS_RE = re.compile(r"<sup>(.+?)</sup>|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`")
# Bare day + month (e.g. "1 August") and ISO ("2012-06-11") -> ordinal with superscript.
MONTHS = (
    r"January|February|March|April|May|June|July|August|"
    r"September|October|November|December"
)
BARE_DATE_RE = re.compile(rf"\b(\d{{1,2}})\s+({MONTHS})\b")
ISO_DATE_RE = re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b")
MONTH_NAMES = {
    1: "January", 2: "February", 3: "March", 4: "April", 5: "May", 6: "June",
    7: "July", 8: "August", 9: "September", 10: "October", 11: "November", 12: "December",
}


def _set_style_font(doc):
    """Normal style -> Times New Roman 12pt, 1.5 line spacing, justified."""
    normal = doc.styles["Normal"]
    normal.font.name = BODY_FONT
    normal.font.size = BODY_SIZE
    normal.paragraph_format.line_spacing = 1.5
    normal.paragraph_format.space_after = Pt(6)
    rpr = normal.element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    rfonts.set(qn("w:ascii"), BODY_FONT)
    rfonts.set(qn("w:hAnsi"), BODY_FONT)
    rfonts.set(qn("w:cs"), BODY_FONT)


def _add_run(paragraph, text, bold=False, italic=False, size=None, superscript=False):
    run = paragraph.add_run(text)
    run.bold = bold
    run.italic = italic
    if superscript:
        run.font.superscript = True
    if size is not None:
        run.font.size = size
    run.font.name = BODY_FONT
    return run


def _ordinal_suffix(day):
    """English ordinal suffix for a day number: 1->st, 2->nd, 3->rd, else th."""
    if 10 <= day % 100 <= 20:
        return "th"
    return {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")


def _format_ordinal_dates(text):
    """Normalize dates to an ordinal with a superscript suffix.

    - Bare '1 August 2026'  -> '1<sup>st</sup> August 2026'
    - ISO '2012-06-11'      -> '11<sup>th</sup> June 2012' (date-picker values)

    A safety net for dates the model wrote without an ordinal suffix; dates
    already written as '1<sup>st</sup> August' are left untouched."""

    def iso_repl(match):
        year, month, day = match.group(1), int(match.group(2)), int(match.group(3))
        month_name = MONTH_NAMES.get(month)
        if month_name is None:
            return match.group(0)
        return f"{day}<sup>{_ordinal_suffix(day)}</sup> {month_name} {year}"

    def repl(match):
        day = int(match.group(1))
        return f"{day}<sup>{_ordinal_suffix(day)}</sup> {match.group(2)}"

    return ISO_DATE_RE.sub(iso_repl, BARE_DATE_RE.sub(repl, text))


def _add_inline_text(paragraph, text):
    """Split **bold** / *italic* / <sup>superscript</sup> into styled runs."""
    for part in INLINE_RE.split(text):
        if not part:
            continue
        if part.startswith("<sup>") and part.endswith("</sup>"):
            _add_run(paragraph, part[5:-6], superscript=True)
        elif part.startswith("**") and part.endswith("**"):
            _add_run(paragraph, part[2:-2], bold=True)
        elif part.startswith("*") and part.endswith("*"):
            _add_run(paragraph, part[1:-1], italic=True)
        else:
            _add_run(paragraph, part)


def _add_markdown_paragraph(doc, text, style=None, alignment=WD_ALIGN_PARAGRAPH.JUSTIFY):
    """Add a paragraph, honouring **bold**, *italic* and <sup>superscript</sup>."""
    paragraph = doc.add_paragraph(style=style)
    paragraph.alignment = alignment
    _add_inline_text(paragraph, _format_ordinal_dates(text))
    return paragraph


def _strip_inline_markdown(text):
    """Remove bold/italic/code/superscript markers, keeping the inner text."""
    return EMPHASIS_RE.sub(
        lambda m: m.group(1) or m.group(2) or m.group(3) or m.group(4), text
    )


def _split_table_row(line):
    """Split a markdown row like '| A | B |' into trimmed cells."""
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _add_markdown_table(doc, table_lines):
    """Convert a markdown pipe table (header, separator, data rows) to a Word table."""
    rows = []
    for line in table_lines:
        cells = _split_table_row(line)
        # Skip the '|------|--------|' separator row.
        if cells and all(SEPARATOR_RE.match(cell) for cell in cells):
            continue
        rows.append(cells)
    if not rows:
        return

    width = max(len(row) for row in rows)
    header = rows[0] + [""] * (width - len(rows[0]))
    data = [row + [""] * (width - len(row)) for row in rows[1:]]
    _add_data_table(doc, header, data)


def _draft_table_row_count(draft: str) -> int:
    """Count the data rows in the draft's markdown pipe table (0 when absent)."""
    lines = draft.split("\n")
    index = 0
    while index < len(lines):
        if not TABLE_ROW_RE.match(lines[index]):
            index += 1
            continue
        block = []
        while index < len(lines) and TABLE_ROW_RE.match(lines[index]):
            block.append(lines[index])
            index += 1
        count = 0
        for position, line in enumerate(block):
            if position == 0:
                continue  # header row
            cells = _split_table_row(line)
            if cells and all(SEPARATOR_RE.match(cell) for cell in cells):
                continue  # separator row
            count += 1
        return count
    return 0


def _add_draft(doc, draft):
    """Render a drafted section: prose paragraphs, bullets/lists, and any stray
    markdown pipe tables are converted into proper Word tables."""
    lines = draft.split("\n")
    index = 0
    while index < len(lines):
        raw = lines[index].rstrip()
        if not raw.strip():
            index += 1
            continue
        if TABLE_ROW_RE.match(raw):
            # Consume the whole contiguous table block.
            table_lines = []
            while index < len(lines) and TABLE_ROW_RE.match(lines[index]):
                table_lines.append(lines[index])
                index += 1
            _add_markdown_table(doc, table_lines)
            continue
        if BULLET_RE.match(raw):
            _add_markdown_paragraph(doc, BULLET_RE.sub("", raw), style="List Bullet")
        elif NUMBER_RE.match(raw):
            _add_markdown_paragraph(doc, NUMBER_RE.sub("", raw), style="List Number")
        else:
            _add_markdown_paragraph(doc, raw)
        index += 1


def _shade_cell(cell, fill="D9D9D9"):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def _add_data_table(doc, header, data):
    """Build a bordered Word table from a header row and data rows."""
    if not header:
        return
    width = len(header)
    table = doc.add_table(rows=1 + len(data), cols=width)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    for col_index, column in enumerate(header):
        cell = table.rows[0].cells[col_index]
        cell.text = ""
        _add_run(
            cell.paragraphs[0],
            _strip_inline_markdown(_format_ordinal_dates(column)),
            bold=True,
            size=Pt(10),
        )
        _shade_cell(cell)

    for row_index, row in enumerate(data, start=1):
        for col_index in range(width):
            cell_value = row[col_index] if col_index < len(row) else ""
            cell = table.rows[row_index].cells[col_index]
            cell.text = ""
            _add_run(
                cell.paragraphs[0],
                _strip_inline_markdown(_format_ordinal_dates(cell_value)) or "—",
                size=Pt(10),
            )


def _add_rows_table(doc, rows):
    """Render a repeatable rows section (drugs, care plan, outcomes) as a table."""
    header = doc.add_paragraph()
    header.paragraph_format.space_before = Pt(6)
    header.paragraph_format.space_after = Pt(4)
    _add_run(header, rows.get("title", ""), bold=True, size=Pt(11))
    _add_data_table(doc, rows.get("columns") or [], rows.get("data") or [])


def _add_page_number(doc):
    footer = doc.sections[0].footer
    paragraph = footer.paragraphs[0]
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = paragraph.add_run()
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = "PAGE"
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run._r.append(fld_begin)
    run._r.append(instr)
    run._r.append(fld_end)


def _add_title_page(doc, title):
    """Centered title page in the style of the sample care studies."""
    center = WD_ALIGN_PARAGRAPH.CENTER
    _add_markdown_paragraph(doc, "PATIENT/FAMILY CARE STUDY", alignment=center).runs[0].bold = True
    _add_markdown_paragraph(doc, "ON", alignment=center)
    patient = (title.get("patientName") or "").strip()
    if patient:
        p = _add_markdown_paragraph(doc, patient.upper(), alignment=center)
        for run in p.runs:
            run.bold = True
            run.font.size = Pt(14)
    _add_markdown_paragraph(doc, "WITH", alignment=center)
    diagnosis = (title.get("diagnosis") or "").strip()
    if diagnosis:
        p = _add_markdown_paragraph(doc, diagnosis.upper(), alignment=center)
        for run in p.runs:
            run.bold = True
            run.font.size = Pt(14)
    _add_markdown_paragraph(doc, "PRESENTED BY", alignment=center)
    student = (title.get("studentName") or "").strip()
    if student:
        index = (title.get("indexNumber") or "").strip()
        _add_markdown_paragraph(doc, student.upper() + (f" ({index})" if index else ""), alignment=center)
    _add_markdown_paragraph(doc, "A FINAL YEAR STUDENT OF", alignment=center)
    college = (title.get("collegeName") or "").strip()
    location = (title.get("collegeLocation") or "").strip()
    if college:
        _add_markdown_paragraph(
            doc,
            college.upper() + (f", {location.upper()}" if location else ""),
            alignment=center,
        )
    _add_markdown_paragraph(
        doc,
        "A PATIENT AND FAMILY CARE STUDY SUBMITTED TO NURSING AND MIDWIFERY COUNCIL OF GHANA "
        "IN PARTIAL FULFILLMENT OF THE REQUIREMENT FOR THE AWARD OF LICENSE IN GENERAL NURSING",
        alignment=center,
    )
    year = (title.get("year") or "").strip()
    if year:
        p = _add_markdown_paragraph(doc, year, alignment=center)
        p.paragraph_format.space_before = Pt(24)

    doc.add_page_break()


def _chapter_heading(chapters, chapter_index, chapter):
    """Heading for a chapter: 'CHAPTER I: ASSESSMENT' for numbered chapters, or
    the bare name (e.g. 'PRELIMINARY PAGES') for the unnumbered front matter.
    The ordinal counts only non-front-matter chapters, so adding the
    preliminary pages never shifts the I–VI numbering."""
    if chapter.get("isFrontMatter"):
        return chapter.get("name", "").upper()
    ordinal = sum(
        1 for c in chapters[:chapter_index] if not c.get("isFrontMatter")
    )
    return f"CHAPTER {ROMAN[ordinal]}: {chapter.get('name', '').upper()}"


def _add_toc(doc, chapters):
    """Static table of contents (simple and robust — no field update needed)."""
    heading = doc.add_paragraph()
    heading.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_run(heading, "TABLE OF CONTENTS", bold=True, size=Pt(14))

    for chapter_index, chapter in enumerate(chapters):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(8)
        _add_run(p, _chapter_heading(chapters, chapter_index, chapter), bold=True)
        for section in chapter.get("sections", []):
            sp = doc.add_paragraph()
            sp.paragraph_format.left_indent = Inches(0.4)
            sp.paragraph_format.space_after = Pt(2)
            _add_run(sp, f"{section.get('id', '')} {section.get('heading', '')}")

    if not _has_bibliography(chapters):
        references = doc.add_paragraph()
        references.paragraph_format.space_before = Pt(8)
        _add_run(references, "REFERENCES", bold=True)

    doc.add_page_break()


def _strip_duplicate_heading(draft, section):
    """Drop a leading draft line that merely repeats the section heading."""
    lines = draft.split("\n")
    # Skip leading blank lines before inspecting the first content line.
    first_index = 0
    while first_index < len(lines) and not lines[first_index].strip():
        first_index += 1
    if first_index >= len(lines):
        return draft

    def normalize(text):
        return re.sub(r"\s+", " ", re.sub(r"[*_`#]", "", text)).strip().lower()

    first = normalize(lines[first_index])
    expected = normalize(f"{section.get('id', '')} {section.get('heading', '')}")
    if first and (first == expected or first == normalize(section.get("heading", ""))):
        lines = lines[first_index + 1:]
    return "\n".join(lines).strip("\n")


VITAL_LABEL_RE = re.compile(
    r"temperature|pulse|respiration|blood pressure|spo₂|spo2|weight", re.I
)


def _vital_detail(label, value):
    """Vitals carry their unit in the label: "Temperature (°C)" -> "38.7°C"."""
    name = re.sub(r"\(.*\)", "", label).strip()
    unit_match = re.search(r"\(([^)]*)\)", label)
    unit = unit_match.group(1).strip() if unit_match else ""
    detail = value.strip()
    if unit and unit not in detail:
        detail = f"{detail}{unit}" if unit == "%" else f"{detail} {unit}"
    return f"{name} {detail}"
# Long student-written values are already prose — keep them as clean paragraphs.
PROSE_LENGTH = 60


def _prose_date(value):
    """'2026-08-13' -> '13th August, 2026'; anything else passes through."""
    match = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", value.strip())
    if not match:
        return value
    year, month, day = match.groups()
    month_name = MONTH_NAMES.get(int(month))
    if month_name is None:
        return value
    day_number = int(day)
    suffix = (
        "th"
        if 11 <= day_number % 100 <= 13
        else {1: "st", 2: "nd", 3: "rd"}.get(day_number % 10, "th")
    )
    return f"{day_number}{suffix} {month_name}, {year}"


def _join_with_and(items):
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def _particulars_prose(parts):
    """1.1 Patient's Particulars -> one flowing biography paragraph instead of
    one mechanical sentence per field (mirrors particularsProse in App.tsx).

    Returns a list of (label_or_None, text) tuples."""

    def find(pattern):
        for part in parts:
            if pattern.search(part["label"]):
                return part["value"]
        return ""

    name = find(re.compile(r"name\s*/\s*initials|initials", re.I))
    age = find(re.compile(r"^age$", re.I))
    dob = find(re.compile(r"date of birth", re.I))
    sex = find(re.compile(r"^sex$", re.I))
    ethnicity = find(re.compile(r"ethnicity|tribe", re.I))
    religion = find(re.compile(r"religion", re.I))
    marital = find(re.compile(r"marital status", re.I))
    occupation = find(re.compile(r"occupation", re.I))
    address = find(re.compile(r"address|residence", re.I))
    ward = find(re.compile(r"ward|unit", re.I))
    # "Hospital number" must not be mistaken for the facility field.
    facility = find(re.compile(r"facility|hospital(?!\s*number)", re.I))
    admission_date = find(re.compile(r"date.*admission|admission.*date", re.I))
    diagnosis = find(re.compile(r"diagnosis", re.I))
    informant = find(re.compile(r"informant", re.I))

    prose = []

    identity = []
    if sex:
        identity.append(sex.lower())
    age_match = re.match(r"^\d+", age.strip())
    if age_match:
        identity.append(f"aged {age_match.group(0)} years")
    elif dob:
        identity.append(f"born on {_prose_date(dob)}")
    if ethnicity:
        identity.append(f"of the {ethnicity.strip()} tribe")
    if religion:
        rel = religion.strip()
        if re.search(r"christian|muslim|hindu|buddhist", rel, re.I):
            identity.append(f"a {rel}")
        else:
            identity.append(f"of the {rel} faith")
    if marital:
        identity.append(marital.lower())
    if occupation:
        identity.append(f"a {occupation.strip().lower()} by occupation")
    if identity:
        subject = f"The patient, {name.strip()}," if name else "The patient"
        residence = f", residing at {address.strip()}" if address else ""
        prose.append((None, f"{subject} is {_join_with_and(identity)}{residence}."))

    admission = []
    if ward:
        admission.append(f"to the {ward.strip().lower()}")
    if facility:
        admission.append(f"at {facility.strip()}")
    if admission_date:
        admission.append(f"on {_prose_date(admission_date.strip())}")
    if admission:
        if sex and sex.lower() == "female":
            pronoun = "she"
        elif sex:
            pronoun = "he"
        else:
            pronoun = "the patient"
        diagnosis_clause = (
            f" with a diagnosis of {diagnosis.strip()}" if diagnosis else ""
        )
        prose.append(
            (
                None,
                f"{pronoun.capitalize()} was admitted {', '.join(admission)}{diagnosis_clause}.",
            )
        )
    elif diagnosis:
        prose.append((None, f"The admission diagnosis was {diagnosis.strip()}."))

    if informant:
        cleaned = re.sub(r"\s*[-–—]\s*.*$", "", informant.strip()).strip()
        if re.match(r"^him", cleaned, re.I):
            phrase = "the patient himself"
        elif re.match(r"^her", cleaned, re.I):
            phrase = "the patient herself"
        else:
            phrase = cleaned
        reliability = (
            "; the information was deemed reliable"
            if re.search(r"reliab", informant, re.I)
            else ""
        )
        prose.append((None, f"The informant was {phrase}{reliability}."))

    cluster_re = re.compile(
        r"name\s*/\s*initials|initials|^age$|^sex$|ethnicity|tribe|religion|marital "
        r"status|occupation|address|residence|date of birth|ward|unit|facility|"
        r"hospital(?!\s*number)|admission|diagnosis|informant",
        re.I,
    )
    for part in parts:
        if not cluster_re.search(part["label"]):
            prose.append((part["label"], part["value"]))
    return prose


def _generic_prose(parts):
    """All other sections: long student-written values stay as clean paragraphs,
    short facts get a bold-label lead-in, and vitals group into one factual
    list (mirrors genericProse in App.tsx). Returns (label_or_None, text)."""
    prose = []

    vitals = [p for p in parts if VITAL_LABEL_RE.search(p["label"])]
    if vitals:
        details = [_vital_detail(p["label"], p["value"]) for p in vitals]
        text = ", ".join(details)
        prose.append((None, text[0].upper() + text[1:] + "."))
    vital_labels = {p["label"] for p in vitals}

    for part in parts:
        if part["label"] in vital_labels:
            continue
        value = part["value"]
        if len(value) >= PROSE_LENGTH:
            prose.append((None, value))
        else:
            prose.append((part["label"], value))
    return prose


def _field_prose(fields, section_id=""):
    """Compose a section's collected field data into professional prose for the
    Word export (mirrors fieldsToProse in App.tsx). Section 1.1 is composed
    into a flowing biography; every other section renders the student's own
    values as paragraphs with bold-label facts for short entries."""
    parts = [
        {"label": f.get("label") or "", "value": (f.get("value") or "").strip()}
        for f in fields
        if (f.get("value") or "").strip()
    ]
    if section_id == "1.1":
        return _particulars_prose(parts)
    return _generic_prose(parts)


def _render_section(doc, section):
    section_heading = doc.add_paragraph()
    section_heading.paragraph_format.space_before = Pt(10)
    section_heading.paragraph_format.space_after = Pt(4)
    section_heading.paragraph_format.keep_with_next = True
    _add_run(
        section_heading,
        f"{section.get('id', '')} {section.get('heading', '')}".strip(),
        bold=True,
        size=Pt(12),
    )

    draft = _strip_duplicate_heading((section.get("draft") or "").strip(), section)
    fields = [f for f in section.get("fields") or [] if (f.get("value") or "").strip()]
    rows = section.get("rows")
    row_data = rows.get("data") if rows else None
    # An AI-drafted table (e.g. the drugs table in 2.2) IS the section's
    # deliverable and replaces the structured scaffold — UNLESS it omits rows
    # the student entered (models occasionally drop items). In that case the
    # structured table is kept as a safety net so no collected data silently
    # disappears from the export.
    draft_table_rows = _draft_table_row_count(draft)
    student_row_count = len(row_data) if row_data else 0
    draft_has_table = draft_table_rows > 0
    draft_covers_rows = draft_table_rows >= student_row_count

    if draft:
        # A drafted paragraph is the section's content — the fields are NOT
        # dumped underneath it (the draft already narrates that data). This
        # also applies to mixed sections like 5.1: the draft paragraph
        # replaces the field list, while any structured rows still render.
        _add_draft(doc, draft)
    elif fields:
        for label, text in _field_prose(fields, section.get("id", "")):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            if label:
                _add_run(p, f"{label}: ", bold=True)
            _add_inline_text(p, _format_ordinal_dates(text))
    if row_data and (not draft_has_table or not draft_covers_rows):
        _add_rows_table(doc, rows)
    if not draft and not fields and not row_data:
        p = doc.add_paragraph()
        _add_run(p, "Not completed.", italic=True)


def _add_chapter(doc, chapters, chapter_index, chapter, include_intro=True):
    chapter_heading = doc.add_paragraph()
    chapter_heading.paragraph_format.space_before = Pt(14)
    chapter_heading.paragraph_format.space_after = Pt(8)
    chapter_heading.paragraph_format.keep_with_next = True
    _add_run(
        chapter_heading,
        _chapter_heading(chapters, chapter_index, chapter),
        bold=True,
        size=Pt(14),
    )

    intro = (chapter.get("intro") or "").strip()
    if include_intro and intro:
        # Match the sample care studies: a short opening paragraph right under
        # the chapter heading, rendered like a drafted section's prose.
        _add_draft(doc, intro)

    for section in chapter.get("sections", []):
        _render_section(doc, section)


def _collect_references(chapters):
    """Distinct reference labels cited across the given chapters, in order.

    Includes chapter introductions' sources first (they appear earliest in the
    document), then every section's sources."""
    seen = set()
    refs = []

    def add_ref(ref):
        label = (ref.get("label") or "").strip()
        if not label or label in seen:
            return
        seen.add(label)
        refs.append(label)

    for chapter in chapters:
        for ref in chapter.get("introReferences") or []:
            add_ref(ref)
        for section in chapter.get("sections", []):
            for ref in section.get("references") or []:
                add_ref(ref)
    return refs


def _has_bibliography(chapters):
    """True when the student's Bibliography section (6.3) has entries. The
    curated bibliography then replaces the auto-generated REFERENCES page, so
    the document never carries two reference lists."""
    for chapter in chapters:
        for section in chapter.get("sections", []):
            if section.get("id") == "6.3":
                rows = section.get("rows") or {}
                return bool(rows.get("data"))
    return False


def _add_references(doc, chapters, page_break_before=False):
    """End-of-document REFERENCES list, matching the sample care studies."""
    refs = _collect_references(chapters)
    if not refs:
        return
    if page_break_before:
        doc.add_page_break()
    heading = doc.add_paragraph()
    heading.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_run(heading, "REFERENCES", bold=True, size=Pt(14))
    for index, label in enumerate(refs, start=1):
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.left_indent = Inches(0.3)
        p.paragraph_format.first_line_indent = Inches(-0.3)  # hanging indent
        _add_run(p, f"{index}. ")
        _add_inline_text(p, _format_ordinal_dates(label))


def build_docx(payload):
    doc = Document()
    _set_style_font(doc)
    _add_page_number(doc)

    title = payload.get("title") or {}
    chapters = payload.get("chapters") or []
    scope = payload.get("scope") or {}
    scope_type = scope.get("type") or "full"
    # Unknown/invalid scope types render the full study — degrade gracefully
    # rather than leaving chapter/section variables unbound below.
    if scope_type not in ("chapter", "section"):
        scope_type = "full"

    if scope_type in ("chapter", "section"):
        chapter_index = int(scope.get("chapterIndex") or 0)
        chapter = chapters[chapter_index] if 0 <= chapter_index < len(chapters) else None
        if chapter is None:
            scope_type = "full"  # fall back rather than emit an empty document
        elif scope_type == "section":
            section_index = int(scope.get("sectionIndex") or 0)
            sections = chapter.get("sections") or []
            if 0 <= section_index < len(sections):
                # A single-section export renders just that section — the whole
                # chapter's introduction would be context the student didn't ask for.
                chapter = {**chapter, "sections": [sections[section_index]], "intro": ""}
            else:
                scope_type = "full"

    if scope_type == "full":
        _add_title_page(doc, title)
        _add_toc(doc, chapters)
        for chapter_index, chapter in enumerate(chapters):
            _add_chapter(doc, chapters, chapter_index, chapter)
        if not _has_bibliography(chapters):
            _add_references(doc, chapters, page_break_before=True)
    else:
        # Chapter/section exports begin directly with the chapter heading — no
        # title page, TOC, or header block; the full study alone carries those.
        _add_chapter(doc, chapters, chapter_index, chapter)
        if not _has_bibliography([chapter]):
            _add_references(doc, [chapter])

    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", help="Path to a JSON file (defaults to stdin)")
    args = parser.parse_args()

    if args.file:
        with open(args.file, "r", encoding="utf-8") as f:
            payload = json.load(f)
    else:
        # Read stdin as UTF-8 bytes: Windows pipes default to cp1252, which
        # cannot decode every character a drafted section may contain.
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))

    data = build_docx(payload)
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    main()
