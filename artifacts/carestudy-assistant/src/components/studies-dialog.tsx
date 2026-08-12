import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  CloudOff,
  FolderOpen,
  History,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import {
  listStudies,
  listStudyVersions,
  type StudySummary,
  type StudyVersionSummary,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type StudiesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bump this to refetch the list (after save/delete/restore). */
  refreshKey: number;
  currentStudyId: number | null;
  isSaving: boolean;
  /** False while the workspace has no data at all — saving would store nothing. */
  canSave: boolean;
  onOpenStudy: (id: number) => void;
  onDeleteStudy: (id: number) => void;
  onRestoreVersion: (studyId: number, versionId: number) => void;
  onSaveCurrent: () => void;
  onNewStudy: () => void;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function StudiesDialog({
  open,
  onOpenChange,
  refreshKey,
  currentStudyId,
  isSaving,
  canSave,
  onOpenStudy,
  onDeleteStudy,
  onRestoreVersion,
  onSaveCurrent,
  onNewStudy,
}: StudiesDialogProps) {
  const [studies, setStudies] = useState<StudySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [versions, setVersions] = useState<Record<number, StudyVersionSummary[]>>({});
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionFailures, setVersionFailures] = useState<number[]>([]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setStudies(await listStudies());
    } catch (err) {
      setStudies(null);
      setError(
        err instanceof Error
          ? err.message
          : 'Could not reach the storage service. Is the API server running?',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refreshKey]);

  const toggleVersions = async (studyId: number) => {
    if (expanded === studyId) {
      setExpanded(null);
      return;
    }
    setExpanded(studyId);
    if (versions[studyId]) return;
    setVersionsLoading(true);
    try {
      const rows = await listStudyVersions(studyId);
      setVersions((previous) => ({ ...previous, [studyId]: rows }));
      setVersionFailures((previous) => previous.filter((id) => id !== studyId));
    } catch (err) {
      setVersions((previous) => ({ ...previous, [studyId]: [] }));
      setVersionFailures((previous) =>
        previous.includes(studyId) ? previous : [...previous, studyId],
      );
      toast.error('Could not load version history', {
        description: err instanceof Error ? err.message : 'Storage is unreachable.',
      });
    } finally {
      setVersionsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>My studies</DialogTitle>
          <DialogDescription>
            Saved on the server with version history — reopen them from any browser.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={onSaveCurrent}
            disabled={isSaving || !canSave}
            title={canSave ? undefined : 'Add at least one piece of data before saving'}
          >
            {isSaving ? (
              <RotateCcw className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            {isSaving ? 'Saving…' : 'Save current study'}
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onNewStudy}>
            <Plus className="size-3.5" /> New study
          </Button>
        </div>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {loading && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-sm text-muted-foreground">
              <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
              Loading your studies…
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs leading-relaxed text-destructive">
              <p className="font-semibold">Storage is not reachable</p>
              <p className="mt-1 opacity-90">{error}</p>
              <p className="mt-2 opacity-80">
                Make sure the API server is running and can write its database file
                (<code className="font-mono">carestudy.db</code> — tables are created automatically).
              </p>
            </div>
          )}

          {!loading && !error && studies && studies.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <CloudOff className="mx-auto size-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium">No saved studies yet</p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                Fill in your study, then press “Save current study” — your work will survive
                refreshes and be listed here.
              </p>
            </div>
          )}

          {!loading &&
            !error &&
            studies &&
            studies.map((study) => {
              const isCurrent = study.id === currentStudyId;
              const isExpanded = expanded === study.id;
              const studyVersions = versions[study.id] ?? null;
              return (
                <div
                  key={study.id}
                  className={cn(
                    'rounded-lg border p-3',
                    isCurrent ? 'border-primary/30 bg-primary/[0.03]' : 'bg-card',
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                      <BookOpen className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{study.name}</p>
                      <p className="mt-0.5 font-mono text-[10px] tabular text-muted-foreground">
                        Saved {formatDate(study.updatedAt)}
                        {study.stats
                          ? ` · ${study.stats.drafted}/${study.stats.total} sections drafted`
                          : ''}
                      </p>
                    </div>
                    {isCurrent && (
                      <Badge variant="secondary" className="shrink-0">
                        Open
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => toggleVersions(study.id)}
                      aria-label={isExpanded ? 'Hide versions' : 'Show versions'}
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={() => onOpenStudy(study.id)}
                    >
                      <FolderOpen className="size-3.5" /> Open
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onDeleteStudy(study.id)}
                      aria-label="Delete study"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="mt-2.5 space-y-1.5 border-t pt-2.5">
                      <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <History className="size-3" /> Version history
                      </p>
                      {!studyVersions && versionsLoading && (
                        <p className="px-1 py-1 text-[11px] italic text-muted-foreground">
                          Loading versions…
                        </p>
                      )}
                      {!studyVersions && versionFailures.includes(study.id) && (
                        <p className="px-1 py-1 text-[11px] italic text-destructive">
                          Could not load the version history for this study.
                        </p>
                      )}
                      {studyVersions && studyVersions.length === 0 && (
                        <p className="px-1 py-1 text-[11px] italic text-muted-foreground">
                          No versions yet — each save records a new one.
                        </p>
                      )}
                      {studyVersions?.map((version) => (
                        <div
                          key={version.id}
                          className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5"
                        >
                          <span className="font-mono text-[11px] tabular text-muted-foreground">
                            {formatDate(version.createdAt)}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5"
                            onClick={() => onRestoreVersion(study.id, version.id)}
                          >
                            <RotateCcw className="size-3" /> Restore
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
