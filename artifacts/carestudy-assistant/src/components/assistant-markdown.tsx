import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";

export default function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className="assistant-markdown min-w-0 text-[15px] leading-7 text-foreground/90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeKatex]}
        components={{
          h1: ({ children }) => <h2 className="mb-3 mt-6 text-2xl font-semibold tracking-tight first:mt-0">{children}</h2>,
          h2: ({ children }) => <h3 className="mb-2 mt-6 text-xl font-semibold tracking-tight first:mt-0">{children}</h3>,
          h3: ({ children }) => <h4 className="mb-2 mt-5 text-lg font-semibold tracking-tight first:mt-0">{children}</h4>,
          p: ({ children }) => <p className="my-3 leading-7 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-6 marker:text-primary">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-6 marker:text-primary">{children}</ol>,
          li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-4 border-primary/40 bg-muted/40 py-2 pl-4 pr-3 text-muted-foreground [&>p]:my-1">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div role="region" aria-label="Scrollable answer table" tabIndex={0} className="my-5 overflow-x-auto rounded-xl border bg-card shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <table className="w-full min-w-[36rem] border-collapse text-sm leading-6">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/70 text-foreground">{children}</thead>,
          th: ({ children, style }) => <th scope="col" style={style} className="border-b px-4 py-3 text-left font-semibold">{children}</th>,
          tr: ({ children }) => (
            <tr className="border-b transition-colors last:border-b-0 odd:bg-muted/20 hover:bg-accent/40">
              {children}
            </tr>
          ),
          td: ({ children, style }) => <td style={style} className="min-w-32 border-l px-4 py-3 align-top text-foreground/85 first:border-l-0">{children}</td>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="break-words text-primary underline underline-offset-2">
              {children}
            </a>
          ),
          code: ({ children, className }) => (
            <code className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]", className)}>{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="my-4 overflow-x-auto rounded-xl bg-slate-950 p-4 text-sm leading-6 text-slate-100 [&>code]:bg-transparent [&>code]:p-0">
              {children}
            </pre>
          ),
          hr: () => <hr className="my-6 border-border" />,
          img: ({ alt }) => <span className="text-sm text-muted-foreground">[Image omitted{alt ? `: ${alt}` : ""}]</span>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
