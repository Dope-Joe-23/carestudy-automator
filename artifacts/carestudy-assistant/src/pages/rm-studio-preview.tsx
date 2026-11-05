import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Eye,
  FileText,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StudioSidebarToolsPortal } from "@/components/studio-shell";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import { RM_CARE_STUDY_TEMPLATE_DRAFT } from "@/lib/template";
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
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, Record<string, string>>>({});
  const [rowValues, setRowValues] = useState<Record<string, PreviewRow[]>>({});

  const chapter = RM_CARE_STUDY_TEMPLATE_DRAFT[chapterIndex];
  const section = activeSectionId
    ? chapter.sections.find((item) => item.id === activeSectionId) ?? null
    : null;
  const values = section ? fieldValues[section.id] ?? {} : {};
  const rows = section ? rowValues[section.id] ?? [] : [];

  return (
    <main className="min-h-full bg-background">
      <StudioSidebarToolsPortal>
        <SidebarGroup>
          <SidebarGroupLabel>Chapters</SidebarGroupLabel>
          <SidebarMenu>
            <Collapsible asChild defaultOpen className="group/collapsible">
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip="RM chapters · provisional">
                    <FileText className="size-4 shrink-0 text-sidebar-primary" />
                    <span className="min-w-0 flex-1 truncate text-left">RM · provisional</span>
                    <ChevronRight className="ml-auto size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {RM_CARE_STUDY_TEMPLATE_DRAFT.map((item, itemIndex) => (
                      <SidebarMenuItem key={item.name}>
                        <SidebarMenuButton
                          isActive={chapterIndex === itemIndex}
                          tooltip={item.name}
                          className="h-auto py-2"
                          onClick={() => {
                            setChapterIndex(itemIndex);
                            setActiveSectionId(null);
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate text-left">{item.name}</span>
                          <span className="font-mono text-[10px] text-sidebar-foreground/60">
                            {item.sections.length}
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          </SidebarMenu>
        </SidebarGroup>
      </StudioSidebarToolsPortal>
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">RM draft · {chapter.shortLabel}</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold">{chapter.name}</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{chapter.blurb}</p>
            </div>
            <Badge variant="outline" className="gap-1">
              <Eye className="size-3.5" /> Preview mode
            </Badge>
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
