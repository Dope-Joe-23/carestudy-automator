import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  CircleAlert,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Clipboard,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileCheck2,
  FileText,
  Gauge,
  Globe,
  HeartPulse,
  History,
  Info,
  Library,
  LineChart,
  ListChecks,
  Moon,
  NotebookPen,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Save,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Sun,
  Target,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';
import { ThemeProvider, useTheme } from 'next-themes';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  CHAPTER_TEMPLATE,
  type TemplateField,
  type TemplateRowDef,
} from '@/lib/template';
import {
  addLibrarySource,
  createStudy,
  deleteLibrarySource,
  deleteStudy,
  deleteStudyFile,
  exportStudyDocx,
  getStudy,
  listLibrarySources,
  listStudyFiles,
  readFileAsBase64,
  requestDraft,
  updateLibrarySource,
  updateStudy,
  uploadStudyFile,
  verifyReferences,
  type DraftReference,
  type ExportPayload,
  type ExportScope,
  type LibrarySource,
  type SourceCheck,
  type StoredStudy,
  type StudyFile,
} from '@/lib/api';
import { checkCitationConsistency } from '@/lib/verify';
import { SourceCheckList } from '@/components/source-verification';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StudiesPanel } from '@/components/studies-panel';

type SectionStatus = 'empty' | 'noted' | 'drafted';

type Section = {
  id: string;
  heading: string;
  blurb: string;
  fields: TemplateField[];
  rows?: TemplateRowDef;
  notes: string;
  draft: string;
  /** Reference sources this section's draft was grounded on. */
  references: DraftReference[];
  status: SectionStatus;
  data: Record<string, string>;
  rowData: RowRow[];
};

type RowRow = { id: number; cells: string[] };

type Chapter = {
  name: string;
  shortLabel: string;
  blurb: string;
  /** Unnumbered preliminary pages (preface/acknowledgement/introduction). */
  isFrontMatter?: boolean;
  /** Introduction paragraph that opens this chapter in print and Word export. */
  intro: string;
  /** Sources cited by the drafted chapter introduction. */
  introReferences: DraftReference[];
  sections: Section[];
};

/** Result of verifying one section's (or the whole study's) references. */
type SectionVerification = {
  warnings: string[];
  checks: SourceCheck[];
  checkedAt: string;
};

const CHAPTER_ICONS: LucideIcon[] = [
  ScrollText,
  Stethoscope,
  LineChart,
  Target,
  ClipboardList,
  CheckCircle2,
  BookOpen,
];

let rowIdCounter = 0;
const nextRowId = () => ++rowIdCounter;

function makeChapters(): Chapter[] {
  return CHAPTER_TEMPLATE.map((chapter, chapterIndex) => ({
    name: chapter.name,
    shortLabel: chapter.shortLabel,
    blurb: chapter.blurb,
    isFrontMatter: chapter.isFrontMatter,
    sections: chapter.sections.map((section) => ({
      id: section.id,
      heading: section.heading,
      blurb: section.blurb,
      fields: section.fields,
      rows: section.rows,
      notes: '',
      draft: '',
      references: [],
      status: 'empty' as SectionStatus,
      data: {},
      rowData: [],
    })),
    intro: '',
    introReferences: [],
  }));
}

const queryClient = new QueryClient();

// ---------------------------------------------------------------------------
// Completion helpers
// ---------------------------------------------------------------------------

function sectionFilledCount(section: Section): number {
  const fieldFilled = section.fields.filter((field) => (section.data[field.id] ?? '').trim()).length;
  const cellFilled = section.rowData.reduce(
    (total, row) => total + row.cells.filter((cell) => cell.trim()).length,
    0,
  );
  const notesFilled = section.notes.trim() ? 1 : 0;
  return fieldFilled + cellFilled + notesFilled;
}

function sectionInputCount(section: Section): number {
  const rowCapacity = section.rows
    ? section.rows.columns.length * Math.max(section.rowData.length, 1)
    : 0;
  return section.fields.length + rowCapacity + 1;
}

function sectionCompletion(section: Section): number {
  const total = sectionInputCount(section);
  if (total <= 0) return 0;
  return Math.round((sectionFilledCount(section) / total) * 100);
}

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function computeStatus(section: Section): SectionStatus {
  if (section.draft.trim()) return 'drafted';
  const hasContent =
    section.notes.trim().length > 0 ||
    Object.values(section.data).some((value) => value.trim().length > 0) ||
    section.rowData.some((row) => row.cells.some((cell) => cell.trim().length > 0));
  return hasContent ? 'noted' : 'empty';
}

/**
 * Map a stored row's cells onto the template's current columns (positional).
 * The nursing care plan columns were reordered to the RGN guideline order, so
 * older saved care-plan rows — the 5-cell shape [diagnosis, goal,
 * interventions, rationale, evaluation] or the 7-cell shape that appends
 * [date/time, nursing orders] — are remapped by position instead.
 */
function mapStoredCells(
  sectionId: string,
  cells: (string | undefined)[] | undefined,
  targetRows: TemplateRowDef | undefined,
): string[] {
  if (!targetRows) return [];
  if (
    sectionId === '3.2' &&
    targetRows.id === 'carePlan' &&
    Array.isArray(cells) &&
    (cells.length === 5 || cells.length === 7)
  ) {
    // New order: [diagnosisDate, diagnosis, goal, nursingOrders,
    //             interventions, evaluationDate, evaluation, rationale]
    return [
      cells[5] ?? '', // diagnosis date (legacy generic date/time)
      cells[0] ?? '', // diagnosis
      cells[1] ?? '', // objectives / outcome criteria
      cells[6] ?? '', // nursing orders
      cells[2] ?? '', // interventions
      '', // evaluation date — no legacy equivalent
      cells[4] ?? '', // evaluation
      cells[3] ?? '', // rationale
    ];
  }
  return targetRows.columns.map((_, columnIndex) => cells?.[columnIndex] ?? '');
}

/** Required fields that still need the student's input (soft — never blocks drafting). */
function missingRequiredFields(section: Section): TemplateField[] {
  return section.fields.filter(
    (field) => field.required && !(section.data[field.id] ?? '').trim(),
  );
}

function composeSectionInput(section: Section): string {
  const parts: string[] = [];

  for (const field of section.fields) {
    const value = (section.data[field.id] ?? '').trim();
    if (value) parts.push(`${field.label}: ${value}`);
  }

  if (section.rows) {
    section.rowData.forEach((row, rowIndex) => {
      const filled = row.cells.map((cell) => cell.trim()).filter(Boolean);
      if (filled.length === 0) return;
      parts.push(`${section.rows!.title} — entry ${rowIndex + 1}:`);
      section.rows!.columns.forEach((column, columnIndex) => {
        const cell = (row.cells[columnIndex] ?? '').trim();
        if (cell) parts.push(`  ${column.label}: ${cell}`);
      });
    });
  }

  const notes = section.notes.trim();
  if (notes) parts.push(`Free-form clinical notes:\n${notes}`);

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Field prose — turns collected "label: value" data into professional flowing
// text so a section without a draft still reads like a document. Section 1.1
// (patient's particulars) is composed into a single natural biography;
// other sections render long student-written values as their own paragraphs
// and short facts with a bold-label lead-in. The Word export mirrors these
// same rules in carestudy_rag/src/export_docx.py.
// ---------------------------------------------------------------------------

type FieldProse = { label?: string; text: string };

/** "2026-08-13" → "13th August, 2026"; anything else passes through. */
function formatProseDate(value: string): string {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const [, year, month, day] = match;
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const dayNumber = Number(day);
  const suffix =
    dayNumber % 100 >= 11 && dayNumber % 100 <= 13
      ? 'th'
      : { 1: 'st', 2: 'nd', 3: 'rd' }[dayNumber % 10] ?? 'th';
  return `${dayNumber}${suffix} ${monthNames[Number(month) - 1]}, ${year}`;
}

function capitalizeFirst(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const VITAL_LABEL_RE = /temperature|pulse|respiration|blood pressure|spo₂|spo2|weight/i;

/** Vitals carry their unit in the label: "Temperature (°C)" → "38.7°C". */
function vitalDetail(label: string, value: string): string {
  const name = label.replace(/\(.*\)/, '').trim();
  const unit = label.match(/\(([^)]*)\)/)?.[1].trim() ?? '';
  let detail = value.trim();
  if (unit && !detail.includes(unit)) {
    detail = unit === '%' ? `${detail}${unit}` : `${detail} ${unit}`;
  }
  return `${name} ${detail}`;
}
/** Long student-written values are already prose — keep them as clean paragraphs. */
const PROSE_LENGTH = 60;

/** 1.1 Patient's Particulars → one flowing biography, not one sentence per field. */
function particularsProse(parts: Array<{ label: string; value: string }>): FieldProse[] {
  const by = (pattern: RegExp) => parts.find((part) => pattern.test(part.label))?.value ?? '';

  const name = by(/name\s*\/\s*initials|initials/i);
  const age = by(/^age$/i);
  const dob = by(/date of birth/i);
  const sex = by(/^sex$/i);
  const ethnicity = by(/ethnicity|tribe/i);
  const religion = by(/religion/i);
  const marital = by(/marital status/i);
  const occupation = by(/occupation/i);
  const address = by(/address|residence/i);
  const ward = by(/ward|unit/i);
  // "Hospital number" must not be mistaken for the facility field.
  const facility = by(/facility|hospital(?!\s*number)/i);
  const admissionDate = by(/date.*admission|admission.*date/i);
  const diagnosis = by(/diagnosis/i);
  const informant = by(/informant/i);

  const prose: FieldProse[] = [];

  // Identity sentence — only the parts the student actually filled.
  const identity: string[] = [];
  if (sex) identity.push(sex.toLowerCase());
  const ageNumber = age.trim().match(/^\d+/);
  if (ageNumber) identity.push(`aged ${ageNumber[0]} years`);
  else if (dob) identity.push(`born on ${formatProseDate(dob)}`);
  if (ethnicity) identity.push(`of the ${ethnicity.trim()} tribe`);
  if (religion) {
    const rel = religion.trim();
    identity.push(
      /christian|muslim|hindu|buddhist/i.test(rel) ? `a ${rel}` : `of the ${rel} faith`,
    );
  }
  if (marital) identity.push(marital.toLowerCase());
  if (occupation) identity.push(`a ${occupation.trim().toLowerCase()} by occupation`);
  if (identity.length > 0) {
    const subject = name ? `The patient, ${name.trim()},` : 'The patient';
    const residence = address ? `, residing at ${address.trim()}` : '';
    prose.push({ text: `${subject} is ${joinWithAnd(identity)}${residence}.` });
  }

  // Admission sentence.
  const admission: string[] = [];
  if (ward) admission.push(`to the ${ward.trim().toLowerCase()}`);
  if (facility) admission.push(`at ${facility.trim()}`);
  if (admissionDate) admission.push(`on ${formatProseDate(admissionDate.trim())}`);
  if (admission.length > 0) {
    const pronoun = sex
      ? sex.toLowerCase() === 'female'
        ? 'she'
        : 'he'
      : 'the patient';
    const diagnosisClause = diagnosis ? ` with a diagnosis of ${diagnosis.trim()}` : '';
    prose.push({
      text: `${capitalizeFirst(pronoun)} was admitted ${admission.join(', ')}${diagnosisClause}.`,
    });
  } else if (diagnosis) {
    prose.push({ text: `The admission diagnosis was ${diagnosis.trim()}.` });
  }

  // Informant & reliability.
  if (informant) {
    const cleaned = informant.trim().replace(/\s*[-–—]\s*.*$/i, '').trim();
    let phrase = cleaned;
    if (/^him/i.test(cleaned)) phrase = 'the patient himself';
    else if (/^her/i.test(cleaned)) phrase = 'the patient herself';
    const reliability = /reliab/i.test(informant)
      ? '; the information was deemed reliable'
      : '';
    prose.push({ text: `The informant was ${phrase}${reliability}.` });
  }

  // Anything not woven into the biography (e.g. hospital number) stays a fact.
  const clusterRe =
    /name\s*\/\s*initials|initials|^age$|^sex$|ethnicity|tribe|religion|marital status|occupation|address|residence|date of birth|ward|unit|facility|hospital(?!\s*number)|admission|diagnosis|informant/i;
  for (const part of parts) {
    if (!clusterRe.test(part.label)) prose.push({ label: part.label, text: part.value });
  }
  return prose;
}

/** All other sections: student prose as paragraphs, short facts with bold labels. */
function genericProse(parts: Array<{ label: string; value: string }>): FieldProse[] {
  const prose: FieldProse[] = [];

  // Vitals read naturally as one factual list: "Temperature 38.7°C, pulse 125 bpm…"
  const vitals = parts.filter((part) => VITAL_LABEL_RE.test(part.label));
  if (vitals.length > 0) {
    const details = vitals.map((part) => vitalDetail(part.label, part.value));
    prose.push({ text: `${capitalizeFirst(details.join(', '))}.` });
  }
  const vitalLabels = new Set(vitals.map((part) => part.label));

  for (const part of parts) {
    if (vitalLabels.has(part.label)) continue;
    if (part.value.length >= PROSE_LENGTH) {
      prose.push({ text: part.value });
    } else {
      prose.push({ label: part.label, text: part.value });
    }
  }
  return prose;
}

/** Compose a section's filled fields into prose paragraphs for print/export. */
function fieldsToProse(section: Section): FieldProse[] {
  const parts = section.fields
    .map((field) => ({ label: field.label, value: (section.data[field.id] ?? '').trim() }))
    .filter((part) => part.value);
  return section.id === '1.1' ? particularsProse(parts) : genericProse(parts);
}

// ---------------------------------------------------------------------------
// Field-level building blocks
// ---------------------------------------------------------------------------

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: TemplateField;
  value: string;
  onChange: (value: string) => void;
}) {
  const filled = value.trim().length > 0;
  const inputId = `field-${field.id}`;

  return (
    <div className={cn('space-y-1.5', field.span === 2 && 'sm:col-span-2')}>
      <label
        htmlFor={inputId}
        className="flex items-center gap-1.5 text-xs font-medium text-sidebar-foreground/90"
      >
        <span
          className={cn(
            'grid size-4 shrink-0 place-items-center rounded-full border transition-colors',
            filled
              ? 'border-transparent bg-primary text-primary-foreground'
              : 'border-sidebar-foreground/30 text-transparent',
          )}
        >
          <Check className="size-2.5" strokeWidth={3.2} />
        </span>
        {field.label}
        {field.required && (
          <span className="text-red-400" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {field.type === 'textarea' ? (
        <Textarea
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="min-h-[76px] border-white/15 bg-white/10 leading-relaxed text-sidebar-foreground placeholder:text-sidebar-foreground/40"
          aria-describedby={field.hint ? `hint-${field.id}` : undefined}
          aria-required={field.required || undefined}
        />
      ) : field.type === 'select' ? (
        <Select
          // Always controlled: empty values map to the sentinel option so the
          // component never flips between uncontrolled and controlled.
          value={value || '__none__'}
          onValueChange={(next) => onChange(next === '__none__' ? '' : next)}
        >
          <SelectTrigger
            id={inputId}
            className="h-9 border-white/15 bg-white/10 text-sidebar-foreground data-[placeholder]:text-sidebar-foreground/40"
          >
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Select…</SelectItem>
            {field.options?.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === 'date' ? (
        <Input
          id={inputId}
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 border-white/15 bg-white/10 text-sidebar-foreground [color-scheme:dark]"
          aria-describedby={field.hint ? `hint-${field.id}` : undefined}
          aria-required={field.required || undefined}
        />
      ) : (
        <Input
          id={inputId}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="h-9 border-white/15 bg-white/10 text-sidebar-foreground placeholder:text-sidebar-foreground/40"
          aria-describedby={field.hint ? `hint-${field.id}` : undefined}
          aria-required={field.required || undefined}
        />
      )}

      {field.hint && (
        <p
          className="text-[11px] leading-relaxed text-sidebar-foreground/60"
          id={`hint-${field.id}`}
        >
          {field.hint}
        </p>
      )}
    </div>
  );
}

function RowEditor({
  rowDef,
  rows,
  onChange,
}: {
  rowDef: TemplateRowDef;
  rows: RowRow[];
  onChange: (rows: RowRow[]) => void;
}) {
  const updateCell = (rowId: number, columnIndex: number, value: string) => {
    onChange(
      rows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              cells: row.cells.map((cell, ci) => (ci === columnIndex ? value : cell)),
            }
          : row,
      ),
    );
  };

  const addRow = () =>
    onChange([...rows, { id: nextRowId(), cells: rowDef.columns.map(() => '') }]);
  const removeRow = (rowId: number) => onChange(rows.filter((row) => row.id !== rowId));

  return (
    <div className="mt-4 border-t border-sidebar-border/60 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold text-sidebar-foreground">{rowDef.title}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={addRow}
          className="h-8 gap-1.5 border-white/15 bg-white/10 text-sidebar-foreground hover:bg-white/15 hover:text-sidebar-foreground"
        >
          <Plus className="size-3.5" /> {rowDef.addLabel}
        </Button>
      </div>

      {rows.length === 0 && (
        <p className="mt-3 text-xs italic leading-relaxed text-sidebar-foreground/60">
          {rowDef.emptyHint}
        </p>
      )}

      <div className="mt-3 space-y-2 overflow-x-auto pb-1">
        <AnimatePresence initial={false}>
          {rows.map((row, rowIndex) => (
            <motion.div
              key={row.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="flex items-center gap-2"
              style={{ minWidth: rowDef.columns.length * 132 + 56 }}
            >
              <span className="w-5 shrink-0 text-center font-mono text-[11px] tabular text-sidebar-foreground/60">
                {rowIndex + 1}
              </span>
              {rowDef.columns.map((column, columnIndex) => (
                <Input
                  key={column.id}
                  className="h-8 border-white/15 bg-white/10 text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/40"
                  placeholder={column.label}
                  value={row.cells[columnIndex] ?? ''}
                  onChange={(event) => updateCell(row.id, columnIndex, event.target.value)}
                />
              ))}
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-sidebar-foreground/50 hover:text-red-400"
                onClick={() => removeRow(row.id)}
                aria-label={`Remove ${rowDef.title} row ${rowIndex + 1}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft preview — renders markdown pipe tables so drafted tables don't show
// raw pipes, while everything else stays in the familiar pre-formatted style.
// ---------------------------------------------------------------------------

const PREVIEW_TABLE_ROW = /^\s*\|/;
const PREVIEW_SEPARATOR = /^:?-{2,}:?$/;
const PREVIEW_INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|<sup>[^<]*<\/sup>)/g;

/** Render **bold**, *italic*, and <sup>superscript</sup> inline markdown. */
function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let key = 0;
  for (const part of text.split(PREVIEW_INLINE)) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      nodes.push(<strong key={key++}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith('<sup>') && part.endsWith('</sup>')) {
      nodes.push(
        <sup key={key++} className="text-[9px] leading-none">
          {part.slice(5, -6)}
        </sup>,
      );
    } else if (part.startsWith('*') && part.endsWith('*')) {
      nodes.push(<em key={key++}>{part.slice(1, -1)}</em>);
    } else {
      nodes.push(<span key={key++}>{part}</span>);
    }
  }
  return nodes;
}

type PreviewBlock =
  | { kind: 'text'; text: string }
  | { kind: 'table'; header: string[]; rows: string[][] };

function parsePreviewTable(lines: string[]): { header: string[]; rows: string[][] } | null {
  const parsed: string[][] = [];
  for (const line of lines) {
    const cells = line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.trim().replace(/\*\*(.+?)\*\*|\*(.+?)\*/g, '$1$2'));
    if (cells.length && cells.every((cell) => PREVIEW_SEPARATOR.test(cell))) continue;
    parsed.push(cells);
  }
  if (parsed.length === 0) return null;
  const width = Math.max(...parsed.map((row) => row.length));
  const header = parsed[0].concat(Array(Math.max(width - parsed[0].length, 0)).fill(''));
  const rows = parsed
    .slice(1)
    .map((row) => row.concat(Array(Math.max(width - row.length, 0)).fill('')));
  return { header, rows };
}

function splitPreviewBlocks(draft: string): PreviewBlock[] {
  const blocks: PreviewBlock[] = [];
  // Drafts from the Python engine on Windows may use CRLF line endings;
  // normalize so table cells and text never carry stray carriage returns.
  const lines = draft.replace(/\r/g, '').split('\n');
  let index = 0;
  while (index < lines.length) {
    if (PREVIEW_TABLE_ROW.test(lines[index])) {
      const tableLines: string[] = [];
      while (index < lines.length && PREVIEW_TABLE_ROW.test(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      const table = parsePreviewTable(tableLines);
      blocks.push(
        table ? { kind: 'table', ...table } : { kind: 'text', text: tableLines.join('\n') },
      );
      continue;
    }
    const textLines: string[] = [];
    while (index < lines.length && !PREVIEW_TABLE_ROW.test(lines[index])) {
      textLines.push(lines[index]);
      index += 1;
    }
    blocks.push({ kind: 'text', text: textLines.join('\n') });
  }
  return blocks;
}

/** Shared markdown-table renderer used by both the on-screen preview and the
 *  print/export view, so their table markup never drifts apart. */
function PreviewTable({ header, rows }: { header: string[]; rows: string[][] }) {
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr>
          {header.map((cell, cellIndex) => (
            <th key={cellIndex} className="border bg-muted px-2 py-1 text-left font-semibold">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className="border px-2 py-1 align-top">
                {cell || '—'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DraftPreview({ draft }: { draft: string }) {
  const blocks = useMemo(() => splitPreviewBlocks(draft), [draft]);
  return (
    <div className="mt-4 max-h-[320px] overflow-auto rounded-lg border bg-card p-4 text-xs leading-relaxed">
      {blocks.map((block, index) =>
        block.kind === 'table' ? (
          <div key={index} className="mb-2 overflow-x-auto">
            <PreviewTable header={block.header} rows={block.rows} />
          </div>
        ) : (
          <p key={index} className="whitespace-pre-wrap font-mono leading-relaxed">
            {renderInlineMarkdown(block.text)}
          </p>
        ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Print view draft renderer — converts drafted markdown pipe tables into real
// HTML tables (matching the Word export), so raw "| ... |" never leaks into
// the printed document. Reuses the same block parser as the on-screen preview.
// ---------------------------------------------------------------------------

function PrintDraft({ draft }: { draft: string }) {
  const blocks = useMemo(() => splitPreviewBlocks(draft), [draft]);
  return (
    <div className="mt-1.5 space-y-2">
      {blocks.map((block, index) =>
        block.kind === 'table' ? (
          <div key={index} className="overflow-x-auto">
            <PreviewTable header={block.header} rows={block.rows} />
          </div>
        ) : (
          <p key={index} className="whitespace-pre-wrap text-[13px] leading-relaxed">
            {renderInlineMarkdown(block.text)}
          </p>
        ),
      )}
    </div>
  );
}

/** True when a drafted section already contains a markdown table block. */
function hasMarkdownTable(draft: string): boolean {
  return splitPreviewBlocks(draft).some((block) => block.kind === 'table');
}

/** Number of data rows in the draft's markdown tables (0 when none). */
function draftTableRowCount(draft: string): number {
  return splitPreviewBlocks(draft).reduce(
    (total, block) => (block.kind === 'table' ? total + block.rows.length : total),
    0,
  );
}

// ---------------------------------------------------------------------------
// Sidebar panels — Patient documents and the reference library live in the
// sidebar so the main column stays focused on the section being written.
// ---------------------------------------------------------------------------

function PatientDocumentsPanel({
  studyId,
  files,
  isUploading,
  error,
  onFilePick,
  onRemoveFile,
  onSaveFirst,
}: {
  studyId: number | null;
  files: StudyFile[];
  isUploading: boolean;
  error: string | null;
  onFilePick: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (fileId: number) => void;
  onSaveFirst: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt"
        className="hidden"
        onChange={onFilePick}
      />
      {studyId ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-full gap-1.5 text-xs"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <RotateCcw className="size-3 animate-spin" />
          ) : (
            <Upload className="size-3" />
          )}
          {isUploading ? 'Uploading…' : 'Upload document'}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-full gap-1.5 text-xs"
          onClick={onSaveFirst}
        >
          <Save className="size-3" /> Save study first
        </Button>
      )}
      {!studyId ? (
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          Documents attach to a saved study — save the workspace once to unlock uploads.
        </p>
      ) : files.length === 0 ? (
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          No documents yet. Upload an admission sheet, lab results, or referral letter.
        </p>
      ) : (
        <ul className="space-y-1">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-1.5 rounded-md border bg-card px-2 py-1.5"
            >
              <FileText className="size-3 shrink-0 text-primary" />
              <span
                className="min-w-0 flex-1 truncate text-[11px] font-medium"
                title={`${file.filename} (${formatFileSize(file.size)})`}
              >
                {file.filename}
              </span>
              {file.status === 'ready' ? (
                <Check
                  className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-label="Ready"
                />
              ) : file.status === 'error' ? (
                <span title={file.error ?? undefined} className="grid shrink-0 place-items-center">
                  <CircleAlert
                    className="size-3 text-destructive"
                    aria-label="Failed"
                  />
                </span>
              ) : (
                <RotateCcw
                  className="size-3 shrink-0 animate-spin text-muted-foreground"
                  aria-label="Indexing"
                />
              )}
              <button
                type="button"
                onClick={() => onRemoveFile(file.id)}
                aria-label={`Remove ${file.filename}`}
                className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] leading-relaxed text-destructive">
          <CircleAlert className="mt-0.5 size-3 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

function ReferenceLibraryPanel({
  sources,
  busy,
  error,
  url,
  onUrlChange,
  onAddUrl,
  onFilePick,
  onEdit,
  onRemove,
}: {
  sources: LibrarySource[];
  busy: boolean;
  error: string | null;
  url: string;
  onUrlChange: (value: string) => void;
  onAddUrl: () => void;
  onFilePick: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onEdit: (source: LibrarySource) => void;
  onRemove: (id: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="file"
          accept=".epub,.pdf,.docx,.txt,.md"
          className="hidden"
          onChange={onFilePick}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-7 flex-1 gap-1.5 text-xs"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <Upload className="size-3" /> Add file
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 flex-1 gap-1.5 text-xs"
          onClick={onAddUrl}
          disabled={!url.trim() || busy}
        >
          {busy ? (
            <RotateCcw className="size-3 animate-spin" />
          ) : (
            <Globe className="size-3" />
          )}
          Add link
        </Button>
      </div>
      <Input
        value={url}
        onChange={(event) => onUrlChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onAddUrl();
          }
        }}
        placeholder="Paste an article / resource link…"
        className="h-7 text-xs"
      />
      {sources.length === 0 ? (
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          Your library is empty. Add an ebook, article, notes, or a link — drafts cite them.
        </p>
      ) : (
        <ul className="space-y-1">
          {sources.map((source) => {
            const KindIcon: LucideIcon =
              source.kind === 'ebook'
                ? BookOpen
                : source.kind === 'notes'
                  ? NotebookPen
                  : source.kind === 'url'
                    ? Globe
                    : FileText;
            return (
              <li
                key={source.id}
                className="flex items-center gap-1.5 rounded-md border bg-card px-2 py-1.5"
              >
                <KindIcon className="size-3 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium" title={source.title}>
                    {source.title}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {[source.author, source.year, source.citeKey].filter(Boolean).join(' · ') ||
                      (source.kind === 'url' && source.url ? source.url : source.kind)}
                  </span>
                </span>
                {source.status === 'ready' ? (
                  <Check
                    className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-label="Ready"
                  />
                ) : source.status === 'error' ? (
                  <span title={source.error ?? undefined} className="grid shrink-0 place-items-center">
                    <CircleAlert className="size-3 text-destructive" aria-label="Failed" />
                  </span>
                ) : (
                  <RotateCcw
                    className="size-3 shrink-0 animate-spin text-muted-foreground"
                    aria-label="Indexing"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onEdit(source)}
                  aria-label={`Edit citation for ${source.title}`}
                  className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Pencil className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(source.id)}
                  aria-label={`Remove ${source.title}`}
                  className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] leading-relaxed text-destructive">
          <CircleAlert className="mt-0.5 size-3 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/** How long after the last edit before the workspace autosaves. */
const AUTOSAVE_DELAY_MS = 1500;

const ONBOARDING_STEPS = [
  {
    title: 'Pick a chapter & section',
    text: 'Six chapters, twenty sections — each with a template of exactly what to collect.',
  },
  {
    title: 'Fill the template or jot notes',
    text: 'Fields update your progress automatically. Nothing is ever invented for you.',
  },
  {
    title: 'Draft, review, and print',
    text: 'Draft each section from your own input, then export the full study for submission.',
  },
];

function Home() {
  const { resolvedTheme, setTheme } = useTheme();
  const [chapters, setChapters] = useState(makeChapters);
  const [activeChapter, setActiveChapter] = useState(0);
  const [activeSection, setActiveSection] = useState(0);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isIntroDrafting, setIsIntroDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [sectionTab, setSectionTab] = useState<'collect' | 'draft'>('collect');
  const [collectOpen, setCollectOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Manual draft editing: toggle the rendered draft into an editable text box.
  const [draftEditing, setDraftEditing] = useState(false);
  const [draftWork, setDraftWork] = useState('');
  const [commandOpen, setCommandOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [exportMeta, setExportMeta] = useState({
    patientName: '',
    diagnosis: '',
    studentName: '',
    indexNumber: '',
    collegeName: 'Nursing & Midwifery Training College',
    collegeLocation: '',
    year: String(new Date().getFullYear()),
  });
  const [currentStudyId, setCurrentStudyId] = useState<number | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [studyListKey, setStudyListKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  // Save dialog: an editable, pre-derived study name so saved studies aren't
  // all labelled "Care study".
  const [saveOpen, setSaveOpen] = useState(false);
  const [studyName, setStudyName] = useState('');
  const [currentStudyName, setCurrentStudyName] = useState<string | null>(null);
  // New-study dialog: name the study up front so it shows in the navbar and is
  // used as the default when the workspace is first saved.
  const [newStudyOpen, setNewStudyOpen] = useState(false);
  const [newStudyName, setNewStudyName] = useState('');
  // Uploaded patient documents (PDF/DOCX/TXT) that ground every draft.
  const [studyFiles, setStudyFiles] = useState<StudyFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Personal reference library (ebooks, notes, articles, external resources).
  const [librarySources, setLibrarySources] = useState<LibrarySource[]>([]);
  const [libraryUrl, setLibraryUrl] = useState('');
  const [isLibraryBusy, setIsLibraryBusy] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [editSource, setEditSource] = useState<LibrarySource | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string;
    author: string;
    year: string;
    venue: string;
    citeKey: string;
    url: string;
  } | null>(null);

  // Reference verification results, keyed by section id so they survive
  // navigation; cleared whenever a section is re-drafted or a new study loads.
  const [verifyBySection, setVerifyBySection] = useState<Record<string, SectionVerification>>({});
  const [verifyPending, setVerifyPending] = useState<Record<string, boolean>>({});
  const [verifyAll, setVerifyAll] = useState<SectionVerification | null>(null);
  const [verifyAllPending, setVerifyAllPending] = useState(false);
  // Set before programmatic workspace changes (load/reset/new) so the dirty
  // tracker below doesn't mark freshly-loaded state as unsaved edits.
  const suppressDirty = useRef(false);
  // Bumped whenever the workspace is replaced (open/reset/new) so a stale
  // in-flight autosave can detect that its snapshot was discarded.
  const workspaceGeneration = useRef(0);
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    try {
      return !window.localStorage.getItem('carestudy_onboarding');
    } catch {
      return true;
    }
  });

  const markOnboardingSeen = () => {
    try {
      window.localStorage.setItem('carestudy_onboarding', 'seen');
    } catch {
      // ignore storage errors
    }
  };

  const currentChapter = chapters[activeChapter];
  const currentSection = currentChapter.sections[activeSection];
  const allSections = useMemo(() => chapters.flatMap((chapter) => chapter.sections), [chapters]);

  // The front-matter chapter (preface/acknowledgement/introduction) is
  // unnumbered in the document; the real chapters keep their I–VI numbering.
  const isFrontMatterChapter = (chapterIndex: number) =>
    Boolean(chapters[chapterIndex]?.isFrontMatter);
  const chapterOrdinal = (chapterIndex: number) =>
    chapters.slice(0, chapterIndex).filter((chapter) => !chapter.isFrontMatter).length;

  /** Every distinct reference cited anywhere in the study (for the print view). */
  const allReferences = useMemo(() => {
    const seen = new Set<string>();
    const refs: DraftReference[] = [];
    for (const chapter of chapters) {
      for (const ref of chapter.introReferences ?? []) {
        if (!seen.has(ref.label)) {
          seen.add(ref.label);
          refs.push(ref);
        }
      }
      for (const section of chapter.sections) {
        for (const ref of section.references ?? []) {
          if (!seen.has(ref.label)) {
            seen.add(ref.label);
            refs.push(ref);
          }
        }
      }
    }
    return refs;
  }, [chapters]);

  /** True when the student's Bibliography section (6.3) has entries — its
   *  curated list then replaces the auto-generated references list. */
  const hasBibliography = useMemo(
    () =>
      chapters.some((chapter) =>
        chapter.sections.some(
          (section) =>
            section.id === '6.3' &&
            section.rowData.some((row) => row.cells.some((cell) => cell.trim())),
        ),
      ),
    [chapters],
  );

  const draftedCount = allSections.filter((section) => section.status === 'drafted').length;
  const inProgressCount = allSections.filter((section) => section.status === 'noted').length;

  const totalFilled = allSections.reduce((sum, section) => sum + sectionFilledCount(section), 0);
  const overallCompletion = Math.round(
    allSections.reduce((sum, section) => sum + sectionCompletion(section), 0) /
      Math.max(allSections.length, 1),
  );
  // Save unlocks as soon as anything has been collected (a field, a note, a
  // drafted intro). Export stays locked until at least one section is drafted,
  // so a document never leaves the app without any drafted content.
  const canSave =
    totalFilled > 0 ||
    draftedCount > 0 ||
    studyFiles.length > 0 ||
    chapters.some((chapter) => chapter.intro.trim().length > 0);
  const canExport = draftedCount > 0;

  const chapterCompletion = (chapterIndex: number) => {
    const sections = chapters[chapterIndex].sections;
    if (sections.length === 0) return 0;
    return Math.round(
      sections.reduce((sum, section) => sum + sectionCompletion(section), 0) / sections.length,
    );
  };

  const chapterMissingRequired = (chapterIndex: number) =>
    chapters[chapterIndex].sections.reduce(
      (sum, section) =>
        section.status === 'drafted' ? sum : sum + missingRequiredFields(section).length,
      0,
    );

  const updateSection = (
    chapterIndex: number,
    sectionIndex: number,
    updates: Partial<Section>,
  ) => {
    setChapters((previous) =>
      previous.map((chapter, ci) => {
        if (ci !== chapterIndex) return chapter;
        return {
          ...chapter,
          sections: chapter.sections.map((section, si) =>
            si === sectionIndex
              ? { ...section, ...updates, status: computeStatus({ ...section, ...updates }) }
              : section,
          ),
        };
      }),
    );
  };

  const updateCurrentSection = (updates: Partial<Section>) =>
    updateSection(activeChapter, activeSection, updates);

  const setFieldValue = (fieldId: string, value: string) => {
    updateCurrentSection({ data: { ...currentSection.data, [fieldId]: value } });
  };

  const setRowData = (rows: RowRow[]) => {
    updateCurrentSection({ rowData: rows });
  };

  const jumpTo = (chapterIndex: number, sectionIndex: number) => {
    setActiveChapter(chapterIndex);
    setActiveSection(sectionIndex);
    setDraftError(null);
  };

  const selectChapter = (index: number) => jumpTo(index, 0);

  const goPrevious = () => {
    setDraftError(null);
    if (activeSection > 0) {
      setActiveSection(activeSection - 1);
    } else if (activeChapter > 0) {
      setActiveChapter(activeChapter - 1);
      setActiveSection(chapters[activeChapter - 1].sections.length - 1);
    }
  };

  const goNext = () => {
    setDraftError(null);
    if (activeSection < currentChapter.sections.length - 1) {
      setActiveSection(activeSection + 1);
    } else if (activeChapter < chapters.length - 1) {
      setActiveChapter(activeChapter + 1);
      setActiveSection(0);
    }
  };

  const draftSection = async () => {
    if (!draftAvailable || isDrafting) return;
    // Capture the target section now: the request takes seconds, and the user
    // may navigate to another section before it resolves.
    const targetChapter = activeChapter;
    const targetSection = activeSection;
    const targetSectionId = currentSection.id;
    const heading = currentSection.heading;
    setIsDrafting(true);
    setDraftError(null);
    try {
      const composed = composeSectionInput(currentSection);
      // Pure row-data sections (2.2 drugs, 3.2 care plan) are drafted as tables.
      // Mixed sections like 5.1 (narrative fields + an outcomes grid) stay prose
      // — their grid still exports as a structured table.
      const tabular = Boolean(currentSection.rows) && currentSection.fields.length === 0;
      // Pass the section template's column headers so the drafted table matches
      // the expected layout (drug, dose, indication, ...) instead of making
      // up its own columns.
      const rowColumns =
        tabular && currentSection.rows
          ? currentSection.rows.columns.map((column) => column.label)
          : [];
      const result = await requestDraft(
        heading,
        composed,
        tabular,
        'section',
        currentStudyId,
        rowColumns,
      );
      updateSection(targetChapter, targetSection, {
        draft: result.draft,
        references: result.references,
      });
      // Land on the Draft tab so the freshly generated text is what's on
      // screen — but only if the user is still viewing the section that was
      // drafted (they may have navigated away mid-generation).
      if (activeChapter === targetChapter && activeSection === targetSection) {
        setSectionTab('draft');
      }
      // The draft changed — any earlier verification of this section (and of
      // the whole study) is stale.
      setVerifyBySection((prev) => {
        if (!(targetSectionId in prev)) return prev;
        const next = { ...prev };
        delete next[targetSectionId];
        return next;
      });
      setVerifyAll(null);
      setCopied(false);
      toast.success(`Draft ready — ${currentSection.heading}`, {
        description: 'Retrieved from your library and drafted locally. Review and refine the wording before submission.',
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'The drafting service is unreachable. Is the API server running?';
      // Keep the failure visible in the draft panel, not just a transient toast.
      setDraftError(message);
      toast.error('Drafting failed', { description: message });
    } finally {
      setIsDrafting(false);
    }
  };

  const clearSection = () => {
    setSectionTab('collect');
    setCollectOpen(false);
    setDraftEditing(false);
    updateCurrentSection({ notes: '', draft: '', references: [], data: {}, rowData: [] });
    setVerifyBySection((prev) => {
      const next = { ...prev };
      delete next[currentSection.id];
      return next;
    });
    setVerifyAll(null);
    setCopied(false);
    setDraftError(null);
  };

  const resetAll = () => {
    workspaceGeneration.current += 1;
    setSectionTab('collect');
    setCollectOpen(false);
    setChapters(makeChapters());
    setActiveChapter(0);
    setActiveSection(0);
    setVerifyBySection({});
    setVerifyAll(null);
    setCopied(false);
    setDraftError(null);
    // Detach from the saved study so the next save creates a fresh one rather
    // than overwriting the existing study with a blank workspace.
    setCurrentStudyId(null);
    setLastSavedAt(null);
    setStudyFiles([]);
    setUploadError(null);
    try {
      window.localStorage.removeItem(LAST_STUDY_KEY);
    } catch {
      // ignore storage errors
    }
    toast.success('All progress cleared', {
      description: 'Your workspace is back to a blank study.',
    });
  };

  const copyOutput = async () => {
    if (!currentSection.draft) return;
    await navigator.clipboard?.writeText(currentSection.draft);
    setCopied(true);
    toast('Draft copied to clipboard');
    window.setTimeout(() => setCopied(false), 1800);
  };

  /** Enter draft-edit mode with a working copy of the current draft. */
  const startDraftEdit = () => {
    setDraftWork(currentSection.draft);
    setDraftEditing(true);
  };

  /** Write the edited text back into the section and leave edit mode. */
  const saveDraftEdit = () => {
    updateCurrentSection({ draft: draftWork });
    setDraftEditing(false);
    toast.success('Draft updated', {
      description: 'Your edits are saved with this section.',
    });
  };

  /** Update the active chapter's introduction (and the sources it cites). */
  const updateChapterIntro = (
    chapterIndex: number,
    intro: string,
    introReferences: DraftReference[],
  ) => {
    setChapters((previous) =>
      previous.map((chapter, ci) =>
        ci === chapterIndex ? { ...chapter, intro, introReferences } : chapter,
      ),
    );
  };

  /** Draft the active chapter's introduction with the AI engine. */
  const draftChapterIntro = async () => {
    if (isIntroDrafting) return;
    const targetChapter = activeChapter;
    setIsIntroDrafting(true);
    try {
      const chapter = chapters[targetChapter];
      const heading = isFrontMatterChapter(targetChapter)
        ? chapter.name
        : `Chapter ${ROMAN[chapterOrdinal(targetChapter)]}: ${chapter.name}`;
      // Ground the intro in the chapter's scope: its name, blurb, and the
      // headings of everything it covers.
      const notes = [
        chapter.name,
        chapter.blurb,
        ...chapter.sections.map((section) => `${section.id} ${section.heading} — ${section.blurb}`),
      ].join('\n');
      const result = await requestDraft(heading, notes, false, 'chapter_intro', currentStudyId);
      updateChapterIntro(targetChapter, result.draft, result.references);
      toast.success(`Introduction drafted — ${chapter.name}`, {
        description: 'A short opening paragraph for this chapter. Review and refine the wording before submission.',
      });
    } catch (error) {
      toast.error('Could not draft the introduction', {
        description:
          error instanceof Error
            ? error.message
            : 'The drafting service is unreachable. Is the API server running?',
      });
    } finally {
      setIsIntroDrafting(false);
    }
  };

  const clearChapterIntro = () => {
    updateChapterIntro(activeChapter, '', []);
  };

  // -------------------------------------------------------------------------
  // Citation / reference verification
  // -------------------------------------------------------------------------

  const formatCheckTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  /** Verify the current section's sources: local consistency + live URL checks. */
  const verifySectionSources = async () => {
    const sectionId = currentSection.id;
    const refs = currentSection.references;
    if (refs.length === 0 || verifyPending[sectionId]) return;
    setVerifyPending((prev) => ({ ...prev, [sectionId]: true }));
    const localWarnings = checkCitationConsistency(currentSection.draft, refs);
    try {
      const { results, checkedAt } = await verifyReferences(refs);
      setVerifyBySection((prev) => ({
        ...prev,
        [sectionId]: {
          warnings: localWarnings,
          checks: results,
          checkedAt: formatCheckTime(checkedAt),
        },
      }));
      const problems = results.filter((result) => result.status !== 'ok').length;
      if (problems === 0 && localWarnings.length === 0) {
        toast.success('Sources verified', {
          description: 'Every citation matches a listed source and every link resolves.',
        });
      } else {
        toast('Verification found things to review', {
          description: `${problems} link${problems === 1 ? '' : 's'} and ${localWarnings.length} citation ${localWarnings.length === 1 ? 'issue' : 'issues'} — check the results below.`,
        });
      }
    } catch (error) {
      // Server unreachable: still surface the local consistency check.
      setVerifyBySection((prev) => ({
        ...prev,
        [sectionId]: {
          warnings: [
            ...localWarnings,
            'Could not reach the verification service — live link checks were skipped.',
          ],
          checks: [],
          checkedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      }));
      toast.error('Verification failed', {
        description:
          error instanceof Error
            ? error.message
            : 'The verification service is unreachable. Is the API server running?',
      });
    } finally {
      setVerifyPending((prev) => ({ ...prev, [sectionId]: false }));
    }
  };

  /** Verify every source across the whole study (from the print/export dialog). */
  const verifyAllSources = async () => {
    if (allReferences.length === 0 || verifyAllPending) return;
    setVerifyAllPending(true);
    const warnings: string[] = [];
    for (const section of allSections) {
      if (section.references.length === 0) continue;
      for (const warning of checkCitationConsistency(section.draft, section.references)) {
        warnings.push(`${section.id} ${section.heading}: ${warning}`);
      }
    }
    try {
      const { results, checkedAt } = await verifyReferences(allReferences);
      setVerifyAll({ warnings, checks: results, checkedAt: formatCheckTime(checkedAt) });
      const problems = results.filter((result) => result.status !== 'ok').length;
      if (problems === 0 && warnings.length === 0) {
        toast.success('All sources verified', {
          description: `${allReferences.length} source${allReferences.length === 1 ? '' : 's'} — every citation matches and every link resolves.`,
        });
      } else {
        toast('Verification found things to review', {
          description: `${problems} link${problems === 1 ? '' : 's'} and ${warnings.length} citation ${warnings.length === 1 ? 'issue' : 'issues'} across the study.`,
        });
      }
    } catch (error) {
      setVerifyAll({
        warnings: [
          ...warnings,
          'Could not reach the verification service — live link checks were skipped.',
        ],
        checks: [],
        checkedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
      toast.error('Verification failed', {
        description:
          error instanceof Error
            ? error.message
            : 'The verification service is unreachable. Is the API server running?',
      });
    } finally {
      setVerifyAllPending(false);
    }
  };

  /** Build the server-side Word export payload from the current workspace. */
  const buildExportPayload = (scope: ExportScope = { type: 'full' }): ExportPayload => ({
    title: exportMeta,
    scope,
    chapters: chapters.map((chapter) => ({
      name: chapter.name,
      isFrontMatter: chapter.isFrontMatter,
      intro: chapter.intro,
      introReferences: chapter.introReferences,
      sections: chapter.sections.map((section) => {
        const fields = section.fields
          .filter((field) => (section.data[field.id] ?? '').trim())
          .map((field) => ({ label: field.label, value: section.data[field.id].trim() }));
        const rows = section.rows
          ? {
              title: section.rows.title,
              columns: section.rows.columns.map((column) => column.label),
              data: section.rowData
                .map((row) => section.rows!.columns.map((_, ci) => row.cells[ci] ?? ''))
                .filter((cells) => cells.some((cell) => cell.trim())),
            }
          : undefined;
        return {
          id: section.id,
          heading: section.heading,
          draft: section.draft,
          references: section.references,
          fields,
          rows,
        };
      }),
    })),
  });

  const downloadDocx = async (scope: ExportScope = { type: 'full' }) => {
    try {
      const blob = await exportStudyDocx(buildExportPayload(scope));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName =
        (exportMeta.studentName.trim() || 'care-study')
          .replace(/[^a-z0-9\-_ ]/gi, '')
          .trim() || 'care-study';
      const rawScopeName =
        scope.type === 'section'
          ? `${currentSection.id} ${currentSection.heading}`
          : scope.type === 'chapter'
            ? isFrontMatterChapter(activeChapter)
              ? currentChapter.name
              : `Chapter ${ROMAN[chapterOrdinal(activeChapter)]} - ${currentChapter.name}`
            : 'Care Study';
      const safeScopeName = rawScopeName.replace(/[^a-z0-9\-_. ]/gi, '').trim() || 'Care Study';
      link.href = url;
      link.download = `${safeName} - ${safeScopeName}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Word document downloaded', {
        description:
          scope.type === 'full'
            ? 'Formatted to the standard care study layout.'
            : 'This part of the study was formatted with the care study layout.',
      });
    } catch (error) {
      toast.error('Export failed', {
        description:
          error instanceof Error
            ? error.message
            : 'The export service is unreachable. Is the API server running?',
      });
    }
  };

  // -------------------------------------------------------------------------
  // Study storage — autosave, open, and delete via the server database
  // -------------------------------------------------------------------------

  const LAST_STUDY_KEY = 'carestudy_last_study';

  /** Serialize the workspace into the server-side snapshot shape. */
  const buildStudyPayload = (): StoredStudy => ({
    title: exportMeta,
    chapters: chapters.map((chapter) => ({
      name: chapter.name,
      intro: chapter.intro,
      introReferences: chapter.introReferences,
      sections: chapter.sections.map((section) => ({
        id: section.id,
        notes: section.notes,
        draft: section.draft,
        references: section.references,
        data: section.data,
        rowData: section.rowData.map((row) => ({ cells: row.cells })),
      })),
    })),
  });

  /**
   * Replace the workspace with a stored snapshot, re-keyed to the current
   * template (fields/rows always come from CHAPTER_TEMPLATE, so saved data
   * survives template tweaks).
   */
  const loadStudyIntoWorkspace = (
    stored: StoredStudy,
    studyId: number | null,
    announce = true,
  ) => {
    workspaceGeneration.current += 1;
    const next = makeChapters();
    for (const chapter of stored.chapters) {
      const chapterIndex = CHAPTER_TEMPLATE.findIndex(
        (template) => template.name === chapter.name,
      );
      if (chapterIndex < 0) continue;
      // Old saves have no intro — default to an empty string so the chapter
      // still renders exactly as before.
      next[chapterIndex].intro = typeof chapter.intro === 'string' ? chapter.intro : '';
      next[chapterIndex].introReferences = Array.isArray(chapter.introReferences)
        ? chapter.introReferences
        : [];
      for (const saved of chapter.sections) {
        const target = next[chapterIndex].sections.find((section) => section.id === saved.id);
        if (!target) continue;
        target.notes = typeof saved.notes === 'string' ? saved.notes : '';
        target.draft = typeof saved.draft === 'string' ? saved.draft : '';
        target.references = Array.isArray(saved.references) ? saved.references : [];
        target.data =
          saved.data && typeof saved.data === 'object'
            ? (saved.data as Record<string, string>)
            : {};
        // Older templates stored problems, strengths and nursing diagnoses all
        // under the single “2.3 Health Needs Identified” section. Old saves
        // still hold those keys under 2.3 — move strengths and nursing
        // diagnoses into their new sections so nothing is lost.
        if (saved.id === '2.3' && saved.data && typeof saved.data === 'object') {
          const legacy = saved.data as Record<string, string>;
          const strengthsSection = next[chapterIndex].sections.find((s) => s.id === '2.4');
          const diagnosesSection = next[chapterIndex].sections.find((s) => s.id === '2.5');
          if (
            strengthsSection &&
            typeof legacy.strengths === 'string' &&
            legacy.strengths.trim()
          ) {
            strengthsSection.data = { strengths: legacy.strengths };
            strengthsSection.status = computeStatus(strengthsSection);
          }
          if (
            diagnosesSection &&
            typeof legacy.nursingDiagnoses === 'string' &&
            legacy.nursingDiagnoses.trim()
          ) {
            diagnosesSection.data = { nursingDiagnoses: legacy.nursingDiagnoses };
            diagnosesSection.status = computeStatus(diagnosesSection);
          }
        }
        target.rowData = Array.isArray(saved.rowData)
          ? saved.rowData.map((row) => ({
              id: nextRowId(),
              cells: mapStoredCells(saved.id, row.cells, target.rows),
            }))
          : [];
        target.status = computeStatus(target);
      }
    }
    suppressDirty.current = true;
    setChapters(next);
    setVerifyBySection({});
    setVerifyAll(null);
    setExportMeta({
      patientName: typeof stored.title?.patientName === 'string' ? stored.title.patientName : '',
      diagnosis: typeof stored.title?.diagnosis === 'string' ? stored.title.diagnosis : '',
      studentName: typeof stored.title?.studentName === 'string' ? stored.title.studentName : '',
      indexNumber: typeof stored.title?.indexNumber === 'string' ? stored.title.indexNumber : '',
      collegeName: stored.title?.collegeName || 'Nursing & Midwifery Training College',
      collegeLocation:
        typeof stored.title?.collegeLocation === 'string' ? stored.title.collegeLocation : '',
      year: stored.title?.year || String(new Date().getFullYear()),
    });
    setCurrentStudyId(studyId);
    // The loaded study may have a different name — forget any cached one so
    // the next save dialog derives a fresh default.
    setCurrentStudyName(null);
    // Files are study-scoped; the caller refreshes them when a study id exists.
    setStudyFiles([]);
    setActiveChapter(0);
    setActiveSection(0);
    setCopied(false);
    setDraftError(null);
    setDirty(false);
    if (announce) {
      toast.success('Study opened', { description: 'Your workspace was restored.' });
    }
  };

  /**
   * Derive a recognizable, unique study name from the patient data itself —
   * the 1.1 particulars (initials + admission diagnosis) first, the title-page
   * fields second, and a dated fallback last so nothing is ever just "Care study".
   */
  const deriveStudyName = () => {
    const particulars = chapters[0]?.sections.find((section) => section.id === '1.1');
    const patient =
      (particulars?.data['initials'] ?? '').trim() || exportMeta.patientName.trim();
    const diagnosis =
      (particulars?.data['diagnosis'] ?? '').trim() || exportMeta.diagnosis.trim();
    if (patient && diagnosis) return `${patient} — ${diagnosis}`.slice(0, 80);
    if (patient) return patient.slice(0, 80);
    if (diagnosis) return `Care study — ${diagnosis}`.slice(0, 80);
    const today = new Date().toLocaleDateString([], {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return `Care study — ${today}`;
  };

  /** Open the save dialog with a sensible, editable default name. */
  const openSaveDialog = () => {
    // Re-saving keeps the name the study was last saved under; a fresh save
    // derives one from the patient data (or uses the name chosen at creation).
    setStudyName(currentStudyName ?? deriveStudyName());
    setSaveOpen(true);
  };

  /** Open the new-study dialog with a derived default name to edit. */
  const openNewStudyDialog = () => {
    setNewStudyName(deriveStudyName());
    setNewStudyOpen(true);
  };

  /** Start a blank study under the name chosen in the dialog. */
  const createNewStudy = () => {
    const name = newStudyName.trim() || deriveStudyName();
    setNewStudyOpen(false);
    startNewStudy(name);
  };

  const saveStudy = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const data = buildStudyPayload();
      const name = studyName.trim() || deriveStudyName();
      const saved = currentStudyId
        ? await updateStudy(currentStudyId, name, data)
        : await createStudy(name, data);
      setCurrentStudyId(saved.id);
      setCurrentStudyName(name);
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setDirty(false);
      setSaveOpen(false);
      try {
        window.localStorage.setItem(LAST_STUDY_KEY, String(saved.id));
      } catch {
        // ignore storage errors
      }
      setStudyListKey((key) => key + 1);
      toast.success('Study saved', {
        description: currentStudyId
          ? 'Your latest work is saved.'
          : 'Saved to the server — reopen it anytime from “My studies”.',
      });
    } catch (error) {
      toast.error('Save failed', {
        description:
          error instanceof Error
            ? error.message
            : 'The storage service is unreachable. Is the API server running?',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const openStudy = async (id: number) => {
    try {
      const detail = await getStudy(id);
      loadStudyIntoWorkspace(detail.data, id);
      setCurrentStudyName(detail.name);
      void refreshStudyFiles(id);
      setLastSavedAt(
        new Date(detail.updatedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );

    } catch (error) {
      toast.error('Could not open study', {
        description: error instanceof Error ? error.message : 'Storage is unreachable.',
      });
    }
  };

  // Autosave — quietly persist the workspace 1.5s after the last edit. The
  // first autosave creates the study (under the name chosen at creation, or a
  // name derived from the patient data); later ones update it in place, so
  // nothing is ever lost and there is nothing to restore.
  const autosaveBusy = useRef(false);
  const autosave = async () => {
    if (autosaveBusy.current) return;
    autosaveBusy.current = true;
    const generation = workspaceGeneration.current;
    try {
      const name = currentStudyName ?? deriveStudyName();
      const data = buildStudyPayload();
      const saved = currentStudyId
        ? await updateStudy(currentStudyId, name, data)
        : await createStudy(name, data);
      // If the workspace was replaced while saving (study opened / reset / new
      // study), drop the result — the snapshot we wrote belongs to the
      // discarded workspace and must not repoint the UI at it.
      if (generation !== workspaceGeneration.current) return;
      setCurrentStudyId(saved.id);
      setCurrentStudyName(name);
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setDirty(false);
      try {
        window.localStorage.setItem(LAST_STUDY_KEY, String(saved.id));
      } catch {
        // ignore storage errors
      }
      setStudyListKey((key) => key + 1);
    } catch (error) {
      // Keep dirty so the next edit retries; the header indicator already
      // shows “Unsaved changes” while the storage service is unreachable.
      console.error('Autosave failed', error);
    } finally {
      autosaveBusy.current = false;
    }
  };

  // -------------------------------------------------------------------------
  // Clinical document uploads
  // -------------------------------------------------------------------------

  /** Reload the current study's uploaded documents from the server. */
  const refreshStudyFiles = async (studyId: number) => {
    try {
      setStudyFiles(await listStudyFiles(studyId));
    } catch {
      setStudyFiles([]);
    }
  };

  const uploadFile = async (file: File) => {
    if (!currentStudyId || isUploading) return;
    // Fail fast before reading 20 MB of base64 for something the server would reject.
    if (file.size > MAX_UPLOAD_BYTES) {
      const message = `File is too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`;
      setUploadError(message);
      toast.error('Upload failed', { description: message });
      return;
    }
    setIsUploading(true);
    setUploadError(null);
    try {
      await uploadStudyFile(currentStudyId, file);
      // Re-ingest covers every file, so refresh the whole list — a previously
      // failed file may have become ready.
      await refreshStudyFiles(currentStudyId);
      toast.success('Document uploaded', {
        description: 'Drafts are now grounded in this document alongside your notes.',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The upload service is unreachable.';
      setUploadError(message);
      toast.error('Upload failed', { description: message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFilePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file
    if (file) void uploadFile(file);
  };

  const removeFile = async (fileId: number) => {
    if (!currentStudyId) return;
    try {
      await deleteStudyFile(currentStudyId, fileId);
      setStudyFiles((prev) => prev.filter((file) => file.id !== fileId));
      toast.success('Document removed');
    } catch (error) {
      toast.error('Could not remove document', {
        description: error instanceof Error ? error.message : 'Storage is unreachable.',
      });
    }
  };

  // -------------------------------------------------------------------------
  // Personal reference library
  // -------------------------------------------------------------------------

  const refreshLibrary = async () => {
    try {
      setLibrarySources(await listLibrarySources());
    } catch {
      // keep whatever we already have
    }
  };

  const addLibraryFile = async (file: File) => {
    if (isLibraryBusy) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      const message = `File is too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`;
      setLibraryError(message);
      toast.error('Could not add source', { description: message });
      return;
    }
    setIsLibraryBusy(true);
    setLibraryError(null);
    try {
      const lower = file.name.toLowerCase();
      const kind: LibrarySource['kind'] = lower.endsWith('.epub')
        ? 'ebook'
        : lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.txt')
          ? 'notes'
          : 'article';
      const content = await readFileAsBase64(file);
      await addLibrarySource({ kind, filename: file.name, content });
      await refreshLibrary();
      toast.success('Source added to your library', {
        description: 'It will be cited in future drafts whenever it is relevant.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add the source.';
      setLibraryError(message);
      toast.error('Could not add source', { description: message });
    } finally {
      setIsLibraryBusy(false);
    }
  };

  const handleLibraryFilePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void addLibraryFile(file);
  };

  const addLibraryUrl = async () => {
    const url = libraryUrl.trim();
    if (!url || isLibraryBusy) return;
    setIsLibraryBusy(true);
    setLibraryError(null);
    try {
      await addLibrarySource({ kind: 'url', url });
      setLibraryUrl('');
      await refreshLibrary();
      toast.success('External resource added', {
        description: 'The page was fetched and added to your library.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not fetch the link.';
      setLibraryError(message);
      toast.error('Could not add link', { description: message });
    } finally {
      setIsLibraryBusy(false);
    }
  };

  const openCitationEditor = (source: LibrarySource) => {
    setEditSource(source);
    setEditForm({
      title: source.title ?? '',
      author: source.author ?? '',
      year: source.year ?? '',
      venue: source.venue ?? '',
      citeKey: source.citeKey ?? '',
      url: source.url ?? '',
    });
  };

  const saveCitationEdit = async () => {
    if (!editSource || !editForm) return;
    try {
      await updateLibrarySource(editSource.id, editForm);
      setEditSource(null);
      setEditForm(null);
      await refreshLibrary();
      toast.success('Citation updated', {
        description: 'Drafts will cite this source with the new details.',
      });
    } catch (error) {
      toast.error('Could not update citation', {
        description: error instanceof Error ? error.message : 'Storage is unreachable.',
      });
    }
  };

  const removeLibrarySource = async (id: number) => {
    try {
      await deleteLibrarySource(id);
      await refreshLibrary();
      toast.success('Source removed');
    } catch (error) {
      toast.error('Could not remove source', {
        description: error instanceof Error ? error.message : 'Storage is unreachable.',
      });
    }
  };

  const removeStudy = async (id: number) => {
    // The confirmation happens in the ⋯ menu's Delete tab — never double-ask.
    try {
      await deleteStudy(id);
      if (currentStudyId === id) {
        setCurrentStudyId(null);
        setLastSavedAt(null);
        try {
          window.localStorage.removeItem(LAST_STUDY_KEY);
        } catch {
          // ignore storage errors
        }
      }
      setStudyListKey((key) => key + 1);
      toast.success('Study deleted');
    } catch (error) {
      toast.error('Delete failed', {
        description: error instanceof Error ? error.message : 'Storage is unreachable.',
      });
    }
  };

  /** Rename a saved study (keeps its data) from the ⋯ menu. */
  const renameStudy = async (id: number, name: string) => {
    try {
      // updateStudy stores a full snapshot — reuse the study's own data so the
      // rename changes nothing but the name.
      const detail = await getStudy(id);
      await updateStudy(id, name, detail.data);
      setStudyListKey((key) => key + 1);
      if (currentStudyId === id) {
        setCurrentStudyName(name);
      }
      toast.success('Study renamed', {
        description: `Now saved as “${name}”.`,
      });
    } catch (error) {
      toast.error('Rename failed', {
        description: error instanceof Error ? error.message : 'Storage is unreachable.',
      });
      // Re-throw so the panel keeps the dialog open for a retry.
      throw error;
    }
  };

  const startNewStudy = (name: string | null = null) => {
    workspaceGeneration.current += 1;
    suppressDirty.current = true;
    setChapters(makeChapters());
    setVerifyBySection({});
    setVerifyAll(null);
    setExportMeta({
      patientName: '',
      diagnosis: '',
      studentName: '',
      indexNumber: '',
      collegeName: 'Nursing & Midwifery Training College',
      collegeLocation: '',
      year: String(new Date().getFullYear()),
    });
    setCurrentStudyId(null);
    setLastSavedAt(null);
    setCurrentStudyName(name);
    setStudyFiles([]);
    setUploadError(null);
    setActiveChapter(0);
    setActiveSection(0);
    setCopied(false);
    setDraftError(null);
    setDirty(false);
    try {
      window.localStorage.removeItem(LAST_STUDY_KEY);
    } catch {
      // ignore storage errors
    }
    toast.success('New study started', {
      description: name
        ? `“${name}” is ready — the workspace is blank. Save once you have collected something.`
        : 'The workspace is blank. Save once you have collected something.',
    });
  };

  const handleNotesKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      draftSection();
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // global DOM KeyboardEvent
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Resume the last-opened study after a refresh. Silently falls back to a
  // blank workspace when the server is unreachable or the study was deleted.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = window.localStorage.getItem(LAST_STUDY_KEY);
        if (!raw) return;
        const id = Number(raw);
        if (!Number.isInteger(id)) return;
        const detail = await getStudy(id);
        if (!cancelled) {
          loadStudyIntoWorkspace(detail.data, id, false);
          setCurrentStudyName(detail.name);
          void refreshStudyFiles(id);
          setLastSavedAt(
            new Date(detail.updatedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          );
          toast.success('Welcome back', {
            description: `Restored “${detail.name}” from your saved studies.`,
          });
        }
      } catch {
        // No last study, server unreachable, or it was deleted — keep the blank workspace.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the personal reference library once — it is user-level, not tied to
  // a study, so it survives resets and study switches.
  useEffect(() => {
    void refreshLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Section work area: land on the Draft tab when the section already has
  // output, otherwise on Collect — navigation never dumps you past a form.
  // The data-collection modal never auto-opens on navigation; it is opened
  // explicitly by clicking a section or the Collect data button.
  useEffect(() => {
    const hasDraft = currentSection.draft.trim().length > 0;
    setSectionTab(hasDraft ? 'draft' : 'collect');
    // Draft editing is per-section: drop any half-finished edit when moving on.
    setDraftEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSection.id]);

  // Track whether the workspace has changed since the last save, so the
  // header indicator never claims "Saved" over unsaved edits.
  useEffect(() => {
    if (suppressDirty.current) {
      suppressDirty.current = false;
      return;
    }
    setDirty(true);
  }, [chapters, exportMeta]);

  // Debounced autosave: the timer resets on every edit, so a save fires 1.5s
  // after the last change. Programmatic loads/resets/new studies never set
  // dirty, so they never trigger a save; nothing autosaves until there is
  // content (canSave).
  useEffect(() => {
    if (!dirty || !canSave) return;
    const timer = window.setTimeout(() => {
      void autosave();
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, canSave, chapters, exportMeta]);

  const draftAvailable = sectionFilledCount(currentSection) > 0;
  const filledCount = sectionFilledCount(currentSection);
  const totalCount = sectionInputCount(currentSection);
  const rowCount = currentSection.rowData.length;
  const currentRequiredMissing = missingRequiredFields(currentSection);
  const atFirst = activeChapter === 0 && activeSection === 0;
  const atLast =
    activeChapter === chapters.length - 1 &&
    activeSection === currentChapter.sections.length - 1;

  const kpi = [
    { label: 'Sections drafted', value: draftedCount, icon: FileCheck2, accent: 'text-primary' },
    { label: 'In progress', value: inProgressCount, icon: NotebookPen, accent: 'text-amber-600' },
    { label: 'Entries collected', value: totalFilled, icon: ListChecks, accent: 'text-sky-600' },
    { label: 'Completion', value: `${overallCompletion}%`, icon: Gauge, accent: 'text-violet-600' },
  ];

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="no-print">
        <SidebarHeader>
          <button
            onClick={() => setOverviewOpen(true)}
            className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-sidebar-accent"
            aria-label="Open study overview"
          >
            <span className="brand-tile grid size-9 shrink-0 place-items-center rounded-xl text-sidebar-primary-foreground">
              <HeartPulse className="size-5" />
            </span>
            <span className="group-data-[collapsible=icon]:hidden">
              <span className="block font-serif text-base leading-none tracking-tight text-sidebar-foreground">
                care<span className="text-sidebar-primary">study</span>
              </span>
              <span className="mt-1.5 block font-mono text-[9px] uppercase tracking-[0.16em] text-sidebar-foreground/50">
                drafting assistant
              </span>
            </span>
          </button>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
              Chapters
            </SidebarGroupLabel>
            <SidebarMenu>
              <Collapsible asChild defaultOpen={false} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip="Chapters">
                      <Library className="size-4 shrink-0 text-sidebar-primary" />
                      <span className="flex-1 truncate text-left">Chapters</span>
                      <ChevronRight className="ml-auto size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {chapters.map((chapter, index) => {
                        const Icon = CHAPTER_ICONS[index] ?? FileText;
                        const completion = chapterCompletion(index);
                        const missingRequired = chapterMissingRequired(index);
                        return (
                          <SidebarMenuItem key={chapter.name}>
                            <SidebarMenuButton
                              isActive={index === activeChapter}
                              onClick={() => selectChapter(index)}
                              tooltip={chapter.name}
                              className="h-auto flex-col items-stretch gap-1.5 py-2"
                            >
                              <span className="flex w-full items-center gap-2.5">
                                <Icon className="size-4 shrink-0 text-sidebar-primary" />
                                <span className="flex-1 truncate text-[13px] font-medium">
                                  {chapter.name}
                                </span>
                                <span className="tabular font-mono text-[10px] text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
                                  {completion}%
                                </span>
                                {missingRequired > 0 && (
                                  <span
                                    className="flex shrink-0 items-center gap-1 rounded-full bg-amber-400/15 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-400 group-data-[collapsible=icon]:hidden"
                                    title={`${missingRequired} required field${missingRequired === 1 ? '' : 's'} missing`}
                                  >
                                    <CircleAlert className="size-3" />
                                    {missingRequired}
                                  </span>
                                )}
                              </span>
                              <span className="flex h-1 w-full overflow-hidden rounded-full bg-sidebar-border/70 group-data-[collapsible=icon]:hidden">
                                <span
                                  className="block h-full rounded-full bg-sidebar-primary transition-all"
                                  style={{ width: `${completion}%` }}
                                />
                              </span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
              Workspace
            </SidebarGroupLabel>
            <SidebarMenu>
              <Collapsible asChild defaultOpen={false} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip="Patient documents">
                      <Upload className="size-4 shrink-0 text-sidebar-primary" />
                      <span className="flex-1 truncate text-left">Patient documents</span>
                      {studyFiles.length > 0 && (
                        <span className="tabular font-mono text-[10px] text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
                          {studyFiles.length}
                        </span>
                      )}
                      <ChevronRight className="ml-auto size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <PatientDocumentsPanel
                        studyId={currentStudyId}
                        files={studyFiles}
                        isUploading={isUploading}
                        error={uploadError}
                        onFilePick={handleFilePick}
                        onRemoveFile={removeFile}
                        onSaveFirst={openSaveDialog}
                      />
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              <Collapsible asChild defaultOpen={false} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip="My reference library">
                      <BookOpen className="size-4 shrink-0 text-sidebar-primary" />
                      <span className="flex-1 truncate text-left">My reference library</span>
                      {librarySources.length > 0 && (
                        <span className="tabular font-mono text-[10px] text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
                          {librarySources.length}
                        </span>
                      )}
                      <ChevronRight className="ml-auto size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <ReferenceLibraryPanel
                        sources={librarySources}
                        busy={isLibraryBusy}
                        error={libraryError}
                        url={libraryUrl}
                        onUrlChange={setLibraryUrl}
                        onAddUrl={addLibraryUrl}
                        onFilePick={handleLibraryFilePick}
                        onEdit={openCitationEditor}
                        onRemove={removeLibrarySource}
                      />
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              <Collapsible asChild defaultOpen={false} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip="My studies">
                      <History className="size-4 shrink-0 text-sidebar-primary" />
                      <span className="flex-1 truncate text-left">My studies</span>
                      <ChevronRight className="ml-auto size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <StudiesPanel
                        refreshKey={studyListKey}
                        currentStudyId={currentStudyId}
                        isSaving={isSaving}
                        canSave={canSave}
                        onOpenStudy={openStudy}
                        onDeleteStudy={removeStudy}
                        onRenameStudy={renameStudy}
                        onSaveCurrent={openSaveDialog}
                        onNewStudy={openNewStudyDialog}
                      />
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 group-data-[collapsible=icon]:hidden">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sidebar-primary" />
              <div>
                <p className="text-xs font-medium text-sidebar-foreground">Grounded by design</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-sidebar-foreground/70">
                  No patient facts are invented.
                </p>
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sidebar-primary font-mono text-[11px] font-medium text-sidebar-primary-foreground">
                  NS
                </span>
                <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <span className="block truncate text-xs font-medium text-sidebar-foreground">
                    Nursing student
                  </span>
                  <span className="block truncate text-[11px] text-sidebar-foreground/60">
                    Personal workspace
                  </span>
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Care study</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setOverviewOpen(true)}>
                <Info /> Study overview
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={resetAll}
              >
                <RotateCcw /> Reset all progress
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="no-print">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <div className="min-w-0 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <span className="inline-block max-w-[22rem] truncate align-bottom">
              {currentStudyName ?? deriveStudyName()}
            </span>{' '}
            <span className="mx-1 opacity-50">/</span>{' '}
            <span className="text-foreground">
              {isFrontMatterChapter(activeChapter)
                ? 'Preliminary pages'
                : `Chapter ${chapterOrdinal(activeChapter) + 1}`}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setCommandOpen(true)}
              className="flex h-9 w-9 items-center justify-center gap-2 rounded-md border bg-card text-muted-foreground shadow-xs transition-colors hover:bg-muted sm:w-auto sm:px-3 sm:justify-start"
              aria-label="Search sections"
            >
              <Search className="size-4 shrink-0" />
              <span className="hidden text-sm sm:inline">Search sections…</span>
              <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">
                ⌘K
              </kbd>
            </button>
            <span
              className={cn(
                'hidden font-mono text-[10px] tabular lg:inline',
                dirty && lastSavedAt ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
              )}
            >
              {lastSavedAt ? (dirty ? 'Unsaved changes' : `Saved · ${lastSavedAt}`) : 'Not saved'}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="hidden h-9 gap-1.5 sm:inline-flex"
              onClick={openSaveDialog}
              disabled={!canSave}
              title={canSave ? undefined : 'Add at least one piece of data before saving'}
            >
              <Save className="size-4" />
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="hidden h-9 gap-1.5 sm:inline-flex"
              onClick={openNewStudyDialog}
              title="Start a fresh blank study"
            >
              <Plus className="size-4" /> New study
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="hidden h-9 gap-1.5 sm:inline-flex"
              onClick={() => setPrintOpen(true)}
            >
              <Printer className="size-4" /> Print
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-9"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
            >
              {resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button variant="outline" size="icon" className="size-9" onClick={() => setOverviewOpen(true)} aria-label="Study overview">
              <Info className="size-4" />
            </Button>
          </div>
        </header>

        <div className="flex-1 space-y-4 p-4 md:p-5 lg:p-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
            <p className="min-w-0 truncate text-sm font-semibold leading-tight">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                {isFrontMatterChapter(activeChapter)
                  ? 'Preliminary Pages'
                  : `Chapter ${ROMAN[chapterOrdinal(activeChapter)]}`}
              </span>
              <span className="mx-2 text-muted-foreground/40">/</span>
              <span className="text-foreground">
                {currentChapter.name} — {currentSection.heading}
              </span>
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Progress value={overallCompletion} className="h-1.5 w-16" aria-hidden="true" />
              <span className="tabular text-xs font-semibold text-primary">
                {overallCompletion}%
              </span>
            </div>
          </div>

          {!isFrontMatterChapter(activeChapter) && (
          <Collapsible defaultOpen={false} className="group/collapsible">
            <Card className="overflow-hidden">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left transition-colors hover:bg-muted/40"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <BookOpen className="size-3.5" />
                    </span>
                    <span className="truncate text-[13px] font-medium">
                      Chapter introduction — {currentChapter.name}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {currentChapter.intro.trim() ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        <Check className="size-3" /> Drafted
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        Optional
                      </span>
                    )}
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-2 border-t pt-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={draftChapterIntro}
                      disabled={isIntroDrafting}
                    >
                      {isIntroDrafting ? (
                        <>
                          <RotateCcw className="size-3.5 animate-spin" /> Drafting…
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-3.5" /> Draft intro
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-muted-foreground"
                      onClick={clearChapterIntro}
                      disabled={!currentChapter.intro.trim()}
                    >
                      <RotateCcw className="size-3.5" /> Clear
                    </Button>
                  </div>
              <Textarea
                value={currentChapter.intro}
                onChange={(event) =>
                  updateChapterIntro(activeChapter, event.target.value, currentChapter.introReferences)
                }
                rows={3}
                placeholder={`Write a short introduction to ${currentChapter.name} — or let the AI draft one. It appears under the chapter heading when you print or export.`}
                className="min-h-[72px] bg-card leading-relaxed"
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {currentChapter.intro.trim()
                    ? `${currentChapter.intro.trim().split(/\s+/).length} words`
                    : 'Optional — but every chapter in the sample studies opens with one.'}
                </span>
                {currentChapter.introReferences.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="size-3.5 text-primary" />
                    {currentChapter.introReferences.length} cited source
                    {currentChapter.introReferences.length === 1 ? '' : 's'} added to the reference list
                  </span>
                )}
              </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
          )}

          <Dialog
            open={editSource !== null}
            onOpenChange={(open) => {
              if (!open) {
                setEditSource(null);
                setEditForm(null);
              }
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Citation details</DialogTitle>
                <DialogDescription>
                  How should drafts cite this source? Fill what you know — a cite key like
                  “Jarvis” or “Potter &amp; Perry” gives the cleanest in-text citations.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  value={editForm?.title ?? ''}
                  onChange={(event) =>
                    setEditForm((form) => (form ? { ...form, title: event.target.value } : form))
                  }
                  placeholder="Title"
                  className="col-span-2 h-8 text-xs"
                />
                <Input
                  value={editForm?.author ?? ''}
                  onChange={(event) =>
                    setEditForm((form) => (form ? { ...form, author: event.target.value } : form))
                  }
                  placeholder="Author (e.g. Jarvis, C.)"
                  className="col-span-2 h-8 text-xs"
                />
                <Input
                  value={editForm?.year ?? ''}
                  onChange={(event) =>
                    setEditForm((form) => (form ? { ...form, year: event.target.value } : form))
                  }
                  placeholder="Year (e.g. 2020)"
                  className="h-8 text-xs"
                />
                <Input
                  value={editForm?.citeKey ?? ''}
                  onChange={(event) =>
                    setEditForm((form) => (form ? { ...form, citeKey: event.target.value } : form))
                  }
                  placeholder="Cite key (e.g. Potter &amp; Perry)"
                  className="h-8 text-xs"
                />
                <Input
                  value={editForm?.venue ?? ''}
                  onChange={(event) =>
                    setEditForm((form) => (form ? { ...form, venue: event.target.value } : form))
                  }
                  placeholder="Venue / edition (e.g. 8th ed., Elsevier)"
                  className="col-span-2 h-8 text-xs"
                />
                <Input
                  value={editForm?.url ?? ''}
                  onChange={(event) =>
                    setEditForm((form) => (form ? { ...form, url: event.target.value } : form))
                  }
                  placeholder="URL (optional)"
                  className="col-span-2 h-8 text-xs"
                />
              </div>
              {editForm && (
                <p className="text-[11px] text-muted-foreground">
                  Drafts will cite:{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                    ({editForm.citeKey || editForm.author || editForm.title || '…'}
                    {editForm.year ? `, ${editForm.year}` : ''})
                  </code>
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditSource(null);
                    setEditForm(null);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={saveCitationEdit}>Save citation</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={collectOpen} onOpenChange={setCollectOpen}>
            <DialogContent className="max-h-[85vh] w-full max-w-2xl overflow-y-auto border-sidebar-border bg-sidebar-accent text-sidebar-foreground">
              <DialogHeader>
                <DialogTitle>
                  {currentSection.id} · {currentSection.heading}
                </DialogTitle>
                <DialogDescription className="text-sidebar-foreground/70">
                  Fill what you observed — drafts are built from exactly what you record here,
                  nothing is invented on your behalf.
                </DialogDescription>
              </DialogHeader>

              {currentSection.fields.length > 0 && (
                <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
                  {currentSection.fields.map((field) => (
                    <FieldControl
                      key={field.id}
                      field={field}
                      value={currentSection.data[field.id] ?? ''}
                      onChange={(value) => setFieldValue(field.id, value)}
                    />
                  ))}
                </div>
              )}

              {currentSection.rows && (
                <RowEditor
                  rowDef={currentSection.rows}
                  rows={currentSection.rowData}
                  onChange={setRowData}
                />
              )}

              <div className="flex items-center justify-between gap-3 border-t border-sidebar-border/60 pt-4">
                <span
                  aria-live="polite"
                  className="font-mono text-[11px] tabular text-sidebar-foreground/70"
                >
                  {currentSection.rows
                    ? `${filledCount} filled`
                    : `${filledCount} / ${totalCount} collected`}
                </span>
                <div className="flex items-center gap-2">
                  {currentRequiredMissing.length > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-amber-300">
                      <CircleAlert className="size-3.5" />
                      {currentRequiredMissing.length} required missing
                    </span>
                  )}
                  <Button onClick={() => setCollectOpen(false)}>
                    <Check className="size-4" /> Done
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
            <Card className="hidden lg:block">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">
                    {isFrontMatterChapter(activeChapter)
                      ? 'Preliminary pages'
                      : `Chapter ${chapterOrdinal(activeChapter) + 1}`}
                  </CardTitle>
                  <Badge variant="outline" className="tabular">
                    {activeSection + 1} / {currentChapter.sections.length}
                  </Badge>
                </div>
                <CardDescription className="pt-1 leading-relaxed">
                  {currentChapter.blurb}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 p-2">
                {currentChapter.sections.map((section, index) => {
                  const completion = sectionCompletion(section);
                  const requiredMissing = missingRequiredFields(section);
                  return (
                    <button
                      key={section.id}
                      onClick={() => jumpTo(activeChapter, index)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                        index === activeSection
                          ? 'border-primary/25 bg-accent/70'
                          : 'border-transparent hover:bg-muted/70',
                      )}
                    >
                      <span className="w-7 shrink-0 font-mono text-[11px] tabular text-muted-foreground">
                        {section.id}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block truncate text-[13px]',
                            index === activeSection ? 'font-medium text-accent-foreground' : 'font-normal',
                          )}
                        >
                          {section.heading}
                        </span>
                        <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-primary transition-all"
                            style={{ width: `${completion}%` }}
                          />
                        </span>
                      </span>
                      <span className="tabular text-[11px] text-muted-foreground">{completion}%</span>
                      {requiredMissing.length > 0 && section.status !== 'drafted' && (
                        <span
                          className="flex shrink-0 items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-600 dark:text-amber-400"
                          title={`Required: ${requiredMissing.map((f) => f.label).join(', ')}`}
                        >
                          <CircleAlert className="size-3" />
                          {requiredMissing.length}
                        </span>
                      )}
                      {section.status === 'drafted' && (
                        <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                      )}
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b bg-muted/30 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 font-mono text-[11px] tabular text-primary">
                      {currentSection.id}
                    </span>
                    <CardTitle className="truncate text-base leading-tight" title={currentSection.blurb}>
                      {currentSection.heading}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={filledCount > 0 ? 'secondary' : 'outline'}
                      className="tabular gap-1.5"
                    >
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          filledCount > 0 ? 'bg-primary' : 'bg-muted-foreground/40',
                        )}
                      />
                      {currentSection.rows
                        ? `${filledCount} collected · ${rowCount} ${rowCount === 1 ? 'row' : 'rows'}`
                        : `${filledCount} / ${totalCount} collected`}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5"
                          disabled={!canExport}
                          title={
                            canExport ? undefined : 'Draft at least one section before exporting'
                          }
                        >
                          <Download className="size-3.5" /> Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem
                          onClick={() =>
                            downloadDocx({
                              type: 'section',
                              chapterIndex: activeChapter,
                              sectionIndex: activeSection,
                            })
                          }
                          disabled={filledCount === 0 && !currentSection.draft.trim()}
                        >
                          <FileText className="size-4" />
                          This section (.docx)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            downloadDocx({ type: 'chapter', chapterIndex: activeChapter })
                          }
                          disabled={
                            !currentChapter.sections.some(
                              (section) =>
                                sectionFilledCount(section) > 0 || section.draft.trim().length > 0,
                            )
                          }
                        >
                          <BookOpen className="size-4" />
                          This chapter (.docx)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-muted-foreground"
                      onClick={clearSection}
                      disabled={filledCount === 0}
                    >
                      <RotateCcw className="size-3.5" /> Clear
                    </Button>
                  </div>
                </div>

                <div className="pt-2 lg:hidden">
                  <Select
                    value={String(activeSection)}
                    onValueChange={(value) => jumpTo(activeChapter, Number(value))}
                  >
                    <SelectTrigger className="h-9 bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currentChapter.sections.map((section, index) => (
                        <SelectItem key={section.id} value={String(index)}>
                          {section.id} · {section.heading}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>

              <CardContent className="space-y-6 pt-4">
                <Tabs
                  value={sectionTab}
                  onValueChange={(value) => setSectionTab(value as 'collect' | 'draft')}
                >
                  <TabsList className="grid w-full max-w-xs grid-cols-2">
                    <TabsTrigger value="collect" className="gap-1.5">
                      <ClipboardList className="size-3.5" /> Collect
                    </TabsTrigger>
                    <TabsTrigger value="draft" className="gap-1.5">
                      <BookOpen className="size-3.5" /> Draft
                      {currentSection.draft.trim() && (
                        <span className="ml-0.5 grid size-4 place-items-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
                          <Check className="size-2.5" strokeWidth={3} />
                        </span>
                      )}
                    </TabsTrigger>
                  </TabsList>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${currentSection.id}-${activeChapter}-${activeSection}-${sectionTab}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="space-y-6 pt-4"
                    >
                      {sectionTab === 'collect' ? (
                        <>
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <ClipboardCheck className="size-4 text-primary" />
                          <div>
                            <span className="block text-sm font-semibold">Section data</span>
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              {currentSection.rows
                                ? `${filledCount} filled · ${rowCount} ${rowCount === 1 ? 'row' : 'rows'}`
                                : `${filledCount} / ${totalCount} collected`}
                            </span>
                          </div>
                        </div>
                        <Button onClick={() => setCollectOpen(true)} className="h-9 gap-1.5">
                          <ClipboardList className="size-4" /> Collect data
                        </Button>
                      </div>

                      {currentRequiredMissing.length > 0 && !currentSection.draft.trim() && (
                        <p
                          role="status"
                          className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400"
                        >
                          <CircleAlert className="mt-px size-3.5 shrink-0" />
                          <span>
                            <span className="font-semibold">Required fields missing:</span>{' '}
                            {currentRequiredMissing.map((f) => f.label).join(' · ')}
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="section-notes"
                          className="flex items-center gap-1.5 text-xs font-medium"
                        >
                          <FileText className="size-3.5 text-muted-foreground" />
                          Clinical notes
                          <span className="font-normal text-muted-foreground">
                            (optional free text)
                          </span>
                        </label>
                        <span className="tabular font-mono text-[11px] text-muted-foreground">
                          {currentSection.notes.length} chars
                        </span>
                      </div>
                      <Textarea
                        id="section-notes"
                        value={currentSection.notes}
                        onChange={(event) => updateCurrentSection({ notes: event.target.value })}
                        onKeyDown={handleNotesKeyDown}
                        rows={5}
                        placeholder={'Write what you observed, heard, measured, or were told…\n\nUse your own shorthand. There is no need to make it polished yet.'}
                        className="min-h-[120px] bg-card leading-relaxed"
                      />
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">⌘</kbd>
                          {' + '}
                          <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">Enter</kbd>
                          {' '}to draft
                        </span>
                        <span>Private to this browser</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        onClick={draftSection}
                        disabled={!draftAvailable || isDrafting}
                        className="h-10 gap-2"
                      >
                        {isDrafting ? (
                          <>
                            <span className="size-1.5 animate-pulse rounded-full bg-primary-foreground/70" />
                            Drafting…
                          </>
                        ) : (
                          <>
                            <Sparkles className="size-4" /> Draft this section
                            <ArrowRight className="size-4" />
                          </>
                        )}
                      </Button>
                      {!draftAvailable && (
                        <span className="text-xs text-muted-foreground">
                          Fill the template or add notes to unlock drafting
                        </span>
                      )}
                    </div>
                      </>
                    ) : (
                    <div
                      className={cn(
                        'rounded-xl border p-4',
                        currentSection.draft
                          ? 'border-primary/20 bg-primary/[0.03]'
                          : 'border-dashed bg-muted/20',
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              'grid size-8 place-items-center rounded-lg',
                              currentSection.draft
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground',
                            )}
                          >
                            <BookOpen className="size-4" />
                          </span>
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                              Draft output
                            </p>
                            <p className="text-sm font-medium">
                              {currentSection.draft
                                ? 'A grounded starting point'
                                : 'Your draft will appear here'}
                            </p>
                          </div>
                        </div>
                        {currentSection.draft && !draftEditing && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={startDraftEdit}
                          >
                            <Pencil className="size-3.5" /> Edit
                          </Button>
                        )}
                        {currentSection.draft && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={copyOutput}
                          >
                            {copied ? (
                              <>
                                <ClipboardCheck className="size-3.5" /> Copied
                              </>
                            ) : (
                              <>
                                <Clipboard className="size-3.5" /> Copy text
                              </>
                            )}
                          </Button>
                        )}
                      </div>

                      {draftError && (
                        <div
                          role="alert"
                          className="mt-3 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5"
                        >
                          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-destructive">
                              Drafting failed
                            </p>
                            <p className="mt-0.5 break-words text-xs leading-relaxed text-destructive/90">
                              {draftError}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDraftError(null)}
                            aria-label="Dismiss error"
                            className="grid size-6 shrink-0 place-items-center rounded-md text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      )}

                      {currentSection.draft && draftEditing ? (
                        <div className="mt-3 space-y-2.5">
                          <Textarea
                            value={draftWork}
                            onChange={(event) => setDraftWork(event.target.value)}
                            className="min-h-[300px] resize-y bg-card font-mono text-[13px] leading-relaxed"
                            placeholder="Edit the drafted text…"
                            autoFocus
                          />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[11px] leading-relaxed text-muted-foreground">
                              Markdown is supported — it renders in preview, print, and the Word
                              export.
                            </p>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDraftEditing(false)}
                              >
                                Cancel
                              </Button>
                              <Button size="sm" onClick={saveDraftEdit} disabled={!draftWork.trim()}>
                                <Check className="size-4" /> Save
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : currentSection.draft ? (
                        <DraftPreview draft={currentSection.draft} />
                      ) : (
                        <div className="mt-4 space-y-3">
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {draftAvailable
                              ? 'Ready when you are. Drafting uses the fields and notes you provide — grounded in your care study library.'
                              : 'Nothing collected yet. Fill the template, or jot down bedside observations, then draft this section.'}
                          </p>
                          {draftAvailable ? (
                            <Button
                              onClick={draftSection}
                              disabled={isDrafting}
                              size="sm"
                              className="h-8 gap-1.5"
                            >
                              {isDrafting ? (
                                <>
                                  <span className="size-1.5 animate-pulse rounded-full bg-primary-foreground/70" />
                                  Drafting…
                                </>
                              ) : (
                                <>
                                  <Sparkles className="size-3.5" /> Draft now
                                </>
                              )}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5"
                              onClick={() => {
                                setSectionTab('collect');
                                setCollectOpen(true);
                              }}
                            >
                              <ClipboardList className="size-3.5" /> Collect data first
                            </Button>
                          )}
                          <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                            <ShieldCheck className="size-3.5 text-primary" />
                            Transparent, local, and fact-safe
                          </span>
                        </div>
                      )}

                      {currentSection.references.length > 0 && (
                        <div className="mt-3 border-t pt-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                              Sources consulted
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 gap-1.5 px-1.5 text-[11px] font-medium text-muted-foreground"
                              onClick={verifySectionSources}
                              disabled={verifyPending[currentSection.id]}
                              title="Check that every citation matches a source and every link resolves"
                            >
                              {verifyPending[currentSection.id] ? (
                                <RotateCcw className="size-3 animate-spin" />
                              ) : (
                                <ShieldCheck className="size-3" />
                              )}
                              {verifyPending[currentSection.id] ? 'Checking…' : 'Verify sources'}
                            </Button>
                          </div>
                          <ul className="mt-1.5 space-y-1">
                            {currentSection.references.map((ref, index) => (
                              <li
                                key={index}
                                className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground"
                              >
                                <span className="font-mono tabular">{index + 1}.</span>
                                {ref.url ? (
                                  <a
                                    href={ref.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="break-words underline decoration-dotted underline-offset-2 transition-colors hover:text-primary"
                                  >
                                    {ref.label}
                                  </a>
                                ) : (
                                  <span className="break-words">{ref.label}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                          {verifyBySection[currentSection.id] && (
                            <SourceCheckList
                              warnings={verifyBySection[currentSection.id].warnings}
                              checks={verifyBySection[currentSection.id].checks}
                              checkedAt={verifyBySection[currentSection.id].checkedAt}
                            />
                          )}
                        </div>
                      )}
                    </div>
                    )}
                  </motion.div>
                </AnimatePresence>
                </Tabs>

                <div className="flex items-center justify-between border-t pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground"
                    onClick={goPrevious}
                    disabled={atFirst}
                  >
                    <ChevronLeft className="size-4" /> Previous
                  </Button>
                  <span className="tabular font-mono text-[11px] text-muted-foreground">
                    {currentChapter.shortLabel} · {activeSection + 1} of {currentChapter.sections.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground"
                    onClick={goNext}
                    disabled={atLast}
                  >
                    Next <ChevronRight className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-2 font-mono text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5 text-primary">
              <ShieldCheck className="size-3.5" /> Designed to support your thinking, never replace it.
            </span>
            <span className="opacity-60">Retrieval-grounded drafting · runs on your machine</span>
          </footer>
        </div>
      </SidebarInset>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Search chapters, sections, actions…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {chapters.map((chapter, chapterIndex) => (
            <CommandGroup
              key={chapter.name}
              heading={
                isFrontMatterChapter(chapterIndex)
                  ? chapter.name
                  : `Chapter ${chapterOrdinal(chapterIndex) + 1} · ${chapter.name}`
              }
            >
              {chapter.sections.map((section, sectionIndex) => (
                <CommandItem
                  key={section.id}
                  value={`${section.id} ${section.heading} chapter ${chapterIndex + 1}`}
                  onSelect={() => {
                    jumpTo(chapterIndex, sectionIndex);
                    setCommandOpen(false);
                  }}
                >
                  <FileText className="size-4 text-muted-foreground" />
                  <span>{section.heading}</span>
                  <CommandShortcut>{section.id}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandGroup heading="Actions">
            <CommandItem
              value="draft current section"
              disabled={!draftAvailable || isDrafting}
              onSelect={() => {
                setCommandOpen(false);
                draftSection();
              }}
            >
              <Sparkles className="size-4 text-muted-foreground" />
              Draft current section
            </CommandItem>
            <CommandItem
              value="study overview"
              onSelect={() => {
                setCommandOpen(false);
                setOverviewOpen(true);
              }}
            >
              <Info className="size-4 text-muted-foreground" />
              Study overview
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{currentStudyId ? 'Save study' : 'Save this study'}</DialogTitle>
            <DialogDescription>
              Give it a name you'll recognize in “My studies” — the patient's name or
              initials work well. One has been pre-filled from your data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={studyName}
              onChange={(event) => setStudyName(event.target.value)}
              placeholder="e.g. P.A. — Sickle cell disease"
              maxLength={80}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter' && studyName.trim() && !isSaving) {
                  event.preventDefault();
                  saveStudy();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSaveOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveStudy} disabled={!studyName.trim() || isSaving} className="gap-2">
                {isSaving ? (
                  <RotateCcw className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {isSaving ? 'Saving…' : currentStudyId ? 'Save & update' : 'Save study'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newStudyOpen} onOpenChange={setNewStudyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New study</DialogTitle>
            <DialogDescription>
              Give the new study a name — the patient's name or initials work well. You
              can change it later when you save.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={newStudyName}
              onChange={(event) => setNewStudyName(event.target.value)}
              placeholder="e.g. P.A. — Sickle cell disease"
              maxLength={80}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter' && newStudyName.trim()) {
                  event.preventDefault();
                  createNewStudy();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNewStudyOpen(false)}>
                Cancel
              </Button>
              <Button onClick={createNewStudy} disabled={!newStudyName.trim()} className="gap-2">
                <Plus className="size-4" /> Start study
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={overviewOpen} onOpenChange={setOverviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Study overview</DialogTitle>
            <DialogDescription>
              Patient / Family Care Study — templates shaped from eight sample care studies.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {kpi.map((stat) => (
              <div
                key={stat.label}
                className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3"
              >
                <span
                  className={cn(
                    'grid size-8 shrink-0 place-items-center rounded-lg bg-background',
                    stat.accent,
                  )}
                >
                  <stat.icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="tabular mt-0.5 text-2xl font-semibold leading-none">
                    {stat.value}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-4">
            {chapters.map((chapter, index) => (
              <div key={chapter.name}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">
                    Chapter {index + 1} · {chapter.name}
                  </span>
                  <span className="tabular text-muted-foreground">
                    {chapterCompletion(index)}%
                  </span>
                </div>
                <Progress value={chapterCompletion(index)} className="mt-1.5 h-1" />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {printOpen && (
        <div className="print-sheet fixed inset-0 z-50 overflow-auto bg-background">
          <div className="mx-auto max-w-[820px] px-6 py-8 md:px-10">
            <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">
                  Print / Export
                </p>
                <h2 className="mt-0.5 text-xl font-semibold">Your care study</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={openSaveDialog}
                  disabled={!canSave}
                  title={canSave ? undefined : 'Add at least one piece of data before saving'}
                  className="gap-2"
                >
                  {isSaving ? (
                    <RotateCcw className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Save study
                </Button>
                <Button
                  onClick={() => window.print()}
                  className="gap-2"
                  disabled={!canExport}
                  title={canExport ? undefined : 'Draft at least one section before exporting'}
                >
                  <Printer className="size-4" /> Print / Save as PDF
                </Button>
                <Button
                  onClick={() => downloadDocx()}
                  className="gap-2"
                  disabled={!canExport}
                  title={canExport ? undefined : 'Draft at least one section before exporting'}
                >
                  <Download className="size-4" /> Download Word (.docx)
                </Button>
                <Button
                  variant="outline"
                  onClick={verifyAllSources}
                  disabled={verifyAllPending || allReferences.length === 0}
                  className="gap-2"
                  title={
                    allReferences.length === 0
                      ? 'No sources to verify yet — draft a section first'
                      : 'Check every source cited anywhere in the study'
                  }
                >
                  {verifyAllPending ? (
                    <RotateCcw className="size-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="size-4" />
                  )}
                  {verifyAllPending ? 'Checking…' : 'Verify all sources'}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9"
                  onClick={() => setPrintOpen(false)}
                  aria-label="Close print view"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            {verifyAll && (
              <div className="no-print mb-6 rounded-xl border bg-card p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-primary" />
                  Reference verification — {allReferences.length}{' '}
                  {allReferences.length === 1 ? 'source' : 'sources'} across the study
                </p>
                <SourceCheckList
                  warnings={verifyAll.warnings}
                  checks={verifyAll.checks}
                  checkedAt={verifyAll.checkedAt}
                />
              </div>
            )}

            <div className="no-print mb-6 rounded-xl border bg-card p-4">
              <p className="mb-3 text-xs font-semibold text-muted-foreground">
                Title page details
              </p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Input
                  value={exportMeta.studentName}
                  onChange={(e) => setExportMeta({ ...exportMeta, studentName: e.target.value })}
                  placeholder="Student name"
                  className="h-8 text-xs"
                />
                <Input
                  value={exportMeta.indexNumber}
                  onChange={(e) => setExportMeta({ ...exportMeta, indexNumber: e.target.value })}
                  placeholder="Index number"
                  className="h-8 text-xs"
                />
                <Input
                  value={exportMeta.patientName}
                  onChange={(e) => setExportMeta({ ...exportMeta, patientName: e.target.value })}
                  placeholder="Patient name / initials"
                  className="h-8 text-xs"
                />
                <Input
                  value={exportMeta.diagnosis}
                  onChange={(e) => setExportMeta({ ...exportMeta, diagnosis: e.target.value })}
                  placeholder="Diagnosis"
                  className="h-8 text-xs"
                />
                <Input
                  value={exportMeta.collegeName}
                  onChange={(e) => setExportMeta({ ...exportMeta, collegeName: e.target.value })}
                  placeholder="College name"
                  className="h-8 text-xs"
                />
                <Input
                  value={exportMeta.collegeLocation}
                  onChange={(e) => setExportMeta({ ...exportMeta, collegeLocation: e.target.value })}
                  placeholder="College location"
                  className="h-8 text-xs"
                />
                <Input
                  value={exportMeta.year}
                  onChange={(e) => setExportMeta({ ...exportMeta, year: e.target.value })}
                  placeholder="Year"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="print-doc rounded-xl border bg-card p-8 shadow-sm md:p-12">
              <header className="border-b pb-6 text-center">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Patient / Family Care Study
                </p>
                <h1 className="mt-2 font-serif text-2xl">
                  {exportMeta.collegeName || 'Nursing &amp; Midwifery Training College'}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {exportMeta.studentName || 'Student name'}
                  {exportMeta.indexNumber ? ` · ${exportMeta.indexNumber}` : ''} ·{' '}
                  {exportMeta.year}
                </p>
              </header>

              {chapters.map((chapter, chapterIndex) => (
                <section key={chapter.name} className="mt-8">
                  <h2 className="flex items-baseline gap-2 border-b pb-1.5 font-serif text-lg">
                    <span className="font-mono text-xs text-primary">
                      {isFrontMatterChapter(chapterIndex)
                        ? chapter.name.toUpperCase()
                        : `CHAPTER ${ROMAN[chapterOrdinal(chapterIndex)]}`}
                    </span>{' '}
                    {isFrontMatterChapter(chapterIndex) ? '' : chapter.name}
                  </h2>
                  {chapter.intro.trim() && (
                    <p className="mt-2.5 whitespace-pre-wrap text-[13px] leading-relaxed">
                      {renderInlineMarkdown(chapter.intro)}
                    </p>
                  )}
                  {chapter.sections.map((section) => {
                    const filledFields = section.fields.filter((field) =>
                      (section.data[field.id] ?? '').trim(),
                    );
                    const hasRows = section.rowData.length > 0;
                    // When the draft already contains a table (row sections
                    // like 2.2 drugs), that table replaces the structured rows
                    // table — never show a duplicated sparse scaffold. The
                    // scaffold is kept as a safety net only if the draft table
                    // omits rows the student entered (mirrors the Word export).
                    const draftHasTable =
                      Boolean(section.draft) && hasMarkdownTable(section.draft);
                    const draftCoversRows =
                      draftTableRowCount(section.draft) >= section.rowData.length;
                    const hasAnything =
                      Boolean(section.draft) ||
                      filledFields.length > 0 ||
                      hasRows ||
                      section.notes.trim().length > 0;
                    return (
                      <div key={section.id} className="mt-4 break-inside-avoid">
                        <h3 className="text-sm font-semibold">
                          {section.id} {section.heading}
                        </h3>

                        {section.draft ? (
                          <PrintDraft draft={section.draft} />
                        ) : filledFields.length > 0 ? (
                          <div className="mt-2 space-y-2">
                            {fieldsToProse(section).map((para, index) => (
                              <p
                                key={index}
                                className="whitespace-pre-wrap text-[13px] leading-relaxed"
                              >
                                {para.label && <strong>{para.label}: </strong>}
                                {para.text}
                              </p>
                            ))}
                          </div>
                        ) : null}

                        {hasRows && section.rows && (!draftHasTable || !draftCoversRows) && (
                          <div className="mt-2 overflow-x-auto">
                            <table className="w-full border-collapse text-[12px]">
                              <thead>
                                <tr>
                                  {section.rows.columns.map((column) => (
                                    <th key={column.id} className="border px-2 py-1 text-left font-medium">
                                      {column.label}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {section.rowData.map((row) => (
                                  <tr key={row.id}>
                                    {section.rows!.columns.map((column, ci) => (
                                      <td key={column.id} className="border px-2 py-1 align-top">
                                        {row.cells[ci] || '—'}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {section.notes.trim().length > 0 && (
                          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                            <span className="font-medium text-foreground">Notes: </span>
                            {section.notes}
                          </p>
                        )}

                        {!hasAnything && (
                          <p className="mt-1.5 text-[12px] italic text-muted-foreground">
                            Not completed.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </section>
              ))}

              {allReferences.length > 0 && !hasBibliography && (
                <section className="mt-8 break-inside-avoid">
                  <h2 className="flex items-baseline gap-2 border-b pb-1.5 font-serif text-lg">
                    <span className="font-mono text-xs text-primary">REFERENCES</span>{' '}
                    Reference List
                  </h2>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12px] leading-relaxed text-muted-foreground">
                    {allReferences.map((ref, index) => (
                      <li key={index} className="break-words">
                        {ref.url ? (
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-dotted underline-offset-2 hover:text-primary"
                          >
                            {ref.label}
                          </a>
                        ) : (
                          ref.label
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={onboardingOpen} onOpenChange={(open) => { setOnboardingOpen(open); if (!open) markOnboardingSeen(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Welcome to CareStudy</DialogTitle>
            <DialogDescription>
              Your patient/family care study, section by section.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {ONBOARDING_STEPS.map((step, index) => (
              <div key={step.title} className="flex gap-3 rounded-lg border bg-muted/40 p-3.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                    {step.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <Button
            className="w-full gap-2"
            onClick={() => {
              markOnboardingSeen();
              setOnboardingOpen(false);
            }}
          >
            Get started <ArrowRight className="size-4" />
          </Button>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

function Router() {
  return (
    <ErrorBoundary resetKey={useLocation()[0]}>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
