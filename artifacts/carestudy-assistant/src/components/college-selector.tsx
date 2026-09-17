/**
 * CollegeSelector — a searchable combobox for selecting a Ghanaian nursing
 * institution. Shows a dropdown with filtering as the user types, plus allows
 * a custom value for institutions not in the list.
 */
import { useMemo, useRef, useState, useEffect } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { GHANA_NURSING_SCHOOLS } from "@/lib/ghana-nursing-schools";

export function CollegeSelector({
  value,
  onChange,
  id,
  placeholder = "Start typing to search…",
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input when the popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return GHANA_NURSING_SCHOOLS;
    return GHANA_NURSING_SCHOOLS.filter((school) =>
      school.toLowerCase().includes(q),
    );
  }, [search]);

  const showOtherOption = search.trim().length > 0 &&
    !GHANA_NURSING_SCHOOLS.some(
      (s) => s.toLowerCase() === search.toLowerCase().trim(),
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="border-b px-3 py-2">
          <input
            ref={inputRef}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search institutions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              // Allow typing a custom value with Enter when no exact match
              if (e.key === "Enter" && search.trim()) {
                e.preventDefault();
                onChange(search.trim());
                setSearch("");
                setOpen(false);
              }
            }}
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto p-1">
          {filtered.map((school) => (
            <button
              key={school}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                value === school && "bg-accent text-accent-foreground",
              )}
              onClick={() => {
                onChange(school);
                setSearch("");
                setOpen(false);
              }}
            >
              <Check
                className={cn(
                  "size-4 shrink-0",
                  value === school ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="truncate">{school}</span>
            </button>
          ))}

          {filtered.length === 0 && !showOtherOption && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              No institutions found.
            </p>
          )}

          {showOtherOption && (
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                value === search.trim() && "bg-accent text-accent-foreground",
              )}
              onClick={() => {
                onChange(search.trim());
                setSearch("");
                setOpen(false);
              }}
            >
              <Check
                className={cn(
                  "size-4 shrink-0",
                  value === search.trim() ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="truncate">Use &quot;{search.trim()}&quot;</span>
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
