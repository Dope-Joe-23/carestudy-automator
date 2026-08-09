import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
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
  FileCheck2,
  FileText,
  Gauge,
  HeartPulse,
  Info,
  LineChart,
  ListChecks,
  Moon,
  NotebookPen,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Sun,
  Target,
  Trash2,
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
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Textarea } from '@/components/ui/textarea';

type SectionStatus = 'empty' | 'noted' | 'drafted';

type Section = {
  id: string;
  heading: string;
  blurb: string;
  fields: TemplateField[];
  rows?: TemplateRowDef;
  notes: string;
  draft: string;
  status: SectionStatus;
  data: Record<string, string>;
  rowData: RowRow[];
};

type RowRow = { id: number; cells: string[] };

type Chapter = {
  name: string;
  shortLabel: string;
  blurb: string;
  sections: Section[];
};

const CHAPTER_ICONS: LucideIcon[] = [
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
    sections: chapter.sections.map((section) => ({
      id: section.id,
      heading: section.heading,
      blurb: section.blurb,
      fields: section.fields,
      rows: section.rows,
      notes: '',
      draft: '',
      status: 'empty' as SectionStatus,
      data: {},
      rowData: [],
    })),
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

function computeStatus(section: Section): SectionStatus {
  if (section.draft.trim()) return 'drafted';
  const hasContent =
    section.notes.trim().length > 0 ||
    Object.values(section.data).some((value) => value.trim().length > 0) ||
    section.rowData.some((row) => row.cells.some((cell) => cell.trim().length > 0));
  return hasContent ? 'noted' : 'empty';
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
        className="flex items-center gap-1.5 text-xs font-medium text-foreground"
      >
        <span
          className={cn(
            'grid size-4 shrink-0 place-items-center rounded-full border transition-colors',
            filled
              ? 'border-transparent bg-primary text-primary-foreground'
              : 'border-input text-transparent',
          )}
        >
          <Check className="size-2.5" strokeWidth={3.2} />
        </span>
        {field.label}
        {field.required && (
          <span className="text-destructive" aria-hidden="true">
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
          className="min-h-[76px] bg-card leading-relaxed"
          aria-describedby={field.hint ? `hint-${field.id}` : undefined}
          aria-required={field.required || undefined}
        />
      ) : field.type === 'select' ? (
        <Select
          value={value || undefined}
          onValueChange={(next) => onChange(next === '__none__' ? '' : next)}
        >
          <SelectTrigger id={inputId} className="h-9 bg-card">
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
          className="h-9 bg-card"
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
          className="h-9 bg-card"
          aria-describedby={field.hint ? `hint-${field.id}` : undefined}
          aria-required={field.required || undefined}
        />
      )}

      {field.hint && (
        <p className="text-[11px] leading-relaxed text-muted-foreground" id={`hint-${field.id}`}>
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
    <div className="mt-4 border-t border-border/70 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold">{rowDef.title}</span>
        <Button variant="outline" size="sm" onClick={addRow} className="h-8 gap-1.5">
          <Plus className="size-3.5" /> {rowDef.addLabel}
        </Button>
      </div>

      {rows.length === 0 && (
        <p className="mt-3 text-xs italic leading-relaxed text-muted-foreground">
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
              <span className="w-5 shrink-0 text-center font-mono text-[11px] tabular text-muted-foreground">
                {rowIndex + 1}
              </span>
              {rowDef.columns.map((column, columnIndex) => (
                <Input
                  key={column.id}
                  className="h-8 bg-card text-xs"
                  placeholder={column.label}
                  value={row.cells[columnIndex] ?? ''}
                  onChange={(event) => updateCell(row.id, columnIndex, event.target.value)}
                />
              ))}
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
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
// Home
// ---------------------------------------------------------------------------

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

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
  const [copied, setCopied] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
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

  const draftedCount = allSections.filter((section) => section.status === 'drafted').length;
  const inProgressCount = allSections.filter((section) => section.status === 'noted').length;
  const notedCount = draftedCount + inProgressCount;
  const totalFilled = allSections.reduce((sum, section) => sum + sectionFilledCount(section), 0);
  const overallCompletion = Math.round(
    allSections.reduce((sum, section) => sum + sectionCompletion(section), 0) /
      Math.max(allSections.length, 1),
  );

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

  const updateCurrentSection = (updates: Partial<Section>) => {
    setChapters((previous) =>
      previous.map((chapter, chapterIndex) => {
        if (chapterIndex !== activeChapter) return chapter;
        return {
          ...chapter,
          sections: chapter.sections.map((section, sectionIndex) =>
            sectionIndex === activeSection
              ? { ...section, ...updates, status: computeStatus({ ...section, ...updates }) }
              : section,
          ),
        };
      }),
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
  };

  const selectChapter = (index: number) => jumpTo(index, 0);

  const goPrevious = () => {
    if (activeSection > 0) {
      setActiveSection(activeSection - 1);
    } else if (activeChapter > 0) {
      setActiveChapter(activeChapter - 1);
      setActiveSection(chapters[activeChapter - 1].sections.length - 1);
    }
  };

  const goNext = () => {
    if (activeSection < currentChapter.sections.length - 1) {
      setActiveSection(activeSection + 1);
    } else if (activeChapter < chapters.length - 1) {
      setActiveChapter(activeChapter + 1);
      setActiveSection(0);
    }
  };

  const draftSection = () => {
    if (!draftAvailable || isDrafting) return;
    setIsDrafting(true);
    window.setTimeout(() => {
      const composed = composeSectionInput(currentSection);
      const output = [
        `Dry-run draft for ${currentSection.heading}`,
        '',
        'Structured template input:',
        composed || '(no fields or notes collected yet)',
        '',
        'Drafting note:',
        'This section has been shaped from the structured fields and clinical notes above. Add, remove, or revise any wording so it reflects your clinical judgement and course requirements.',
        '',
        'Reference status: template examples retrieved; reference material available for structure only.',
        'Safety check: no patient facts were invented or inferred.',
        'AI status: no AI key is connected. This is a local, transparent dry-run.',
      ].join('\n');
      updateCurrentSection({ draft: output });
      setCopied(false);
      setIsDrafting(false);
      toast.success(`Draft ready — ${currentSection.heading}`, {
        description: 'Review and refine the wording before submission.',
      });
    }, 620);
  };

  const clearSection = () => {
    updateCurrentSection({ notes: '', draft: '', data: {}, rowData: [] });
    setCopied(false);
  };

  const resetAll = () => {
    setChapters(makeChapters());
    setActiveChapter(0);
    setActiveSection(0);
    setCopied(false);
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
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Care study <span className="mx-1 opacity-50">/</span>{' '}
            <span className="text-foreground">Chapter {activeChapter + 1}</span>
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
            <Badge variant="secondary" className="hidden gap-1.5 md:inline-flex">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Saved locally
            </Badge>
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

        <div className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">
                Patient / Family Care Study
              </p>
              <h1 className="hero-title mt-3 text-4xl leading-[1.04] md:text-5xl">
                Build it from what{' '}
                <em className="text-primary italic">you observed.</em>
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Twenty sections, each with a template of the exact information to collect —
                shaped from eight real care studies.
              </p>
            </div>
            <Card className="w-full md:w-72">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Study progress
                  </span>
                  <span className="tabular text-lg font-semibold text-primary">
                    {overallCompletion}%
                  </span>
                </div>
                <Progress value={overallCompletion} className="mt-2.5 h-1.5" />
                <p className="mt-2.5 text-[11px] text-muted-foreground">
                  {notedCount} of {allSections.length} sections in progress
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpi.map((item) => (
              <Card key={item.label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg bg-muted', item.accent)}>
                    <item.icon className="size-4.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="tabular mt-1 text-2xl font-semibold leading-none">{item.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
            <Card className="hidden lg:block">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Chapter {activeChapter + 1}</CardTitle>
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
              <CardHeader className="border-b bg-muted/30">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 font-mono text-xs tabular text-primary">
                      {currentSection.id}
                    </span>
                    <div>
                      <CardTitle className="text-xl leading-snug">{currentSection.heading}</CardTitle>
                      <CardDescription className="pt-0.5 leading-relaxed">
                        {currentSection.blurb}
                      </CardDescription>
                    </div>
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

                <div className="pt-3 lg:hidden">
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

              <CardContent className="space-y-6 pt-5">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${currentSection.id}-${activeChapter}-${activeSection}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="space-y-6"
                  >
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <ClipboardCheck className="size-4 text-primary" />
                          <span className="text-sm font-semibold">What to collect</span>
                        </div>
                        <span className="font-mono text-[11px] tabular text-muted-foreground">
                          {currentSection.rows
                            ? `${filledCount} filled`
                            : `${filledCount} / ${totalCount}`}
                        </span>
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

                      {currentSection.fields.length > 0 && (
                        <div className="mt-4 grid gap-x-4 gap-y-4 sm:grid-cols-2">
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
                            Preparing dry-run…
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
                              Dry-run output
                            </p>
                            <p className="text-sm font-medium">
                              {currentSection.draft
                                ? 'A grounded starting point'
                                : 'Your draft will appear here'}
                            </p>
                          </div>
                        </div>
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

                      {currentSection.draft ? (
                        <pre className="mt-4 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-lg border bg-card p-4 font-mono text-xs leading-relaxed">
                          {currentSection.draft}
                        </pre>
                      ) : (
                        <div className="mt-4 space-y-3">
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {draftAvailable
                              ? 'Ready when you are. The dry-run will only use the fields and notes you provide.'
                              : 'Nothing collected yet. Fill the template above, or jot down bedside observations, then draft this section.'}
                          </p>
                          <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                            <ShieldCheck className="size-3.5 text-primary" />
                            Transparent, local, and fact-safe
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </AnimatePresence>

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
            <span className="opacity-60">Local preview · no AI key connected</span>
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
              heading={`Chapter ${chapterIndex + 1} · ${chapter.name}`}
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

      <Dialog open={overviewOpen} onOpenChange={setOverviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Study overview</DialogTitle>
            <DialogDescription>
              Patient / Family Care Study — templates shaped from eight sample care studies.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Chapters', value: chapters.length },
              { label: 'Sections', value: allSections.length },
              { label: 'Sections drafted', value: draftedCount },
              { label: 'Completion', value: `${overallCompletion}%` },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border bg-muted/40 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </p>
                <p className="tabular mt-1 text-2xl font-semibold">{stat.value}</p>
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
                <Button onClick={() => window.print()} className="gap-2">
                  <Printer className="size-4" /> Print / Save as PDF
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

            <div className="print-doc rounded-xl border bg-card p-8 shadow-sm md:p-12">
              <header className="border-b pb-6 text-center">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Patient / Family Care Study
                </p>
                <h1 className="mt-2 font-serif text-2xl">Nursing &amp; Midwifery Training College</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Student name · Index number · {new Date().getFullYear()}
                </p>
              </header>

              {chapters.map((chapter, chapterIndex) => (
                <section key={chapter.name} className="mt-8">
                  <h2 className="flex items-baseline gap-2 border-b pb-1.5 font-serif text-lg">
                    <span className="font-mono text-xs text-primary">CHAPTER {ROMAN[chapterIndex]}</span>{' '}
                    {chapter.name}
                  </h2>
                  {chapter.sections.map((section) => {
                    const filledFields = section.fields.filter((field) =>
                      (section.data[field.id] ?? '').trim(),
                    );
                    const hasRows = section.rowData.length > 0;
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
                          <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed">
                            {section.draft}
                          </p>
                        ) : filledFields.length > 0 ? (
                          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
                            {filledFields.map((field) => (
                              <div key={field.id} className="flex gap-1.5">
                                <dt className="shrink-0 font-medium">{field.label}:</dt>
                                <dd className="text-muted-foreground">{section.data[field.id]}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}

                        {hasRows && section.rows && (
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
