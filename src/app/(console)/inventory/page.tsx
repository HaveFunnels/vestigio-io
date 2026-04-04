"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Column } from "@/components/console/DataTable";
import SummaryCards, { SummaryCard } from "@/components/console/SummaryCards";
import ConsoleState from "@/components/console/ConsoleState";
import { loadInventory, type InventorySurface, type DataState } from "@/lib/console-data";

// ──────────────────────────────────────────────
// Inventory Page — Surface-Level Intelligence
//
// Displays normalized surfaces (not raw URLs).
// Each row = a logical page/route/step.
// Shows: live status, page type, sessions, findings.
//
// Clicking findings count → navigates to Findings
// with surface filter applied.
// ──────────────────────────────────────────────

type LiveFilter = "all" | "live" | "not_live";
type TypeFilter = "all" | "commercial" | "support" | "policy" | "other";
type HttpStatusFilter = "all" | "2xx" | "3xx" | "4xx" | "5xx";
type HasFindingsFilter = "all" | "with" | "without";
type TierFilter = "all" | "critical" | "high" | "medium" | "low";
type ResponseTimeFilter = "all" | "lt500" | "500_2000" | "gt2000";

// ── Custom Dropdown ──────────────────────────

interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

function FilterDropdown<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const activeLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-sm text-content-secondary transition-colors hover:bg-surface-card-hover"
      >
        <span>{activeLabel}</span>
        <svg
          className={`h-3.5 w-3.5 text-content-faint transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[10rem] rounded-lg border border-edge bg-surface-card p-1 shadow-xl">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-card-hover ${
                opt.value === value ? "text-content" : "text-content-secondary"
              }`}
            >
              {opt.value === value ? (
                <svg className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <span className="h-3.5 w-3.5" />
              )}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Title Case helper ──────────────────────────

function titleCase(str: string): string {
  return str
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Side Drawer ────────────────────────────────

function SurfaceDrawer({
  surface,
  onClose,
}: {
  surface: InventorySurface | null;
  onClose: () => void;
}) {
  const isOpen = surface !== null;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKey);
    }
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-96 flex-col border-l border-edge bg-surface-card transition-transform duration-200 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {surface && (
          <>
            <div className="flex items-center justify-between border-b border-edge px-5 py-4">
              <h2 className="text-sm font-semibold text-content">Surface Details</h2>
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-muted"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* URL */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-content-faint font-medium mb-1">URL</div>
                <div className="text-sm text-content font-mono break-all">{surface.host}{surface.normalized_path}</div>
              </div>

              {/* Title */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-content-faint font-medium mb-1">Title</div>
                <div className="text-sm text-content">{surface.title || surface.label}</div>
              </div>

              {/* Description */}
              {surface.description && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-content-faint font-medium mb-1">Description</div>
                  <div className="text-sm text-content-secondary">{surface.description}</div>
                </div>
              )}

              {/* Type & Tier */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-content-faint font-medium mb-1">Type</div>
                  <span className={`inline-block text-xs px-2 py-0.5 rounded ${surface.is_commercial ? "bg-blue-900/30 text-blue-400" : "bg-surface-inset text-content-muted"}`}>
                    {titleCase(surface.page_type)}
                  </span>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-content-faint font-medium mb-1">Tier</div>
                  <span className="text-sm text-content-secondary">{titleCase(surface.tier)}</span>
                </div>
              </div>

              {/* Status & HTTP Code */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-content-faint font-medium mb-1">Status</div>
                  <span className={`inline-flex items-center gap-1.5 text-xs ${surface.is_live ? "text-emerald-400" : "text-content-faint"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${surface.is_live ? "bg-emerald-400" : "bg-content-faint"}`} />
                    {surface.is_live ? "Live" : "Not Seen"}
                  </span>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-content-faint font-medium mb-1">HTTP Code</div>
                  <span className={`text-sm font-mono ${
                    surface.http_status === null
                      ? "text-content-faint"
                      : surface.http_status >= 400
                        ? "text-red-400"
                        : surface.http_status >= 300
                          ? "text-amber-400"
                          : "text-emerald-400"
                  }`}>
                    {surface.http_status ?? "---"}
                  </span>
                </div>
              </div>

              {/* Sessions & Findings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-content-faint font-medium mb-1">Sessions</div>
                  <span className="text-sm font-mono text-content-secondary">{surface.session_count.toLocaleString()}</span>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-content-faint font-medium mb-1">Findings</div>
                  <span className={`text-sm font-mono ${surface.finding_count > 0 ? "text-amber-400" : "text-content-faint"}`}>
                    {surface.finding_count}
                  </span>
                </div>
              </div>

              {/* Response Time */}
              {surface.response_time_ms !== null && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-content-faint font-medium mb-1">Response Time</div>
                  <span className="text-sm font-mono text-content-secondary">{surface.response_time_ms}ms</span>
                </div>
              )}

              {/* Last Checked */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-content-faint font-medium mb-1">Last Checked</div>
                <span className="text-sm text-content-secondary">
                  {surface.last_seen_at ? new Date(surface.last_seen_at).toLocaleString() : "Never"}
                </span>
              </div>

              {/* Discovery Sources */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-content-faint font-medium mb-1">Discovery Sources</div>
                <div className="flex gap-1.5 flex-wrap">
                  {surface.discovery_sources.map((src) => (
                    <span key={src} className="text-[10px] px-1.5 py-0.5 bg-surface-inset text-content-faint rounded">
                      {titleCase(src)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── Floating Selection Bar ─────────────────────

function SelectionBar({
  count,
  onUseAsContext,
  onClear,
}: {
  count: number;
  onUseAsContext: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="sticky top-0 z-30 flex items-center gap-4 rounded-lg border border-edge bg-surface-card px-4 py-2.5 shadow-lg">
      <span className="text-sm font-medium text-content">
        {count} selected
      </span>
      <div className="flex-1" />
      <button
        onClick={onUseAsContext}
        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-text transition-colors hover:bg-accent/80"
      >
        Use as Context
      </button>
      <button
        onClick={onClear}
        className="rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-card-hover"
      >
        Clear Selection
      </button>
    </div>
  );
}

// ── Main Page ──────────────────────────────────

export default function InventoryPage() {
  const router = useRouter();
  const [liveFilter, setLiveFilter] = useState<LiveFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [httpStatusFilter, setHttpStatusFilter] = useState<HttpStatusFilter>("all");
  const [hasFindingsFilter, setHasFindingsFilter] = useState<HasFindingsFilter>("all");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [responseTimeFilter, setResponseTimeFilter] = useState<ResponseTimeFilter>("all");
  const [discoverySourceFilter, setDiscoverySourceFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [dataState, setDataState] = useState<DataState<InventorySurface[]>>({ status: "loading" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerSurface, setDrawerSurface] = useState<InventorySurface | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadInventory().then((result) => {
      if (!cancelled) setDataState(result);
    });
    return () => { cancelled = true; };
  }, []);

  const surfaces = dataState.status === "ready" ? dataState.data : [];

  const discoverySourceOptions = useMemo(() => {
    const unique = Array.from(new Set(surfaces.flatMap(s => s.discovery_sources))).sort();
    return [
      { value: "all" as const, label: "All Sources" },
      ...unique.map(src => ({ value: src, label: titleCase(src) })),
    ];
  }, [surfaces]);

  const filtered = useMemo(() => {
    return surfaces.filter((s) => {
      if (liveFilter === "live" && !s.is_live) return false;
      if (liveFilter === "not_live" && s.is_live) return false;
      if (typeFilter === "commercial" && !s.is_commercial) return false;
      if (typeFilter === "support" && s.page_type !== "support") return false;
      if (typeFilter === "policy" && s.page_type !== "policy") return false;
      if (typeFilter === "other" && s.is_commercial) return false;
      if (httpStatusFilter !== "all") {
        if (s.http_status === null) return false;
        if (httpStatusFilter === "2xx" && (s.http_status < 200 || s.http_status >= 300)) return false;
        if (httpStatusFilter === "3xx" && (s.http_status < 300 || s.http_status >= 400)) return false;
        if (httpStatusFilter === "4xx" && (s.http_status < 400 || s.http_status >= 500)) return false;
        if (httpStatusFilter === "5xx" && (s.http_status < 500 || s.http_status >= 600)) return false;
      }
      if (hasFindingsFilter === "with" && s.finding_count === 0) return false;
      if (hasFindingsFilter === "without" && s.finding_count > 0) return false;
      if (tierFilter !== "all" && s.tier !== tierFilter) return false;
      if (responseTimeFilter !== "all") {
        if (s.response_time_ms === null) return false;
        if (responseTimeFilter === "lt500" && s.response_time_ms >= 500) return false;
        if (responseTimeFilter === "500_2000" && (s.response_time_ms < 500 || s.response_time_ms >= 2000)) return false;
        if (responseTimeFilter === "gt2000" && s.response_time_ms < 2000) return false;
      }
      if (discoverySourceFilter !== "all" && !s.discovery_sources.includes(discoverySourceFilter)) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        if (!(s.label.toLowerCase().includes(q) || s.normalized_path.toLowerCase().includes(q) || s.host.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [surfaces, liveFilter, typeFilter, httpStatusFilter, hasFindingsFilter, tierFilter, responseTimeFilter, discoverySourceFilter, searchText]);

  // ── Selection ──

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filtered.length && filtered.length > 0) return new Set();
      return new Set(filtered.map((s) => s.surface_id));
    });
  }, [filtered]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleUseAsContext = useCallback(() => {
    const ids = Array.from(selectedIds);
    router.push(`/chat?context=${encodeURIComponent(ids.join(","))}`);
  }, [selectedIds, router]);

  // ── Down pages count ──

  const downCount = useMemo(
    () => surfaces.filter((s) => !s.is_live || (s.http_status !== null && s.http_status >= 400)).length,
    [surfaces],
  );

  // TODO: Replace mocked deltas with real period-over-period data from the API
  // when backend supports it. These are placeholder values for UI development.
  const mockDeltas = {
    total: +3,
    live: +2,
    commercial: +1,
    findings: -1,
    down: 0,
  };

  const liveCount = surfaces.filter((s) => s.is_live).length;

  const summaryCards: SummaryCard[] = [
    {
      label: "Total Surfaces",
      value: surfaces.length,
      subtext: mockDeltas.total !== 0 ? `${mockDeltas.total > 0 ? "+" : ""}${mockDeltas.total} from last period` : undefined,
    },
    {
      label: "Commercial",
      value: surfaces.filter((s) => s.is_commercial).length,
      variant: "info",
      subtext: mockDeltas.commercial !== 0 ? `${mockDeltas.commercial > 0 ? "+" : ""}${mockDeltas.commercial} from last period` : undefined,
    },
    {
      label: "With Findings",
      value: surfaces.filter((s) => s.finding_count > 0).length,
      variant: "warning",
      subtext: mockDeltas.findings !== 0 ? `${mockDeltas.findings > 0 ? "+" : ""}${mockDeltas.findings} from last period` : undefined,
    },
  ];

  const closeDrawer = useCallback(() => setDrawerSurface(null), []);

  const isAllSelected = filtered.length > 0 && selectedIds.size === filtered.length;

  const columns: Column<InventorySurface>[] = [
    {
      key: "_select",
      label: "",
      className: "w-10",
      render: (row: InventorySurface) => (
        <input
          type="checkbox"
          checked={selectedIds.has(row.surface_id)}
          onChange={(e) => {
            e.stopPropagation();
            toggleSelect(row.surface_id);
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-3.5 w-3.5 rounded border-edge bg-surface-inset accent-accent cursor-pointer"
        />
      ),
    },
    {
      key: "label",
      label: "Surface",
      render: (row: InventorySurface) => (
        <div>
          <div className="text-sm text-content-secondary">{row.label}</div>
          <div className="text-xs text-content-faint font-mono">{row.host}{row.normalized_path}</div>
        </div>
      ),
    },
    {
      key: "page_type",
      label: "Type",
      render: (row: InventorySurface) => (
        <span className={`text-xs px-2 py-0.5 rounded ${row.is_commercial ? "bg-blue-900/30 text-blue-400" : "bg-surface-inset text-content-muted"}`}>
          {titleCase(row.page_type)}
        </span>
      ),
    },
    {
      key: "is_live",
      label: "Status",
      render: (row: InventorySurface) => (
        <span className={`inline-flex items-center gap-1 text-xs ${
          !row.is_live
            ? "text-content-faint"
            : row.http_status !== null && row.http_status >= 400
              ? "text-red-400"
              : "text-emerald-400"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            !row.is_live
              ? "bg-content-faint"
              : row.http_status !== null && row.http_status >= 400
                ? "bg-red-400"
                : "bg-emerald-400"
          }`} />
          {!row.is_live
            ? "Not Seen"
            : row.http_status !== null && row.http_status >= 400
              ? "Down"
              : "Live"}
        </span>
      ),
    },
    {
      key: "http_status",
      label: "HTTP",
      render: (row: InventorySurface) => (
        <span className={`text-xs font-mono ${
          row.http_status === null
            ? "text-content-faint"
            : row.http_status >= 400
              ? "text-red-400"
              : row.http_status >= 300
                ? "text-amber-400"
                : "text-content-muted"
        }`}>
          {row.http_status ?? "---"}
        </span>
      ),
    },
    {
      key: "session_count",
      label: "Sessions",
      render: (row: InventorySurface) => (
        <span className="text-xs text-content-muted font-mono">{row.session_count.toLocaleString()}</span>
      ),
    },
    {
      key: "finding_count",
      label: "Findings",
      render: (row: InventorySurface) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (row.finding_count > 0) {
              router.push(`/analysis?surface=${encodeURIComponent(row.normalized_path)}`);
            }
          }}
          className={`text-xs font-mono ${row.finding_count > 0 ? "text-amber-400 hover:text-amber-300 cursor-pointer underline" : "text-content-faint"}`}
          disabled={row.finding_count === 0}
        >
          {row.finding_count}
        </button>
      ),
    },
    {
      key: "discovery_sources",
      label: "Sources",
      render: (row: InventorySurface) => (
        <div className="flex gap-1">
          {row.discovery_sources.map((src) => (
            <span key={src} className="text-[10px] px-1.5 py-0.5 bg-surface-inset text-content-faint rounded">
              {titleCase(src)}
            </span>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-content">Inventory</h1>
        <p className="text-sm text-content-faint mt-1">Normalized surfaces across your commercial environment</p>
      </div>

      <ConsoleState
        state={dataState}
        loadingLabel="Loading inventory..."
        emptyLabel="No surfaces discovered yet. Install the Vestigio snippet to start collecting behavioral data and surface inventory."
      >
        {() => (
          <>
            <div className="flex items-stretch gap-4">
              <div className="flex-1">
                <SummaryCards cards={summaryCards} />
              </div>

              {/* Live / Down split card */}
              <div className="flex w-48 shrink-0 overflow-hidden rounded-lg border border-edge bg-surface-card">
                <button
                  onClick={() => setLiveFilter(liveFilter === "live" ? "all" : "live")}
                  className={`flex flex-1 flex-col items-center justify-center gap-1 py-3 transition-colors ${
                    liveFilter === "live"
                      ? "bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/30"
                      : "hover:bg-surface-card-hover"
                  }`}
                >
                  <span className="text-lg font-bold text-emerald-400">{liveCount}</span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/70">Live</span>
                </button>
                <div className="w-px bg-edge" />
                <button
                  onClick={() => setLiveFilter(liveFilter === "not_live" ? "all" : "not_live")}
                  className={`flex flex-1 flex-col items-center justify-center gap-1 py-3 transition-colors ${
                    liveFilter === "not_live"
                      ? "bg-red-500/10 ring-1 ring-inset ring-red-500/30"
                      : "hover:bg-surface-card-hover"
                  }`}
                >
                  <span className="text-lg font-bold text-red-400">{downCount}</span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-red-400/70">Down</span>
                </button>
              </div>
            </div>

            <SelectionBar
              count={selectedIds.size}
              onUseAsContext={handleUseAsContext}
              onClear={clearSelection}
            />

            <div className="flex items-center gap-3">
              <FilterDropdown
                value={liveFilter}
                onChange={setLiveFilter}
                options={[
                  { value: "all", label: "All Status" },
                  { value: "live", label: "Live" },
                  { value: "not_live", label: "Not Seen" },
                ]}
              />
              <FilterDropdown
                value={typeFilter}
                onChange={setTypeFilter}
                options={[
                  { value: "all", label: "All Types" },
                  { value: "commercial", label: "Commercial" },
                  { value: "support", label: "Support" },
                  { value: "policy", label: "Policy" },
                  { value: "other", label: "Other" },
                ]}
              />
              <FilterDropdown
                value={httpStatusFilter}
                onChange={setHttpStatusFilter}
                options={[
                  { value: "all", label: "All HTTP Status" },
                  { value: "2xx", label: "2xx" },
                  { value: "3xx", label: "3xx" },
                  { value: "4xx", label: "4xx" },
                  { value: "5xx", label: "5xx" },
                ]}
              />
              <FilterDropdown
                value={hasFindingsFilter}
                onChange={setHasFindingsFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "with", label: "With Findings" },
                  { value: "without", label: "Without Findings" },
                ]}
              />
              <FilterDropdown
                value={tierFilter}
                onChange={setTierFilter}
                options={[
                  { value: "all", label: "All Tiers" },
                  { value: "critical", label: "Critical" },
                  { value: "high", label: "High" },
                  { value: "medium", label: "Medium" },
                  { value: "low", label: "Low" },
                ]}
              />
              <FilterDropdown
                value={responseTimeFilter}
                onChange={setResponseTimeFilter}
                options={[
                  { value: "all", label: "All Response Times" },
                  { value: "lt500", label: "< 500ms" },
                  { value: "500_2000", label: "500ms – 2s" },
                  { value: "gt2000", label: "> 2s" },
                ]}
              />
              <FilterDropdown
                value={discoverySourceFilter}
                onChange={setDiscoverySourceFilter}
                options={discoverySourceOptions}
              />
              <input
                type="text"
                placeholder="Search..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-sm text-content-secondary placeholder:text-content-faint transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
              {(liveFilter !== "all" || typeFilter !== "all" || httpStatusFilter !== "all" || hasFindingsFilter !== "all" || tierFilter !== "all" || responseTimeFilter !== "all" || discoverySourceFilter !== "all" || searchText) && (
                <button
                  onClick={() => { setLiveFilter("all"); setTypeFilter("all"); setHttpStatusFilter("all"); setHasFindingsFilter("all"); setTierFilter("all"); setResponseTimeFilter("all"); setDiscoverySourceFilter("all"); setSearchText(""); }}
                  className="rounded-lg px-3 py-1.5 text-xs text-content-faint transition-colors hover:text-content-secondary"
                >
                  Clear filters
                </button>
              )}
              <span className="ml-auto text-xs text-content-faint">{filtered.length} of {surfaces.length} surfaces</span>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-16 text-content-faint">
                <p className="text-lg">No surfaces match the current filters</p>
                <p className="text-sm mt-2">Try adjusting the filters above.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-edge">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-edge bg-surface-inset/60">
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={toggleSelectAll}
                          className="h-3.5 w-3.5 rounded border-edge bg-surface-inset accent-accent cursor-pointer"
                        />
                      </th>
                      {columns.slice(1).map((col) => (
                        <th
                          key={col.key}
                          className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted ${col.className || ""}`}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr
                        key={row.surface_id}
                        onClick={() => setDrawerSurface(row)}
                        className="cursor-pointer border-b border-edge transition-colors hover:bg-surface-card-hover"
                      >
                        {columns.map((col) => (
                          <td key={col.key} className={`px-4 py-3 text-content-tertiary ${col.className || ""}`}>
                            {col.render ? col.render(row) : String((row as any)[col.key] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </ConsoleState>

      <SurfaceDrawer surface={drawerSurface} onClose={closeDrawer} />
    </div>
  );
}
