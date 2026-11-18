"""Formatting helpers shared by student document previews and exports."""

import re


def _clean_title(value: str) -> str:
    return re.sub(r"^(?:\*\*|__)(.*?)(?:\*\*|__)$", r"\1", value.strip()).strip()


def _title_from_chapter_name(chapter_name: str) -> str:
    match = re.match(
        r"^\s*(?:case|care\s+study\s+)?chapter\s+"
        r"(?:\d+|one|two|three|four|five|six|first|second|third|fourth|fifth|sixth|i|ii|iii|iv|v|vi)"
        r"\s*[:\-–—]\s*(.+?)\s*$",
        chapter_name,
        re.IGNORECASE,
    )
    return _clean_title(match.group(1)) if match else ""


def split_chapter_front_matter(
    chapter_name: str,
    content: str,
) -> tuple[str | None, str | None, str]:
    lines = content.replace("\r", "").splitlines()
    heading_index = next((index for index, line in enumerate(lines) if line.strip()), None)
    if heading_index is None:
        return None, None, content

    if re.fullmatch(r"<!--\s*align:center\s*-->", lines[heading_index].strip(), re.IGNORECASE):
        heading_index += 1
        while heading_index < len(lines) and not lines[heading_index].strip():
            heading_index += 1
    if heading_index >= len(lines):
        return None, None, content

    heading_line = re.sub(r"^\s*#{1,6}\s*", "", lines[heading_index].strip())
    heading_line = re.sub(r"(?:\*\*|__)", "", heading_line)
    match = re.match(
        r"^(?:(?:case|care\s+study)\s+)?chapter\s+"
        r"(?P<number>\d+|one|two|three|four|five|six|first|second|third|fourth|fifth|sixth|i|ii|iii|iv|v|vi)\b"
        r"(?P<tail>.*)$",
        heading_line,
        re.IGNORECASE,
    )
    if not match:
        return None, None, content

    number = match.group("number").lower()
    chapter_words = {
        "1": "ONE", "one": "ONE", "first": "ONE",
        "2": "TWO", "two": "TWO", "second": "TWO",
        "3": "THREE", "three": "THREE", "third": "THREE",
        "4": "FOUR", "four": "FOUR", "fourth": "FOUR",
        "5": "FIVE", "five": "FIVE", "fifth": "FIVE",
        "6": "SIX", "six": "SIX", "sixth": "SIX",
        "i": "I", "ii": "II", "iii": "III",
        "iv": "IV", "v": "V", "vi": "VI",
    }
    chapter_heading = f"CHAPTER {chapter_words.get(number, number.upper())}:"
    title = _clean_title(match.group("tail").strip().lstrip(" :.-–—"))
    body_start = heading_index + 1

    if not title:
        name_title = _title_from_chapter_name(chapter_name)
        next_content_index = body_start
        while next_content_index < len(lines):
            candidate_line = lines[next_content_index].strip()
            if not candidate_line or re.fullmatch(
                r"<!--\s*align:center\s*-->",
                candidate_line,
                re.IGNORECASE,
            ):
                next_content_index += 1
                continue
            break
        candidate = _clean_title(
            re.sub(r"^#{1,6}\s*", "", lines[next_content_index].strip())
            if next_content_index < len(lines)
            else ""
        )
        is_section_heading = bool(
            re.match(r"^(?:#{1,6}\s*)?\d+(?:\.\d+)+\s+", candidate)
        )
        looks_like_title = (
            candidate
            and len(candidate) <= 160
            and not re.search(r"[.!?;]$", candidate)
            and not re.match(r"^(?:[-*+]|\||```)", candidate)
        )
        if (
            not is_section_heading
            and looks_like_title
            and (candidate.upper() == candidate or candidate.casefold() == name_title.casefold())
        ):
            title = candidate
            body_start = next_content_index + 1
        elif name_title:
            title = name_title
            if candidate.casefold() == name_title.casefold():
                body_start = next_content_index + 1

    return chapter_heading, title or None, "\n".join(lines[body_start:]).lstrip()
