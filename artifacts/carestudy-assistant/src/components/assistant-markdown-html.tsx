import ReactMarkdown from "react-markdown";
import { renderToStaticMarkup } from "react-dom/server";
import type { CSSProperties } from "react";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

export const assistantMarkdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "mark", "u"],
};

export type AssistantDocumentParagraphStyle = {
  align?: "left" | "center" | "right" | "justify";
  spacing?: number;
  indent?: number;
};

export function splitAssistantDocumentBlocks(text: string) {
  return text.replace(/\r/g, "").split(/\n\s*\n/).map((raw) => {
    let content = raw.trim();
    const style: AssistantDocumentParagraphStyle = {};
    const directive = content.match(/^<!--\s*(.*?)\s*-->\s*/);
    if (directive) {
      for (const token of directive[1].split(/\s+/)) {
        const [key, value] = token.split(":", 2);
        if (key === "align" && ["left", "center", "right", "justify"].includes(value)) {
          style.align = value as AssistantDocumentParagraphStyle["align"];
        } else if (key === "spacing") {
          const spacing = Number(value);
          if (Number.isFinite(spacing)) style.spacing = spacing;
        } else if (key === "indent") {
          const indent = Number(value);
          if (Number.isFinite(indent)) style.indent = indent;
        }
      }
      content = content.slice(directive[0].length).trim();
    }
    return { content, style };
  }).filter((block) => block.content.length > 0);
}

function cssForParagraphStyle(style: AssistantDocumentParagraphStyle): CSSProperties {
  return {
    ...(style.align ? { textAlign: style.align } : {}),
    ...(style.spacing !== undefined ? { lineHeight: style.spacing } : {}),
    ...(style.indent !== undefined ? { textIndent: `${style.indent}in` } : {}),
  };
}

export function renderAssistantMarkdownForEditing(text: string): string {
  return renderToStaticMarkup(
    <div className="assistant-markdown min-w-0 text-foreground/90">
      {splitAssistantDocumentBlocks(text).map((block, index) => (
        <div key={index} style={cssForParagraphStyle(block.style)}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[
              rehypeRaw,
              [rehypeSanitize, assistantMarkdownSanitizeSchema],
              rehypeKatex,
            ]}
          >
            {block.content}
          </ReactMarkdown>
        </div>
      ))}
    </div>,
  );
}
