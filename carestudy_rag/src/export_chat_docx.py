"""Export an assistant response as a readable Word document."""

import json
import re
import sys
from io import BytesIO

from docx import Document
from docx.shared import Inches, Pt
from docx.text.paragraph import Paragraph


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
        is_code = part.startswith("`") and part.endswith("`")
        is_link = re.fullmatch(r"\[([^\]]+)\]\((https?://[^)]+)\)", part)
        if is_subscript or is_superscript:
            value = (is_subscript or is_superscript).group(1)
        elif is_bold or is_italic:
            value = part[2:-2] if is_bold else part[1:-1]
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
        if is_code:
            run.font.name = "Consolas"
            run.font.size = Pt(9)


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

    lines = answer.splitlines()
    index = 0
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
                _add_markdown_runs(cell.paragraphs[0], value, bold=True)
            for row in rows:
                cells = table.add_row().cells
                for column, cell in enumerate(cells):
                    _add_markdown_runs(
                        cell.paragraphs[0],
                        row[column] if column < len(row) else "",
                    )
            continue

        heading = re.match(r"^(#{1,3})\s+(.+)$", line)
        if heading:
            paragraph = document.add_heading("", level=len(heading.group(1)))
            _add_markdown_runs(paragraph, heading.group(2))
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
        index += 1

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


def main() -> None:
    payload = json.load(sys.stdin)
    if not isinstance(payload, dict) or not isinstance(payload.get("answer"), str):
        raise ValueError("A title and answer are required.")
    references = payload.get("references")
    if references is not None and not isinstance(references, list):
        raise ValueError("References must be a list.")
    sys.stdout.buffer.write(
        export_chat_docx(
            str(payload.get("title", "NurseAid response")),
            payload["answer"],
            references,
        )
    )


if __name__ == "__main__":
    main()
