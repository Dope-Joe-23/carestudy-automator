"""
Splits a nursing care-study document into (chapter, subsection, heading, text) chunks.

Recognises headers like:
    CHAPTER ONE
    ASSESSMENT OF PATIENT AND FAMILY
    1.0 Introduction
    1.1 Patient's Particulars
    2.3 A. Diagnostic Investigations
"""
import re
from dataclasses import dataclass, asdict
from typing import List

CHAPTER_RE = re.compile(r"^CHAPTER\s+\w+\s*$", re.IGNORECASE)
SUBSECTION_RE = re.compile(r"^\d+\.\d+(\.\d+)?\s+\S.*$")


def clean_heading(text: str) -> str:
    """Strip TOC dot leaders (… runs, dots, dashes), collapse whitespace, and
    normalise smart quotes so headings match typed queries."""
    cleaned = text.rstrip(" .·…—–-•")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned.replace("\u2019", "'").replace("\u2018", "'")


@dataclass
class Chunk:
    chapter: str
    heading: str
    text: str
    source: str


def chunk_document(text: str, source_name: str) -> List[Chunk]:
    lines = text.split("\n")
    chunks: List[Chunk] = []

    current_chapter = "UNSPECIFIED"
    current_heading = "Preamble"
    buffer: List[str] = []

    def flush():
        content = "\n".join(buffer).strip()
        if content:
            chunks.append(Chunk(
                chapter=current_chapter,
                heading=current_heading,
                text=content,
                source=source_name,
            ))
        buffer.clear()

    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        stripped = line.strip()

        if CHAPTER_RE.match(stripped):
            flush()
            current_chapter = clean_heading(stripped).title()
            # the next non-empty line is usually the chapter title, e.g. "ASSESSMENT OF PATIENT AND FAMILY"
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines):
                title = clean_heading(lines[j]).title()
                current_chapter = f"{clean_heading(stripped).title()}: {title}"
                i = j
            current_heading = "Introduction"
            i += 1
            continue

        if SUBSECTION_RE.match(stripped):
            flush()
            current_heading = clean_heading(stripped)
            buffer.append(stripped)
            i += 1
            continue

        buffer.append(line)
        i += 1

    flush()
    return chunks


def chunks_to_dicts(chunks: List[Chunk]):
    return [asdict(c) for c in chunks]
