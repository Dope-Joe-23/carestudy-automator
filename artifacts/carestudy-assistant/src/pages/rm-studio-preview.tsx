import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Eye,
  FileText,
  Library,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StudioSidebarToolsPortal } from "@/components/studio-shell";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { RM_CARE_STUDY_TEMPLATE } from "@/lib/template";
import type { TemplateField, TemplateRowDef } from "@/lib/template";

type PreviewRow = Record<string, string>;

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: TemplateField;
  value: string;
  onChange: (value: string) => void;
}) {
  const control = field.type === "textarea" ? (
    <Textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.placeholder}
      rows={4}
    />
  ) : field.type === "select" ? (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
    >
      <option value="">Select an option</option>
      {(field.options ?? []).map((option) => <option key={option}>{option}</option>)}
    </select>
  ) : (
    <Input
      type={field.type === "date" || field.type === "datetime-local" ? field.type : "text"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.placeholder}
    />
  );

  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{field.label}</span>
      {field.hint && <span className="text-xs leading-relaxed text-muted-foreground">{field.hint}</span>}
      {control}
    </label>
  );
}

function RowEditor({
  sectionId,
  definition,
  rows,
  onChange,
}: {
  sectionId: string;
  definition: TemplateRowDef;
  rows: PreviewRow[];
  onChange: (rows: PreviewRow[]) => void;
}) {
  const updateCell = (rowIndex: number, columnId: string, value: string) => {
    onChange(rows.map((row, index) => index === rowIndex ? { ...row, [columnId]: value } : row));
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{definition.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{definition.emptyHint}</p>
      </div>
      {rows.map((row, rowIndex) => (
        <Card key={`${sectionId}-${rowIndex}`} className="bg-muted/20">
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
            {definition.columns.map((column) => (
              <label key={column.id} className="grid gap-1.5 text-sm">
                <span className="font-medium">{column.label}</span>
                {column.type === "textarea" ? (
                  <Textarea
                    value={row[column.id] ?? ""}
                    onChange={(event) => updateCell(rowIndex, column.id, event.target.value)}
                    placeholder={column.placeholder}
                    rows={3}
                  />
                ) : (
                  <Input
                    type={column.type === "date" || column.type === "datetime-local" ? column.type : "text"}
                    value={row[column.id] ?? ""}
                    onChange={(event) => updateCell(rowIndex, column.id, event.target.value)}
                    placeholder={column.placeholder}
                  />
                )}
              </label>
            ))}
          </CardContent>
        </Card>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => onChange([...rows, {}])}
      >
        <Plus className="size-4" />
        {definition.addLabel}
      </Button>
    </section>
  );
}

export function RmStudioPreview() {
  const [chapterIndex, setChapterIndex] = useState(0);
  const [chapterPickerOpen, setChapterPickerOpen] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, Record<string, string>>>({});
  const [rowValues, setRowValues] = useState<Record<string, PreviewRow[]>>({});

  const chapter = RM_CARE_STUDY_TEMPLATE[chapterIndex];
  const section = activeSectionId
    ? chapter.sections.find((item) => item.id === activeSectionId) ?? null
    : null;
  const values = section ? fieldValues[section.id] ?? {} : {};
  const rows = section ? rowValues[section.id] ?? [] : [];

  return (
    <main className="min-h-full bg-background">
      <StudioSidebarToolsPortal>
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">Chapters</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Choose a chapter" onClick={() => setChapterPickerOpen(true)}>
                <Library className="size-4 shrink-0 text-sidebar-primary" />
                <span className="min-w-0 flex-1 truncate text-left">Chapters</span>
                <span className="max-w-24 truncate text-[10px] text-sidebar-foreground/60">{chapter.shortLabel}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </StudioSidebarToolsPortal>
      <Dialog open={chapterPickerOpen} onOpenChange={setChapterPickerOpen}>
        <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose a chapter</DialogTitle>
            <DialogDescription>Jump to a chapter in the RM care-study preview.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {RM_CARE_STUDY_TEMPLATE.map((item, itemIndex) => (
              <button key={item.name} type="button" onClick={() => { setChapterIndex(itemIndex); setActiveSectionId(null); setChapterPickerOpen(false); }} className="w-full rounded-lg border p-3 text-left hover:bg-muted/60">
                <span className="flex items-center gap-3">
                  <FileText className="size-4 text-primary" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.name}</span><span className="mt-1 block text-xs text-muted-foreground">{item.sections.length} sections · provisional template</span></span>
                  {chapterIndex === itemIndex && <span className="text-xs text-primary">Current</span>}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <header className="sticky top-0 z-20 flex h-11 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-md md:px-5">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-4" />
        <div className="min-w-0 truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">RM Studio / <span className="text-foreground">{chapter.shortLabel}</span></div>
        <div className="ml-auto flex items-center gap-2"><Badge variant="outline" className="hidden gap-1 sm:flex"><Eye className="size-3" /> Preview mode</Badge><Badge variant="secondary">Not approved</Badge></div>
      </header>
      <div className="flex-1 space-y-4 p-4 md:p-5 lg:p-6">
        <div className="hidden">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">RM · preview</Badge>
              <Badge variant="secondary">Not approved</Badge>
            </div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight">Registered Midwife Studio</h1>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              A maternity-focused workspace draft based on the supplied RM care-study examples.
              Review it with an RM educator before treating it as a programme standard.
            </p>
          </div>
        </div>

        <div role="note" className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">Provisional interface — changes are temporary</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              This preview is not saved and does not run AI drafting, clinical review, or document export.
              Those features stay off until the RM template and rubric are educator-approved.
            </p>
          </div>
        </div>

        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">RM draft · {chapter.shortLabel}</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold tracking-tight">{chapter.name}</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{chapter.blurb}</p>
            </div>
          </div>

          {section ? (
            <Card>
              <CardHeader>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mb-1 w-fit gap-2 px-2"
                  onClick={() => setActiveSectionId(null)}
                >
                  <ArrowLeft className="size-4" /> Back to {chapter.shortLabel} sections
                </Button>
                <CardTitle className="text-base">{section.id} — {section.heading}</CardTitle>
                <CardDescription>{section.blurb}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {section.fields.length > 0 && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {section.fields.map((field) => (
                      <FieldInput
                        key={field.id}
                        field={field}
                        value={values[field.id] ?? ""}
                        onChange={(value) => setFieldValues((current) => ({
                          ...current,
                          [section.id]: { ...current[section.id], [field.id]: value },
                        }))}
                      />
                    ))}
                  </div>
                )}
                {section.rows && (
                  <RowEditor
                    sectionId={section.id}
                    definition={section.rows}
                    rows={rows}
                    onChange={(nextRows) => setRowValues((current) => ({ ...current, [section.id]: nextRows }))}
                  />
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {chapter.sections.map((itemSection) => (
                <Card key={itemSection.id} className="flex h-full flex-col">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      <span className="mr-2 font-mono text-xs text-primary">{itemSection.id}</span>
                      {itemSection.heading}
                    </CardTitle>
                    <CardDescription>{itemSection.blurb}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    {itemSection.rows && (
                      <p className="mb-3 text-xs text-muted-foreground">
                        Includes {itemSection.rows.title.toLocaleLowerCase()} entries
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setActiveSectionId(itemSection.id)}
                    >
                      Open section <ArrowRight className="size-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
