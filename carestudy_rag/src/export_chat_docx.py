"""Export an assistant response as a readable Word document."""

import json
import re
import sys
from io import BytesIO

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_COLOR_INDEX
from docx.shared import Inches, Pt, RGBColor
from docx.text.paragraph import Paragraph

from student_document_format import split_chapter_front_matter

NMC_DOCUMENT_FORMATTING = {
    "fontFamily": "Times New Roman",
    "fontSize": 12,
    "lineSpacing": 2,
    "indent": 0,
    "alignment": "justify",
}


def _is_table_separator(line: str) -> bool:
    cells = line.strip().strip("|").split("|")
    return bool(cells) and all(re.fullmatch(r"\s*:?-{3,}:?\s*", cell) for cell in cells)


def _table_cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _plain_markdown(text: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</?(?:sub|sup)>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r"\1 (\2)", text)
    text = re.sub(r"(?<!\\)(\*\*|__)(.+?)\1", r"\2", text)
    text = re.sub(r"(?<!\\)(\*|_)(.+?)\1", r"\2", text)
    text = re.sub(r"`{1,3}", "", text)
    return text.replace("\\|", "|")


def _add_markdown_runs(paragraph: Paragraph, text: str, *, bold: bool = False) -> None:
    inline_pattern = re.compile(
        r"(<(?:sub|sup)>.*?</(?:sub|sup)>|\*\*.*?\*\*|__.*?__|"
        r"\+\+.*?\+\+|~~.*?~~|==.*?==|"
        r"(?<!\\)\*[^*\n]+\*|(?<!\\)_[^_\n]+_|`[^`]+`|"
        r"\[[^\]]+\]\(https?://[^)]+\))",
        flags=re.IGNORECASE,
    )
    for part in inline_pattern.split(text):
        if not part:
            continue
        is_subscript = re.fullmatch(r"<sub>(.*?)</sub>", part, flags=re.IGNORECASE)
        is_superscript = re.fullmatch(r"<sup>(.*?)</sup>", part, flags=re.IGNORECASE)
        is_bold = part.startswith(("**", "__")) and part.endswith(part[:2])
        is_italic = (
            (part.startswith("*") and part.endswith("*") and not is_bold)
            or (part.startswith("_") and part.endswith("_") and not is_bold)
        )
        is_underlined = part.startswith("++") and part.endswith("++")
        is_strikethrough = part.startswith("~~") and part.endswith("~~")
        is_highlighted = part.startswith("==") and part.endswith("==")
        is_code = part.startswith("`") and part.endswith("`")
        is_link = re.fullmatch(r"\[([^\]]+)\]\((https?://[^)]+)\)", part)
        if is_subscript or is_superscript:
            value = (is_subscript or is_superscript).group(1)
        elif is_bold or is_italic:
            value = part[2:-2] if is_bold else part[1:-1]
        elif is_underlined or is_strikethrough or is_highlighted:
            value = part[2:-2]
        elif is_code:
            value = part.strip("`")
        elif is_link:
            value = f"{is_link.group(1)} ({is_link.group(2)})"
        else:
            value = part
        run = paragraph.add_run(_plain_markdown(value))
        if bold or is_bold:
            run.bold = True
        if is_subscript:
            run.font.subscript = True
        if is_superscript:
            run.font.superscript = True
        if is_italic:
            run.italic = True
        if is_underlined:
            run.underline = True
        if is_strikethrough:
            run.font.strike = True
        if is_highlighted:
            run.font.highlight_color = WD_COLOR_INDEX.YELLOW
        if is_code:
            run.font.name = "Consolas"
            run.font.size = Pt(9)


def _apply_paragraph_format(paragraph: Paragraph, formatting: dict | None) -> None:
    if not formatting:
        return
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    alignments = {
        "left": WD_ALIGN_PARAGRAPH.LEFT,
        "center": WD_ALIGN_PARAGRAPH.CENTER,
        "right": WD_ALIGN_PARAGRAPH.RIGHT,
        "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
    }
    if formatting.get("alignment") in alignments:
        paragraph.alignment = alignments[formatting["alignment"]]
    paragraph.paragraph_format.line_spacing = float(formatting.get("lineSpacing", 2))
    paragraph.paragraph_format.first_line_indent = Inches(float(formatting.get("indent", 0)))
    for run in paragraph.runs:
        run.font.name = str(formatting.get("fontFamily", "Times New Roman"))
        run.font.size = Pt(float(formatting.get("fontSize", 12)))


def _add_markdown_content(document: Document, answer: str, formatting: dict | None = None) -> None:
    lines = answer.splitlines()
    index = 0
    table_formatting = (
        {**formatting, "fontSize": 10, "alignment": "left"}
        if formatting
        else None
    )
    while index < len(lines):
        line = lines[index].strip()
        if not line:
            index += 1
            continue
        if (
            "|" in line
            and index + 1 < len(lines)
            and _is_table_separator(lines[index + 1])
        ):
            header = _table_cells(line)
            rows = []
            index += 2
            while index < len(lines) and "|" in lines[index]:
                rows.append(_table_cells(lines[index]))
                index += 1
            table = document.add_table(rows=1, cols=len(header))
            table.style = "Light Shading Accent 1"
            for cell, value in zip(table.rows[0].cells, header):
                paragraph = cell.paragraphs[0]
                _add_markdown_runs(paragraph, value, bold=True)
                _apply_paragraph_format(paragraph, table_formatting)
            for row in rows:
                cells = table.add_row().cells
                for column, cell in enumerate(cells):
                    paragraph = cell.paragraphs[0]
                    _add_markdown_runs(
                        paragraph,
                        row[column] if column < len(row) else "",
                    )
                    _apply_paragraph_format(paragraph, table_formatting)
            continue

        heading = re.match(r"^(#{1,3})\s+(.+)$", line)
        paragraph_formatting = formatting
        if heading:
            paragraph = document.add_heading("", level=len(heading.group(1)))
            _add_markdown_runs(paragraph, heading.group(2))
            if formatting:
                paragraph_formatting = {
                    **formatting,
                    "fontSize": 14 if len(heading.group(1)) == 1 else 12,
                    "alignment": "left",
                }
        elif re.match(r"^[-*]\s+", line):
            paragraph = document.add_paragraph(style="List Bullet")
            _add_markdown_runs(paragraph, re.sub(r"^[-*]\s+", "", line))
        elif re.match(r"^\d+[.)]\s+", line):
            paragraph = document.add_paragraph(style="List Number")
            _add_markdown_runs(paragraph, re.sub(r"^\d+[.)]\s+", "", line))
        elif line.startswith(">"):
            paragraph = document.add_paragraph(style="Quote")
            _add_markdown_runs(paragraph, line.lstrip("> "))
        elif line.startswith("```"):
            index += 1
            code_lines = []
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code_lines.append(lines[index])
                index += 1
            paragraph = document.add_paragraph()
            run = paragraph.add_run("\n".join(code_lines))
            run.font.name = "Consolas"
            run.font.size = Pt(9)
        else:
            paragraph = document.add_paragraph()
            _add_markdown_runs(paragraph, line)
        _apply_paragraph_format(paragraph, paragraph_formatting)
        index += 1


def export_chat_docx(
    title: str,
    answer: str,
    references: list[dict] | None = None,
) -> bytes:
    document = Document()
    section = document.sections[0]
    section.top_margin = Inches(0.7)
    section.bottom_margin = Inches(0.7)
    section.left_margin = Inches(0.8)
    section.right_margin = Inches(0.8)
    document.styles["Normal"].font.name = "Aptos"
    document.styles["Normal"].font.size = Pt(10.5)
    document.add_heading(title, level=0)

    _add_markdown_content(document, answer)

    if references:
        document.add_heading("References", level=1)
        for index, reference in enumerate(references, start=1):
            label = str(reference.get("label", "")).strip()
            url = str(reference.get("url") or "").strip()
            if not label:
                continue
            paragraph = document.add_paragraph()
            _add_markdown_runs(paragraph, f"[{index}] {label}")
            if url:
                _add_markdown_runs(paragraph, f" — {url}")

    output = BytesIO()
    document.save(output)
    return output.getvalue()


def export_document_work_docx(title: str, chapters: list[dict]) -> bytes:
    document = Document()
    section = document.sections[0]
    section.top_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)
    normal_style = document.styles["Normal"]
    normal_style.font.name = "Times New Roman"
    normal_style.font.size = Pt(12)
    normal_style.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    normal_style.paragraph_format.line_spacing = 2
    normal_style.paragraph_format.first_line_indent = Inches(0)
    normal_style.paragraph_format.space_after = Pt(6)
    for style_name, size, before, after in (
        ("Heading 1", 14, 14, 8),
        ("Heading 2", 12, 10, 4),
        ("Heading 3", 12, 8, 4),
    ):
        heading_style = document.styles[style_name]
        heading_style.font.name = "Times New Roman"
        heading_style.font.size = Pt(size)
        heading_style.font.bold = True
        heading_style.font.color.rgb = RGBColor(0, 0, 0)
        heading_style.paragraph_format.space_before = Pt(before)
        heading_style.paragraph_format.space_after = Pt(after)
    document.core_properties.title = title

    for index, chapter in enumerate(chapters):
        formatting = chapter.get("formatting") or NMC_DOCUMENT_FORMATTING
        if index == 0 and formatting:
            section.bottom_margin = Inches(float(formatting.get("bottomMargin", 1)))
        chapter_heading, chapter_title, content = split_chapter_front_matter(
            str(chapter["name"]),
            str(chapter["content"]),
        )
        if chapter_heading:
            heading = document.add_heading("", level=1)
            _add_markdown_runs(heading, chapter_heading, bold=True)
            _apply_paragraph_format(
                heading,
                {**formatting, "fontSize": 14, "alignment": "center"},
            )
        if chapter_title:
            title_paragraph = document.add_paragraph()
            _add_markdown_runs(title_paragraph, chapter_title, bold=True)
            _apply_paragraph_format(
                title_paragraph,
                {**formatting, "fontSize": 14, "alignment": "center"},
            )
        _add_markdown_content(document, content, formatting)

    output = BytesIO()
    document.save(output)
    return output.getvalue()


def main() -> None:
    payload = json.load(sys.stdin)
    if not isinstance(payload, dict):
        raise ValueError("An export payload is required.")
    if isinstance(payload.get("chapters"), list):
        chapters = payload["chapters"]
        if not chapters or not all(
            isinstance(chapter, dict)
            and isinstance(chapter.get("name"), str)
            and isinstance(chapter.get("content"), str)
            for chapter in chapters
        ):
            raise ValueError("A non-empty list of document chapters is required.")
        sys.stdout.buffer.write(
            export_document_work_docx(
                str(payload.get("title", "Care study")),
                chapters,
            )
        )
        return
    if not isinstance(payload.get("answer"), str):
        raise ValueError("A title and answer are required.")
    references = payload.get("references")
    if references is not None and not isinstance(references, list):
        raise ValueError("References must be a list.")
    sys.stdout.buffer.write(
        export_chat_docx(
            str(payload.get("title", "Nursuit response")),
            payload["answer"],
            references,
        )
    )


if __name__ == "__main__":
    main()
