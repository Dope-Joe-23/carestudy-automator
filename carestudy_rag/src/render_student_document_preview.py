"""Render unpaid student document previews as watermarked, non-selectable page images."""

import base64
import json
import re
import sys
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import Any
from html import unescape

from PIL import Image, ImageDraw, ImageFont

from student_document_format import split_chapter_front_matter as _split_chapter_front_matter

PAGE_WIDTH = 816
PAGE_HEIGHT = 1056
PAGE_MARGIN = 96
BODY_FONT_SIZE = 16
BODY_LINE_HEIGHT = 24
MAX_PREVIEW_CHARS = 100_000
MAX_PREVIEW_PAGES = 40

FONT_PATHS = {
    "regular": (
        r"C:\Windows\Fonts\times.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/Times_New_Roman.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
    ),
    "italic": (
        r"C:\Windows\Fonts\timesi.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSerif-Italic.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf",
    ),
    "bold": (
        r"C:\Windows\Fonts\timesbd.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/Times_New_Roman_Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    ),
    "bold_italic": (
        r"C:\Windows\Fonts\timesbi.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSerif-BoldItalic.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-BoldItalic.ttf",
    ),
    "code": (
        r"C:\Windows\Fonts\consola.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    ),
}


@lru_cache(maxsize=32)
def _font(weight: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in FONT_PATHS[weight]:
        if not Path(candidate).is_file():
            continue
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def _weight_for(styles: frozenset[str]) -> str:
    if "code" in styles:
        return "code"
    if "bold" in styles and "italic" in styles:
        return "bold_italic"
    if "bold" in styles:
        return "bold"
    if "italic" in styles:
        return "italic"
    return "regular"


@lru_cache(maxsize=8192)
def _measure(text: str, styles: frozenset[str], size: int) -> float:
    text_size = max(8, round(size * 0.7)) if {"sup", "sub"} & styles else size
    return _font(_weight_for(styles), text_size).getlength(text)


INLINE_MARKDOWN = re.compile(
    r"(?<!\\)(\*\*.*?\*\*|__.*?__|~~.*?~~|==.*?==|\+\+.*?\+\+|"
    r"<(?:sup|sub)>.*?</(?:sup|sub)>|<mark>.*?</mark>|<u>.*?</u>|<br\s*/?>|"
    r"\*[^*\n]+\*|_[^_\n]+_|`[^`]+`|\[[^\]]+\]\(https?://[^)]+\))",
    flags=re.IGNORECASE,
)


def _inline_spans(text: str, styles: frozenset[str] = frozenset()) -> list[tuple[str, frozenset[str]]]:
    spans: list[tuple[str, frozenset[str]]] = []
    for part in INLINE_MARKDOWN.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") or part.startswith("__") and part.endswith("__"):
            spans.extend(_inline_spans(part[2:-2], styles | {"bold"}))
        elif part.startswith("~~") and part.endswith("~~"):
            spans.extend(_inline_spans(part[2:-2], styles | {"strike"}))
        elif part.startswith("==") and part.endswith("=="):
            spans.extend(_inline_spans(part[2:-2], styles | {"highlight"}))
        elif part.startswith("++") and part.endswith("++"):
            spans.extend(_inline_spans(part[2:-2], styles | {"underline"}))
        elif part.lower().startswith("<sup>") and part.lower().endswith("</sup>"):
            spans.extend(_inline_spans(part[5:-6], styles | {"sup"}))
        elif part.lower().startswith("<sub>") and part.lower().endswith("</sub>"):
            spans.extend(_inline_spans(part[5:-6], styles | {"sub"}))
        elif part.lower().startswith("<mark>") and part.lower().endswith("</mark>"):
            spans.extend(_inline_spans(part[6:-7], styles | {"highlight"}))
        elif part.lower().startswith("<u>") and part.lower().endswith("</u>"):
            spans.extend(_inline_spans(part[3:-4], styles | {"underline"}))
        elif re.fullmatch(r"<br\s*/?>", part, flags=re.IGNORECASE):
            spans.append(("\n", styles))
        elif part.startswith("`") and part.endswith("`"):
            spans.extend(_inline_spans(part[1:-1], styles | {"code"}))
        elif part.startswith("[") and "](" in part and part.endswith(")"):
            label, url = re.match(r"\[([^\]]+)\]\((https?://[^)]+)\)", part).groups()
            spans.extend(_inline_spans(label, styles | {"link"}))
            spans.append((f" ({url})", styles))
        elif part.startswith("*") and part.endswith("*") or part.startswith("_") and part.endswith("_"):
            spans.extend(_inline_spans(part[1:-1], styles | {"italic"}))
        else:
            spans.append((unescape(part.replace(r"\|", "|")), styles))
    return spans


def _wrap_spans(
    spans: list[tuple[str, frozenset[str]]],
    font_size: int,
    max_width: int,
) -> list[list[tuple[str, frozenset[str], float, float]]]:
    lines: list[list[tuple[str, frozenset[str], float, float]]] = []
    current: list[tuple[str, frozenset[str], float, float]] = []
    current_width = 0.0
    pending_space = False
    for text, styles in spans:
        for token in re.findall(r"\n|\s+|\S+", text):
            if token == "\n":
                lines.append(current)
                current = []
                current_width = 0
                pending_space = False
                continue
            if token.isspace():
                pending_space = True
                continue
            word_width = _measure(token, styles, font_size)
            space_width = _measure(" ", styles, font_size) if current and pending_space else 0.0
            if current and current_width + space_width + word_width > max_width:
                lines.append(current)
                current = []
                current_width = 0
                space_width = 0
            current.append((token, styles, word_width, space_width))
            current_width += space_width + word_width
            pending_space = False
    if current or not lines:
        lines.append(current)
    return lines


def _draw_inline_line(
    draw: ImageDraw.ImageDraw,
    line: list[tuple[str, frozenset[str], float, float]],
    x: float,
    y: float,
    max_width: int,
    font_size: int,
    line_height: int,
    *,
    alignment: str = "left",
    justify: bool = False,
) -> None:
    if not line:
        return
    line_width = sum(space_width + word_width for _, _, word_width, space_width in line)
    if alignment == "center":
        x += max(0, (max_width - line_width) / 2)
    elif alignment == "right":
        x += max(0, max_width - line_width)
    extra_space = (
        max(0, max_width - line_width) / (len(line) - 1)
        if justify and len(line) > 1
        else 0
    )
    for index, (word, styles, word_width, space_width) in enumerate(line):
        x += space_width + (extra_space if index else 0)
        text_size = max(8, round(font_size * 0.7)) if {"sup", "sub"} & styles else font_size
        font = _font(_weight_for(styles), text_size)
        text_y = y - 4 if "sup" in styles else y + 4 if "sub" in styles else y
        color = (0, 85, 155) if "link" in styles else (15, 23, 42)
        if "highlight" in styles or "code" in styles:
            background = (255, 244, 170) if "highlight" in styles else (238, 240, 244)
            draw.rectangle((x - 1, y + 1, x + word_width + 1, y + line_height - 2), fill=background)
        draw.text((x, text_y), word, font=font, fill=color)
        if "underline" in styles or "link" in styles:
            draw.line((x, y + line_height - 3, x + word_width, y + line_height - 3), fill=color, width=1)
        if "strike" in styles:
            draw.line((x, y + line_height // 2, x + word_width, y + line_height // 2), fill=color, width=1)
        x += word_width


def _is_table_separator(line: str) -> bool:
    cells = _table_cells(line)
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells)


def _table_cells(line: str) -> list[str]:
    return [
        cell.strip().replace(r"\|", "|")
        for cell in re.split(r"(?<!\\)\|", line.strip().strip("|"))
    ]


def _document_blocks(content: str) -> list[tuple[str, Any]]:
    blocks: list[tuple[str, Any]] = []
    paragraph: list[str] = []

    def flush_paragraph() -> None:
        if paragraph:
            text = " ".join(line.strip() for line in paragraph if line.strip())
            if text:
                blocks.append(("body", text))
            paragraph.clear()

    lines = content.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        if not line:
            flush_paragraph()
            index += 1
            continue
        if line.startswith("```"):
            flush_paragraph()
            code_lines: list[str] = []
            index += 1
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code_lines.append(lines[index])
                index += 1
            blocks.append(("code", "\n".join(code_lines)))
            if index < len(lines):
                index += 1
            continue
        if (
            "|" in line
            and index + 1 < len(lines)
            and _is_table_separator(lines[index + 1].strip())
        ):
            flush_paragraph()
            header = _table_cells(line)
            alignments = []
            for cell in _table_cells(lines[index + 1].strip()):
                left = cell.startswith(":")
                right = cell.endswith(":")
                alignments.append(
                    "center" if left and right else "left" if left or not right else "right"
                )
            rows: list[list[str]] = []
            index += 2
            while index < len(lines) and "|" in lines[index]:
                rows.append(_table_cells(lines[index].strip()))
                index += 1
            blocks.append(("table", {"header": header, "rows": rows, "alignments": alignments}))
            continue
        heading = re.match(r"^(#{1,6})\s+(.+)$", line)
        if heading:
            flush_paragraph()
            blocks.append((f"heading-{len(heading.group(1))}", heading.group(2)))
            index += 1
            continue
        if re.fullmatch(r"[-*_]{3,}", line):
            flush_paragraph()
            blocks.append(("divider", ""))
            index += 1
            continue
        if re.match(r"^[-*+]\s+", line):
            flush_paragraph()
            blocks.append(("list", f"• {re.sub(r'^[-*+]\s+', '', line)}"))
            index += 1
            continue
        numbered = re.match(r"^(\d+)[.)]\s+(.+)$", line)
        if numbered:
            flush_paragraph()
            blocks.append(("list", f"{numbered.group(1)}. {numbered.group(2)}"))
            index += 1
            continue
        if line.startswith(">"):
            flush_paragraph()
            blocks.append(("quote", line.lstrip("> ").strip()))
            index += 1
            continue
        paragraph.append(line)
        index += 1
    flush_paragraph()
    return blocks


def _watermark(page: Image.Image) -> Image.Image:
    overlay = Image.new("RGBA", page.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)
    watermark_font = _font("bold", 30)
    label = "NURSUIT - UNPAID PREVIEW"
    width = int(draw.textlength(label, font=watermark_font))
    draw.text(
        ((PAGE_WIDTH - width) / 2, PAGE_HEIGHT / 2 - 20),
        label,
        font=watermark_font,
        fill=(110, 110, 110, 55),
    )
    rotated = overlay.rotate(35, resample=Image.Resampling.BICUBIC)
    page_rgba = page.convert("RGBA")
    page_rgba.alpha_composite(rotated, ((PAGE_WIDTH - rotated.width) // 2, (PAGE_HEIGHT - rotated.height) // 2))
    return page_rgba.convert("RGB")


def _encode_page(page: Image.Image, page_number: int, page_count: int) -> str:
    draw = ImageDraw.Draw(page)
    footer_font = _font("regular", 11)
    footer = f"Preview only - GH₵50 unlocks editing and export    Page {page_number} of {page_count}"
    footer_width = draw.textlength(footer, font=footer_font)
    draw.text(
        ((PAGE_WIDTH - footer_width) / 2, PAGE_HEIGHT - 45),
        footer,
        font=footer_font,
        fill=(90, 90, 90),
    )
    page = _watermark(page)
    output = BytesIO()
    page.save(output, format="PNG", compress_level=2)
    return f"data:image/png;base64,{base64.b64encode(output.getvalue()).decode('ascii')}"


def render_document_preview(chapter_name: str, content: str) -> list[str]:
    if not chapter_name.strip() or not content.strip():
        raise ValueError("A chapter name and chapter content are required.")
    if len(content) > MAX_PREVIEW_CHARS:
        raise ValueError("This chapter is too large to render as a preview.")

    page = Image.new("RGB", (PAGE_WIDTH, PAGE_HEIGHT), "white")
    draw = ImageDraw.Draw(page)
    y = PAGE_MARGIN
    max_width = PAGE_WIDTH - PAGE_MARGIN * 2
    page_bottom = PAGE_HEIGHT - PAGE_MARGIN
    pages: list[Image.Image] = []
    chapter_heading, chapter_title, body_content = _split_chapter_front_matter(
        chapter_name,
        content,
    )

    def new_page() -> None:
        nonlocal page, draw, y
        pages.append(page)
        if len(pages) >= MAX_PREVIEW_PAGES:
            raise ValueError("This chapter is too long to render as a preview.")
        page = Image.new("RGB", (PAGE_WIDTH, PAGE_HEIGHT), "white")
        draw = ImageDraw.Draw(page)
        y = PAGE_MARGIN

    for front_matter, font_size, line_height in (
        (chapter_heading, 20, 28),
        (chapter_title, 18, 26),
    ):
        if not front_matter:
            continue
        for line in _wrap_spans(
            _inline_spans(front_matter, frozenset({"bold"})),
            font_size,
            max_width,
        ):
            if y + line_height > page_bottom:
                new_page()
            _draw_inline_line(
                draw,
                line,
                PAGE_MARGIN,
                y,
                max_width,
                font_size,
                line_height,
                alignment="center",
            )
            y += line_height
        y += 4
    y += 12

    def draw_table_row(
        cells: list[str],
        widths: list[int],
        alignments: list[str],
        *,
        bold: bool,
        repeat_header: bool = True,
    ) -> None:
        nonlocal y
        line_height = 18
        padding = 6
        font_size = 13
        layouts = [
            _wrap_spans(
                _inline_spans(cell, frozenset({"bold"}) if bold else frozenset()),
                font_size,
                width - padding * 2,
            )
            for cell, width in zip(cells, widths)
        ]
        max_lines = max((len(layout) for layout in layouts), default=1)
        offset = 0
        while offset < max_lines:
            available_lines = int((page_bottom - y - padding * 2) // line_height)
            if available_lines <= 0:
                new_page()
                if repeat_header and not bold:
                    draw_table_row(header_cells, widths, alignments, bold=True, repeat_header=False)
                continue
            line_count = min(max_lines - offset, available_lines)
            row_height = line_count * line_height + padding * 2
            x = PAGE_MARGIN
            for column, width in enumerate(widths):
                top = y
                fill = (232, 237, 244) if bold else (255, 255, 255)
                draw.rectangle((x, top, x + width, top + row_height), fill=fill, outline=(175, 184, 196))
                for line_index in range(offset, min(offset + line_count, len(layouts[column]))):
                    _draw_inline_line(
                        draw,
                        layouts[column][line_index],
                        x + padding,
                        top + padding + (line_index - offset) * line_height,
                        width - padding * 2,
                        font_size,
                        line_height,
                        alignment=alignments[column],
                    )
                x += width
            y += row_height
            offset += line_count
            if offset < max_lines:
                new_page()
                if repeat_header and not bold:
                    draw_table_row(header_cells, widths, alignments, bold=True, repeat_header=False)

    for kind, raw_block in _document_blocks(body_content):
        if kind == "table":
            header_cells = raw_block["header"]
            rows = raw_block["rows"]
            column_count = max(
                len(header_cells),
                max((len(row) for row in rows), default=0),
            )
            if not column_count:
                continue
            widths = [max_width // column_count] * column_count
            widths[-1] += max_width - sum(widths)
            header_cells = header_cells + [""] * (column_count - len(header_cells))
            alignments = raw_block["alignments"] + ["left"] * (
                column_count - len(raw_block["alignments"])
            )
            draw_table_row(header_cells, widths, alignments, bold=True, repeat_header=False)
            for row in rows:
                row_cells = row + [""] * (column_count - len(row))
                draw_table_row(row_cells, widths, alignments, bold=False)
            y += 10
            continue

        if kind == "divider":
            if y + 12 > page_bottom:
                new_page()
            draw.line((PAGE_MARGIN, y + 5, PAGE_WIDTH - PAGE_MARGIN, y + 5), fill=(150, 158, 170), width=1)
            y += 16
            continue

        is_heading = kind.startswith("heading")
        is_quote = kind == "quote"
        is_code = kind == "code"
        base_styles = frozenset({"bold"}) if is_heading else frozenset({"code"}) if is_code else frozenset()
        font_size = 19 if kind == "heading-1" else 16 if is_heading else BODY_FONT_SIZE
        line_height = 26 if kind == "heading-1" else 24 if is_heading else BODY_LINE_HEIGHT
        indent = 22 if is_quote else 0
        if is_heading:
            y += 8
        if is_code:
            spans = [(str(raw_block), base_styles)]
        else:
            spans = _inline_spans(str(raw_block), base_styles)
        wrapped_lines = _wrap_spans(spans, font_size, max_width - indent)
        for line_index, line in enumerate(wrapped_lines):
            if y + line_height > page_bottom:
                new_page()
            if is_quote:
                draw.line(
                    (PAGE_MARGIN + 5, y, PAGE_MARGIN + 5, y + line_height),
                    fill=(112, 145, 177),
                    width=2,
                )
            _draw_inline_line(
                draw,
                line,
                PAGE_MARGIN + indent,
                y,
                max_width - indent,
                font_size,
                line_height,
                alignment="left" if is_heading or is_quote or is_code or kind == "list" else "justify",
                justify=kind == "body" and line_index < len(wrapped_lines) - 1,
            )
            y += line_height
        y += 8 if is_heading else 7

    pages.append(page)
    if len(pages) > MAX_PREVIEW_PAGES:
        raise ValueError("This chapter is too long to render as a preview.")
    page_count = len(pages)
    return [
        _encode_page(page_image, index, page_count)
        for index, page_image in enumerate(pages, start=1)
    ]


def main() -> None:
    try:
        request: Any = json.load(sys.stdin)
        pages = render_document_preview(
            request.get("chapterName", ""),
            request.get("content", ""),
        )
        print(json.dumps({"pages": pages}, separators=(",", ":")))
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
