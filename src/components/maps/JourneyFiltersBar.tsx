"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

// ── Types ──

export const JOURNEY_STAGES = [
  "any",
  "homepage",
  "landing",
  "category",
  "product",
  "pricing",
  "cart",
  "checkout",
  "thank_you",
] as const;
export type JourneyStage = (typeof JOURNEY_STAGES)[number];

export const JOURNEY_RANGES = ["7d", "30d", "90d", "all_time"] as const;
export type JourneyRange = (typeof JOURNEY_RANGES)[number];

export interface JourneyFilters {
  start: JourneyStage;
  end: JourneyStage;
  range: JourneyRange;
}

export function pickStage(v: string | null | undefined): JourneyStage {
  return (JOURNEY_STAGES as readonly string[]).includes(v || "")
    ? (v as JourneyStage)
    : "any";
}

export function pickRange(v: string | null | undefined): JourneyRange {
  return (JOURNEY_RANGES as readonly string[]).includes(v || "")
    ? (v as JourneyRange)
    : "30d";
}

// ── FilterPill generic dropdown ──

interface PillOption<V extends string> {
  value: V;
  label: string;
  disabled?: boolean;
  hint?: string;
}

function FilterPill<V extends string>({
  prefix,
  connector,
  label,
  value,
  options,
  onChange,
  disabled,
  disabledHint,
}: {
  prefix: string;
  connector?: string;
  label: string;
  value: V;
  options: PillOption<V>[];
  onChange: (v: V) => void;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (ref.current && target && !ref.current.contains(target)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="flex items-center gap-2">
      {connector && (
        <span className="text-xs lowercase text-content-muted">
          {connector}
        </span>
      )}
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => !disabled && setOpen((x) => !x)}
          disabled={disabled}
          title={disabled ? disabledHint : undefined}
          className={`flex min-w-0 items-start gap-3 rounded-lg border px-3 py-1.5 text-left transition-colors sm:min-w-[140px] ${
            disabled
              ? "cursor-not-allowed border-edge/40 bg-surface-inset/30 opacity-70"
              : open
                ? "border-blue-500/50 bg-blue-500/5"
                : "border-edge bg-surface-card hover:border-edge-strong hover:bg-surface-card-hover"
          }`}
        >
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">
              {prefix}
            </span>
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
              {label}
            </span>
          </div>
          {!disabled && (
            <svg
              className={`mt-1 h-3 w-3 shrink-0 text-content-muted transition-transform ${open ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 12 12"
            >
              <path
                d="M3 4.5l3 3 3-3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-edge bg-surface-card shadow-xl">
            <div className="max-h-[320px] overflow-auto py-1">
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => {
                    if (opt.disabled) return;
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition-colors ${
                    opt.disabled
                      ? "cursor-not-allowed text-content-faint"
                      : opt.value === value
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "text-content-secondary hover:bg-surface-card-hover hover:text-content"
                  }`}
                >
                  <span>{opt.label}</span>
                  {opt.hint && (
                    <span className="text-[10px] text-content-faint">
                      {opt.hint}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ──

export default function JourneyFiltersBar({
  filters,
  onChange,
  mode,
}: {
  filters: JourneyFilters;
  onChange: (patch: Partial<JourneyFilters>) => void;
  mode: unknown;
}) {
  const t = useTranslations("console.maps.journey");
  const tStages = useTranslations("console.maps.page_types");

  const stageOptions: PillOption<JourneyStage>[] = JOURNEY_STAGES.map((s) => ({
    value: s,
    label:
      s === "any"
        ? (t("any_page") as string)
        : (tStages(s as never) as string),
  }));
  const rangeOptions: PillOption<JourneyRange>[] = JOURNEY_RANGES.map((r) => ({
    value: r,
    label: t(`ranges.${r}` as never) as string,
  }));
  const cohortOptions: PillOption<"all">[] = [
    { value: "all", label: t("cohorts.all") as string },
  ];

  return (
    <div className="no-scrollbar flex items-center gap-2 overflow-x-auto border-b border-edge bg-surface-card/30 px-4 py-3 sm:flex-wrap sm:gap-3 sm:px-6">
      <FilterPill
        prefix={t("starting") as string}
        label={
          filters.start === "any"
            ? (t("any_page") as string)
            : (tStages(filters.start as never) as string)
        }
        value={filters.start}
        options={stageOptions}
        onChange={(v) => onChange({ start: v })}
      />
      <FilterPill
        prefix={t("ending") as string}
        connector={t("to") as string}
        label={
          filters.end === "any"
            ? (t("any_page") as string)
            : (tStages(filters.end as never) as string)
        }
        value={filters.end}
        options={stageOptions}
        onChange={(v) => onChange({ end: v })}
      />
      <FilterPill<"all">
        prefix={t("users_in") as string}
        connector={t("for") as string}
        label={t("cohorts.all") as string}
        value="all"
        options={cohortOptions}
        onChange={() => {}}
        disabled
        disabledHint={t("cohorts.coming_soon") as string}
      />
      <FilterPill
        prefix={t("time") as string}
        connector={t("in") as string}
        label={t(`ranges.${filters.range}` as never) as string}
        value={filters.range}
        options={rangeOptions}
        onChange={(v) => onChange({ range: v })}
      />
      {mode === "inferred" && (
        <span className="ml-auto flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-600 dark:text-amber-400">
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          {t("inferred_notice")}
        </span>
      )}
      {mode === "demo" && (
        <span className="ml-auto flex items-center gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/5 px-2 py-1 text-[11px] text-violet-600 dark:text-violet-400">
          {t("demo_notice")}
        </span>
      )}
    </div>
  );
}
