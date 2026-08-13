import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  CloudOff,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { listStudies, type StudySummary } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type StudiesPanelProps = {
  /** Bump this to refetch the list (after save/delete/rename). */
  refreshKey: number;
  currentStudyId: number | null;
  isSaving: boolean;
  /** False while the workspace has no data at all — saving would store nothing. */
  canSave: boolean;
  onOpenStudy: (id: number) => void;
  onDeleteStudy: (id: number) => void;
  onRenameStudy: (id: number, name: string) => Promise<void>;
  onSaveCurrent: () => void;
  onNewStudy: () => void;
};

export function StudiesPanel({
  refreshKey,
  currentStudyId,
  isSaving,
  canSave,
  onOpenStudy,
  onDeleteStudy,
  onRenameStudy,
  onSaveCurrent,
  onNewStudy,
}: StudiesPanelProps) {
  const [studies, setStudies] = useState<StudySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Which row is being renamed / delete-confirmed.
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

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
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const startRename = (study: StudySummary) => {
    setRenameValue(study.name);
    setRenamingId(study.id);
    // Focus once the input mounts (next frame).
    window.setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const performRename = async () => {
    if (renamingId === null || renaming) return;
    const name = renameValue.trim();
    if (!name) return;
    setRenaming(true);
    try {
      await onRenameStudy(renamingId, name);
      setRenamingId(null);
    } finally {
      setRenaming(false);
    }
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 flex-1 gap-1.5 text-xs"
          onClick={onNewStudy}
        >
          <Plus className="size-3" /> New study
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 flex-1 gap-1.5 text-xs"
          onClick={onSaveCurrent}
          disabled={isSaving || !canSave}
          title={canSave ? undefined : 'Add at least one piece of data before saving'}
        >
          {isSaving ? (
            <RotateCcw className="size-3 animate-spin" />
          ) : (
            <Save className="size-3" />
          )}
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {loading && (
        <p className="flex items-center justify-center gap-2 px-1 py-2 text-[11px] text-sidebar-foreground/70">
          <span className="size-3 animate-spin rounded-full border-2 border-sidebar-foreground/30 border-t-sidebar-foreground" />
          Loading your studies…
        </p>
      )}

      {!loading && error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] leading-relaxed text-destructive">
          {error}
        </p>
      )}

      {!loading && !error && studies && studies.length === 0 && (
        <p className="px-1 text-[11px] leading-relaxed text-sidebar-foreground/70">
          <CloudOff className="mb-0.5 mr-1 inline size-3" />
          No saved studies yet — press “New study” to start. Your work autosaves
          as you go.
        </p>
      )}

      {!loading && !error && studies && studies.length > 0 && (
        <ul className="space-y-1">
          {studies.map((study) => {
            const isCurrent = study.id === currentStudyId;
            const isRenaming = renamingId === study.id;
            const isDeleteConfirming = deleteConfirmId === study.id;
            return (
              <li
                key={study.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (!isRenaming && !isDeleteConfirming) onOpenStudy(study.id);
                }}
                onKeyDown={(event) => {
                  if (
                    (event.key === 'Enter' || event.key === ' ') &&
                    !isRenaming &&
                    !isDeleteConfirming
                  ) {
                    event.preventDefault();
                    onOpenStudy(study.id);
                  }
                }}
                title={isRenaming || isDeleteConfirming ? undefined : 'Open study'}
                className={cn(
                  'group/study cursor-pointer rounded-md border border-sidebar-border bg-sidebar-accent/40 p-2 text-sidebar-foreground transition-colors',
                  isCurrent && 'border-sidebar-primary/60 bg-sidebar-primary/20',
                )}
              >
                {isRenaming ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      placeholder="Study name"
                      maxLength={80}
                      className="h-6 min-w-0 flex-1 border-sidebar-border bg-white/5 px-1.5 text-[11px]"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && renameValue.trim() && !renaming) {
                          event.preventDefault();
                          void performRename();
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          cancelRename();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void performRename()}
                      disabled={!renameValue.trim() || renaming}
                      aria-label="Save rename"
                      className="grid size-5 shrink-0 place-items-center rounded text-sidebar-primary transition-colors hover:bg-white/10 disabled:opacity-40"
                    >
                      {renaming ? (
                        <RotateCcw className="size-3 animate-spin" />
                      ) : (
                        <Check className="size-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={cancelRename}
                      aria-label="Cancel rename"
                      className="grid size-5 shrink-0 place-items-center rounded text-sidebar-foreground/60 transition-colors hover:bg-white/10 hover:text-sidebar-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ) : isDeleteConfirming ? (
                  <div className="space-y-1.5">
                    <p className="text-[10px] leading-relaxed text-sidebar-foreground/80">
                      Delete “{study.name}” permanently?
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-6 flex-1 gap-1 px-2 text-[10px]"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteConfirmId(null);
                          onDeleteStudy(study.id);
                        }}
                      >
                        <Trash2 className="size-3" /> Delete
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 flex-1 gap-1 px-2 text-[10px] text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteConfirmId(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="size-3 shrink-0 text-sidebar-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium leading-tight">
                        {study.name}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`Study options for ${study.name}`}
                          className="grid size-6 shrink-0 place-items-center rounded text-sidebar-foreground/60 opacity-70 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:opacity-100 group-hover/study:opacity-100"
                        >
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        side="right"
                        sideOffset={6}
                        className="min-w-[150px] border-sidebar-border bg-sidebar-accent p-1 text-sidebar-foreground"
                      >
                        <DropdownMenuItem
                          onSelect={() => startRename(study)}
                          className="cursor-pointer gap-2 px-2 py-1.5 text-[11px] text-sidebar-foreground focus:bg-white/10 focus:text-sidebar-foreground"
                        >
                          <Pencil className="size-3.5 text-sidebar-foreground/70" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-white/10" />
                        <DropdownMenuItem
                          onSelect={() => {
                            setDeleteConfirmId(study.id);
                          }}
                          className="cursor-pointer gap-2 px-2 py-1.5 text-[11px] text-red-400 focus:bg-red-500/15 focus:text-red-300"
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
