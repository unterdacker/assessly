"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceTypeComboboxProps {
  /** Currently selected value (controlled). */
  value: string;
  /** Called when the user selects or creates a value. */
  onChange: (value: string) => void;
  /** The list of existing service types from the database. */
  options: string[];
  /** Placeholder shown when nothing is selected. */
  placeholder?: string;
  /** Id forwarded to the trigger button for label association. */
  id?: string;
  /** Whether the control is disabled. */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A keyboard-accessible, searchable combobox for vendor service types.
 *
 * Design decisions:
 * - Built without `cmdk` to keep the dependency tree lean (Radix is already present).
 * - Uses a controlled `<input>` inside a floating panel anchored to the trigger.
 * - When the typed query has no exact match, a "Create new: …" option appears,
 *   letting users introduce a brand-new type without a separate text field.
 * - Follows WCAG 2.1 AA: role="combobox", aria-expanded, aria-controls, etc.
 */
export function ServiceTypeCombobox({
  value,
  onChange,
  options,
  placeholder = "Select or type a service type…",
  id,
  disabled = false,
}: ServiceTypeComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();

  // ------------------------------------------------------------------
  // Derived state
  // ------------------------------------------------------------------

  const trimmedQuery = query.trim();

  const filtered = React.useMemo(() => {
    if (!trimmedQuery) return options;
    const q = trimmedQuery.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, trimmedQuery]);

  const exactMatch =
    trimmedQuery !== "" &&
    options.some((o) => o.toLowerCase() === trimmedQuery.toLowerCase());

  const showCreate = trimmedQuery !== "" && !exactMatch;

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  const openPanel = () => {
    if (disabled) return;
    setQuery("");
    setOpen(true);
    // Focus the search input on next tick
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const closePanel = () => {
    setOpen(false);
    setQuery("");
  };

  const selectOption = (option: string) => {
    onChange(option);
    closePanel();
  };

  const createOption = () => {
    if (!trimmedQuery) return;
    onChange(trimmedQuery);
    closePanel();
  };

  // ------------------------------------------------------------------
  // Close on outside click / Escape
  // ------------------------------------------------------------------

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closePanel();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger */}
      <Button
        id={id}
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={openPanel}
        className={cn(
          "w-full justify-between font-normal",
          !value && "text-muted-foreground",
        )}
      >
        <span title={value || placeholder} className="truncate">{value || placeholder}</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {/* Floating panel */}
      {open && (
        <div
          className={cn(
            "absolute z-[100] mt-1 w-full rounded-md border border-slate-200 shadow-lg",
            "bg-white dark:bg-slate-950 dark:border-slate-800 text-popover-foreground",
            "animate-in fade-in-0 zoom-in-95",
          )}
        >
          {/* Search input */}
          <div className="flex items-center border-b px-3">
            <input
              ref={inputRef}
              role="searchbox"
              aria-autocomplete="list"
              aria-controls={listId}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (filtered.length === 1) {
                    selectOption(filtered[0]);
                  } else if (showCreate) {
                    createOption();
                  }
                }
              }}
              placeholder="Search or type to create…"
              className={cn(
                "flex h-10 w-full bg-transparent py-3 text-sm outline-none",
                "placeholder:text-muted-foreground",
              )}
            />
          </div>

          {/* Options list */}
          <ul
            id={listId}
            role="listbox"
            className="max-h-56 overflow-y-auto p-1"
          >
            {/* Existing types */}
            {filtered.length === 0 && !showCreate && (
              <li className="py-6 text-center text-sm text-muted-foreground">
                No types found — type to create the first one.
              </li>
            )}

            {filtered.map((option) => (
              <li
                key={option}
                role="option"
                aria-selected={value === option}
                onClick={() => selectOption(option)}
                className={cn(
                  "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm",
                  "outline-none transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  value === option && "bg-accent/50",
                )}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    value === option ? "opacity-100" : "opacity-0",
                  )}
                />
                {option}
              </li>
            ))}

            {/* "Create new" option */}
            {showCreate && (
              <li
                role="option"
                aria-selected={false}
                onClick={createOption}
                className={cn(
                  "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm",
                  "outline-none transition-colors",
                  "hover:bg-primary/10 hover:text-primary",
                  "text-primary font-medium",
                )}
              >
                <Plus className="mr-2 h-4 w-4 shrink-0" />
                Create new:&nbsp;
                <span className="italic">&ldquo;{trimmedQuery}&rdquo;</span>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
