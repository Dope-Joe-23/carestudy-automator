import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/studentApi";

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "submitted", label: "Submitted" },
  { value: "in_production", label: "In production" },
  { value: "ready", label: "Ready" },
  { value: "cancelled", label: "Cancelled" },
];

export function OrderStatusFilter({
  value,
  counts,
  total,
  onChange,
}: {
  value: OrderStatus | "all";
  counts: Record<OrderStatus, number>;
  total: number;
  onChange: (value: OrderStatus | "all") => void;
}) {
  const options: { value: OrderStatus | "all"; label: string; count: number }[] = [
    { value: "all", label: "All orders", count: total },
    ...STATUS_OPTIONS.map((option) => ({
      ...option,
      count: counts[option.value],
    })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter orders by status">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
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
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
