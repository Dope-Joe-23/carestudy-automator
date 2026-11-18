type ParagraphStyle = {
  align?: "left" | "center" | "right" | "justify";
  spacing?: number;
  indent?: number;
};

const CHAPTER_NUMBER_WORDS: Record<string, string> = {
  "1": "ONE",
  one: "ONE",
  first: "ONE",
  "2": "TWO",
  two: "TWO",
  second: "TWO",
  "3": "THREE",
  three: "THREE",
  third: "THREE",
  "4": "FOUR",
  four: "FOUR",
  fourth: "FOUR",
  "5": "FIVE",
  five: "FIVE",
  fifth: "FIVE",
  "6": "SIX",
  six: "SIX",
  sixth: "SIX",
  i: "I",
  ii: "II",
  iii: "III",
  iv: "IV",
  v: "V",
  vi: "VI",
};

function cleanChapterTitle(value: string): string {
  return value
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^(?:\*\*|__)(.*?)(?:\*\*|__)$/, "$1")
    .trim();
}

function chapterTitleFromName(chapterName: string): string {
  const match = chapterName.match(
    /^\s*(?:case|care\s+study\s+)?chapter\s+(?:\d+|one|two|three|four|five|six|first|second|third|fourth|fifth|sixth|i|ii|iii|iv|v|vi)\s*[:\-–—]\s*(.+?)\s*$/i,
  );
  return match ? cleanChapterTitle(match[1]) : "";
}

export function formatStudentChapterContent(content: string, chapterName = ""): string {
  const normalizedContent = content.replace(/\r/g, "");
  if (
    /^\s*<!--\s*align:center\s*-->\s*\n\s*#\s+\*\*CHAPTER\s+/i.test(normalizedContent)
  ) {
    return normalizedContent.trimStart();
  }

  const lines = normalizedContent.split("\n");
  const headingIndex = lines.findIndex((line) => line.trim());
  if (headingIndex < 0) return content;

  const headingLine = lines[headingIndex]
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/(?:\*\*|__)/g, "");
  const match = headingLine.match(
    /^(?:(?:case|care\s+study)\s+)?chapter\s+(?<number>\d+|one|two|three|four|five|six|first|second|third|fourth|fifth|sixth|i|ii|iii|iv|v|vi)\b(?:(?:\s*[:.\-–—]\s*|\s+)(?<title>.*))?$/i,
  );
  if (!match?.groups) return content;

  const number = match.groups.number.toLowerCase();
  const chapterNumber = CHAPTER_NUMBER_WORDS[number] ?? number.toUpperCase();
  let title = cleanChapterTitle(match.groups.title ?? "");
  let bodyStart = headingIndex + 1;
  const nameTitle = chapterTitleFromName(chapterName);

  if (!title) {
    let nextContentIndex = bodyStart;
    while (nextContentIndex < lines.length && !lines[nextContentIndex].trim()) {
      nextContentIndex += 1;
    }
    const candidate = cleanChapterTitle(lines[nextContentIndex] ?? "");
    const isSectionHeading = /^(?:#{1,6}\s*)?\d+(?:\.\d+)+\s+/.test(candidate);
    const isStandaloneTitle =
      candidate.length > 0 &&
      candidate.length <= 160 &&
      !/[.!?;]$/.test(candidate) &&
      !/^(?:[-*+]|\||```)/.test(candidate);
    if (
      !isSectionHeading &&
      isStandaloneTitle &&
      (candidate.toLocaleUpperCase() === candidate || candidate.toLocaleLowerCase() === nameTitle.toLocaleLowerCase())
    ) {
      title = candidate;
      bodyStart = nextContentIndex + 1;
    } else if (nameTitle) {
      title = nameTitle;
    }
  }

  const body = lines.slice(bodyStart).join("\n").trimStart();
  const frontMatter = [
    "<!-- align:center -->",
    `# **CHAPTER ${chapterNumber}:**`,
    ...(title ? ["", "<!-- align:center -->", `**${title}**`] : []),
  ].join("\n");
  return body ? `${frontMatter}\n\n${body}` : frontMatter;
}

function directiveLineFor(style: ParagraphStyle): string {
  const parts: string[] = [];
  if (style.align) parts.push(`align:${style.align}`);
  if (style.spacing !== undefined) parts.push(`spacing:${style.spacing}`);
  if (style.indent !== undefined) parts.push(`indent:${style.indent}`);
  return parts.length ? `<!-- ${parts.join(" ")} -->` : "";
}

function paragraphDirective(element: HTMLElement): string {
  const style: ParagraphStyle = {};
  const align = element.style.textAlign;
  const spacing = Number.parseFloat(element.style.lineHeight);
  const indent = Number.parseFloat(element.style.textIndent);
  if (align && ["left", "center", "right", "justify"].includes(align)) {
    style.align = align as ParagraphStyle["align"];
  }
  if (Number.isFinite(spacing)) style.spacing = spacing;
  if (Number.isFinite(indent)) style.indent = indent / 96;
  return directiveLineFor(style);
}

function childrenToInlineMarkdown(element: Element): string {
  return Array.from(element.childNodes)
    .map((child) => inlineMarkdown(child))
    .join("");
}

function inlineMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\u00a0/g, " ");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  const inner = childrenToInlineMarkdown(element);
  if (tag === "br") return "  \n";
  if (tag === "strong" || tag === "b") return `**${inner}**`;
  if (tag === "em" || tag === "i") return `*${inner}*`;
  if (tag === "mark" || element.style.backgroundColor) {
    return `<mark>${inner}</mark>`;
  }
  if (tag === "u" || element.style.textDecorationLine.includes("underline")) {
    return `<u>${inner}</u>`;
  }
  if (["s", "strike", "del"].includes(tag) || element.style.textDecorationLine.includes("line-through")) {
    return `~~${inner}~~`;
  }
  if (tag === "sup" || tag === "sub") return `<${tag}>${inner}</${tag}>`;
  if (tag === "code") return `\`${inner}\``;
  if (tag === "a") {
    const href = element.getAttribute("href") ?? "";
    return /^https?:\/\//i.test(href) ? `[${inner}](${href})` : inner;
  }
  return inner;
}

function tableMarkdown(table: HTMLTableElement): string {
  const rows = Array.from(table.rows).map((row) =>
    Array.from(row.cells).map((cell) =>
      childrenToInlineMarkdown(cell).replace(/\s*\n\s*/g, " ").trim().replace(/\|/g, "\\|"),
    ),
  );
  if (!rows.length) return "";
  const columnCount = Math.max(...rows.map((row) => row.length));
  const header = Array.from({ length: columnCount }, (_, index) => rows[0][index] ?? "");
  const separator = header.map(() => "---");
  return [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...rows.slice(1).map((row) =>
      `| ${Array.from({ length: columnCount }, (_, index) => row[index] ?? "").join(" | ")} |`,
    ),
  ].join("\n");
}

function listMarkdown(element: HTMLElement, depth = 0): string {
  const ordered = element.tagName.toLowerCase() === "ol";
  const items = Array.from(element.children).filter(
    (child): child is HTMLLIElement => child.tagName.toLowerCase() === "li",
  );
  return items.map((item, index) => {
    const directive = paragraphDirective(item);
    const nestedLists: string[] = [];
    const ownContent = Array.from(item.childNodes).map((child) => {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        ["ul", "ol"].includes((child as HTMLElement).tagName.toLowerCase())
      ) {
        nestedLists.push(listMarkdown(child as HTMLElement, depth + 1));
        return "";
      }
      return inlineMarkdown(child);
    }).join("").trim();
    const marker = ordered ? `${index + 1}. ` : "- ";
    const nested = nestedLists.join("");
    return `${directive ? `${directive}\n` : ""}${"  ".repeat(depth)}${marker}${ownContent}\n${nested}`;
  }).join("");
}

function blockMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.trim() ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  if (tag === "table") return `${tableMarkdown(element as HTMLTableElement)}\n\n`;
  if (tag === "ul" || tag === "ol") return `${listMarkdown(element)}\n`;
  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1]);
    return `${"#".repeat(level)} ${childrenToInlineMarkdown(element).trim()}\n\n`;
  }
  if (tag === "p") {
    const directive = paragraphDirective(element);
    const text = childrenToInlineMarkdown(element).trim();
    return `${directive ? `${directive}\n` : ""}${text}\n\n`;
  }
  if (tag === "blockquote") {
    const quote = Array.from(element.childNodes).map(blockMarkdown).join("").trim();
    return `${quote.split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
  }
  if (tag === "pre") {
    const code = element.textContent ?? "";
    return `\`\`\`\n${code.replace(/\n+$/, "")}\n\`\`\`\n\n`;
  }
  if (tag === "hr") return "---\n\n";
  if (tag === "div") {
    const directive = paragraphDirective(element);
    const content = Array.from(element.childNodes).map(blockMarkdown).join("");
    const hasBlockChildren = Array.from(element.children).some((child) =>
      /^(?:blockquote|div|h[1-6]|ol|p|pre|table|ul)$/.test(child.tagName.toLowerCase()),
    );
    if (!hasBlockChildren) {
      const paragraph = childrenToInlineMarkdown(element).trim();
      return `${directive ? `${directive}\n` : ""}${paragraph}\n\n`;
    }
    return directive ? `${directive}\n${content}` : content;
  }
  return childrenToInlineMarkdown(element);
}

export function markdownFromEditorHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  return Array.from(template.content.childNodes)
    .map(blockMarkdown)
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
