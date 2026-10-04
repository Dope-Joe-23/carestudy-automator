/**
 * Studio → NurseFlow question bank (/studio/nurseflow).
 *
 * One screen with two jobs: bring new cards in from a validated JSON batch,
 * and review what is already stored. Only cards an educator marks `approved`
 * reach the public feed, so the review column leads with status, search and
 * the full card detail (answer options, rationale, source) rather than a
 * bare title.
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Link } from "wouter";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  CircleAlert,
  Eye,
  ExternalLink,
  FileText,
  FileUp,
  ImageIcon,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { API_URL } from "@/lib/apiBase";
import { getAdminToken } from "@/lib/adminAuth";
import { getDisplayName, useAdmin } from "@/lib/adminContext";
import { cn } from "@/lib/utils";

type ReviewStatus = "draft" | "in_review" | "approved" | "retired";

type Question = {
  id: string;
  topic: string;
  level: string;
  title: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
  rationale: string;
  sourceTitle: string;
  sourceUrl: string;
  learningObjective: string;
  visualBrief: string;
  /** "document" means sourceUrl is only a reference (e.g. an uploaded PDF's
   * name), so the card needs a real source before it can be approved. */
  sourceKind?: "url" | "document";
  reviewStatus: ReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type Issue = { row: number; field: string; message: string };
type Filter = "all" | ReviewStatus;

/** Our own job record — the provider's URL and prompt never leave the server. */
type VideoJob = {
  id: string;
  cardId: string | null;
  title: string;
  model: string;
  provider: "image" | "veo";
  mediaType: "image" | "video";
  width: number | null;
  height: number | null;
  status: "in_progress" | "completed" | "failed";
  seconds: number;
  aspectRatio: string;
  error: string | null;
  contentUrl: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

/** A batch the editor is holding, in the shape the validate endpoint expects. */
type PayloadState =
  | { kind: "empty" }
  | { kind: "missing" }
  | { kind: "invalid"; message: string }
  | { kind: "ready"; count: number };

const api = `${API_URL}/nurseflow/questions`;
/// The clip boundary is public (it is not behind the studio session), so it
/// needs its own helper rather than the token-carrying `request` above.
const videoApi = `${API_URL}/nurseflow/video-jobs`;
const EMPTY_PAYLOAD = '{\n  "questions": []\n}';

async function videoRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${videoApi}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The video service is unavailable.");
  return body as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getAdminToken() ?? ""}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body as T;
}

const STATUS_META: Record<ReviewStatus, { label: string; variant: "default" | "secondary" | "outline"; icon: LucideIcon }> = {
  draft: { label: "Draft", variant: "outline", icon: FileText },
  in_review: { label: "In review", variant: "secondary", icon: Eye },
  approved: { label: "Approved", variant: "default", icon: CheckCircle2 },
  retired: { label: "Retired", variant: "outline", icon: Trash2 },
};

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All cards" },
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In review" },
  { value: "approved", label: "Approved" },
  { value: "retired", label: "Retired" },
];

/** Field names as the import endpoint spells them, in reader-friendly words. */
const FIELD_LABELS: Record<string, string> = {
  id: "ID",
  topic: "Topic",
  level: "Level",
  title: "Title",
  question: "Question",
  options: "Options",
  correctOptionIndex: "Correct option",
  rationale: "Rationale",
  sourceTitle: "Source title",
  sourceUrl: "Source URL",
  learningObjective: "Learning objective",
  visualBrief: "Visual brief",
  reviewStatus: "Review status",
};

const statusMeta = (status: string) => STATUS_META[status as ReviewStatus] ?? STATUS_META.draft;

/** Short relative age for the review queue; exact time lives in the tooltip. */
function timeAgo(iso: string | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const fullDate = (iso: string | undefined) => (iso ? new Date(iso).toLocaleString() : "");

/** Read a picked file as raw base64 (no data-URL prefix) for the extract endpoint. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : "");
    };
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.readAsDataURL(file);
  });
}

export function NurseFlowQuestionBankPage() {
  const reviewer = getDisplayName(useAdmin());

  const [questions, setQuestions] = useState<Question[]>([]);
  const [savedAt, setSavedAt] = useState("");
  const [payload, setPayload] = useState(EMPTY_PAYLOAD);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [validation, setValidation] = useState<{ valid: boolean; received: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [starterBusy, setStarterBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // The import editor lives in a modal so the review queue can use the full width.
  const [importOpen, setImportOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);
  // Optional public URL applied to every card extracted from a PDF. Left blank,
  // cards come back flagged as needing a source before approval.
  const [extractSourceUrl, setExtractSourceUrl] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await request<{ questions?: Question[]; updatedAt?: string }>("");
      setQuestions(data.questions ?? []);
      setSavedAt(data.updatedAt ?? "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load question bank.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  /** Live read of the editor contents — mirrors the server's shape checks. */
  const payloadState = useMemo<PayloadState>(() => {
    const trimmed = payload.trim();
    if (!trimmed) return { kind: "empty" };
    try {
      const parsed = JSON.parse(trimmed) as { questions?: unknown };
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.questions)) {
        return { kind: "missing" };
      }
      if (parsed.questions.length === 0) return { kind: "empty" };
      return { kind: "ready", count: parsed.questions.length };
    } catch (error) {
      return { kind: "invalid", message: error instanceof Error ? error.message : "Invalid JSON." };
    }
  }, [payload]);

  const counts = useMemo(() => {
    const tally: Record<Filter, number> = { all: questions.length, draft: 0, in_review: 0, approved: 0, retired: 0 };
    for (const question of questions) {
      if (question.reviewStatus in tally) tally[question.reviewStatus] += 1;
    }
    return tally;
  }, [questions]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return questions
      .filter((question) => filter === "all" || question.reviewStatus === filter)
      .filter((question) =>
        !needle
          ? true
          : [question.title, question.topic, question.id, question.question, question.sourceTitle]
              .filter(Boolean)
              .some((value) => value.toLowerCase().includes(needle)),
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [questions, filter, query]);

  async function validate() {
    try {
      setWorking(true);
      const data = await request<{ valid: boolean; received: number; issues?: Issue[] }>("/validate", {
        method: "POST",
        body: payload,
      });
      setIssues(data.issues ?? []);
      setValidation({ valid: data.valid, received: data.received });
      if (data.valid) toast.success(`All ${data.received} cards passed validation.`);
    } catch (error) {
      setIssues([]);
      setValidation(null);
      toast.error(error instanceof Error ? error.message : "Invalid JSON.");
    } finally {
      setWorking(false);
    }
  }

  async function importBatch() {
    try {
      setWorking(true);
      const data = await request<{ imported: number }>("/import", { method: "POST", body: payload });
      toast.success(`${data.imported} draft card${data.imported === 1 ? "" : "s"} added to the review queue.`);
      setPayload(EMPTY_PAYLOAD);
      setIssues([]);
      setValidation(null);
      setImportOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setWorking(false);
    }
  }

  async function loadStarter() {
    try {
      setStarterBusy(true);
      const data = await request<{ questions?: unknown[] }>("/starter");
      const batch = data.questions ?? [];
      if (batch.length === 0) {
        toast.error("The starter file has no cards in it.");
        return;
      }
      setPayload(JSON.stringify({ questions: batch }, null, 2));
      setIssues([]);
      setValidation(null);
      toast.success(`Starter batch loaded — ${batch.length} cards. Validate, then import as drafts.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the starter batch.");
    } finally {
      setStarterBusy(false);
    }
  }

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-picking the same file
    if (!file) return;
    try {
      const text = await file.text();
      setPayload(text);
      setIssues([]);
      setValidation(null);
      try {
        JSON.parse(text);
        toast.success(`Loaded ${file.name} into the editor.`);
      } catch {
        toast.error(`${file.name} is not valid JSON yet — fix it in the editor.`);
      }
    } catch {
      toast.error("That file could not be read.");
    }
  }

  function formatPayload() {
    try {
      setPayload(JSON.stringify(JSON.parse(payload), null, 2));
      toast.success("JSON formatted.");
    } catch {
      toast.error("Cannot format invalid JSON.");
    }
  }

  function clearPayload() {
    setPayload(EMPTY_PAYLOAD);
    setIssues([]);
    setValidation(null);
  }

  /** Send an uploaded PDF or Word document to the extraction endpoint. */
  async function extractDocument(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      toast.error("Choose a PDF or Word (.docx) file.");
      return;
    }
    try {
      setExtracting(true);
      const content = await fileToBase64(file);
      const data = await request<{ questions?: unknown[] }>("/extract", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, content, sourceUrl: extractSourceUrl.trim() }),
      });
      const cards = data.questions ?? [];
      if (cards.length === 0) {
        toast.error("The document produced no usable cards.");
        return;
      }
      setPayload(JSON.stringify({ questions: cards }, null, 2));
      setIssues([]);
      setValidation(null);
      toast.success(
        `Extracted ${cards.length} card${cards.length === 1 ? "" : "s"} — review the JSON, validate, then import.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  /** Attach a real source URL to a card so it can be approved. */
  async function setSource(id: string, sourceUrl: string) {
    try {
      setBusyId(id);
      await request(`/${encodeURIComponent(id)}/source`, {
        method: "PATCH",
        body: JSON.stringify({ sourceUrl }),
      });
      toast.success("Source URL saved.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the source.");
    } finally {
      setBusyId(null);
    }
  }

  async function review(id: string, reviewStatus: ReviewStatus) {
    try {
      setBusyId(id);
      await request(`/${encodeURIComponent(id)}/review`, {
        method: "PATCH",
        body: JSON.stringify({ reviewStatus, reviewedBy: reviewer }),
      });
      toast.success(`Card marked ${statusMeta(reviewStatus).label.toLowerCase()}.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  const pendingReview = counts.draft + counts.in_review;
  const lines = payload.split("\n").length;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        <Link
          href="/studio"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Studio
        </Link>

        <header className="mt-4 flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[.18em] text-primary">NurseFlow</p>
            <h1 className="mt-1 font-serif text-3xl tracking-tight sm:text-4xl">Question Bank</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Validate, review and publish original learning cards. Only approved cards appear in the public feed.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground sm:inline-flex">
              <ShieldCheck className="size-3.5 text-primary" /> Reviewing as {reviewer}
            </span>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("mr-2 size-4", loading && "animate-spin")} /> Refresh
            </Button>
            <Button onClick={() => setImportOpen(true)}>
              <FileUp className="mr-2 size-4" /> Import cards
            </Button>
          </div>
        </header>

        {/* Compact status pills double as the review-queue filter. */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">
            Bank status
          </span>
          {FILTERS.map((option) => {
            const active = filter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                aria-pressed={active}
                className={cn(
                  "group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/40 hover:bg-accent",
                )}
              >
                <span
                  className={cn(
                    "transition-colors",
                    active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  {option.label}
                </span>
                <span
                  className={cn(
                    "min-w-6 rounded-full px-1.5 py-0.5 text-center font-mono text-[11px] tabular-nums",
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {counts[option.value]}
                </span>
              </button>
            );
          })}
          {filter !== "all" && (
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="ml-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Show all
            </button>
          )}
        </div>
        {pendingReview > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CircleAlert className="size-3.5 text-primary" />
            {pendingReview} card{pendingReview === 1 ? "" : "s"} still need a decision before they reach learners.
          </p>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Import editor (modal)                                            */}
        {/* ---------------------------------------------------------------- */}
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent className="max-w-3xl gap-0 p-0">
            <DialogHeader className="border-b px-6 py-5">
              <DialogTitle className="flex items-center gap-2">
                <FileUp className="size-5 text-primary" /> Import draft cards
              </DialogTitle>
              <DialogDescription>
                Paste a JSON object with a <code>questions</code> array, load the repository's starter batch, or
                extract cards from an uploaded PDF or Word document. Validate before importing — every card is stored
                as a draft, whatever <code>reviewStatus</code> the payload carries, and is published only by an
                approval in the queue.
              </DialogDescription>
            </DialogHeader>
            <div className="px-6 py-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <PayloadPill state={payloadState} />
                <span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                  {lines} line{lines === 1 ? "" : "s"} · {payload.length.toLocaleString()} chars
                </span>
              </div>

              <Textarea
                value={payload}
                onChange={(event) => setPayload(event.target.value)}
                className="mt-3 min-h-[280px] font-mono text-xs leading-relaxed"
                spellCheck={false}
                aria-label="Question batch JSON"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={formatPayload} disabled={payloadState.kind === "invalid"}>
                  <Sparkles className="mr-1.5 size-3.5" /> Format
                </Button>
                <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                  <FileText className="mr-1.5 size-3.5" /> Choose .json
                </Button>
                <Button variant="outline" size="sm" onClick={() => documentInput.current?.click()} disabled={extracting}>
                  {extracting ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 size-3.5" />
                  )}
                  Extract from PDF / Word
                </Button>
                <Button variant="outline" size="sm" onClick={() => void loadStarter()} disabled={starterBusy}>
                  {starterBusy ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-1.5 size-3.5" />
                  )}
                  Load starter questions
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={clearPayload}
                  disabled={payload === EMPTY_PAYLOAD}
                >
                  <Trash2 className="mr-1.5 size-3.5" /> Clear
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(event) => void pickFile(event)}
                />
                <input
                  ref={documentInput}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(event) => void extractDocument(event)}
                />
              </div>

              <div className="mt-3">
                <label
                  htmlFor="extract-source"
                  className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground"
                >
                  Source URL for document extraction (optional)
                </label>
                <Input
                  id="extract-source"
                  value={extractSourceUrl}
                  onChange={(event) => setExtractSourceUrl(event.target.value)}
                  placeholder="https://… — applied to every card; leave blank to flag them as needing a source"
                  className="mt-1"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                <Button variant="outline" onClick={() => void validate()} disabled={working || payloadState.kind !== "ready"}>
                  {working ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldCheck className="mr-2 size-4" />}
                  Validate
                </Button>
                <Button onClick={() => void importBatch()} disabled={working || payloadState.kind !== "ready"}>
                  <Send className="mr-2 size-4" /> Import drafts
                </Button>
              </div>

              {issues.length > 0 ? (
                <div role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                  <p className="flex items-center gap-2 text-xs font-semibold text-destructive">
                    <CircleAlert className="size-4" />
                    {issues.length} issue{issues.length === 1 ? "" : "s"} found — fix these before importing.
                  </p>
                  <ul className="mt-2 space-y-1">
                    {issues.slice(0, 8).map((issue, index) => (
                      <li key={`${issue.row}-${issue.field}-${index}`} className="text-xs leading-relaxed text-muted-foreground">
                        <span className="font-mono text-foreground">Row {issue.row}</span> ·{" "}
                        {FIELD_LABELS[issue.field] ?? issue.field}: {issue.message}
                      </li>
                    ))}
                  </ul>
                  {issues.length > 8 && (
                    <p className="mt-2 text-xs text-muted-foreground">…and {issues.length - 8} more.</p>
                  )}
                </div>
              ) : validation?.valid ? (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
                  <CheckCircle2 className="size-4 shrink-0 text-primary" />
                  All {validation.received} cards passed validation — ready to import as drafts.
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>

        {/* ---------------------------------------------------------------- */}
        {/* Review queue                                                     */}
        {/* ---------------------------------------------------------------- */}
        <div className="mt-6">
          <Card>
            <CardHeader className="gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-3">
                    <span>Review queue</span>
                    <Badge variant="secondary" className="font-mono tabular-nums">
                      {visible.length}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {questions.length === 0
                      ? "Saved cards will collect here."
                      : `${visible.length} of ${questions.length} saved card${questions.length === 1 ? "" : "s"}${
                          savedAt ? ` · saved ${timeAgo(savedAt)}` : ""
                        }`}
                  </CardDescription>
                </div>
                <div className="relative w-full sm:w-72 sm:shrink-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search title, topic or source…"
                    aria-label="Search saved cards"
                    className="pl-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <QueueSkeleton />
              ) : questions.length === 0 ? (
                <EmptyState
                  title="No cards in the bank yet"
                  body="Open the importer to paste a batch, extract cards from a PDF or Word file, or load the starter questions."
                  action={
                    <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                      <FileUp className="mr-1.5 size-3.5" /> Import cards
                    </Button>
                  }
                />
              ) : visible.length === 0 ? (
                <EmptyState
                  title="Nothing matches this view"
                  body="No saved card matches the current filter and search."
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFilter("all");
                        setQuery("");
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                visible.map((question) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    busy={busyId === question.id}
                    expanded={expandedId === question.id}
                    onToggle={() => setExpandedId((current) => (current === question.id ? null : question.id))}
                    onReview={review}
                    onSetSource={setSource}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

/** Live verdict on whatever is in the editor, before any server round-trip. */
function PayloadPill({ state }: { state: PayloadState }) {
  const shell = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium";
  if (state.kind === "ready") {
    return (
      <span className={cn(shell, "border-primary/40 bg-primary/10 text-primary")}>
        <CheckCircle2 className="size-3.5" /> {state.count} card{state.count === 1 ? "" : "s"} ready
      </span>
    );
  }
  if (state.kind === "invalid") {
    return (
      <span className={cn(shell, "border-destructive/40 bg-destructive/10 text-destructive")} title={state.message}>
        <CircleAlert className="size-3.5" /> Invalid JSON
      </span>
    );
  }
  if (state.kind === "missing") {
    return (
      <span className={cn(shell, "border-destructive/40 bg-destructive/10 text-destructive")}>
        <CircleAlert className="size-3.5" /> Needs a questions array
      </span>
    );
  }
  return (
    <span className={cn(shell, "border-dashed text-muted-foreground")}>
      <FileText className="size-3.5" /> Empty payload
    </span>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed p-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{body}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((key) => (
        <div key={key} className="rounded-xl border p-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="mt-3 h-4 w-2/3" />
          <Skeleton className="mt-2 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

function DetailBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

/**
 * Teaching-clip panel for one card. Generation is a three-step, asynchronous
 * boundary: submit, poll, then play from the server's cached copy. The panel
 * restores whatever the server already holds for the card, so closing the tab
 * mid-render does not lose the clip.
 */
function VideoClipPanel({ question }: { question: Question }) {
  const [job, setJob] = useState<VideoJob | null>(null);
  const [watermarked, setWatermarked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(true);
  const brief = question.visualBrief?.trim() ?? "";

  // Pull the newest clip the server has for this card (any status), so a
  // reload shows a finished clip again or resumes watching a running job.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await videoRequest<{ job: VideoJob | null; watermarked?: boolean }>(`?cardId=${encodeURIComponent(question.id)}`);
        if (cancelled) return;
        setJob(data.job);
        setWatermarked(Boolean(data.watermarked));
      } catch {
        // Not configured, or the store is unreachable — the Generate button
        // reports the reason when the editor actually asks for a clip.
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [question.id]);

  // Veo renders out of band; poll while a job is running and stop on a
  // terminal state (the effect re-runs when `status` changes).
  useEffect(() => {
    if (job?.status !== "in_progress") return;
    const jobId = job.id;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const data = await videoRequest<{ job: VideoJob }>(`/${jobId}`);
        if (!cancelled) setJob(data.job);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not check the clip.");
      }
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [job?.status, job?.id]);

  async function generate() {
    try {
      setBusy(true);
      setError("");
      const data = await videoRequest<{ job: VideoJob }>("", {
        method: "POST",
        body: JSON.stringify({ title: question.title, visualBrief: brief, cardId: question.id }),
      });
      setJob(data.job);
      // The default image provider answers synchronously, so a completed job
      // comes back from the create call itself; Veo would return in_progress.
      toast.success(data.job.status === "completed" ? "Teaching visual ready." : "Visual requested — this usually takes a minute to render.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The clip could not be started.");
    } finally {
      setBusy(false);
    }
  }

  const running = busy || job?.status === "in_progress";

  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">
          <ImageIcon className="size-3.5" /> Teaching visual
        </p>
        {!restoring && (
          <Button size="sm" variant={job?.status === "completed" ? "outline" : "default"} onClick={() => void generate()} disabled={running || !brief}>
            {running ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Sparkles className="mr-1.5 size-3.5" />}
            {job?.status === "completed" ? "Generate again" : "Generate visual"}
          </Button>
        )}
      </div>

      {!brief && (
        <p className="mt-2 text-xs text-muted-foreground">
          This card has no visual brief, so there is nothing safe to send to the video model.
        </p>
      )}

      {job?.status === "completed" && job.contentUrl && job.mediaType === "image" && (
        <div className="mt-3 w-full max-w-[220px] overflow-hidden rounded-lg border bg-muted">
          <img
            key={job.id}
            src={job.contentUrl}
            alt={`Teaching visual for ${question.title}`}
            style={{ aspectRatio: `${job.width ?? 9} / ${job.height ?? 16}` }}
            className="nurseflow-visual-drift size-full object-cover"
          />
        </div>
      )}

      {job?.status === "completed" && job.contentUrl && job.mediaType === "video" && (
        <video
          key={job.id}
          src={job.contentUrl}
          controls
          playsInline
          className="mt-3 w-full max-w-[260px] rounded-lg border bg-black"
        />
      )}

      {job?.status === "in_progress" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Rendering — you can collapse this card and come back to it.
        </p>
      )}

      {job?.status === "completed" && (
        <p className="mt-2 text-xs text-muted-foreground">
          {/* The provider may snap the requested size to a model bucket, so
              the exact pixels are not claimed here — only the aspect ratio. */}
          {job.mediaType === "image" ? "still image, animated in the app" : `${job.seconds}s clip`}
          {" · "}
          {job.aspectRatio} · {job.model} · saved {timeAgo(job.completedAt ?? job.updatedAt)}
        </p>
      )}

      {watermarked && job?.mediaType === "image" && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-500">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            The free image tier stamps a watermark. Registering a free token at auth.pollinations.ai and setting
            <span className="font-mono"> NURSEFLOW_IMAGE_TOKEN </span>
            removes it and raises the rate limit.
          </span>
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <p className="mt-3 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">
        Sent to the visual model: <span className="text-foreground/70">{question.title}</span> plus the card's visual
        brief. The generated visual is a training aid, not the evidence source.
      </p>
    </div>
  );
}

/**
 * One saved card. Collapsed it answers "what is this and what state is it in";
 * expanded it shows the full item an educator needs to sign off on — options
 * with the correct answer marked, rationale, source and the visual brief.
 */
/**
 * Inline "needs source" fixer for a card imported from a document. Saving a
 * real URL flips the card to a normal URL source so it can be approved.
 */
function SourceFixer({
  questionId,
  busy,
  onSetSource,
}: {
  questionId: string;
  busy: boolean;
  onSetSource: (id: string, url: string) => void;
}) {
  const [value, setValue] = useState("");
  const valid = /^https?:\/\/\S+$/i.test(value.trim());
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-500">
        <CircleAlert className="size-3.5" /> Needs a source URL before it can be approved
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        This card was extracted from a document, so its source is only a reference. Add the document's public link to
        publish it.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="https://…"
          className="h-9 min-w-[12rem] flex-1"
          aria-label="Source URL"
        />
        <Button size="sm" onClick={() => onSetSource(questionId, value.trim())} disabled={busy || !valid}>
          {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
          Save source
        </Button>
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  busy,
  expanded,
  onToggle,
  onReview,
  onSetSource,
}: {
  question: Question;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onReview: (id: string, status: ReviewStatus) => void;
  onSetSource: (id: string, url: string) => void;
}) {
  const meta = statusMeta(question.reviewStatus);
  const StatusIcon = meta.icon;
  const status = question.reviewStatus;
  const options = Array.isArray(question.options) ? question.options : [];
  const needsSource = question.sourceKind === "document";

  return (
    <article className={cn("rounded-xl border p-4 transition-colors", expanded && "bg-muted/30")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={meta.variant} className="gap-1">
              <StatusIcon className="size-3" /> {meta.label}
            </Badge>
            {question.level && <Badge variant="outline">{question.level}</Badge>}
            {needsSource && (
              <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-700 dark:text-amber-500">
                <CircleAlert className="size-3" /> Needs source
              </Badge>
            )}
            {question.topic && (
              <span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                {question.topic}
              </span>
            )}
          </div>
          <p className="mt-2 font-medium leading-snug">{question.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-mono">{question.id}</span>
            {question.sourceTitle ? ` · ${question.sourceTitle}` : ""}
            {question.updatedAt ? (
              <span title={fullDate(question.updatedAt)}> · updated {timeAgo(question.updatedAt)}</span>
            ) : null}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-muted-foreground"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide card detail" : "Show card detail"}
        >
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
        </Button>
      </div>

      <p className={cn("mt-2 text-sm leading-relaxed text-muted-foreground", !expanded && "line-clamp-2")}>
        {question.question}
      </p>

      {expanded && (
        <div className="mt-3 space-y-3">
          {options.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                Answer options · correct answer marked
              </p>
              <ol className="mt-2 grid gap-1.5">
                {options.map((option, index) => {
                  const correct = index === question.correctOptionIndex;
                  return (
                    <li
                      key={`${question.id}-option-${index}`}
                      className={cn(
                        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm leading-relaxed",
                        correct ? "border-primary/40 bg-primary/5" : "border-border/60",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold",
                          correct ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {String.fromCharCode(65 + index)}
                      </span>
                      <span>{option}</span>
                      {correct && <CheckCircle2 className="ml-auto mt-0.5 size-4 shrink-0 text-primary" />}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {needsSource && <SourceFixer questionId={question.id} busy={busy} onSetSource={onSetSource} />}

          <div className="grid gap-3 sm:grid-cols-2">
            <DetailBlock label="Rationale">{question.rationale || "—"}</DetailBlock>
            <DetailBlock label="Learning objective">{question.learningObjective || "—"}</DetailBlock>
          </div>

          {question.visualBrief && (
            <DetailBlock label="Visual brief">
              <span className="text-muted-foreground">{question.visualBrief}</span>
            </DetailBlock>
          )}

          <VideoClipPanel question={question} />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {question.sourceUrl ? (
              <a
                href={question.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
              >
                <ExternalLink className="size-3.5" /> Open source
              </a>
            ) : null}
            {question.reviewedBy && (
              <span className="inline-flex items-center gap-1" title={fullDate(question.reviewedAt)}>
                <ShieldCheck className="size-3.5" /> Approved by {question.reviewedBy}
                {question.reviewedAt ? ` · ${timeAgo(question.reviewedAt)}` : ""}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        {status !== "approved" && (
          <Button
            size="sm"
            onClick={() => onReview(question.id, "approved")}
            disabled={busy || needsSource}
            title={needsSource ? "Add a source URL before approving" : undefined}
          >
            {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 size-3.5" />}
            Approve
          </Button>
        )}
        {status === "draft" && (
          <Button size="sm" variant="outline" onClick={() => onReview(question.id, "in_review")} disabled={busy}>
            Send to review
          </Button>
        )}
        {status === "in_review" && (
          <Button size="sm" variant="outline" onClick={() => onReview(question.id, "draft")} disabled={busy}>
            Back to draft
          </Button>
        )}
        {status === "retired" && (
          <Button size="sm" variant="outline" onClick={() => onReview(question.id, "draft")} disabled={busy}>
            <RotateCcw className="mr-1.5 size-3.5" /> Restore as draft
          </Button>
        )}
        {status === "approved" && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => onReview(question.id, "retired")}
            disabled={busy}
          >
            <Trash2 className="mr-1.5 size-3.5" /> Retire
          </Button>
        )}
        {status === "approved" && (
          <span className="ml-auto text-xs text-muted-foreground">Live in the public feed</span>
        )}
        {status === "in_review" && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Approval is stamped with your name and the date.
          </span>
        )}
      </div>
    </article>
  );
}
