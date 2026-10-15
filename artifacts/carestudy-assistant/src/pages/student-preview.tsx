/**
 * Student preview page — read-only rendering of a delivered care study.
 *
 * Mounted at /student/orders/:id/preview. The student can browse the full
 * study document (title page, chapters, sections, tables) but cannot edit
 * anything. Exporting the Word document is gated by the delivery PIN: the
 * staff sets it when delivering and shares it once the student has paid them
 * (off-platform — the release button here is optional). The sidebar notes the
 * PIN status and opens the download dialog as soon as a PIN is set.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  HeartPulse,
  KeyRound,
  Loader2,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PinDownloadDialog } from "@/components/pin-download-dialog";
import * as studentApi from "@/lib/studentApi";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/** Section IDs whose tables are wide enough to need landscape-like width on the preview. */
const LANDSCAPE_SECTION_IDS = new Set(["2.2", "3.2"]);

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="brand-tile grid size-9 shrink-0 place-items-center rounded-xl text-sidebar-primary-foreground">
        <HeartPulse className="size-5" />
      </span>
      {!compact && (
        <span>
          <span className="block font-serif text-base leading-none tracking-tight text-foreground">
            care<span className="text-primary">study</span>
          </span>
          <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            study preview
          </span>
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inline markdown renderer
// ---------------------------------------------------------------------------

const INLINE_RE =
  /(\*\*[^*]+\*\*|\*[^*]+\*|<sup>[^<]*<\/sup>|==[^=]+?==|\+\+[^+]+\+\+|~~[^~]+~~)/g;

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let key = 0;
  for (const part of text.split(INLINE_RE)) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**")) {
      nodes.push(<strong key={key++}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith("==") && part.endsWith("==")) {
      nodes.push(
        <mark key={key++} className="rounded-sm bg-yellow-200/80 px-0.5 dark:bg-yellow-500/40">
          {part.slice(2, -2)}
        </mark>,
      );
    } else if (part.startsWith("++") && part.endsWith("++")) {
      nodes.push(<u key={key++}>{part.slice(2, -2)}</u>);
    } else if (part.startsWith("~~") && part.endsWith("~~")) {
      nodes.push(<s key={key++}>{part.slice(2, -2)}</s>);
    } else if (part.startsWith("<sup>") && part.endsWith("</sup>")) {
      nodes.push(
        <sup key={key++} className="text-[9px] leading-none">
          {part.slice(5, -6)}
        </sup>,
      );
    } else if (part.startsWith("*") && part.endsWith("*")) {
      nodes.push(<em key={key++}>{part.slice(1, -1)}</em>);
    } else {
      nodes.push(<span key={key++}>{part}</span>);
    }
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Markdown table renderer
// ---------------------------------------------------------------------------

function MarkdownTable({ text }: { text: string }) {
  const lines = text.split("\n").filter((line) => line.trim());
  const separator = /^:?-{2,}:?$/;

  const dataLines = lines.filter(
    (line) =>
      !separator.test(
        line
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim())
          .join(""),
      ),
  );
  if (dataLines.length === 0) return null;

  const parseRow = (line: string) =>
    line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim());

  const headerCells = parseRow(dataLines[0]);
  const bodyRows = dataLines.slice(1).map(parseRow);

  // Self-heal a common model mistake: the header names a date/time first
  // column but every data row dropped the leading empty cell (the diagnosis
  // landed in the date column), shifting every cell one column left of its
  // header. Only heals the unambiguous shape: every data row short by exactly
  // one and a date-labelled first header. Ragged tables keep their alignment.
  const firstHeader = (headerCells[0] ?? "").toLowerCase();
  const firstHeaderIsDate = firstHeader.includes("date") || firstHeader.includes("time");
  const needsShift =
    headerCells.length > 1 &&
    firstHeaderIsDate &&
    bodyRows.length > 0 &&
    bodyRows.every((row) => row.length === headerCells.length - 1);
  const shiftedRows = needsShift ? bodyRows.map((row) => ["", ...row]) : bodyRows;

  return (
    <div className="my-3 overflow-x-auto rounded-lg border">
      <table className="w-full text-[11px] leading-relaxed">
        <thead>
          <tr className="border-b bg-muted/50">
            {headerCells.map((cell, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold text-foreground">
                {renderInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shiftedRows.map((row, ri) => (
            <tr
              key={ri}
              className={cn(
                "border-b last:border-0",
                ri % 2 === 0 ? "bg-background" : "bg-muted/20",
              )}
            >
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5 text-muted-foreground">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft content renderer
// ---------------------------------------------------------------------------

function DraftContent({ text }: { text: string }) {
  if (!text.trim()) return null;

  const blocks = text.split(/\n{2,}/);

  return (
    <div className="space-y-2 leading-relaxed">
      {blocks.map((block, bi) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        if (trimmed.includes("|") && trimmed.split("\n").length >= 2) {
          const rows = trimmed.split("\n");
          const hasTableStructure = rows.some((row) =>
            /^:?-{2,}:?$/.test(
              row
                .trim()
                .replace(/^\||\|$/g, "")
                .split("|")
                .map((c) => c.trim())
                .join(""),
            ),
          );
          if (hasTableStructure) {
            return <MarkdownTable key={bi} text={trimmed} />;
          }
        }

        const lines = trimmed.split("\n");
        const isBulletList = lines.every((line) => /^\s*[-•*]\s+/.test(line));
        const isNumberedList = lines.every((line) => /^\s*\d+[.)]\s+/.test(line));

        if (isBulletList) {
          return (
            <ul key={bi} className="ml-4 list-disc space-y-1">
              {lines.map((line, li) => (
                <li key={li} className="text-muted-foreground">
                  {renderInline(line.replace(/^\s*[-•*]\s+/, ""))}
                </li>
              ))}
            </ul>
          );
        }

        if (isNumberedList) {
          return (
            <ol key={bi} className="ml-4 list-decimal space-y-1">
              {lines.map((line, li) => (
                <li key={li} className="text-muted-foreground">
                  {renderInline(line.replace(/^\s*\d+[.)]\s+/, ""))}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p key={bi} className="text-muted-foreground whitespace-pre-line">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section prose renderer
// ---------------------------------------------------------------------------

function SectionProse({
  data,
  rowData,
  rowColumns,
  landscape = false,
}: {
  data: Record<string, string>;
  rowData: { cells: string[] }[];
  rowColumns?: { id: string; label: string }[];
  landscape?: boolean;
}) {
  const fieldEntries = Object.entries(data).filter(([, v]) => v.trim());

  return (
    <div className="space-y-3">
      {fieldEntries.map(([key, value]) => (
        <div key={key} className="text-sm">
          <span className="font-semibold text-foreground">{key}: </span>
          <span className="text-muted-foreground">{value}</span>
        </div>
      ))}

      {rowData.length > 0 && rowColumns && rowColumns.length > 0 && (
        <div className={cn("overflow-x-auto rounded-lg border", landscape && "border-primary/20 bg-background")}>
          <table className={cn("w-full text-[11px] leading-relaxed", landscape && "min-w-[900px]")}>
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-semibold text-foreground">#</th>
                {rowColumns.map((col) => (
                  <th key={col.id} className="px-3 py-2 text-left font-semibold text-foreground">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowData.map((row, ri) => (
                <tr
                  key={ri}
                  className={cn(
                    "border-b last:border-0",
                    ri % 2 === 0 ? "bg-background" : "bg-muted/20",
                  )}
                >
                  <td className="px-3 py-1.5 text-muted-foreground">{ri + 1}</td>
                  {rowColumns.map((col, ci) => (
                    <td key={col.id} className="px-3 py-1.5 text-muted-foreground">
                      {row.cells[ci] || ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Download panel (sidebar) — PIN status + export actions
// ---------------------------------------------------------------------------

type DownloadPanelProps = {
  visibleChapters: { ch: studentApi.PreviewChapter; i: number }[];
  activeIndex: number;
  onSelect: (index: number) => void;
  released: boolean;
  onDownloadFull: () => void;
  onDownloadChapter: (index: number) => void;
};

function DownloadPanel({
  visibleChapters,
  activeIndex,
  onSelect,
  released,
  onDownloadFull,
  onDownloadChapter,
}: DownloadPanelProps) {
  return (
    <nav className="space-y-3">
      {/* Full study card */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold">Full Care Study</p>
            <p className="text-[10px] text-muted-foreground">
              All {visibleChapters.length} chapters
            </p>
          </div>
          <Badge
            variant={released ? "default" : "secondary"}
            className="shrink-0 gap-1 text-[10px]"
          >
            {released ? (
              <>
                <CheckCircle2 className="size-3" /> Unlocked
              </>
            ) : (
              <>
                <Lock className="size-3" /> Locked
              </>
            )}
          </Badge>
        </div>

        {released ? (
          <Button size="sm" className="mt-3 w-full h-8 gap-1.5" onClick={onDownloadFull}>
            <Download className="size-3.5" /> Download Word
          </Button>
        ) : (
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            Your academic team releases the download PIN once your payment is confirmed.
          </p>
        )}
      </div>

      <Separator />

      {/* Individual chapters */}
      <div>
        <p className="mb-2 px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Chapters
        </p>
        <div className="space-y-1">
          {visibleChapters.map(({ ch, i }) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              className={cn(
                "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                activeIndex === i
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold">
                {ROMAN[i] ?? String(i + 1)}
              </span>
              <span className="min-w-0 flex-1 truncate">{ch.name}</span>
              {!ch.isFrontMatter && released && (
                <Download
                  className="size-3.5 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownloadChapter(i);
                  }}
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Mobile download bar
// ---------------------------------------------------------------------------

function MobileDownloadBar({
  released,
  onDownloadFull,
}: {
  released: boolean;
  onDownloadFull: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {released ? (
              <KeyRound className="size-3.5 shrink-0 text-primary" />
            ) : (
              <Lock className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate text-xs font-medium">
              {released ? "PIN released — ready to download" : "Waiting for your PIN"}
            </span>
          </div>
        </div>
        {released ? (
          <Button size="sm" className="h-8 shrink-0 gap-1.5" onClick={onDownloadFull}>
            <Download className="size-3.5" /> Download
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5" disabled>
            <Lock className="size-3.5" /> Locked
          </Button>
        )}
      </div>
      <div className="h-0" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function PreviewSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton */}
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-20" />
            <Separator orientation="vertical" className="h-5" />
            <Skeleton className="h-8 w-24" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-36" />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-0">
        {/* Sidebar skeleton */}
        <aside className="hidden w-64 shrink-0 border-r py-4 lg:block sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
          <div className="space-y-3 px-3">
            {/* Full study card */}
            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Skeleton className="mb-1.5 h-3 w-24" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="mt-3 h-6 w-20" />
              <Skeleton className="mt-2 h-8 w-full" />
              <Skeleton className="mt-2 h-2.5 w-36" />
            </div>

            <Separator />

            {/* Chapter list */}
            <div>
              <Skeleton className="mb-2 h-2.5 w-16" />
              <div className="space-y-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg px-3 py-2">
                    <Skeleton className="size-5 shrink-0 rounded-full" />
                    <Skeleton className="h-3.5 flex-1" style={{ width: `${60 + (i % 3) * 15}%` }} />
                    <Skeleton className="size-3.5 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Main content skeleton */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[780px] px-4 py-8 md:px-10">
            {/* Title page */}
            <header className="border-b pb-8 text-center">
              <Skeleton className="mx-auto h-2.5 w-48" />
              <Skeleton className="mx-auto mt-3 h-7 w-72" />
              <Skeleton className="mx-auto mt-2 h-3.5 w-56" />
              <Skeleton className="mx-auto mt-1.5 h-3.5 w-40" />
            </header>

            {/* Chapter skeleton 1 */}
            <div className="mt-8">
              <div className="flex items-center justify-between pb-1.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-5 w-40" />
                </div>
                <Skeleton className="h-7 w-24" />
              </div>
              <div className="mt-3 space-y-2">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-4/5" />
              </div>

              <div className="mt-5">
                <Skeleton className="mb-2 h-4 w-48" />
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-3/4" />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main preview page
// ---------------------------------------------------------------------------

export function StudentPreviewPage({ orderId }: { orderId: number }) {
  const [showPreliminary, setShowPreliminary] = useState(false);
  const [activeChapter, setActiveChapter] = useState(0);
  const chapterRefs = useRef<Map<number, HTMLElement>>(new Map());

  const [downloadDialog, setDownloadDialog] = useState<{
    open: boolean;
    chapterIndex?: number;
  }>({ open: false });

  const { data: orderData, isLoading: orderLoading } = useQuery({
    queryKey: ["student-order", orderId],
    queryFn: () => studentApi.getOrder(orderId),
  });

  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: ["order-preview", orderId],
    queryFn: () => studentApi.getOrderPreview(orderId),
    enabled: orderData?.order.status === "ready",
  });

  const order = orderData?.order;
  // The download opens as soon as a PIN is set on the delivery. The staff may
  // release it in-app or simply tell the student the PIN over another channel
  // — either way the student can export, and the platform charges on download.
  const released = order?.pin.set ?? false;
  const hasDelivery = Boolean(order?.delivery);
  const canView = order?.status === "ready" && hasDelivery;

  const visibleChapters = useMemo(() => {
    if (!preview) return [];
    return preview.chapters
      .map((ch, i) => ({ ch, i }))
      .filter(({ ch }) => showPreliminary || !ch.isFrontMatter);
  }, [preview, showPreliminary]);

  const scrollToChapter = useCallback((index: number) => {
    setActiveChapter(index);
    const el = chapterRefs.current.get(index);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const handleDownloadFull = useCallback(() => {
    if (!released) {
      toast.info("This study isn't ready to download yet.");
      return;
    }
    setDownloadDialog({ open: true });
  }, [released]);

  const handleDownloadChapter = useCallback(
    (chapterIndex: number) => {
      if (!released) {
        toast.info("This study isn't ready to download yet.");
        return;
      }
      setDownloadDialog({ open: true, chapterIndex });
    },
    [released],
  );

  // Loading — full skeleton layout
  if (orderLoading || previewLoading) {
    return <PreviewSkeleton />;
  }

  // Error / not ready
  if (!order || !canView) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <span className="grid size-14 place-items-center rounded-full bg-muted">
              <FileText className="size-7 text-muted-foreground" />
            </span>
            <div>
              <h1 className="font-serif text-xl font-semibold">Study not available</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {!hasDelivery
                  ? "Your completed study has not been delivered yet. Check back soon."
                  : "This study is not ready for preview."}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href={`/student/orders/${orderId}`}>
                <ArrowLeft className="size-4" /> Back to project
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <span className="grid size-14 place-items-center rounded-full bg-muted">
              <FileText className="size-7 text-muted-foreground" />
            </span>
            <div>
              <h1 className="font-serif text-xl font-semibold">Preview not available</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                The study preview could not be loaded. {released
                  ? "You can still export the Word document with your PIN."
                  : "Its download PIN has not been set yet."}
              </p>
            </div>
            {released && (
              <Button onClick={handleDownloadFull}>
                <Download className="size-4" /> Download study
              </Button>
            )}
            <Button asChild variant="ghost" size="sm">
              <Link href={`/student/orders/${orderId}`}>
                <ArrowLeft className="size-4" /> Back to project
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/student/orders/${orderId}`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "gap-1.5 text-muted-foreground",
              )}
            >
              <ArrowLeft className="size-4" /> Project
            </Link>
            <Separator orientation="vertical" className="h-5" />
            <BrandMark compact />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setShowPreliminary((v) => !v)}
            >
              {showPreliminary ? "Hide" : "Show"} preliminary
            </Button>
            <Button size="sm" className="h-8 gap-1.5" onClick={handleDownloadFull}>
              {released ? (
                <>
                  <Download className="size-4" /> Download Word
                </>
              ) : (
                <>
                  <Lock className="size-4" /> PIN locked
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-0">
        {/* Sidebar — download panel (desktop) */}
        <aside className="hidden w-64 shrink-0 border-r py-4 lg:block sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
          <DownloadPanel
            visibleChapters={visibleChapters}
            activeIndex={activeChapter}
            onSelect={scrollToChapter}
            released={released}
            onDownloadFull={handleDownloadFull}
            onDownloadChapter={handleDownloadChapter}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[780px] px-4 py-8 md:px-10">
            {/* Title page */}
            <header className="border-b pb-8 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Patient / Family Care Study
              </p>
              <h1 className="mt-3 font-serif text-2xl font-semibold">
                {preview.title.collegeName || "Nursing & Midwifery Training College"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {preview.title.studentName || "Student name"}
                {preview.title.indexNumber ? ` · ${preview.title.indexNumber}` : ""} ·{" "}
                {preview.title.year}
              </p>
              {preview.title.diagnosis && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Diagnosis: {preview.title.diagnosis}
                </p>
              )}
            </header>

            {/* Chapters and sections */}
            {visibleChapters.map(({ ch, i }) => {
              const roman = ROMAN[visibleChapters.findIndex((vc) => vc.i === i)] ?? String(i + 1);

              return (
                <section
                  key={i}
                  ref={(el) => { if (el) chapterRefs.current.set(i, el); }}
                  className="mt-8 break-inside-avoid"
                >
                  {/* Chapter heading with inline download button */}
                  <div className="flex items-center justify-between gap-3 pb-1.5">
                    <h2 className="font-serif text-lg font-semibold">
                      {!ch.isFrontMatter && (
                        <span className="mr-2 font-mono text-xs text-primary">
                          CHAPTER {roman}
                        </span>
                      )}
                      {ch.isFrontMatter ? ch.name.toUpperCase() : ch.name}
                    </h2>
                    {!ch.isFrontMatter && released && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-xs"
                        onClick={() => handleDownloadChapter(i)}
                      >
                        <Download className="size-3.5" /> Download
                      </Button>
                    )}
                  </div>

                  {/* Chapter intro */}
                  {ch.intro?.trim() && <DraftContent text={ch.intro} />}

                  {/* Sections */}
                  {ch.sections.map((section) => {
                    const hasDraft = Boolean(section.draft?.trim());
                    const hasData = Object.values(section.data).some((v) => v.trim());
                    const hasRows = section.rowData.length > 0;
                    const hasContent = hasDraft || hasData || hasRows;

                    if (!hasContent) return null;

                    const isLandscape = LANDSCAPE_SECTION_IDS.has(section.id);

                    return (
                      <div
                        key={section.id}
                        className={cn(
                          "mt-4 break-inside-avoid",
                          isLandscape && "relative -mx-[calc((100vw-780px)/2)] w-[100vw] max-w-[1100px] md:mx-auto md:w-[calc(100vw-4rem)]",
                        )}
                      >
                        <h3 className="font-semibold text-foreground">
                          {section.id} {section.heading}
                        </h3>

                        {hasDraft ? (
                          <div className="mt-2">
                            <DraftContent text={section.draft} />
                          </div>
                        ) : hasData || hasRows ? (
                          <div className="mt-2">
                            <SectionProse
                              data={section.data}
                              rowData={section.rowData}
                              rowColumns={section.rowColumns}
                              landscape={isLandscape}
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </section>
              );
            })}

            {/* Bottom download CTA */}
            <div
              className={cn(
                "mt-12 rounded-xl border-2 border-dashed p-8 text-center",
                released
                  ? "border-primary/30 bg-primary/5"
                  : "border-muted-foreground/20 bg-muted/30",
              )}
            >
              {released ? (
                <>
                  <KeyRound className="mx-auto mb-3 size-8 text-primary/70" />
                  <h3 className="font-serif text-lg font-semibold">
                    Your study is unlocked
                  </h3>
                  <p className="mt-2 max-w-lg mx-auto text-sm text-muted-foreground">
                    Enter the PIN your academic team gave you to export the complete study as a Word
                    document.
                  </p>
                  <Button className="mt-5 gap-1.5" onClick={handleDownloadFull}>
                    <Download className="size-4" /> Download Word document
                  </Button>
                </>
              ) : (
                <>
                  <Lock className="mx-auto mb-3 size-8 text-muted-foreground/60" />
                  <h3 className="font-serif text-lg font-semibold">Awaiting PIN release</h3>
                  <p className="mt-2 max-w-lg mx-auto text-sm text-muted-foreground">
                    Your academic team releases the download PIN once they confirm your payment.
                    You'll be able to export this study from this page then.
                  </p>
                </>
              )}
            </div>

            {/* Footer */}
            <footer className="mt-12 border-t pt-6 pb-8">
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                CareStudy Institute supports nursing education — preparing the study, and preparing
                you to defend it. Your materials stay yours and are used only to prepare your study.
              </p>
            </footer>
          </div>
        </main>
      </div>

      {/* Mobile bottom bar */}
      <MobileDownloadBar released={released} onDownloadFull={handleDownloadFull} />
      <div className="h-16 lg:hidden" />

      {/* PIN download dialog */}
      {order && (
        <PinDownloadDialog
          open={downloadDialog.open}
          onClose={() => setDownloadDialog({ open: false })}
          order={order}
          chapterIndex={downloadDialog.chapterIndex}
        />
      )}
    </div>
  );
}
