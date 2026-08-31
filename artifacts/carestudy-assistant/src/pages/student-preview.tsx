/**
 * Student preview page — read-only rendering of a delivered care study.
 *
 * Mounted at /student/orders/:id/preview. The student can browse the full
 * study document (title page, chapters, sections, tables) but cannot edit
 * anything. The sidebar shows a chapter-level purchase panel: buy individual
 * chapters (GH₵ 50 each) or the full study (GH₵ 250). After payment,
 * download buttons unlock per chapter or for the whole study.
 */
import { useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Download,
  FileText,
  HeartPulse,
  ListChecks,
  Loader2,
  Lock,
  Menu,
  ShoppingCart,
  Sparkles,
  Unlock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import * as studentApi from "@/lib/studentApi";
import { payWithPaystack, getPaystackKey } from "@/lib/paystack";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

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
          {bodyRows.map((row, ri) => (
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
}: {
  data: Record<string, string>;
  rowData: { cells: string[] }[];
  rowColumns?: { id: string; label: string }[];
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
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-[11px] leading-relaxed">
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
// Chapter purchase panel (sidebar)
// ---------------------------------------------------------------------------

type ChapterPurchasePanelProps = {
  visibleChapters: { ch: studentApi.PreviewChapter; i: number }[];
  activeIndex: number;
  onSelect: (index: number) => void;
  isPaid: boolean;
  paidScope: studentApi.PaidScope;
  onBuyFullStudy: () => void;
  onBuyChapter: (index: number, name: string) => void;
  onDownloadChapter: (index: number) => void;
  onDownloadFull: () => void;
};

function ChapterPurchasePanel({
  visibleChapters,
  activeIndex,
  onSelect,
  isPaid,
  paidScope,
  onBuyFullStudy,
  onBuyChapter,
  onDownloadChapter,
  onDownloadFull,
}: ChapterPurchasePanelProps) {
  const fullStudyPrice = studentApi.PRICE_FULL_STUDY;
  const chapterPrice = studentApi.PRICE_CHAPTER;
  const totalIfBoughtIndividually = visibleChapters.length * chapterPrice;
  const savings = totalIfBoughtIndividually - fullStudyPrice;

  const isFullPaid = isPaid && paidScope === "full";
  const isChapterPaid = isPaid && paidScope === "chapter";

  return (
    <nav className="space-y-3">
      {/* Buy Full Study card */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold">Full Care Study</p>
            <p className="text-[10px] text-muted-foreground">
              All {visibleChapters.length} chapters
            </p>
          </div>
          {isFullPaid ? (
            <Badge variant="default" className="shrink-0 gap-1 text-[10px]">
              <CheckCircle2 className="size-3" /> Purchased
            </Badge>
          ) : isChapterPaid ? (
            <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
              <Unlock className="size-3" /> Upgrade
            </Badge>
          ) : null}
        </div>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-bold text-primary">GH₵ {fullStudyPrice}</span>
          {savings > 0 && !isFullPaid && (
            <span className="text-[10px] text-emerald-600 font-medium">
              Save GH₵ {savings}
            </span>
          )}
        </div>

        {!isFullPaid ? (
          <Button
            size="sm"
            className="mt-2 w-full h-8 gap-1.5"
            onClick={onBuyFullStudy}
          >
            <ShoppingCart className="size-3.5" /> Buy full study
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="mt-2 w-full h-8 gap-1.5"
            onClick={onDownloadFull}
          >
            <Download className="size-3.5" /> Download Word
          </Button>
        )}

        {!isFullPaid && (
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            GH₵ {(fullStudyPrice / visibleChapters.length).toFixed(0)} per chapter · GH₵ {chapterPrice} individually
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
          {visibleChapters.map(({ ch, i }) => {
            const chapterPaid = isFullPaid || (isChapterPaid && activeIndex === i);
            return (
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
                  {chapterPaid ? (
                    <CheckCircle2 className="size-3.5 text-primary" />
                  ) : (
                    ROMAN[i] ?? String(i + 1)
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{ch.name}</span>
                {chapterPaid ? (
                  <Download
                    className="size-3.5 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownloadChapter(i);
                    }}
                  />
                ) : (
                  <Lock className="size-3 shrink-0 text-muted-foreground/40" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Mobile purchase bar + bottom sheet
// ---------------------------------------------------------------------------

/**
 * Sticky bottom bar on mobile (hidden lg:hidden). Shows the current purchase
 * status and a button that slides up the full ChapterPurchasePanel in a Sheet.
 */
function MobilePurchaseBar(props: ChapterPurchasePanelProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { isPaid, paidScope, visibleChapters, activeIndex } = props;
  const isFullPaid = isPaid && paidScope === "full";
  const isChapterPaid = isPaid && paidScope === "chapter";

  const activeChapterName = visibleChapters[activeIndex]?.ch.name ?? "";

  // Compact status text
  let statusText = "Purchase to download";
  if (isFullPaid) statusText = "Full study purchased";
  else if (isChapterPaid)
    statusText = `Chapter purchased: ${activeChapterName}`;

  return (
    <>
      {/* Fixed bottom bar — visible only below lg */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          {/* Status indicator */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {isPaid ? (
                <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
              ) : (
                <Lock className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate text-xs font-medium">{statusText}</span>
            </div>
            {!isPaid && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                GH₵ {studentApi.PRICE_FULL_STUDY} full · GH₵ {studentApi.PRICE_CHAPTER} per chapter
              </p>
            )}
          </div>

          {/* Action button */}
          {isPaid ? (
            <Button
              size="sm"
              className="h-8 shrink-0 gap-1.5"
              onClick={props.onDownloadFull}
            >
              <Download className="size-3.5" /> Download
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-8 shrink-0 gap-1.5"
              onClick={() => setSheetOpen(true)}
            >
              <Menu className="size-3.5" /> Purchase
            </Button>
          )}
        </div>
      </div>

      {/* Bottom sheet — full chapter purchase panel */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="pb-2">
            <SheetTitle className="flex items-center gap-2">
              <ShoppingCart className="size-5 text-primary" />
              Purchase study
            </SheetTitle>
            <SheetDescription>
              Buy the full study or individual chapters — pay via Mobile Money or bank transfer.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-2 pb-4">
            <ChapterPurchasePanel
              {...props}
              onSelect={(index) => {
                props.onSelect(index);
                setSheetOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Spacer so content is never hidden behind the fixed bar on mobile */}
      <div className="h-16 lg:hidden" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Payment dialog
// ---------------------------------------------------------------------------

function PaymentDialog({
  open,
  onClose,
  orderId,
  scope,
  chapterIndex,
  chapterName,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  orderId: number;
  scope: "full" | "chapter";
  chapterIndex?: number;
  chapterName?: string;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState(false);

  const amount = scope === "full" ? studentApi.PRICE_FULL_STUDY : studentApi.PRICE_CHAPTER;
  const label =
    scope === "full"
      ? "Full Care Study"
      : `Chapter: ${chapterName ?? `Chapter ${((chapterIndex ?? 0) + 1)}`}`;

  const handlePay = useCallback(async () => {
    const paystackKey = getPaystackKey();
    if (!paystackKey) {
      toast.error("Payment is not configured. Please contact support.");
      return;
    }

    setProcessing(true);
    try {
      const init = await studentApi.initializePayment(orderId, scope, chapterIndex);
      const result = await payWithPaystack({
        key: paystackKey,
        reference: init.reference,
        amount: init.amount,
        email: init.email,
        currency: "GHS",
        label,
      });
      const verification = await studentApi.verifyPayment(orderId, result.reference);

      if (verification.verified) {
        toast.success("Payment confirmed! You can now download your study.");
        await queryClient.invalidateQueries({ queryKey: ["student-order", orderId] });
        onSuccess();
        onClose();
      } else {
        toast.error("Payment verification is pending. Please wait a moment and try again.");
      }
    } catch (err) {
      if (err instanceof Error && err.message === "Payment was cancelled.") {
        toast.info("Payment was cancelled.");
      } else {
        toast.error(err instanceof Error ? err.message : "Payment failed. Please try again.");
      }
    } finally {
      setProcessing(false);
    }
  }, [orderId, scope, chapterIndex, label, queryClient, onSuccess, onClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => !processing && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="size-5 text-primary" />
            Purchase {scope === "full" ? "Full Study" : "Chapter"}
          </DialogTitle>
          <DialogDescription>
            Pay securely via Paystack — supports Mobile Money (MTN, Telecel) and bank transfer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-sm font-medium">{label}</p>
            <p className="mt-1 text-2xl font-bold text-primary">GH₵ {amount.toFixed(2)}</p>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Payment methods accepted:</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">MTN Mobile Money</Badge>
              <Badge variant="secondary">Telecel Mobile Money</Badge>
              <Badge variant="secondary">Bank Transfer</Badge>
            </div>
          </div>

          <Button className="w-full" onClick={handlePay} disabled={processing}>
            {processing ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Processing payment…
              </>
            ) : (
              <>
                <ShoppingCart className="size-4" /> Pay GH₵ {amount.toFixed(2)}
              </>
            )}
          </Button>

          <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
            Secured by Paystack. Your payment is encrypted and protected.
          </p>
        </div>
      </DialogContent>
    </Dialog>
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
        <aside className="hidden w-64 shrink-0 border-r py-4 lg:block">
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

              {/* Section skeleton */}
              <div className="mt-5">
                <Skeleton className="mb-2 h-4 w-48" />
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-3/4" />
                </div>
              </div>

              <div className="mt-5">
                <Skeleton className="mb-2 h-4 w-36" />
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-5/6" />
                </div>
              </div>
            </div>

            {/* Chapter skeleton 2 */}
            <div className="mt-10">
              <div className="flex items-center justify-between pb-1.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-5 w-36" />
                </div>
                <Skeleton className="h-7 w-24" />
              </div>
              <div className="mt-3 space-y-2">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>

              <div className="mt-5">
                <Skeleton className="mb-2 h-4 w-44" />
                {/* Table skeleton */}
                <div className="mt-2 overflow-hidden rounded-lg border">
                  <div className="flex border-b bg-muted/30 px-3 py-2">
                    <Skeleton className="mr-3 h-3 w-8" />
                    <Skeleton className="mr-3 h-3 flex-1" />
                    <Skeleton className="mr-3 h-3 flex-1" />
                    <Skeleton className="h-3 flex-1" />
                  </div>
                  {Array.from({ length: 3 }).map((_, ri) => (
                    <div key={ri} className="flex border-b px-3 py-2 last:border-0">
                      <Skeleton className="mr-3 h-3 w-8" />
                      <Skeleton className="mr-3 h-3 flex-1" />
                      <Skeleton className="mr-3 h-3 flex-1" />
                      <Skeleton className="h-3 flex-1" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Chapter skeleton 3 */}
            <div className="mt-10">
              <div className="flex items-center justify-between pb-1.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-5 w-44" />
                </div>
                <Skeleton className="h-7 w-24" />
              </div>
              <div className="mt-3 space-y-2">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-3/5" />
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Mobile bar skeleton */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="mt-1 h-2.5 w-56" />
          </div>
          <Skeleton className="h-8 w-24 shrink-0" />
        </div>
      </div>
      <div className="h-16 lg:hidden" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main preview page
// ---------------------------------------------------------------------------

export function StudentPreviewPage({ orderId }: { orderId: number }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [showPreliminary, setShowPreliminary] = useState(false);
  const [activeChapter, setActiveChapter] = useState(0);

  const [payDialog, setPayDialog] = useState<{
    open: boolean;
    scope: "full" | "chapter";
    chapterIndex?: number;
    chapterName?: string;
  }>({ open: false, scope: "full" });

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
  const isPaid = order?.paymentStatus === "verified";
  const hasDelivery = Boolean(order?.delivery);
  const canView = order?.status === "ready" && hasDelivery;

  const visibleChapters = useMemo(() => {
    if (!preview) return [];
    return preview.chapters
      .map((ch, i) => ({ ch, i }))
      .filter(({ ch }) => showPreliminary || !ch.isFrontMatter);
  }, [preview, showPreliminary]);

  const currentChapter = visibleChapters[activeChapter] ?? visibleChapters[0];

  // Download handlers
  const handleDownloadFull = useCallback(() => {
    if (!order) return;
    if (!isPaid) {
      setPayDialog({ open: true, scope: "full" });
      return;
    }
    studentApi
      .downloadOrderStudy(order)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Download failed"));
  }, [order, isPaid]);

  const handleDownloadChapter = useCallback(
    (chapterIndex: number) => {
      if (!order) return;
      if (!isPaid) {
        setPayDialog({
          open: true,
          scope: "chapter",
          chapterIndex,
          chapterName: visibleChapters[chapterIndex]?.ch.name,
        });
        return;
      }
      studentApi
        .downloadOrderChapter(order, chapterIndex)
        .catch((err) => toast.error(err instanceof Error ? err.message : "Download failed"));
    },
    [order, isPaid, visibleChapters],
  );

  const handleBuyFullStudy = useCallback(() => {
    setPayDialog({ open: true, scope: "full" });
  }, []);

  const handleBuyChapter = useCallback(
    (chapterIndex: number, chapterName: string) => {
      setPayDialog({ open: true, scope: "chapter", chapterIndex, chapterName });
    },
    [],
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
                The study preview could not be loaded. Try downloading the document directly.
              </p>
            </div>
            <Button onClick={handleDownloadFull}>
              <Download className="size-4" /> Download study
            </Button>
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
              {isPaid ? (
                <>
                  <Download className="size-4" /> Download Word
                </>
              ) : (
                <>
                  <Lock className="size-4" /> Purchase & Download
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-0">
        {/* Sidebar — chapter purchase panel (desktop) */}
        <aside className="hidden w-64 shrink-0 border-r py-4 lg:block">
          <ChapterPurchasePanel
            visibleChapters={visibleChapters}
            activeIndex={activeChapter}
            onSelect={setActiveChapter}
            isPaid={isPaid}
            paidScope={order.paidScope}
            onBuyFullStudy={handleBuyFullStudy}
            onBuyChapter={handleBuyChapter}
            onDownloadChapter={handleDownloadChapter}
            onDownloadFull={handleDownloadFull}
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
                <section key={i} className="mt-8 break-inside-avoid">
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
                    {!ch.isFrontMatter && (
                      <div className="flex items-center gap-1.5">
                        {(isPaid || (order.paidScope === "chapter")) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 text-xs"
                            onClick={() => handleDownloadChapter(i)}
                          >
                            {isPaid ? (
                              <>
                                <Download className="size-3.5" /> Download
                              </>
                            ) : (
                              <>
                                <Lock className="size-3.5" /> Buy GH₵ {studentApi.PRICE_CHAPTER}
                              </>
                            )}
                          </Button>
                        )}
                      </div>
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

                    return (
                      <div key={section.id} className="mt-4 break-inside-avoid">
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
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </section>
              );
            })}

            {/* Bottom purchase CTA */}
            {!isPaid && (
              <div className="mt-12 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-8 text-center">
                <Lock className="mx-auto mb-3 size-8 text-primary/60" />
                <h3 className="font-serif text-lg font-semibold">
                  Download your completed study
                </h3>
                <p className="mt-2 max-w-lg mx-auto text-sm text-muted-foreground">
                  This preview shows your full study. Purchase access below to export it as a Word
                  document. Buy the full study or individual chapters — pay securely via Mobile Money
                  or bank transfer.
                </p>

                {/* Price comparison */}
                <div className="mx-auto mt-6 max-w-sm space-y-3">
                  <div className="flex items-center justify-between rounded-lg border bg-card p-3">
                    <div className="text-left">
                      <p className="text-sm font-semibold">Full Care Study</p>
                      <p className="text-[11px] text-muted-foreground">
                        All {visibleChapters.length} chapters
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-primary">
                        GH₵ {studentApi.PRICE_FULL_STUDY}
                      </p>
                      <p className="text-[10px] text-emerald-600 font-medium">
                        Save GH₵{" "}
                        {visibleChapters.length * studentApi.PRICE_CHAPTER -
                          studentApi.PRICE_FULL_STUDY}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border bg-card p-3">
                    <div className="text-left">
                      <p className="text-sm font-semibold">Single Chapter</p>
                      <p className="text-[11px] text-muted-foreground">
                        Buy one chapter at a time
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-foreground">
                        GH₵ {studentApi.PRICE_CHAPTER}
                      </p>
                      <p className="text-[10px] text-muted-foreground">each</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Button onClick={handleBuyFullStudy} className="gap-1.5">
                    <ShoppingCart className="size-4" /> Buy full study — GH₵{" "}
                    {studentApi.PRICE_FULL_STUDY}
                  </Button>
                  {visibleChapters.length > 1 && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        handleBuyChapter(currentChapter?.i ?? 0, currentChapter?.ch.name ?? "")
                      }
                      className="gap-1.5"
                    >
                      <BookOpen className="size-4" /> Buy current chapter — GH₵{" "}
                      {studentApi.PRICE_CHAPTER}
                    </Button>
                  )}
                </div>

                {/* Payment methods */}
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    MTN MoMo
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    Telecel MoMo
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    Bank Transfer
                  </Badge>
                </div>
              </div>
            )}

            {/* Paid state */}
            {isPaid && (
              <div className="mt-12 rounded-xl border border-primary/30 bg-primary/5 p-6 text-center">
                <CheckCircle2 className="mx-auto mb-3 size-8 text-primary" />
                <h3 className="font-serif text-lg font-semibold">Payment confirmed</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  You have purchased the{" "}
                  {order.paidScope === "full" ? "full study" : "chapter"}. Download your Word
                  document below.
                </p>
                <Button className="mt-4 gap-1.5" onClick={handleDownloadFull}>
                  <Download className="size-4" /> Download Word document
                </Button>
              </div>
            )}

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

      {/* Mobile bottom purchase bar */}
      <MobilePurchaseBar
        visibleChapters={visibleChapters}
        activeIndex={activeChapter}
        onSelect={setActiveChapter}
        isPaid={isPaid}
        paidScope={order.paidScope}
        onBuyFullStudy={handleBuyFullStudy}
        onBuyChapter={handleBuyChapter}
        onDownloadChapter={handleDownloadChapter}
        onDownloadFull={handleDownloadFull}
      />

      {/* Payment dialog */}
      <PaymentDialog
        open={payDialog.open}
        onClose={() => setPayDialog((prev) => ({ ...prev, open: false }))}
        orderId={orderId}
        scope={payDialog.scope}
        chapterIndex={payDialog.chapterIndex}
        chapterName={payDialog.chapterName}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["student-order", orderId] });
        }}
      />
    </div>
  );
}
