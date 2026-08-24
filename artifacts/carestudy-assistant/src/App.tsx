import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowRight,
  Bold,
  BookOpen,
  Check,
  CheckCircle2,
  CircleAlert,
  Clipboard,
  ClipboardCheck,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Gauge,
  Globe,
  HeartPulse,
  Highlighter,
  History,
  Inbox,
  Info,
  Italic,
  Layers,
  Library,
  LineChart,
  LogOut,
  List,
  ListChecks,
  ListOrdered,
  MessageCircle,
  Moon,
  NotebookPen,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ScrollText,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Strikethrough,
  Sun,
  Target,
  Trash2,
  Underline,
  Upload,
  Undo2,
  X,
  Redo2,
  type LucideIcon,
} from 'lucide-react';
import { ThemeProvider, useTheme } from 'next-themes';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { LandingPage } from '@/pages/landing';
import { StudentPortal } from '@/pages/student-portal';
import { StudioBin } from '@/pages/studio-bin';
import { AdminGate } from '@/components/admin-gate';
import { adminLogout } from '@/lib/adminAuth';
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
  requestDraft,
  requestStudyAssistant,
  updateLibrarySource,
  updateStudy,
  uploadStudyFile,
  verifyReferences,
  type DocTheme,
  type DraftReference,
  type ExportPayload,
  type ExportScope,
  type LibrarySource,
  type SourceCheck,
  type StudyAssistantEdit,
  type StoredSection,
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

/** Template inputs actually collected — fields and row cells only. The
 *  free-form Clinical notes box is tracked separately from the template count. */
function sectionCollectedCount(section: Section): number {
  const fieldFilled = section.fields.filter((field) => (section.data[field.id] ?? '').trim()).length;
  const cellFilled = section.rowData.reduce(
    (total, row) => total + row.cells.filter((cell) => cell.trim()).length,
    0,
  );
  const notesFilled = section.notes.trim() ? 1 : 0;
  return fieldFilled + cellFilled + notesFilled;
}

/** Total template inputs (fields + row cells) for the "X / Y collected" badge. */
function sectionCollectedTotal(section: Section): number {
  const rowCapacity = section.rows
    ? section.rows.columns.length * Math.max(section.rowData.length, 1)
    : 0;
  return section.fields.length + rowCapacity;
}

function sectionCompletion(section: Section): number {
  const total = sectionInputCount(section);
  if (total <= 0) return 0;
  return Math.round((sectionFilledCount(section) / total) * 100);
}

// The client-side fail-fast ceiling. Both the direct-to-R2 path and the
// base64 fallback enforce the same 250 MB default server-side (configurable
// via MAX_UPLOAD_MB); rejection messages for anything under this cap come
// from the server.
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ---------------------------------------------------------------------------
// Word export formatting (the preview/export sheet's format controls)
// ---------------------------------------------------------------------------

/** Defaults mirror the Python exporter's Theme (carestudy_rag/src/export_docx.py). */
const DEFAULT_DOC_THEME: DocTheme = {
  body_font: 'Times New Roman',
  heading_font: 'Times New Roman',
  body_size: 12,
  heading1_size: 14,
  heading2_size: 12,
  table_size: 10,
  table_title_size: 11,
  title_size: 14,
  body_color: '000000',
  heading_color: '000000',
  table_header_fill: 'D9D9D9',
  table_header_color: '000000',
  highlight_color: 'FFFF00',
  line_spacing: 1.5,
  space_after: 6,
  heading1_space_before: 14,
  heading1_space_after: 8,
  heading2_space_before: 10,
  heading2_space_after: 4,
  body_alignment: 'justify',
  first_line_indent: 0,
  top_margin: 1.0,
  bottom_margin: 1.0,
  left_margin: 1.0,
  right_margin: 1.0,
};

// Persisted locally so a student's formatting choices survive reloads — the
// theme rides into the .docx payload, the panel-open flag restores the sheet.
const DOC_THEME_KEY = 'carestudy_doc_theme';
const FORMAT_OPEN_KEY = 'carestudy_format_open';

/** Merge a partial theme onto the defaults so new keys never break old saves. */
function mergeDocTheme(partial: Partial<DocTheme> | null | undefined): DocTheme {
  const merged: DocTheme = { ...DEFAULT_DOC_THEME };
  if (!partial) return merged;
  for (const key of Object.keys(DEFAULT_DOC_THEME) as (keyof DocTheme)[]) {
    const value = partial[key];
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

/** Reload the saved theme (app-level default for new studies). */
function loadSavedDocTheme(): DocTheme {
  try {
    const raw = window.localStorage.getItem(DOC_THEME_KEY);
    if (!raw) return DEFAULT_DOC_THEME;
    return mergeDocTheme(JSON.parse(raw) as Partial<DocTheme>);
  } catch {
    return DEFAULT_DOC_THEME;
  }
}

/** Branded graphic icons for the export toolbar — the classic red PDF badge
 *  and blue Word tile, so the PDF / Word actions are recognizable at a glance
 *  (lucide only ships monochrome line icons). */
function PdfIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="4.5" fill="#EE3A24" />
      <text
        x="12"
        y="15.8"
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="800"
        fill="#ffffff"
        fontFamily="Arial, Helvetica, sans-serif"
      >
        PDF
      </text>
    </svg>
  );
}

function WordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="4.5" fill="#2B579A" />
      <text
        x="12"
        y="16.8"
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="#ffffff"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        W
      </text>
    </svg>
  );
}

const FONT_OPTIONS = [
  'Times New Roman',
  'Arial',
  'Calibri',
  'Georgia',
  'Garamond',
  'Helvetica',
  'Palatino',
  'Courier New',
];
const BODY_SIZE_OPTIONS = [10, 11, 12, 13, 14];
const LINE_SPACING_OPTIONS = [1, 1.15, 1.5, 2];
const ALIGNMENT_OPTIONS = ['justify', 'left', 'center', 'right'] as const;
const FIRST_LINE_INDENT_OPTIONS = [0, 0.25, 0.5];

/** Theme hex (no '#') <-> <input type="color"> value (#RRGGBB). */
const hexToInput = (hex: string) => `#${hex}`;
const inputToHex = (value: string) => value.replace(/^#/, '').toUpperCase();

/** Text tools applied to the selected text in the editable preview. */
const TEXT_TOOLS: {
  key: string;
  label: string;
  icon: LucideIcon;
  command: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'highlight';
}[] = [
  { key: 'bold', label: 'Bold', icon: Bold, command: 'bold' },
  { key: 'italic', label: 'Italic', icon: Italic, command: 'italic' },
  { key: 'underline', label: 'Underline', icon: Underline, command: 'underline' },
  { key: 'strike', label: 'Strikethrough', icon: Strikethrough, command: 'strikeThrough' },
  { key: 'highlight', label: 'Highlight', icon: Highlighter, command: 'highlight' },
];

/** Paragraph alignment applied to the selected paragraph in the preview. */
const PARAGRAPH_ALIGNMENTS: {
  value: 'left' | 'center' | 'right' | 'justify';
  label: string;
  icon: LucideIcon;
}[] = [
  { value: 'left', label: 'Align left', icon: AlignLeft },
  { value: 'center', label: 'Align center', icon: AlignCenter },
  { value: 'right', label: 'Align right', icon: AlignRight },
  { value: 'justify', label: 'Justify', icon: AlignJustify },
];

/** The paragraph-level formatting currently under the caret/selection. */
type ParaState = {
  list: 'ul' | 'ol' | null;
  align: string | null;
  spacing: number | null;
  indent: number | null;
};

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
const PREVIEW_INLINE =
  /(\*\*[^*]+\*\*|\*[^*]+\*|<sup>[^<]*<\/sup>|==[^=]+?==|\+\+[^+]+?\+{2}|~~[^~]+?~~)/g;

/** Render **bold**, *italic*, <sup>superscript</sup>, ==highlight==,
 * ++underline++ and ~~strikethrough~~ inline markdown — the same tokens the
 * Word exporter understands. */
function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let key = 0;
  for (const part of text.split(PREVIEW_INLINE)) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      nodes.push(<strong key={key++}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith('==') && part.endsWith('==')) {
      nodes.push(
        <mark key={key++} className="rounded-sm bg-yellow-200/80 px-0.5 dark:bg-yellow-500/40">
          {part.slice(2, -2)}
        </mark>,
      );
    } else if (part.startsWith('++') && part.endsWith('++')) {
      nodes.push(<u key={key++}>{part.slice(2, -2)}</u>);
    } else if (part.startsWith('~~') && part.endsWith('~~')) {
      nodes.push(<s key={key++}>{part.slice(2, -2)}</s>);
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

// ---------------------------------------------------------------------------
// Per-paragraph formatting — block directives
// ---------------------------------------------------------------------------
// The document theme styles the whole page; to restyle just one paragraph the
// draft can carry a small directive line before it. Both the preview renderer
// and the Word exporter (carestudy_rag/src/export_docx.py) understand:
//
//     <!-- align:center spacing:1.5 indent:0.25 -->
//
// A directive styles the next paragraph (contiguous non-blank lines until a
// blank line). Both keys are optional; spacing accepts LINE_SPACING_OPTIONS.

type ParaStyle = {
  align?: 'left' | 'center' | 'right' | 'justify';
  spacing?: number;
  indent?: number;
};

const PARA_DIRECTIVE_RE =
  /^<!--\s*(?:align:(left|center|right|justify))?\s*(?:spacing:(\d+(?:\.\d+)?))?\s*(?:indent:(\d+(?:\.\d+)?))?\s*-->$/;
const BULLET_LINE_RE = /^\s*[-•]\s+/;
const NUMBER_LINE_RE = /^\s*\d+[.)]\s+/;

/** Parse a directive line ("<!-- align:center spacing:1.5 -->") or null. */
function parseParaDirective(line: string): ParaStyle | null {
  const match = line.match(PARA_DIRECTIVE_RE);
  if (!match || (!match[1] && !match[2] && !match[3])) return null;
  const style: ParaStyle = {};
  if (match[1]) style.align = match[1] as ParaStyle['align'];
  if (match[2]) style.spacing = Math.min(Math.max(Number(match[2]), 1), 3);
  if (match[3]) style.indent = Math.min(Math.max(Number(match[3]), 0), 0.5);
  return style;
}

/** Serialize a paragraph style to a directive line ("" when no styling). */
function directiveLineFor(style: ParaStyle): string {
  const parts: string[] = [];
  if (style.align) parts.push(`align:${style.align}`);
  if (style.spacing !== undefined) parts.push(`spacing:${style.spacing}`);
  if (style.indent !== undefined) parts.push(`indent:${style.indent}`);
  return parts.length ? `<!-- ${parts.join(' ')} -->` : '';
}

/** Split a text block into paragraphs, each tagged with its directive style. */
function splitParaGroups(text: string): { style: ParaStyle | null; lines: string[] }[] {
  const groups: { style: ParaStyle | null; lines: string[] }[] = [];
  let pending: ParaStyle | null = null;
  let current: { style: ParaStyle | null; lines: string[] } | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      // A blank line ends the paragraph; a directive separated from its text
      // by a blank line is orphaned and ignored.
      if (current) {
        groups.push(current);
        current = null;
      }
      pending = null;
      continue;
    }
    const directive = parseParaDirective(line);
    if (directive) {
      if (current) {
        groups.push(current);
        current = null;
      }
      pending = { ...(pending ?? {}), ...directive };
      continue;
    }
    if (!current) {
      current = { style: pending, lines: [] };
      pending = null;
    }
    current.lines.push(line);
  }
  if (current) groups.push(current);
  return groups;
}

/**
 * Serialize a contenteditable paragraph back to draft markdown. Maps the HTML
 * produced by renderInlineMarkdown / the text tools (strong/em/mark/u/s/sup,
 * execCommand's span-with-background, styled paragraph divs and ul/ol lists)
 * back to **bold**, *italic*, ==highlight==, ++underline++, ~~strikethrough~~,
 * <sup> tokens, "- "/"1. " list lines and "<!-- align:... spacing:... -->"
 * directive lines.
 */
function markdownFromHtml(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  const convert = (
    node: Node,
    list: { ordered: boolean; depth: number; index: { value: number } } | null = null,
  ): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (tag === 'br') return '\n';
    if (tag === 'li') {
      // A styled list item (aligned/spaced via the paragraph tools) carries a
      // directive line before it, just like a styled paragraph.
      const align = element.style.textAlign;
      const liSpacing = Number.parseFloat(element.style.lineHeight);
      const liIndent = Number.parseFloat(element.style.textIndent);
      const liStyle: ParaStyle = {};
      if (align && ['left', 'center', 'right', 'justify'].includes(align)) {
        liStyle.align = align as ParaStyle['align'];
      }
      if (Number.isFinite(liSpacing)) liStyle.spacing = liSpacing;
      if (Number.isFinite(liIndent)) liStyle.indent = liIndent / 96;
      const directive = directiveLineFor(liStyle);
      const indent = '  '.repeat(list?.depth ?? 0);
      const marker = list?.ordered ? `${list.index.value}. ` : '- ';
      if (list) list.index.value += 1;
      // Nested lists emit their own (indented) lines; the marker prefixes only
      // the item's own text so wrapped lines never swallow the child list.
      let own = '';
      let nested = '';
      for (const child of Array.from(element.childNodes)) {
        if (
          child.nodeType === Node.ELEMENT_NODE &&
          ['ul', 'ol'].includes((child as HTMLElement).tagName.toLowerCase())
        ) {
          nested += convert(child, list);
        } else {
          own += convert(child, list);
        }
      }
      return `${directive ? `${directive}\n` : ''}${indent}${marker}${own.trim()}\n${nested}`;
    }
    if (tag === 'ul' || tag === 'ol') {
      return Array.from(element.childNodes)
        .map((child) =>
          convert(child, {
            ordered: tag === 'ol',
            depth: (list?.depth ?? -1) + 1,
            index: { value: 1 },
          }),
        )
        .join('');
    }
    const inner = Array.from(element.childNodes).map((child) => convert(child, list)).join('');
    if (tag === 'p' || tag === 'div') {
      // A block carrying paragraph styling round-trips through a directive
      // line so the preview and the Word export both honour it.
      const align = element.style.textAlign;
      const spacing = Number.parseFloat(element.style.lineHeight);
      const indent = Number.parseFloat(element.style.textIndent);
      const style: ParaStyle = {};
      if (align && ['left', 'center', 'right', 'justify'].includes(align)) {
        style.align = align as ParaStyle['align'];
      }
      if (Number.isFinite(spacing)) style.spacing = spacing;
      if (Number.isFinite(indent)) style.indent = indent / 96;
      const directive = directiveLineFor(style);
      return directive ? `${directive}\n${inner}\n` : `${inner}\n`;
    }
    if (tag === 'strong' || tag === 'b') return `**${inner}**`;
    if (tag === 'em' || tag === 'i') return `*${inner}*`;
    if (tag === 'mark') return `==${inner}==`;
    if (tag === 'u') return `++${inner}++`;
    if (tag === 's' || tag === 'strike' || tag === 'del') return `~~${inner}~~`;
    if (tag === 'sup') return `<sup>${inner}</sup>`;
    if (tag === 'span' && element.style.backgroundColor) return `==${inner}==`;
    return inner;
  };
  // template.content is a DocumentFragment — convert() only understands text
  // and element nodes, so iterate its children instead of passing the fragment
  // itself (which would silently serialize to an empty string and wipe the
  // draft on every blur).
  return Array.from(template.content.childNodes)
    .map((child) => convert(child))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Selection-based paragraph styling — the preview's paragraphs are lines of
// flat markdown, so "the paragraph under the selection" is the run of text
// between blank lines. Styling wraps that run in a <div> whose inline styles
// serialize back to a directive line via markdownFromHtml. Lists are handled
// by execCommand (insertUnorderedList / insertOrderedList) instead.
// ---------------------------------------------------------------------------

/** Global text offset of a (node, offset) caret position inside root. */
function textOffsetIn(root: Node, target: Node, offset: number): number | null {
  let found = -1;
  let acc = 0;
  const walk = (node: Node): boolean => {
    if (node === target) {
      if (node.nodeType === Node.TEXT_NODE) {
        found = acc + offset;
      } else {
        // Element caret: offset is a child index — resolve to the text at the
        // start of that child (or the end of the element for the last slot).
        const child = node.childNodes[offset];
        const prefix = Array.from(node.childNodes)
          .slice(0, child ? offset : node.childNodes.length)
          .reduce((sum, c) => sum + (c.textContent ?? '').length, 0);
        found = acc + prefix;
      }
      return true;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      acc += (node.textContent ?? '').length;
      return false;
    }
    for (const child of Array.from(node.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  };
  walk(root);
  return found >= 0 ? found : null;
}

/** Text ranges of the paragraphs overlapping [selStart, selEnd), delimited by
 *  blank lines ("\n\n") just as the flat markdown stores them. */
function paragraphGroupOffsets(
  text: string,
  selStart: number,
  selEnd: number,
): [number, number][] {
  const groups: [number, number][] = [];
  let groupStart = 0;
  for (let i = 0; i < text.length - 1; i += 1) {
    if (text[i] === '\n' && text[i + 1] === '\n') {
      if (i > groupStart && i >= selStart && groupStart <= selEnd) {
        groups.push([groupStart, i]);
      }
      groupStart = i + 2;
    }
  }
  if (text.length > groupStart && text.length >= selStart && groupStart <= selEnd) {
    groups.push([groupStart, text.length]);
  }
  return groups;
}

/** Map a global text offset back to a text node + offset within it. */
function locateOffset(root: Node, target: number): { node: Text; offset: number } | null {
  if (root.nodeType === Node.TEXT_NODE) {
    const length = (root.textContent ?? '').length;
    if (target <= length) return { node: root as Text, offset: target };
    return null;
  }
  let remaining = target;
  for (const child of Array.from(root.childNodes)) {
    const childLength = (child.textContent ?? '').length;
    if (remaining <= childLength) {
      const inside = locateOffset(child, remaining);
      if (inside) return inside;
    }
    remaining -= childLength;
  }
  return null;
}

/** Styled paragraph <div>s (direct children of the editable) whose text
 *  overlaps [start, end). */
function paragraphDivsIn(editable: HTMLElement, start: number, end: number): HTMLElement[] {
  const divs: HTMLElement[] = [];
  let acc = 0;
  for (const child of Array.from(editable.childNodes)) {
    const length = (child.textContent ?? '').length;
    if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName === 'DIV') {
      const childStart = acc;
      if (childStart + length > start && childStart < end) {
        divs.push(child as HTMLElement);
      }
    }
    acc += length;
  }
  return divs;
}

/** Keep the user's caret/selection near where it was after DOM surgery. */
function restoreSelection(
  selection: Selection,
  editable: HTMLElement,
  selStart: number,
  selEnd: number,
): void {
  const textLength = (editable.textContent ?? '').length;
  const start = locateOffset(editable, Math.min(selStart, textLength));
  if (!start) return;
  const range = document.createRange();
  if (selStart === selEnd) {
    range.setStart(start.node, start.offset);
    range.collapse(true);
  } else {
    const end = locateOffset(editable, Math.min(selEnd, textLength));
    if (!end) return;
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Apply alignment / line spacing to the paragraph(s) under the selection by
 *  wrapping each in a styled <div> (reusing ones already there). Returns the
 *  elements touched so callers can re-select them. */
function styleSelectionParagraphs(
  editable: HTMLElement,
  selection: Selection,
  style: ParaStyle,
): HTMLElement[] {
  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  if (!range) return [];
  const text = editable.textContent ?? '';
  const start = textOffsetIn(editable, range.startContainer, range.startOffset);
  const end = textOffsetIn(editable, range.endContainer, range.endOffset);
  if (start === null || end === null) return [];
  const selStart = Math.min(start, end);
  const selEnd = Math.max(start, end);

  // The paragraph the user is typing in is the one under the caret.
  const touched: HTMLElement[] = [];
  for (const [groupStart, groupEnd] of paragraphGroupOffsets(text, selStart, selEnd)) {
    const existing = paragraphDivsIn(editable, groupStart, groupEnd);
    if (existing.length > 0) {
      for (const div of existing) {
        applyParaStyle(div, style);
        touched.push(div);
      }
      continue;
    }
    const startLoc = locateOffset(editable, groupStart);
    const endLoc = locateOffset(editable, groupEnd);
    if (!startLoc || !endLoc) continue;
    // A group that is (part of) a list item: style the item in place rather
    // than unwrapping the list structure into a plain <div>.
    const startItem = startLoc.node.parentElement?.closest('li');
    const endItem = endLoc.node.parentElement?.closest('li');
    if (startItem || endItem) {
      const items = new Set<HTMLElement>();
      if (startItem) items.add(startItem);
      if (endItem && endItem !== startItem) items.add(endItem);
      for (const item of items) {
        applyParaStyle(item, style);
        touched.push(item);
      }
      continue;
    }
    const wrap = document.createRange();
    wrap.setStart(startLoc.node, startLoc.offset);
    wrap.setEnd(endLoc.node, endLoc.offset);
    const content = wrap.extractContents();
    const div = document.createElement('div');
    div.className = 'whitespace-pre-wrap';
    div.appendChild(content);
    wrap.insertNode(div);
    applyParaStyle(div, style);
    touched.push(div);
  }

  // Preserve the caret/selection roughly where it was.
  restoreSelection(selection, editable, selStart, selEnd);
  return touched;
}

/** Set alignment / line spacing on a paragraph element (inline styles are what
 *  markdownFromHtml reads back into directive lines). */
function applyParaStyle(element: HTMLElement, style: ParaStyle): void {
  if (style.align) element.style.textAlign = style.align;
  if (style.spacing !== undefined) element.style.lineHeight = String(style.spacing);
  if (style.indent !== undefined) element.style.textIndent = `${style.indent}in`;
}

/** The paragraph-level formatting under the caret, for the toolbar's state. */
function readParagraphState(selection: Selection | null): ParaState {
  const empty: ParaState = { list: null, align: null, spacing: null, indent: null };
  if (!selection || !selection.anchorNode) return empty;
  const element =
    selection.anchorNode.nodeType === Node.TEXT_NODE
      ? selection.anchorNode.parentElement
      : (selection.anchorNode as HTMLElement);
  if (!element) return empty;
  const list = element.closest('ul')
    ? 'ul'
    : element.closest('ol')
      ? 'ol'
      : null;
  const editable = element.closest('[contenteditable="true"]');
  // The paragraph element is a styled <div> directly under the editable, or
  // the editable block itself when the paragraph carries no styling.
  let paragraph: HTMLElement = element;
  while (paragraph.parentElement && paragraph.parentElement !== editable) {
    paragraph = paragraph.parentElement;
  }
  const computed = window.getComputedStyle(paragraph);
  const inlineSpacing = Number.parseFloat(paragraph.style.lineHeight);
  const inlineIndent = Number.parseFloat(paragraph.style.textIndent);
  return {
    list,
    align: computed.textAlign || null,
    spacing: Number.isFinite(inlineSpacing) ? inlineSpacing : null,
    indent: Number.isFinite(inlineIndent) ? inlineIndent / 96 : null,
  };
}

function assistantPlainText(content: string): string {
  const lines = content.split(/\r?\n/);
  const output: string[] = [];
  let inCodeBlock = false;

  for (const originalLine of lines) {
    const line = originalLine.trim();
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (!line || line === '---' || line === '***' || line === '___') {
      if (output.at(-1) !== '') output.push('');
      continue;
    }
    if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line)) continue;

    let plain = line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/^>\s?/, '')
      .replace(/^\|\s?|\s?\|$/g, '')
      .replace(/\|\s*/g, '. ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/`{1,3}/g, '')
      .replace(/(\*\*|__|~~|==)/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (inCodeBlock) plain = plain.replace(/^\s+/, '');
    if (plain) output.push(plain);
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
function tableToMarkdown(header: string[], rows: string[][]): string {
  const formatRow = (row: string[]) => `| ${row.map((cell) => cell.replace(/\|/g, '\\|')).join(' | ')} |`;
  return [formatRow(header), formatRow(header.map(() => '---')), ...rows.map(formatRow)].join('\n');
}

function PreviewTable({
  header,
  rows,
  editable = false,
  onCellEdit,
}: {
  header: string[];
  rows: string[][];
  editable?: boolean;
  onCellEdit?: (rowIndex: number, cellIndex: number, value: string) => void;
}) {
  return (
    <table className="w-full table-fixed border-collapse text-[11px]">
      <thead>
        <tr>
          {header.map((cell, cellIndex) => (
            <th key={cellIndex} className="w-1/5 border bg-muted px-2 py-1 text-left font-semibold">
              <div
                contentEditable={editable}
                suppressContentEditableWarning
                spellCheck={false}
                onBlur={(event) => onCellEdit?.(-1, cellIndex, event.currentTarget.textContent ?? '')}
                className="min-h-5 whitespace-pre-wrap break-words outline-none"
              >
              {cell}
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className="w-1/5 border px-2 py-1 align-top">
                <div
                  contentEditable={editable}
                  suppressContentEditableWarning
                  spellCheck={false}
                  onBlur={(event) => onCellEdit?.(rowIndex, cellIndex, event.currentTarget.textContent ?? '')}
                  className="min-h-5 whitespace-pre-wrap break-words outline-none"
                >
                  {cell}
                </div>
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
          <div key={index} className="whitespace-pre-wrap font-mono leading-relaxed">
            {renderParaGroups(block.text)}
          </div>
        ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paragraph-level rendering — turns "- " / "1. " lines into real lists (so the
// preview matches the Word export, which already converts them to numbered
// bullet styles) and honours "<!-- align:... spacing:... -->" directives.
// ---------------------------------------------------------------------------

type ListLineNode = { type: 'ul' | 'ol'; depth: number; text: string; children: ListLineNode[] };

function renderListLines(lines: string[], keyBase: number): ReactNode {
  // Build a tree of list items; a line indented by 2+ spaces becomes a child
  // of the previous item (mirrors the exporter's level = indent // 2 rule).
  const roots: ListLineNode[] = [];
  const stack: ListLineNode[] = [];
  for (const line of lines) {
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const depth = Math.min(Math.floor(indent / 2), 3);
    const type = BULLET_LINE_RE.test(line) ? 'ul' : 'ol';
    const text = line.replace(BULLET_LINE_RE, '').replace(NUMBER_LINE_RE, '');
    const node: ListLineNode = { type, depth, text, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
    if (stack.length > 0) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }

  let key = keyBase;
  const bulletStyle = (depth: number) =>
    depth === 1 ? 'list-[circle]' : depth >= 2 ? 'list-[square]' : 'list-disc';
  const numberStyle = (depth: number) =>
    depth === 1 ? 'list-[lower-alpha]' : 'list-decimal';

  const renderItems = (items: ListLineNode[]): ReactNode => {
    const groups: { type: 'ul' | 'ol'; items: ListLineNode[] }[] = [];
    for (const node of items) {
      const last = groups[groups.length - 1];
      if (last && last.type === node.type) last.items.push(node);
      else groups.push({ type: node.type, items: [node] });
    }
    return (
      <>
        {groups.map((group) => {
          const Tag = group.type === 'ol' ? 'ol' : 'ul';
          const style =
            group.type === 'ol' ? numberStyle(group.items[0].depth) : bulletStyle(group.items[0].depth);
          return (
            <Tag key={`list-${key++}`} className={`ml-4 ${style}`}>
              {group.items.map((node) => (
                <li key={`item-${key++}`}>
                  {renderInlineMarkdown(node.text)}
                  {node.children.length > 0 && (
                    <Fragment key={`nested-${key++}`}>{renderItems(node.children)}</Fragment>
                  )}
                </li>
              ))}
            </Tag>
          );
        })}
      </>
    );
  };
  return renderItems(roots);
}

/** Render one paragraph's lines: prose runs stay as text (soft breaks kept as
 *  newlines), consecutive bullet/number lines become a real <ul>/<ol>. */
function renderParaLines(lines: string[], keyBase: number): ReactNode {
  const nodes: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const isList = BULLET_LINE_RE.test(lines[index]) || NUMBER_LINE_RE.test(lines[index]);
    if (isList) {
      const run: string[] = [];
      while (
        index < lines.length &&
        (BULLET_LINE_RE.test(lines[index]) || NUMBER_LINE_RE.test(lines[index]))
      ) {
        run.push(lines[index]);
        index += 1;
      }
      // Keyed wrapper: renderListLines returns a Fragment, and an unkeyed
      // element inside an array trips React's duplicate-key warning.
      nodes.push(
        <Fragment key={`listblock-${keyBase + nodes.length}`}>
          {renderListLines(run, keyBase + nodes.length)}
        </Fragment>,
      );
    } else {
      const run: string[] = [];
      while (
        index < lines.length &&
        !BULLET_LINE_RE.test(lines[index]) &&
        !NUMBER_LINE_RE.test(lines[index])
      ) {
        run.push(lines[index]);
        index += 1;
      }
      // Inline markdown (**bold**, ==highlight==, …) still applies inside the
      // paragraph; the keyed span keeps React's keys unique per run (keyBase
      // scopes them per group so sibling groups can't collide).
      nodes.push(
        <span key={`run-${keyBase + nodes.length}`}>{renderInlineMarkdown(run.join('\n'))}</span>,
      );
    }
  }
  return <>{nodes}</>;
}

/** Render a text block's paragraphs — preserving the blank-line separators
 *  exactly as the flat markdown stores them. Styled paragraphs become <div>s
 *  whose inline styles round-trip to directives, and bullet/numbered lines
 *  become real <ul>/<ol> lists. */
function renderParaGroups(text: string): ReactNode {
  const groups = splitParaGroups(text);
  const nodes: ReactNode[] = [];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    if (nodes.length > 0) nodes.push('\n\n');
    // Each group gets its own key range (a group can emit arbitrarily many
    // keyed list items / runs), so sibling groups can never collide.
    const keyBase = groupIndex * 1000;
    const content = renderParaLines(group.lines, keyBase);
    if (group.style) {
      const css: CSSProperties = {};
      if (group.style.align) css.textAlign = group.style.align;
      if (group.style.spacing !== undefined) css.lineHeight = String(group.style.spacing);
      if (group.style.indent !== undefined) css.textIndent = `${group.style.indent}in`;
      nodes.push(
        <div key={`para-${groupIndex}`} style={css} className="whitespace-pre-wrap">
          {content}
        </div>,
      );
    } else {
      // Keyed wrapper — see renderParaLines: fragments in arrays need keys.
      nodes.push(<Fragment key={`group-${groupIndex}`}>{content}</Fragment>);
    }
  }
  return <>{nodes}</>;
}

// ---------------------------------------------------------------------------
// Preview view draft renderer — converts drafted markdown pipe tables into real
// HTML tables (matching the Word export), so raw "| ... |" never leaks into
// the printed document. Reuses the same block parser as the on-screen preview.
// ---------------------------------------------------------------------------

/** Editable chapter intro — static HTML inside a contenteditable <div> (see
 *  PrintDraft). The { __html } object is memoized on `intro` so its identity
 *  only changes when the intro's markdown changes; an inline literal would
 *  make React rewrite innerHTML on every parent re-render, wiping edits. */
function EditableIntro({
  intro,
  onBlur,
}: {
  intro: string;
  onBlur: (markdown: string) => void;
}) {
  const html = useMemo(
    () => ({ __html: renderToStaticMarkup(renderParaGroups(intro)) }),
    [intro],
  );
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={(event) => onBlur(markdownFromHtml(event.currentTarget.innerHTML))}
      className="mt-2.5 whitespace-pre-wrap outline-none focus:outline-none"
      dangerouslySetInnerHTML={html}
    />
  );
}

function PrintDraft({
  draft,
  onEdit,
}: {
  draft: string;
  /** When provided, prose paragraphs become editable and call back with the
   *  updated markdown on blur (the preview doubles as a text editor). */
  onEdit?: (markdown: string) => void;
}) {
  const blocks = useMemo(() => splitPreviewBlocks(draft), [draft]);
  const editTableCell = (blockIndex: number, rowIndex: number, cellIndex: number, value: string) => {
    if (!onEdit) return;
    const nextBlocks = blocks.map((block, index) => {
      if (index !== blockIndex || block.kind !== 'table') return block;
      const nextHeader = [...block.header];
      const nextRows = block.rows.map((row) => [...row]);
      if (rowIndex < 0) nextHeader[cellIndex] = value;
      else if (nextRows[rowIndex]) nextRows[rowIndex][cellIndex] = value;
      return { kind: 'table' as const, header: nextHeader, rows: nextRows };
    });
    onEdit(nextBlocks.map((block) => block.kind === 'table' ? tableToMarkdown(block.header, block.rows) : block.text).join('\n\n'));
  };
  // Editable blocks are rendered as static HTML, never as React children.
  // While editing, the browser owns the DOM inside a contenteditable (typing,
  // Enter, execCommand all restructure it), so React must not try to reconcile
  // individual nodes there — that mismatch is what produced the
  // "removeChild/insertBefore: node is not a child" crashes. React only
  // rewrites innerHTML wholesale, and only when the draft actually changes
  // (on blur); otherwise it leaves the edited DOM alone.
  // One { __html } object per text block, memoized on `blocks` so the object
  // identity is stable across re-renders. React compares dangerouslySetInnerHTML
  // props by reference, so an inline { __html } literal would make it rewrite
  // innerHTML on EVERY commit — wiping whatever the user is editing. The object
  // only changes when the block's markdown actually changes (on blur).
  const blockHtml = useMemo(
    () =>
      blocks.map((block) =>
        block.kind === 'table'
          ? null
          : { __html: renderToStaticMarkup(renderParaGroups(block.text)) },
      ),
    [blocks],
  );
  return (
    <div className="mt-1.5 space-y-2">
      {blocks.map((block, index) =>
        block.kind === 'table' ? (
          <div key={index} className="overflow-x-auto">
            <PreviewTable
              header={block.header}
              rows={block.rows}
              editable={Boolean(onEdit)}
              onCellEdit={(rowIndex, cellIndex, value) => editTableCell(index, rowIndex, cellIndex, value)}
            />
          </div>
        ) : (
          // A <div> (not <p>): styled paragraphs and lists are legal children,
          // while a <p> would be auto-closed by the browser and crash React.
          <div
            key={index}
            contentEditable={Boolean(onEdit)}
            suppressContentEditableWarning
            spellCheck={false}
            onBlur={(event) => onEdit?.(markdownFromHtml(event.currentTarget.innerHTML))}
            className="whitespace-pre-wrap rounded-sm outline-none focus:outline-none"
            dangerouslySetInnerHTML={blockHtml[index] ?? undefined}
          />
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
  // Whole-chapter drafting: one click generates the chapter introduction (if
  // missing) plus every section that has collected data but no draft yet.
  const [isChapterDrafting, setIsChapterDrafting] = useState(false);
  const [chapterDraftProgress, setChapterDraftProgress] = useState<{
    done: number;
    total: number;
    current: string | null;
  } | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [sectionTab, setSectionTab] = useState<'draft'>('draft');
  const [collectOpen, setCollectOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Manual draft editing: toggle the rendered draft into an editable text box.
  const [draftEditing, setDraftEditing] = useState(false);
  const [draftWork, setDraftWork] = useState('');
  const [commandOpen, setCommandOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  // Chapter dialog: the intro editor + whole-chapter drafting, reached from
  // the compact Intro / Draft all actions in the content header row.
  const [chapterOpen, setChapterOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showPreliminaryPages, setShowPreliminaryPages] = useState(false);
  const [exportMeta, setExportMeta] = useState({
    patientName: '',
    diagnosis: '',
    studentName: '',
    indexNumber: '',
    collegeName: 'Nursing & Midwifery Training College',
    collegeLocation: '',
    year: String(new Date().getFullYear()),
  });
  // Word export formatting — the export sheet's controls write into the .docx
  // theme payload and preview live via CSS variables on the sheet. Loaded from
  // localStorage (merged onto defaults) so choices survive reloads.
  const [docTheme, setDocTheme] = useState<DocTheme>(loadSavedDocTheme);

  const updateDocTheme = (patch: Partial<DocTheme>) =>
    setDocTheme((previous) => ({ ...previous, ...patch }));

  const resetDocTheme = () => setDocTheme({ ...DEFAULT_DOC_THEME });

  const isDefaultDocTheme = (Object.keys(DEFAULT_DOC_THEME) as (keyof DocTheme)[]).every(
    (key) => docTheme[key] === DEFAULT_DOC_THEME[key],
  );

  // Preview sheet: title-page details live in a modal (toolbar button), the
  // document formatting panel opens expanded by default, and the text tools
  // act on whatever text is selected in the editable preview.
  const [titlePageOpen, setTitlePageOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(
    () => window.localStorage.getItem(FORMAT_OPEN_KEY) !== 'closed',
  );
  const [previewTextSelected, setPreviewTextSelected] = useState(false);
  // True when the caret/selection is inside an editable paragraph — enough for
  // the paragraph tools (bullets, alignment, line spacing) to act on.
  const [previewEditingActive, setPreviewEditingActive] = useState(false);
  // The paragraph formatting under the caret, for the tools' active states.
  const [previewParaState, setPreviewParaState] = useState<ParaState>({
    list: null,
    align: null,
    spacing: null,
    indent: null,
  });

  // Persist the document theme and panel-open state so reloads restore them.
  useEffect(() => {
    window.localStorage.setItem(DOC_THEME_KEY, JSON.stringify(docTheme));
  }, [docTheme]);
  useEffect(() => {
    window.localStorage.setItem(FORMAT_OPEN_KEY, formatOpen ? 'open' : 'closed');
  }, [formatOpen]);

  /** Apply a text tool to the current selection inside the editable preview. */
  const applyTextFormat = (tool: (typeof TEXT_TOOLS)[number]) => {
    const selection = window.getSelection();
    const container = document.querySelector('.print-doc');
    if (!selection || selection.isCollapsed || !container || !selection.anchorNode) return;
    if (!container.contains(selection.anchorNode)) return;
    const anchorElement =
      selection.anchorNode.nodeType === Node.TEXT_NODE
        ? selection.anchorNode.parentElement
        : (selection.anchorNode as HTMLElement);
    if (!anchorElement?.closest('[contenteditable="true"]')) return;
    if (tool.command === 'highlight') {
      document.execCommand('hiliteColor', false, 'yellow');
    } else {
      document.execCommand(tool.command, false);
    }
  };

  const applyEditHistory = (command: 'undo' | 'redo') => {
    const selection = window.getSelection();
    const container = document.querySelector('.print-doc');
    if (!selection?.anchorNode || !container?.contains(selection.anchorNode)) return;
    const anchorElement =
      selection.anchorNode.nodeType === Node.TEXT_NODE
        ? selection.anchorNode.parentElement
        : (selection.anchorNode as HTMLElement);
    if (!anchorElement?.closest('[contenteditable="true"]')) return;
    document.execCommand(command, false);
  };

  /** Paragraph-style the paragraph(s) under the caret/selection. */
  const applyParagraphStyle = (style: ParaStyle) => {
    const selection = window.getSelection();
    const container = document.querySelector('.print-doc');
    if (!selection || !container || !selection.anchorNode) return;
    if (!container.contains(selection.anchorNode)) return;
    const anchorElement =
      selection.anchorNode.nodeType === Node.TEXT_NODE
        ? selection.anchorNode.parentElement
        : (selection.anchorNode as HTMLElement);
    const editable = anchorElement?.closest('[contenteditable="true"]');
    if (!editable) return;
    // Lists are their own paragraphs; style the item rather than unwrapping.
    if (anchorElement?.closest('ul, ol')) {
      const item = anchorElement.closest('li');
      if (item) applyParaStyle(item, style);
      return;
    }
    styleSelectionParagraphs(editable as HTMLElement, selection, style);
    setPreviewParaState(readParagraphState(window.getSelection()));
  };

  /** Toggle bullet / numbered list on the selected lines. */
  const applyListFormat = (type: 'ul' | 'ol') => {
    const selection = window.getSelection();
    const container = document.querySelector('.print-doc');
    if (!selection || !container || !selection.anchorNode) return;
    if (!container.contains(selection.anchorNode)) return;
    const anchorElement =
      selection.anchorNode.nodeType === Node.TEXT_NODE
        ? selection.anchorNode.parentElement
        : (selection.anchorNode as HTMLElement);
    if (!anchorElement?.closest('[contenteditable="true"]')) return;
    document.execCommand(type === 'ul' ? 'insertUnorderedList' : 'insertOrderedList', false);
    setPreviewParaState(readParagraphState(window.getSelection()));
  };

  /** Track what the user has selected inside an editable paragraph. */
  const handlePreviewSelect = (event: SyntheticEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    const container = event.currentTarget;
    if (!selection || !selection.anchorNode || !selection.focusNode) {
      setPreviewTextSelected(false);
      setPreviewEditingActive(false);
      setPreviewParaState({ list: null, align: null, spacing: null, indent: null });
      return;
    }
    const editableOf = (node: Node | null) =>
      (node?.nodeType === Node.TEXT_NODE
        ? node.parentElement
        : (node as HTMLElement | null))?.closest('[contenteditable="true"]');
    const insideEditable = Boolean(
      container.contains(selection.anchorNode) &&
        editableOf(selection.anchorNode) &&
        editableOf(selection.focusNode),
    );
    setPreviewEditingActive(insideEditable);
    setPreviewTextSelected(insideEditable && !selection.isCollapsed);
    setPreviewParaState(insideEditable ? readParagraphState(selection) : { list: null, align: null, spacing: null, indent: null });
  };
  const [currentStudyId, setCurrentStudyId] = useState<number | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // True while a debounced autosave request is in flight — drives the
  // “Saving…” status shown next to the Preview/Export toolbar and in the header.
  const [isAutosaving, setIsAutosaving] = useState(false);
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
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMessage, setAssistantMessage] = useState('');
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<
    { role: 'user' | 'assistant'; content: string; edits?: StudyAssistantEdit[]; applied?: boolean }[]
  >([]);

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

  const updateChapterName = (chapterIndex: number, name: string) => {
    setChapters((previous) =>
      previous.map((chapter, ci) => (ci === chapterIndex ? { ...chapter, name } : chapter)),
    );
  };

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
    setSectionTab('draft');
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
    setSectionTab('draft');
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
      // The intro's citations feed the whole-study verification — it's stale now.
      setVerifyAll(null);
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
    // Removing the intro invalidates any whole-study source verification.
    setVerifyAll(null);
  };

  /**
   * Draft the whole chapter in one pass: the introduction (if missing) and
   * every section that has collected data but no draft yet. Sections with no
   * data, and sections already drafted (possibly hand-edited), are skipped.
   * Requests run sequentially through the same engine the section button uses,
   * with per-item progress surfaced in the chapter-draft card.
   */
  const draftChapter = async () => {
    if (isChapterDrafting || isDrafting || isIntroDrafting) return;
    // Capture the target chapter now: the run takes a while, and the user may
    // navigate to another chapter before it resolves.
    const targetChapterIndex = activeChapter;
    const chapter = chapters[targetChapterIndex];
    const readySections = chapter.sections
      .map((section, sectionIndex) => ({ section, sectionIndex }))
      .filter(({ section }) => sectionFilledCount(section) > 0 && !section.draft.trim());
    const needsIntro = !isFrontMatterChapter(targetChapterIndex) && !chapter.intro.trim();
    if (readySections.length === 0 && !needsIntro) {
      toast('Nothing to draft in this chapter', {
        description:
          'Collect data in at least one section that has no draft yet, then try again.',
      });
      return;
    }

    const total = readySections.length + (needsIntro ? 1 : 0);
    let done = 0;
    let introFailed = false;
    const failedSections: string[] = [];
    setIsChapterDrafting(true);
    setChapterDraftProgress({
      done,
      total,
      current: needsIntro ? 'Chapter introduction' : null,
    });
    try {
      if (needsIntro) {
        try {
          const heading = `Chapter ${ROMAN[chapterOrdinal(targetChapterIndex)]}: ${chapter.name}`;
          // Ground the intro in the chapter's scope: its name, blurb, and the
          // headings of everything it covers.
          const notes = [
            chapter.name,
            chapter.blurb,
            ...chapter.sections.map(
              (section) => `${section.id} ${section.heading} — ${section.blurb}`,
            ),
          ].join('\n');
          const result = await requestDraft(
            heading,
            notes,
            false,
            'chapter_intro',
            currentStudyId,
          );
          updateChapterIntro(targetChapterIndex, result.draft, result.references);
          // The intro's citations feed the whole-study verification — it's stale now.
          setVerifyAll(null);
        } catch {
          introFailed = true;
        }
        done += 1;
        setChapterDraftProgress({
          done,
          total,
          current: readySections[0]?.section.heading ?? null,
        });
      }

      for (const { section, sectionIndex } of readySections) {
        setChapterDraftProgress({ done, total, current: `${section.id} ${section.heading}` });
        try {
          const composed = composeSectionInput(section);
          // Pure row-data sections (2.2 drugs, 3.2 care plan) are drafted as
          // tables; mixed sections stay prose.
          const tabular = Boolean(section.rows) && section.fields.length === 0;
          const rowColumns =
            tabular && section.rows ? section.rows.columns.map((column) => column.label) : [];
          const result = await requestDraft(
            section.heading,
            composed,
            tabular,
            'section',
            currentStudyId,
            rowColumns,
          );
          updateSection(targetChapterIndex, sectionIndex, {
            draft: result.draft,
            references: result.references,
          });
          // The draft changed — any earlier verification of this section (and
          // of the whole study) is stale.
          setVerifyBySection((prev) => {
            if (!(section.id in prev)) return prev;
            const next = { ...prev };
            delete next[section.id];
            return next;
          });
          setVerifyAll(null);
        } catch {
          failedSections.push(`${section.id} ${section.heading}`);
        }
        done += 1;
        setChapterDraftProgress({ done, total, current: null });
      }

      const succeededSections = readySections.length - failedSections.length;
      if (!introFailed && failedSections.length === 0) {
        toast.success(`Chapter drafted — ${chapter.name}`, {
          description: `Introduction and ${readySections.length} section${readySections.length === 1 ? '' : 's'} generated from your collected data.`
        });
      } else {
        toast('Chapter draft finished with issues', {
          description:
            `${succeededSections} of ${readySections.length} sections drafted` +
            `${introFailed ? '; the chapter introduction failed' : ''}` +
            `${failedSections.length ? ` — retry: ${failedSections.join(', ')}` : ''}.`
        });
      }
    } finally {
      setIsChapterDrafting(false);
      setChapterDraftProgress(null);
    }
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
    theme: docTheme,
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
    theme: docTheme,
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

  const applyAssistantEdits = (messageIndex: number, edits: StudyAssistantEdit[]) => {
    const knownIds = new Set(chapters.flatMap((chapter) => chapter.sections.map((section) => section.id)));
    const validEdits = edits.filter(
      (edit) => knownIds.has(edit.sectionId) && (
        typeof edit.draft === 'string' || typeof edit.notes === 'string' ||
        (edit.data && typeof edit.data === 'object' && Object.keys(edit.data).length > 0)
      ),
    );
    if (validEdits.length === 0) {
      toast.error('No applicable edits', { description: 'The assistant did not target an existing section.' });
      return;
    }

    setChapters((previous) =>
      previous.map((chapter) => ({
        ...chapter,
        sections: chapter.sections.map((section) => {
          const edit = validEdits.find((candidate) => candidate.sectionId === section.id);
          if (!edit) return section;
          const updates: Partial<Section> = {};
          if (typeof edit.draft === 'string') updates.draft = edit.draft;
          if (typeof edit.notes === 'string') updates.notes = edit.notes;
          if (edit.data && typeof edit.data === 'object') {
            updates.data = { ...section.data, ...edit.data };
          }
          return { ...section, ...updates, status: computeStatus({ ...section, ...updates }) };
        }),
      })),
    );
    setAssistantMessages((messages) =>
      messages.map((message, index) => (index === messageIndex ? { ...message, applied: true } : message)),
    );
    toast.success('Assistant edits applied', {
      description: `${validEdits.length} section${validEdits.length === 1 ? '' : 's'} updated. Changes will autosave.`,
    });
  };

  const askStudyAssistant = async (question = assistantMessage) => {
    const message = question.trim();
    if (!message || assistantBusy) return;
    setAssistantMessage('');
    setAssistantBusy(true);
    setAssistantMessages((messages) => [...messages, { role: 'user', content: message }]);
    try {
      const result = await requestStudyAssistant(buildStudyPayload(), message);
      setAssistantMessages((messages) => [
        ...messages,
        { role: 'assistant', content: result.answer, edits: result.edits },
      ]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'The study assistant is unavailable.';
      setAssistantMessages((messages) => [...messages, { role: 'assistant', content: `Unable to help: ${detail}` }]);
      toast.error('Study assistant failed', { description: detail });
    } finally {
      setAssistantBusy(false);
    }
  };

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
        const savedData =
          saved.data && typeof saved.data === 'object'
            ? (saved.data as Record<string, string>)
            : {};
        const legacyFields = (saved as StoredSection & {
          fields?: { label?: unknown; value?: unknown }[];
        }).fields;
        if (Object.keys(savedData).length > 0) {
          target.data = savedData;
        } else if (Array.isArray(legacyFields)) {
          target.data = Object.fromEntries(
            legacyFields.flatMap((field) => {
              const templateField = target.fields.find((candidate) => candidate.label === field.label);
              return templateField && typeof field.value === 'string'
                ? [[templateField.id, field.value]]
                : [];
            }),
          );
        } else {
          target.data = {};
        }
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
    // The study's own formatting wins when it carries one; older saves (and
    // brand-new workspaces) fall back to the app-level default theme.
    setDocTheme(stored.theme ? mergeDocTheme(stored.theme) : loadSavedDocTheme());
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
    setIsAutosaving(true);
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
      setIsAutosaving(false);
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
    // Fail fast before uploading something the server would reject.
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
      // Pass the File itself: with R2 storage it uploads directly to the
      // bucket (no size cap); the client falls back to base64 when needed.
      await addLibrarySource({ kind, filename: file.name, file });
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
    setSectionTab('draft');
    // Draft editing is per-section: drop any half-finished edit when moving on.
    setDraftEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSection.id]);

  // Track whether the workspace has changed since the last save, so the
  // header indicator never claims "Saved" over unsaved edits. Formatting
  // (docTheme) counts as an edit too — it rides in the same saved snapshot.
  useEffect(() => {
    if (suppressDirty.current) {
      suppressDirty.current = false;
      return;
    }
    setDirty(true);
  }, [chapters, exportMeta, docTheme]);

  // Debounced autosave: the timer resets on every edit (content, title page,
  // or formatting), so a save fires 1.5s after the last change. Programmatic
  // loads/resets/new studies never set dirty, so they never trigger a save;
  // nothing autosaves until there is content (canSave).
  useEffect(() => {
    if (!dirty || !canSave) return;
    const timer = window.setTimeout(() => {
      void autosave();
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, canSave, chapters, exportMeta, docTheme]);

  const draftAvailable = sectionFilledCount(currentSection) > 0;
  const filledCount = sectionFilledCount(currentSection);
  const collectedCount = sectionCollectedCount(currentSection);
  const collectedTotal = sectionCollectedTotal(currentSection);
  const rowCount = currentSection.rowData.length;
  // Whole-chapter drafting: enabled when there is at least one section with
  // collected data that has no draft yet (or a missing chapter introduction
  // that can be generated).
  const chapterReadyCount = currentChapter.sections.filter(
    (section) => sectionFilledCount(section) > 0 && !section.draft.trim(),
  ).length;
  const chapterIntroPending =
    !isFrontMatterChapter(activeChapter) && !currentChapter.intro.trim();
  const canDraftChapter = chapterReadyCount > 0 || chapterIntroPending;
  const currentRequiredMissing = missingRequiredFields(currentSection);
  const atFirst = activeChapter === 0 && activeSection === 0;
  const atLast =
    activeChapter === chapters.length - 1 &&
    activeSection === currentChapter.sections.length - 1;

  // Live save status — shared by the main header and the Preview/Export
  // toolbar so edits and formatting show their autosave state where they happen.
  const saveStatus = isAutosaving
    ? { label: 'Saving…', tone: 'text-primary' }
    : lastSavedAt
      ? dirty
        ? { label: 'Unsaved changes', tone: 'text-amber-600 dark:text-amber-400' }
        : { label: `Saved · ${lastSavedAt}`, tone: 'text-muted-foreground' }
      : { label: 'Not saved', tone: 'text-muted-foreground' };

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

              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Orders">
                  <a href="/studio/bin">
                    <Inbox className="size-4 shrink-0 text-sidebar-primary" />
                    <span className="flex-1 truncate text-left">Orders</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  void adminLogout().finally(() => {
                    // Back to the studio URL — the gate shows the sign-in screen.
                    window.location.href = "/studio";
                  });
                }}
              >
                <LogOut /> Sign out of the studio
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
            <span className={cn('hidden font-mono text-[10px] tabular lg:inline', saveStatus.tone)}>
              {saveStatus.label}
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
              onClick={() => setPreviewOpen(true)}
            >
              <Eye className="size-4" /> Preview
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
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setChapterOpen(true)}
                aria-label="Chapter introduction"
                title={
                  currentChapter.intro.trim()
                    ? `Chapter introduction — drafted (${currentChapter.intro.trim().split(/\s+/).length} words)`
                    : 'Chapter introduction — optional'
                }
              >
                <BookOpen className="size-3.5 text-primary" />
                Intro
                <span
                  className={`size-1.5 rounded-full ${currentChapter.intro.trim() ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
                  aria-hidden="true"
                />
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5"
                onClick={draftChapter}
                disabled={!canDraftChapter || isChapterDrafting || isDrafting || isIntroDrafting}
              >
                {isChapterDrafting ? (
                  <>
                    <RotateCcw className="size-3.5 animate-spin" /> Drafting…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" /> Draft all
                  </>
                )}
              </Button>
            </div>
          </div>
          {isChapterDrafting && chapterDraftProgress && !chapterOpen && (
            <div className="flex items-center gap-3 rounded-lg border border-primary/15 bg-card px-3.5 py-2">
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                {chapterDraftProgress.current ?? 'Wrapping up…'}
              </span>
              <span className="shrink-0 tabular text-[11px] text-muted-foreground">
                {chapterDraftProgress.done} / {chapterDraftProgress.total}
              </span>
              <Progress
                value={(chapterDraftProgress.done / Math.max(chapterDraftProgress.total, 1)) * 100}
                className="h-1.5 flex-1"
              />
            </div>
          )}

          <Dialog open={chapterOpen} onOpenChange={setChapterOpen}>
            <DialogContent className="max-h-[85vh] w-full max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Layers className="size-4 shrink-0 text-primary" />
                  <span className="truncate">
                    {isFrontMatterChapter(activeChapter)
                      ? currentChapter.name
                      : `Chapter ${ROMAN[chapterOrdinal(activeChapter)]}: ${currentChapter.name}`}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  Draft the chapter introduction and every section that has collected data but no draft yet.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {!isFrontMatterChapter(activeChapter) && (
                  <div className="space-y-2.5 rounded-lg border p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium">
                        <BookOpen className="size-3.5 shrink-0 text-primary" />
                        Chapter introduction
                        {currentChapter.intro.trim() ? (
                          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            <Check className="size-3" /> Drafted
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Optional
                          </span>
                        )}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
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
                    </div>
                    <Textarea
                      value={currentChapter.intro}
                      onChange={(event) =>
                        updateChapterIntro(
                          activeChapter,
                          event.target.value,
                          currentChapter.introReferences,
                        )
                      }
                      rows={3}
                      placeholder={`Write a short introduction to ${currentChapter.name} — or let the AI draft one. It appears under the chapter heading when you print or export.`}
                      className="min-h-[72px] bg-card leading-relaxed"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
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
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/15 p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">Draft entire chapter</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      {canDraftChapter
                        ? `Generates the introduction and every section that has collected data but no draft yet — ${chapterReadyCount} section${chapterReadyCount === 1 ? '' : 's'} ready. Already-drafted and empty sections are skipped.`
                        : 'Collect data in at least one section of this chapter to unlock.'}
                    </p>
                  </div>
                  <Button
                    onClick={draftChapter}
                    disabled={!canDraftChapter || isChapterDrafting || isDrafting || isIntroDrafting}
                    className="h-9 shrink-0 gap-1.5"
                  >
                    {isChapterDrafting ? (
                      <>
                        <RotateCcw className="size-3.5 animate-spin" /> Drafting…
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5" /> Draft chapter
                      </>
                    )}
                  </Button>
                </div>

                {isChapterDrafting && chapterDraftProgress && (
                  <div className="space-y-1.5 rounded-lg bg-muted/50 px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                      <span className="truncate">
                        {chapterDraftProgress.current ?? 'Wrapping up…'}
                      </span>
                      <span className="shrink-0 tabular">
                        {chapterDraftProgress.done} / {chapterDraftProgress.total}
                      </span>
                    </div>
                    <Progress
                      value={(chapterDraftProgress.done / Math.max(chapterDraftProgress.total, 1)) * 100}
                      className="h-1.5"
                    />
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

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

              <div className="space-y-2 border-t border-sidebar-border/60 pt-4">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="section-notes"
                    className="flex items-center gap-1.5 text-xs font-medium"
                  >
                    <FileText className="size-3.5 text-sidebar-foreground/70" />
                    Clinical notes
                    <span className="font-normal text-sidebar-foreground/70">
                      (optional free text)
                    </span>
                  </label>
                  <span className="tabular font-mono text-[11px] text-sidebar-foreground/70">
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
                  className="min-h-[120px] bg-sidebar leading-relaxed"
                />
                <div className="flex items-center justify-between text-[11px] text-sidebar-foreground/70">
                  <span>
                    <kbd className="rounded border border-sidebar-border bg-sidebar px-1 font-mono text-[10px]">⌘</kbd>
                    {' + '}
                    <kbd className="rounded border border-sidebar-border bg-sidebar px-1 font-mono text-[10px]">Enter</kbd>
                    {' '}to draft
                  </span>
                  <span>Private to this browser</span>
                </div>
              </div>

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
                    ? `${collectedCount} filled`
                    : `${collectedCount} / ${collectedTotal} collected`}
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
                        ? `${collectedCount} collected · ${rowCount} ${rowCount === 1 ? 'row' : 'rows'}`
                        : `${collectedCount} / ${collectedTotal} collected`}
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
                <Tabs value={sectionTab}>
                  <TabsList className="grid w-full max-w-xs grid-cols-1">
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
                      key={`${currentSection.id}-${activeChapter}-${activeSection}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="space-y-6 pt-4"
                    >
                      <>
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <ClipboardCheck className="size-4 text-primary" />
                          <div>
                            <span className="block text-sm font-semibold">Section data</span>
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              {currentSection.rows
                                ? `${collectedCount} filled · ${rowCount} ${rowCount === 1 ? 'row' : 'rows'}`
                                : `${collectedCount} / ${collectedTotal} collected`}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button onClick={() => setCollectOpen(true)} variant="outline" className="h-9 gap-1.5">
                            <ClipboardList className="size-4" /> Collect data
                          </Button>
                          <Button
                            onClick={draftSection}
                            disabled={!draftAvailable || isDrafting}
                            className="h-9 gap-1.5"
                          >
                            {isDrafting ? (
                              <>
                                <span className="size-1.5 animate-pulse rounded-full bg-primary-foreground/70" />
                                Drafting…
                              </>
                            ) : (
                              <>
                                <Sparkles className="size-4" />
                                {currentSection.draft.trim() ? 'Redraft this section' : 'Draft this section'}
                              </>
                            )}
                          </Button>
                        </div>
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
                            <span className="text-xs text-muted-foreground">
                              Use Collect data above to add the information needed for this section.
                            </span>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5"
                              onClick={() => {
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
                      </>
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

      {previewOpen && (
        <div
          className="print-sheet fixed inset-0 z-50 flex flex-col bg-background"
          style={
            {
              '--doc-body-font': docTheme.body_font ?? 'Times New Roman',
              '--doc-heading-font': docTheme.heading_font ?? 'Times New Roman',
              '--doc-body-size': `${docTheme.body_size ?? 12}pt`,
              '--doc-line-height': String(docTheme.line_spacing ?? 1.5),
              '--doc-align':
                docTheme.body_alignment === 'left'
                  ? 'left'
                  : docTheme.body_alignment === 'center'
                    ? 'center'
                    : docTheme.body_alignment === 'right'
                      ? 'right'
                      : 'justify',
              '--doc-h1-size': `${docTheme.heading1_size ?? 14}pt`,
              '--doc-h2-size': `${docTheme.heading2_size ?? 12}pt`,
              '--doc-table-size': `${docTheme.table_size ?? 10}pt`,
              // Word's defaults (black headings, grey table headers) are left
              // to the app's own colors so the preview stays readable in dark
              // mode; custom colors are applied verbatim.
              '--doc-heading-color':
                docTheme.heading_color && docTheme.heading_color !== '000000'
                  ? `#${docTheme.heading_color}`
                  : undefined,
              '--doc-table-fill':
                docTheme.table_header_fill && docTheme.table_header_fill !== 'D9D9D9'
                  ? `#${docTheme.table_header_fill}`
                  : undefined,
              '--doc-margin-top': `${docTheme.top_margin ?? 1.0}in`,
              '--doc-margin-bottom': `${docTheme.bottom_margin ?? 1.0}in`,
              '--doc-margin-left': `${docTheme.left_margin ?? 1.0}in`,
              '--doc-margin-right': `${docTheme.right_margin ?? 1.0}in`,
            } as CSSProperties
          }
        >
          <div className="no-print shrink-0 border-b bg-background">
            <div className="mx-auto w-full max-w-[820px] px-6 pt-4 md:px-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">
                  Preview / Export
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  <h2 className="text-xl font-semibold">Your care study</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[10px] text-muted-foreground"
                    onClick={() => setShowPreliminaryPages((visible) => !visible)}
                    title={showPreliminaryPages ? 'Hide preliminary pages' : 'Show preliminary pages'}
                  >
                    <Eye className="size-3" />
                    {showPreliminaryPages ? 'Hide preliminary' : 'Show preliminary'}
                  </Button>
                </div>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="size-9"
                onClick={() => {
                  setPreviewOpen(false);
                  setTitlePageOpen(false);
                }}
                aria-label="Close preview"
              >
                <X className="size-4" />
              </Button>
              </div>
            </div>

            <Dialog open={titlePageOpen} onOpenChange={setTitlePageOpen}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Title page details</DialogTitle>
                  <DialogDescription>
                    Used on the title page of the Word export — the patient, diagnosis, and your
                    details.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    value={exportMeta.studentName}
                    onChange={(e) => setExportMeta({ ...exportMeta, studentName: e.target.value })}
                    placeholder="Student name"
                    className="col-span-2 h-8 text-xs"
                  />
                  <Input
                    value={exportMeta.indexNumber}
                    onChange={(e) => setExportMeta({ ...exportMeta, indexNumber: e.target.value })}
                    placeholder="Index number"
                    className="h-8 text-xs"
                  />
                  <Input
                    value={exportMeta.year}
                    onChange={(e) => setExportMeta({ ...exportMeta, year: e.target.value })}
                    placeholder="Year"
                    className="h-8 text-xs"
                  />
                  <Input
                    value={exportMeta.patientName}
                    onChange={(e) => setExportMeta({ ...exportMeta, patientName: e.target.value })}
                    placeholder="Patient name / initials"
                    className="col-span-2 h-8 text-xs"
                  />
                  <Input
                    value={exportMeta.diagnosis}
                    onChange={(e) => setExportMeta({ ...exportMeta, diagnosis: e.target.value })}
                    placeholder="Diagnosis"
                    className="col-span-2 h-8 text-xs"
                  />
                  <Input
                    value={exportMeta.collegeName}
                    onChange={(e) => setExportMeta({ ...exportMeta, collegeName: e.target.value })}
                    placeholder="College name"
                    className="col-span-2 h-8 text-xs"
                  />
                  <Input
                    value={exportMeta.collegeLocation}
                    onChange={(e) => setExportMeta({ ...exportMeta, collegeLocation: e.target.value })}
                    placeholder="College location"
                    className="col-span-2 h-8 text-xs"
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => setTitlePageOpen(false)}>Done</Button>
                </div>
              </DialogContent>
            </Dialog>
            <div className="w-full px-6 pb-4 md:px-10">
              <div className="rounded-lg border bg-card p-1.5">
                <Collapsible open={formatOpen} onOpenChange={setFormatOpen} className="group/collapsible">
                <div className="flex items-center justify-between gap-1.5 px-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    Document formatting
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={
                          formatOpen ? 'Hide formatting options' : 'Show formatting options'
                        }
                      >
                        <ChevronRight className="size-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </div>
                <CollapsibleContent className="overflow-hidden">
                  <div className="mt-1 flex min-w-max items-end gap-1.5 overflow-x-auto pb-1">
                    <label className="w-[112px] shrink-0 space-y-1">
                      <span className="block text-[9px] font-medium text-muted-foreground">
                        Font
                      </span>
                      <Select
                        value={docTheme.body_font ?? 'Times New Roman'}
                        onValueChange={(value) => updateDocTheme({ body_font: value, heading_font: value })}
                      >
                        <SelectTrigger className="h-6 px-2 text-[10px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FONT_OPTIONS.map((font) => (
                            <SelectItem key={font} value={font}>
                              {font}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>

                    <label className="w-[72px] shrink-0 space-y-1">
                      <span className="block text-[9px] font-medium text-muted-foreground">
                        Body size
                      </span>
                      <Select
                        value={String(docTheme.body_size ?? 12)}
                        onValueChange={(value) =>
                          updateDocTheme({
                            body_size: Number(value),
                            heading1_size: Number(value),
                            heading2_size: Number(value),
                          })
                        }
                      >
                        <SelectTrigger className="h-6 px-2 text-[10px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BODY_SIZE_OPTIONS.map((size) => (
                            <SelectItem key={size} value={String(size)}>
                              {size} pt
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>

                  <div className="contents">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-6 shrink-0"
                      title="Undo last preview edit"
                      aria-label="Undo last preview edit"
                      disabled={!previewEditingActive}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyEditHistory('undo')}
                    >
                      <Undo2 className="size-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-6 shrink-0"
                      title="Redo last preview edit"
                      aria-label="Redo last preview edit"
                      disabled={!previewEditingActive}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyEditHistory('redo')}
                    >
                      <Redo2 className="size-3.5" />
                    </Button>
                    <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
                    <Button variant="outline" size="icon" className="size-6" onClick={openSaveDialog} disabled={!canSave} title="Save study" aria-label="Save study">
                      {isSaving ? <RotateCcw className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                    </Button>
                    <Button variant="outline" size="icon" className="size-6" onClick={() => setTitlePageOpen(true)} title="Title page details" aria-label="Title page details">
                      <BookOpen className="size-3.5" />
                    </Button>
                    <Button variant="outline" size="icon" className="size-6" onClick={() => window.print()} disabled={!canExport} title="Print / Save as PDF" aria-label="Print / Save as PDF">
                      <PdfIcon className="size-3.5" />
                    </Button>
                    <Button variant="outline" size="icon" className="size-6" onClick={() => downloadDocx()} disabled={!canExport} title="Download Word document" aria-label="Download Word document">
                      <WordIcon className="size-3.5" />
                    </Button>
                    <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
                    <Button
                      variant={assistantOpen ? 'secondary' : 'outline'}
                      size="icon"
                      className="size-6"
                      title="Toggle the AI editor sidebar"
                      aria-label="Toggle AI editor sidebar"
                      onClick={() => setAssistantOpen((open) => !open)}
                    >
                      <MessageCircle className="size-3.5" />
                    </Button>
                    <span className={cn('mr-1 font-mono text-[9px] tabular', saveStatus.tone)} title="Edits save automatically">
                      {saveStatus.label}
                    </span>
                    <span className="mr-1 text-[9px] font-semibold text-muted-foreground">Text</span>
                    {TEXT_TOOLS.map((tool) => (
                      <Button
                        key={tool.key}
                        variant="outline"
                        size="icon"
                        className="size-6"
                        title={`${tool.label} — select text in the preview first`}
                        aria-label={tool.label}
                        disabled={!previewTextSelected}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyTextFormat(tool)}
                      >
                        <tool.icon className="size-3.5" />
                      </Button>
                    ))}
                    <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
                    <span className="mr-1 text-[9px] font-semibold text-muted-foreground">Paragraph</span>
                    <Button
                      variant={previewParaState.list === 'ul' ? 'secondary' : 'outline'}
                      size="icon"
                      className="size-6"
                      title="Bullet list — select the lines in the preview first"
                      aria-label="Bullet list"
                      disabled={!previewEditingActive}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyListFormat('ul')}
                    >
                      <List className="size-3.5" />
                    </Button>
                    <Button
                      variant={previewParaState.list === 'ol' ? 'secondary' : 'outline'}
                      size="icon"
                      className="size-6"
                      title="Numbered list — select the lines in the preview first"
                      aria-label="Numbered list"
                      disabled={!previewEditingActive}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyListFormat('ol')}
                    >
                      <ListOrdered className="size-3.5" />
                    </Button>
                    <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
                    {PARAGRAPH_ALIGNMENTS.map((alignment) => (
                      <Button
                        key={alignment.value}
                        variant={previewParaState.align === alignment.value ? 'secondary' : 'outline'}
                        size="icon"
                        className="size-6"
                        title={`${alignment.label} — select the paragraph in the preview first`}
                        aria-label={alignment.label}
                        disabled={!previewEditingActive}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyParagraphStyle({ align: alignment.value })}
                      >
                        <alignment.icon className="size-3.5" />
                      </Button>
                    ))}
                    <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
                    <label className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        Line spacing
                      </span>
                      <Select
                        value={String(previewParaState.spacing ?? docTheme.line_spacing ?? 1.5)}
                        onValueChange={(value) => applyParagraphStyle({ spacing: Number(value) })}
                        disabled={!previewEditingActive}
                      >
                        <SelectTrigger className="h-6 w-[58px] px-1.5 text-[10px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LINE_SPACING_OPTIONS.map((spacing) => (
                            <SelectItem key={spacing} value={String(spacing)}>
                              {spacing}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="flex items-center gap-1.5">
                      <span className="text-[9px] font-medium text-muted-foreground">Indent</span>
                      <Select
                        value={String(previewParaState.indent ?? 0)}
                        onValueChange={(value) => applyParagraphStyle({ indent: Number(value) })}
                        disabled={!previewEditingActive}
                      >
                        <SelectTrigger className="h-6 w-[58px] px-1.5 text-[10px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIRST_LINE_INDENT_OPTIONS.map((indent) => (
                            <SelectItem key={indent} value={String(indent)}>
                              {indent === 0 ? 'None' : `${indent}"`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
                    <label className="flex items-center gap-1.5">
                      <span className="text-[9px] font-medium text-muted-foreground">Bottom margin</span>
                      <Select
                        value={String(docTheme.bottom_margin ?? 1.0)}
                        onValueChange={(value) => updateDocTheme({ bottom_margin: Number(value) })}
                      >
                        <SelectTrigger className="h-6 w-[58px] px-1.5 text-[10px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[0.5, 0.75, 1.0, 1.25, 1.5].map((margin) => (
                            <SelectItem key={margin} value={String(margin)}>
                              {margin}"
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  </div>
                  <div className="contents">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 gap-1.5 text-muted-foreground"
                      onClick={resetDocTheme}
                      disabled={isDefaultDocTheme}
                    >
                      <RotateCcw className="size-3.5" /> Reset
                    </Button>
                  </div>
                  </div>
                </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          </div>

          <div className="print-scroll flex-1 overflow-y-auto flex">
            <div className="flex-1 min-w-0 overflow-y-auto">
            <div className="mx-auto w-full max-w-[820px] px-6 py-8 md:px-10">
            <div
              className="print-doc rounded-xl border p-8 shadow-sm md:p-12"
              onSelect={handlePreviewSelect}
            >
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

              {chapters.map((chapter, chapterIndex) => !showPreliminaryPages && chapter.isFrontMatter ? null : (
                <section key={chapter.name} className="mt-8">
                  <h2 className="flex items-baseline gap-2 pb-1.5">
                    <span className="font-mono text-xs text-primary">
                      {isFrontMatterChapter(chapterIndex)
                        ? ''
                        : `CHAPTER ${ROMAN[chapterOrdinal(chapterIndex)]}`}
                    </span>{' '}
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      spellCheck={false}
                      onBlur={(event) =>
                        updateChapterName(
                          chapterIndex,
                          (event.currentTarget.textContent ?? '').trim(),
                        )
                      }
                      className="rounded-sm outline-none focus:outline-none"
                    >
                      {isFrontMatterChapter(chapterIndex)
                        ? chapter.name.toUpperCase()
                        : chapter.name}
                    </span>
                  </h2>
                  {chapter.intro.trim() && (
                    /* A <div> (not <p>) — the intro can contain styled paragraph
                       <div>s and <ul>/<ol> lists, which are illegal inside <p>.
                       The content is static HTML (see PrintDraft) so React never
                       reconciles children inside the editable region. The { __html }
                       object is memoized inside EditableIntro so React doesn't
                       rewrite innerHTML on every re-render while editing. */
                    <EditableIntro
                      intro={chapter.intro}
                      onBlur={(markdown) =>
                        updateChapterIntro(
                          chapterIndex,
                          markdown,
                          chapter.introReferences,
                        )
                      }
                    />
                  )}
                  {chapter.sections.map((section, sectionIndex) => {
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
                        <h3 className="font-semibold">
                          {section.id}{' '}
                          <span
                            contentEditable
                            suppressContentEditableWarning
                            spellCheck={false}
                            onBlur={(event) =>
                              updateSection(chapterIndex, sectionIndex, {
                                heading: (event.currentTarget.textContent ?? '').trim(),
                              })
                            }
                            className="rounded-sm outline-none focus:outline-none"
                          >
                            {section.heading}
                          </span>
                        </h3>

                        {section.draft ? (
                          <PrintDraft
                            draft={section.draft}
                            onEdit={(markdown) => {
                              updateSection(chapterIndex, sectionIndex, { draft: markdown });
                              // The draft changed — any earlier verification of
                              // this section (and of the whole study) is stale.
                              setVerifyBySection((prev) => {
                                if (!(section.id in prev)) return prev;
                                const next = { ...prev };
                                delete next[section.id];
                                return next;
                              });
                              setVerifyAll(null);
                            }}
                          />
                        ) : filledFields.length > 0 ? (
                          <div className="mt-2 space-y-2">
                            {fieldsToProse(section).map((para, index) => (
                              <p key={index} className="whitespace-pre-wrap">
                                {para.label && <strong>{para.label}: </strong>}
                                {para.text}
                              </p>
                            ))}
                          </div>
                        ) : null}

                        {hasRows && section.rows && (!draftHasTable || !draftCoversRows) && (
                          <div className="mt-2 overflow-x-auto">
                            <table className="w-full border-collapse">
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
                          <p className="mt-1.5 text-muted-foreground">
                            <span className="font-medium text-foreground">Notes: </span>
                            {section.notes}
                          </p>
                        )}

                        {!hasAnything && (
                          <p className="mt-1.5 italic text-muted-foreground">
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
                  <h2 className="flex items-baseline gap-2 border-b pb-1.5">
                    <span className="font-mono text-xs text-primary">REFERENCES</span>{' '}
                    Reference List
                  </h2>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
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

            {verifyAll && (
              <div className="no-print mt-6 rounded-xl border bg-card p-4">
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
            <div className="no-print mt-4 flex justify-center">
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
            </div>
            </div>
            </div>

          {assistantOpen && (
            <div className="w-[340px] shrink-0 border-l bg-background flex flex-col overflow-hidden">
              <div className="border-b bg-primary px-4 py-3 text-primary-foreground">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">CareStudy editor</p>
                    <p className="mt-0.5 text-xs text-primary-foreground/80">
                      Reviews the complete work currently on screen.
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="size-7 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" onClick={() => setAssistantOpen(false)} aria-label="Close study assistant">
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 border-b px-3 py-2">
                <Button size="sm" variant="secondary" disabled={assistantBusy} onClick={() => void askStudyAssistant('Review the entire care study for inconsistencies, missing links between sections, and the five highest-priority improvements.')}>Review consistency</Button>
                <Button size="sm" variant="secondary" disabled={assistantBusy} onClick={() => void askStudyAssistant('Fully edit the complete care study for clarity, grammar, professional tone, and internal consistency. Give ready-to-paste replacements grouped by section; do not invent facts.')}>Full edit</Button>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
                {assistantMessages.length === 0 ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Ask about the whole work, or choose a review. Suggestions never overwrite your study automatically.
                  </p>
                ) : assistantMessages.map((item, index) => (
                  <div key={`${item.role}-${index}`} className={cn('rounded-lg px-3 py-2 whitespace-pre-wrap', item.role === 'user' ? 'ml-7 bg-primary text-primary-foreground' : 'mr-3 bg-background border')}>
                    {item.role === 'assistant' ? assistantPlainText(item.content) : item.content}
                    {item.role === 'assistant' && item.edits?.length && !item.applied ? (
                      <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-2">
                        <p className="mb-1.5 text-[10px] font-medium text-primary">
                          {item.edits.length} suggested edit{item.edits.length === 1 ? '' : 's'} — review and apply below
                        </p>
                        <Button
                          size="sm"
                          className="w-full gap-1.5 text-xs"
                          onClick={() => applyAssistantEdits(index, item.edits ?? [])}
                        >
                          <CheckCircle2 className="size-3.5" />
                          Apply {item.edits.length} edit{item.edits.length === 1 ? '' : 's'} to the study
                        </Button>
                      </div>
                    ) : null}
                    {item.role === 'assistant' && item.applied ? (
                      <p className="mt-2 text-xs text-muted-foreground">Applied to the study. Changes will autosave.</p>
                    ) : null}
                  </div>
                ))}
                {assistantBusy && <div className="mr-3 rounded-lg border bg-background px-3 py-2 text-muted-foreground">Reviewing the full study…</div>}
              </div>
              <div className="flex gap-2 border-t p-3">
                <Textarea
                  value={assistantMessage}
                  onChange={(event) => setAssistantMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void askStudyAssistant();
                    }
                  }}
                  placeholder="Ask the editor about this care study…"
                  className="min-h-10 resize-none text-sm"
                  rows={2}
                  disabled={assistantBusy}
                />
                <Button size="icon" className="mt-auto" disabled={!assistantMessage.trim() || assistantBusy} onClick={() => void askStudyAssistant()} aria-label="Send to study assistant">
                  <Send className="size-4" />
                </Button>
              </div>
            </div>
          )}

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
  const [location] = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -5 }}
        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
        className="min-h-screen"
      >
        <ErrorBoundary resetKey={location}>
          <Switch>
            <Route path="/" component={LandingPage} />
            <Route path="/studio">{() => <AdminGate><Home /></AdminGate>}</Route>
            <Route path="/studio/bin">{() => <AdminGate><StudioBin /></AdminGate>}</Route>
            <Route path="/student" nest component={StudentPortal} />
            <Route component={NotFound} />
          </Switch>
        </ErrorBoundary>
      </motion.div>
    </AnimatePresence>
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
