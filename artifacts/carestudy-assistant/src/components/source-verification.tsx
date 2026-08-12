import {
  BadgeCheck,
  CircleAlert,
  CircleX,
  CheckCircle2,
  MinusCircle,
  ShieldCheck,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import type { SourceCheck, SourceCheckStatus } from '@/lib/api';
import { cn } from '@/lib/utils';

const STATUS_META: Record<SourceCheckStatus, { label: string; icon: LucideIcon; className: string }> = {
  ok: { label: 'Verified', icon: CheckCircle2, className: 'text-emerald-600 dark:text-emerald-400' },
  not_found: { label: 'Not found', icon: CircleX, className: 'text-destructive' },
  unreachable: { label: 'Unreachable', icon: WifiOff, className: 'text-amber-600 dark:text-amber-400' },
  invalid: { label: 'Invalid URL', icon: CircleAlert, className: 'text-destructive' },
  no_url: { label: 'No URL', icon: MinusCircle, className: 'text-muted-foreground' },
};

/**
 * Verification summary for a batch of references: consistency warnings first,
 * then one status chip per source.
 */
export function SourceCheckList({
  warnings,
  checks,
  checkedAt,
}: {
  warnings: string[];
  checks: SourceCheck[];
  checkedAt?: string;
}) {
  const hasUrlResults = checks.length > 0;
  const allClean = warnings.length === 0 && (!hasUrlResults || checks.every((c) => c.status === 'ok'));

  return (
    <div className="mt-3 space-y-3">
      {warnings.length > 0 && (
        <div
          role="alert"
          className={cn(
            'rounded-lg border px-3 py-2.5',
            allClean ? 'border-transparent' : 'border-amber-500/30 bg-amber-500/10',
          )}
        >
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
            <CircleAlert className="size-3.5" />
            {warnings.length} citation {warnings.length === 1 ? 'issue' : 'issues'} found
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/90">
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {hasUrlResults && (
        <ul className="space-y-1.5">
          {checks.map((check, index) => {
            const meta = STATUS_META[check.status];
            const Icon = meta.icon;
            const targetUrl = check.resolvedUrl ?? check.url;
            return (
              <li key={index} className="flex items-start gap-2">
                <span
                  className={cn(
                    'mt-px grid size-4 shrink-0 place-items-center',
                    meta.className,
                  )}
                  title={meta.label}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="flex flex-wrap items-center gap-x-1.5">
                    <span className="font-medium text-foreground">{meta.label}</span>
                    {check.note && <span className="text-muted-foreground/70">· {check.note}</span>}
                  </span>
                  <span className="block break-words">
                    {targetUrl ? (
                      <a
                        href={targetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-dotted underline-offset-2 transition-colors hover:text-primary"
                      >
                        {check.label}
                      </a>
                    ) : (
                      check.label
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {allClean && (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
          <BadgeCheck className="size-3.5" />
          All sources verified — every citation matches a listed source and every link resolves.
          {checkedAt && (
            <span className="font-mono text-[10px] text-muted-foreground/70">· {checkedAt}</span>
          )}
        </p>
      )}

      {!allClean && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Advisory only — fix the highlighted sources before submitting.
          {checkedAt && (
            <span className="font-mono text-[10px] text-muted-foreground/70">· {checkedAt}</span>
          )}
        </p>
      )}
    </div>
  );
}
