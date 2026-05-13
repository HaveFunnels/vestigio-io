"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCopilot } from "@/components/app/CopilotProvider";
import { Column } from "@/components/console/DataTable";
import SummaryCards, { SummaryCard } from "@/components/console/SummaryCards";
import ConsoleState from "@/components/console/ConsoleState";
import PageHeader from "@/components/console/PageHeader";
import {
	loadInventory,
	type InventorySurface,
	type InventoryAuditStatus,
	type InventoryPayload,
	type DataState,
} from "@/lib/console-data";
import { ShinyButton } from "@/components/ui/shiny-button";
import { getPageTypeStyle } from "@/lib/page-type-colors";

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

type LiveFilter = "all" | "live" | "stale" | "down";

// Status states surfaced to the user. Mapped from is_live + http_status:
//   live  — successfully fetched in this cycle, status < 400
//   down  — explicit failure (http_status === 0 or >= 400)
//   stale — previously OK but not re-fetched this cycle (recheck pending)
type StatusState = "live" | "stale" | "down";

function classifySurfaceStatus(s: { is_live: boolean; http_status: number | null }): StatusState {
	if (s.http_status === 0 || (s.http_status !== null && s.http_status >= 400)) return "down";
	if (s.is_live) return "live";
	return "stale";
}
type TypeFilter = "all" | "commercial" | "support" | "policy" | "other";
type HttpStatusFilter = "all" | "2xx" | "3xx" | "4xx" | "5xx";
type HasFindingsFilter = "all" | "with" | "without";
type TierFilter = "all" | "critical" | "high" | "medium" | "low";
type ResponseTimeFilter = "all" | "lt500" | "500_2000" | "gt2000";

function humanizeStatus(
	status: number | null,
	t: (key: string) => string,
): { label: string; cls: string } {
	if (status === null) return { label: "---", cls: "text-content-faint" };
	if (status === 0) return { label: t("response.unreachable"), cls: "text-red-400" };
	if (status >= 500) return { label: t("response.server_error"), cls: "text-red-400" };
	if (status === 404) return { label: t("response.not_found"), cls: "text-red-400" };
	if (status >= 400) return { label: t("response.client_error"), cls: "text-red-400" };
	if (status >= 300) return { label: t("response.redirect"), cls: "text-amber-400" };
	return { label: t("response.ok"), cls: "text-emerald-400" };
}

function exportToCsv(rows: InventorySurface[], filename: string) {
	const headers = [
		"URL", "Host", "Page Type", "Tier", "Status",
		"HTTP Code", "Sessions (30d)", "Findings", "Response Time (ms)",
		"Last Seen",
	];
	const csv = [
		headers.join(","),
		...rows.map(r => [
			JSON.stringify(r.normalized_path),
			JSON.stringify(r.host),
			JSON.stringify(r.page_type),
			JSON.stringify(r.tier),
			classifySurfaceStatus(r),
			r.http_status ?? "",
			r.session_count ?? "",
			r.finding_count ?? "",
			r.response_time_ms ?? "",
			r.last_seen_at ?? "",
		].join(",")),
	].join("\n");
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

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

	// Keyboard navigation (Arrow keys, Enter, Escape)
	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Escape") {
			setOpen(false);
			return;
		}
		if (!open) {
			if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
				e.preventDefault();
				setOpen(true);
			}
			return;
		}
		const currentIdx = options.findIndex((o) => o.value === value);
		if (e.key === "ArrowDown") {
			e.preventDefault();
			const next = options[(currentIdx + 1) % options.length];
			if (next) onChange(next.value);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			const prev = options[currentIdx <= 0 ? options.length - 1 : currentIdx - 1];
			if (prev) onChange(prev.value);
		} else if (e.key === "Enter") {
			setOpen(false);
		}
	}

	return (
		<div className='relative' ref={ref} onKeyDown={handleKeyDown}>
			<button
				type='button'
				onClick={() => setOpen((o) => !o)}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={activeLabel}
				className='flex items-center gap-2 whitespace-nowrap rounded-md border border-edge bg-surface-card py-1.5 pl-2.5 pr-6 text-xs text-content-secondary transition-colors hover:bg-surface-card-hover focus:outline-none focus:ring-2 focus:ring-accent/50'
			>
				<span>{activeLabel}</span>
				<svg
					className={`h-3.5 w-3.5 text-content-faint transition-transform ${open ? "rotate-180" : ""}`}
					fill='none'
					viewBox='0 0 24 24'
					strokeWidth={2}
					stroke='currentColor'
					aria-hidden="true"
				>
					<path
						strokeLinecap='round'
						strokeLinejoin='round'
						d='M19.5 8.25l-7.5 7.5-7.5-7.5'
					/>
				</svg>
			</button>

			{open && (
				<div
					role="listbox"
					className='absolute left-0 top-full z-50 mt-1.5 min-w-[10rem] rounded-lg border border-edge bg-surface-card p-1 shadow-xl'
				>
					{options.map((opt) => (
						<button
							key={opt.value}
							type='button'
							role="option"
							aria-selected={opt.value === value}
							onClick={() => {
								onChange(opt.value);
								setOpen(false);
							}}
							className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-card-hover ${
								opt.value === value ? "text-content" : "text-content-secondary"
							}`}
						>
							{opt.value === value ? (
								<svg
									className='h-3.5 w-3.5 text-accent'
									fill='none'
									viewBox='0 0 24 24'
									strokeWidth={2.5}
									stroke='currentColor'
								>
									<path
										strokeLinecap='round'
										strokeLinejoin='round'
										d='M4.5 12.75l6 6 9-13.5'
									/>
								</svg>
							) : (
								<span className='h-3.5 w-3.5' />
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
	return str.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Side Drawer ────────────────────────────────

function SurfaceDrawer({
	surface,
	onClose,
}: {
	surface: InventorySurface | null;
	onClose: () => void;
}) {
	const t = useTranslations("console.inventory.drawer");
	const tTooltip = useTranslations("console.common");
	const tPageType = useTranslations("console.maps.page_types");
	const localizePageType = (type: string) => tPageType.has(type) ? tPageType(type) : titleCase(type);
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
				role="dialog"
				aria-modal="true"
				aria-label={t("title")}
				className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[420px] flex-col border-l border-edge bg-surface-card transition-transform duration-200 ease-out sm:w-96 ${
					isOpen ? "translate-x-0" : "translate-x-full"
				}`}
			>
				{surface && (
					<>
						<div className='flex items-center justify-between border-b border-edge px-5 py-4'>
							<h2 className='text-sm font-semibold text-content'>
								{t("title")}
							</h2>
							<button
								onClick={onClose}
								aria-label={tTooltip("close")}
								className='flex h-7 w-7 items-center justify-center rounded-lg text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-muted'
							>
								<svg
									className='h-4 w-4'
									fill='none'
									viewBox='0 0 24 24'
									strokeWidth={2}
									stroke='currentColor'
								>
									<path
										strokeLinecap='round'
										strokeLinejoin='round'
										d='M6 18L18 6M6 6l12 12'
									/>
								</svg>
							</button>
						</div>

						<div className='flex-1 space-y-5 overflow-y-auto px-5 py-4'>
							{/* URL */}
							<div>
								<div className='mb-1 text-[10px] font-medium uppercase tracking-wider text-content-faint'>
									{t("url")}
								</div>
								<div className='break-all font-mono text-sm text-content'>
									<span>{surface.host}</span>
									<span className='text-content-faint'> · </span>
									<span>{surface.path}</span>
								</div>
							</div>

							{/* Title */}
							<div>
								<div className='mb-1 text-[10px] font-medium uppercase tracking-wider text-content-faint'>
									{t("surface_title")}
								</div>
								<div className='text-sm text-content'>
									{surface.title || surface.label}
								</div>
							</div>

							{/* Description */}
							{surface.description && (
								<div>
									<div className='mb-1 text-[10px] font-medium uppercase tracking-wider text-content-faint'>
										{t("description")}
									</div>
									<div className='text-sm text-content-secondary'>
										{surface.description}
									</div>
								</div>
							)}

							{/* Type & Tier */}
							<div className='grid grid-cols-2 gap-4'>
								<div>
									<div className='mb-1 text-[10px] font-medium uppercase tracking-wider text-content-faint'>
										{t("type")}
									</div>
									{(() => { const pts = getPageTypeStyle(surface.page_type); return (
									<div className="flex items-center gap-1.5">
										<span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${pts.bg} ${pts.text}`}>
											{localizePageType(surface.page_type)}
										</span>
										{surface.classification_confidence !== null && surface.classification_confidence > 0 && (
											<span className="text-[10px] font-mono text-content-faint" title={`Classification confidence`}>
												{surface.classification_confidence}%
											</span>
										)}
									</div>
									); })()}
								</div>
								<div>
									<div className='mb-1 text-[10px] font-medium uppercase tracking-wider text-content-faint'>
										{t("tier")}
									</div>
									<span className='text-sm text-content-secondary'>
										{titleCase(surface.tier)}
									</span>
								</div>
							</div>

							{/* Status & HTTP Code */}
							<div className='grid grid-cols-2 gap-4'>
								<div>
									<div className='mb-1 text-[10px] font-medium uppercase tracking-wider text-content-faint'>
										{t("status")}
									</div>
									{(() => {
										const state = classifySurfaceStatus(surface);
										const tone = state === "live"
											? { text: "text-emerald-400", dot: "bg-emerald-400" }
											: state === "down"
												? { text: "text-red-400", dot: "bg-red-400" }
												: { text: "text-amber-400", dot: "bg-amber-400" };
										return (
											<span className={`inline-flex items-center gap-1.5 text-xs ${tone.text}`}>
												<span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
												{t(state)}
											</span>
										);
									})()}
								</div>
								<div>
									<div className='mb-1 text-[10px] font-medium uppercase tracking-wider text-content-faint'>
										{t("http_code")}
									</div>
									<span
										className={`font-mono text-sm ${
											surface.http_status === null
												? "text-content-faint"
												: surface.http_status >= 400
													? "text-red-400"
													: surface.http_status >= 300
														? "text-amber-400"
														: "text-emerald-400"
										}`}
									>
										{surface.http_status ?? "---"}
									</span>
								</div>
							</div>

							{/* Sessions & Findings — only render when data is available
                  (null = pixel/findings pipeline not yet shipped). */}
							{(surface.session_count !== null ||
								surface.finding_count !== null) && (
								<div className='grid grid-cols-2 gap-4'>
									{surface.session_count !== null && (
										<div>
											<div className='mb-1 text-[10px] font-medium uppercase tracking-wider text-content-faint'>
												{t("sessions")}
											</div>
											<span className='font-mono text-sm text-content-secondary'>
												{surface.session_count.toLocaleString()}
											</span>
										</div>
									)}
									{surface.finding_count !== null && (
										<div>
											<div className='mb-1 text-[10px] font-medium uppercase tracking-wider text-content-faint'>
												{t("findings")}
											</div>
											<span
												className={`font-mono text-sm ${surface.finding_count > 0 ? "text-amber-400" : "text-content-faint"}`}
											>
												{surface.finding_count}
											</span>
										</div>
									)}
								</div>
							)}

							{/* Response Time */}
							{surface.response_time_ms !== null && (
								<div>
									<div className='mb-1 text-[10px] font-medium uppercase tracking-wider text-content-faint'>
										{t("response_time")}
									</div>
									<span className='font-mono text-sm text-content-secondary'>
										{surface.response_time_ms}ms
									</span>
								</div>
							)}

							{/* Last Checked */}
							<div>
								<div className='mb-1 text-[10px] font-medium uppercase tracking-wider text-content-faint'>
									{t("last_checked")}
								</div>
								<span className='text-sm text-content-secondary'>
									{surface.last_seen_at
										? new Date(surface.last_seen_at).toLocaleString()
										: t("never")}
								</span>
							</div>

							{/* Discovery Sources */}
							<div>
								<div className='mb-1 text-[10px] font-medium uppercase tracking-wider text-content-faint'>
									{t("discovery_sources")}
								</div>
								<div className='flex flex-wrap gap-1.5'>
									{surface.discovery_sources.map((src) => (
										<span
											key={src}
											className='rounded bg-surface-inset px-1.5 py-0.5 text-[10px] text-content-faint'
										>
											{titleCase(src)}
										</span>
									))}
								</div>
							</div>
						</div>

						{/* Actions */}
						<div className="border-t border-edge bg-surface-card px-5 py-3">
							<div className="flex flex-col gap-2">
								<a
									href="/app/maps/user_journey"
									className="rounded-md border border-edge bg-surface-inset px-3 py-2 text-center text-xs text-content-secondary transition-colors hover:bg-surface-card-hover hover:text-content"
								>
									{t("view_in_journey")}
								</a>
								{surface.finding_count !== null && surface.finding_count > 0 && (
									<a
										href={`/app/findings?surface=${encodeURIComponent(surface.normalized_path)}`}
										className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-center text-xs text-amber-300 transition-colors hover:bg-amber-500/10"
									>
										{t("view_findings", { count: surface.finding_count })}
									</a>
								)}
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
	onAnalyzeTogether,
	onClear,
}: {
	count: number;
	onUseAsContext: () => void;
	onAnalyzeTogether?: () => void;
	onClear: () => void;
}) {
	const t = useTranslations("console.inventory.selection");
	if (count === 0) return null;

	return (
		<div className='sticky top-0 z-30 flex items-center gap-4 rounded-lg border border-edge bg-surface-card px-4 py-2.5 shadow-lg'>
			<span className='text-sm font-medium text-content'>
				{t("n_selected", { count })}
			</span>
			<div className='flex-1' />
			{count >= 2 && onAnalyzeTogether && (
				<ShinyButton variant="console" onClick={onAnalyzeTogether}>
					{t("analyze_together", { count })}
				</ShinyButton>
			)}
			<ShinyButton variant="console" onClick={onUseAsContext}>{t("use_as_context")}</ShinyButton>
			<button
				onClick={onClear}
				className='rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-card-hover'
			>
				{t("clear")}
			</button>
		</div>
	);
}

// ── Main Page ──────────────────────────────────

export default function InventoryPage() {
	const router = useRouter();
	const copilot = useCopilot();
	const t = useTranslations("console.inventory");
	const tc = useTranslations("console.common.columns");
	const tTooltip = useTranslations("console.common");
	const tp = useTranslations("console.copilot.shared_prompts");
	const tPageType = useTranslations("console.maps.page_types");
	const localizePageType = useCallback(
		(type: string) => (tPageType.has(type) ? tPageType(type) : titleCase(type)),
		[tPageType]
	);
	const [liveFilter, setLiveFilter] = useState<LiveFilter>("all");
	const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
	const [httpStatusFilter, setHttpStatusFilter] =
		useState<HttpStatusFilter>("all");
	const [hasFindingsFilter, setHasFindingsFilter] =
		useState<HasFindingsFilter>("all");
	const [tierFilter, setTierFilter] = useState<TierFilter>("all");
	const [responseTimeFilter, setResponseTimeFilter] =
		useState<ResponseTimeFilter>("all");
	const [discoverySourceFilter, setDiscoverySourceFilter] =
		useState<string>("all");
	const [searchText, setSearchText] = useState("");
	const [sortKey, setSortKey] = useState<string | null>(null);
	const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
	function handleSort(key: string) {
		if (sortKey === key) {
			if (sortDir === "desc") setSortDir("asc");
			else { setSortKey(null); setSortDir("desc"); }
		} else {
			setSortKey(key);
			setSortDir("desc");
		}
	}
	const [dataState, setDataState] = useState<DataState<InventoryPayload>>({
		status: "loading",
	});
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [drawerSurface, setDrawerSurface] = useState<InventorySurface | null>(
		null
	);

	// Initial load + polling while audit is pending/running.
	// Polls every 3s; stops once status is `complete` or `failed` (or page unmounts).
	useEffect(() => {
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;

		async function tick() {
			const result = await loadInventory();
			if (cancelled) return;
			setDataState(result);

			const status =
				result.status === "ready" ? result.data.audit_status?.status : null;
			const isOngoing = status === "pending" || status === "running";
			if (isOngoing) {
				timer = setTimeout(tick, 3000);
			}
		}

		tick();
		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, []);

	const surfaces = dataState.status === "ready" ? dataState.data.surfaces : [];
	const auditStatus: InventoryAuditStatus | null =
		dataState.status === "ready" ? dataState.data.audit_status : null;
	const deltas = dataState.status === "ready" ? dataState.data.deltas : null;
	const lookups = dataState.status === "ready" ? dataState.data.lookups : null;
	const isAuditOngoing =
		auditStatus?.status === "pending" || auditStatus?.status === "running";

	// Hide session/finding columns when 100% of rows have null (the data isn't
	// available yet — pixel pipeline / findings persistence not shipped).
	// This prevents showing fake numbers and an empty column at the same time.
	const hasAnySessionData = surfaces.some((s) => s.session_count !== null);
	const hasAnyFindingData = surfaces.some((s) => s.finding_count !== null);

	const discoverySourceOptions = useMemo(() => {
		const unique = Array.from(
			new Set(surfaces.flatMap((s) => s.discovery_sources))
		).sort();
		return [
			{ value: "all" as const, label: t("discovery_source_filter.all") },
			...unique.map((src) => ({ value: src, label: titleCase(src) })),
		];
	}, [surfaces, t]);

	const filtered = useMemo(() => {
		return surfaces.filter((s) => {
			if (liveFilter !== "all" && classifySurfaceStatus(s) !== liveFilter) return false;
			if (typeFilter === "commercial" && !s.is_commercial) return false;
			if (typeFilter === "support" && s.page_type !== "support") return false;
			if (typeFilter === "policy" && s.page_type !== "policy") return false;
			if (typeFilter === "other" && s.is_commercial) return false;
			if (httpStatusFilter !== "all") {
				if (s.http_status === null) return false;
				if (
					httpStatusFilter === "2xx" &&
					(s.http_status < 200 || s.http_status >= 300)
				)
					return false;
				if (
					httpStatusFilter === "3xx" &&
					(s.http_status < 300 || s.http_status >= 400)
				)
					return false;
				if (
					httpStatusFilter === "4xx" &&
					(s.http_status < 400 || s.http_status >= 500)
				)
					return false;
				if (
					httpStatusFilter === "5xx" &&
					(s.http_status < 500 || s.http_status >= 600)
				)
					return false;
			}
			if (hasFindingsFilter === "with" && (s.finding_count ?? 0) === 0)
				return false;
			if (hasFindingsFilter === "without" && (s.finding_count ?? 0) > 0)
				return false;
			if (tierFilter !== "all" && s.tier !== tierFilter) return false;
			if (responseTimeFilter !== "all") {
				if (s.response_time_ms === null) return false;
				if (responseTimeFilter === "lt500" && s.response_time_ms >= 500)
					return false;
				if (
					responseTimeFilter === "500_2000" &&
					(s.response_time_ms < 500 || s.response_time_ms >= 2000)
				)
					return false;
				if (responseTimeFilter === "gt2000" && s.response_time_ms < 2000)
					return false;
			}
			if (
				discoverySourceFilter !== "all" &&
				!s.discovery_sources.includes(discoverySourceFilter)
			)
				return false;
			if (searchText) {
				const q = searchText.toLowerCase();
				if (
					!(
						s.label.toLowerCase().includes(q) ||
						s.normalized_path.toLowerCase().includes(q) ||
						s.host.toLowerCase().includes(q)
					)
				)
					return false;
			}
			return true;
		});
	}, [
		surfaces,
		liveFilter,
		typeFilter,
		httpStatusFilter,
		hasFindingsFilter,
		tierFilter,
		responseTimeFilter,
		discoverySourceFilter,
		searchText,
	]);

	const sorted = useMemo(() => {
		if (!sortKey) return filtered;
		const dir = sortDir === "asc" ? 1 : -1;
		const getVal = (s: InventorySurface): number | string => {
			switch (sortKey) {
				case "page_type": return s.page_type;
				case "tier": return s.tier;
				case "http_status": return s.http_status ?? -1;
				case "session_count": return s.session_count ?? -1;
				case "finding_count": return s.finding_count ?? -1;
				case "response_time_ms": return s.response_time_ms ?? -1;
				case "label": return s.label;
				default: return s.normalized_path;
			}
		};
		return [...filtered].sort((a, b) => {
			const va = getVal(a), vb = getVal(b);
			if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
			return String(va).localeCompare(String(vb)) * dir;
		});
	}, [filtered, sortKey, sortDir]);

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
			if (prev.size === filtered.length && filtered.length > 0)
				return new Set();
			return new Set(filtered.map((s) => s.surface_id));
		});
	}, [filtered]);

	const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

	const handleUseAsContext = useCallback(() => {
		copilot.open({ prompt: tp("inventory_bulk_analysis", { count: String(selectedIds.size) }) });
	}, [selectedIds, copilot]);

	// ── Status counts ──
	//
	// Three buckets so that live + stale + down = surfaces.length and the
	// header card matches the table.
	//
	//   live  — re-fetched this cycle, http < 400
	//   down  — http_status === 0 (fetch failed) OR http_status >= 400
	//   stale — previously fetched OK but not re-checked this cycle.
	//           "Stale" tells the user the page IS visible to Vestigio
	//           but is awaiting the next audit, instead of the older
	//           ambiguous "not seen" copy.
	const { liveCount, staleCount, downCount } = useMemo(() => {
		let live = 0, stale = 0, down = 0;
		for (const s of surfaces) {
			const state = classifySurfaceStatus(s);
			if (state === "live") live++;
			else if (state === "down") down++;
			else stale++;
		}
		return { liveCount: live, staleCount: stale, downCount: down };
	}, [surfaces]);

	// Real period-over-period deltas from API (null when no prior cycle)
	const formatDelta = (n: number) => (n === 0 ? undefined : `${n > 0 ? "+" : ""}${n} ${t("from_last_period")}`);

	const summaryCards: SummaryCard[] = [
		{
			label: t("cards.total_surfaces"),
			value: surfaces.length,
			subtext: deltas ? formatDelta(deltas.total) : undefined,
		},
		{
			label: t("cards.commercial"),
			value: surfaces.filter((s) => s.is_commercial).length,
			variant: "info",
		},
		{
			label: t("cards.with_findings"),
			value: surfaces.filter((s) => (s.finding_count ?? 0) > 0).length,
			variant: "warning",
			subtext: deltas ? formatDelta(deltas.findings) : undefined,
		},
	];

	const closeDrawer = useCallback(() => setDrawerSurface(null), []);

	const isAllSelected =
		filtered.length > 0 && selectedIds.size === filtered.length;

	const columns: Column<InventorySurface>[] = [
		{
			key: "_select",
			label: "",
			className: "w-10",
			render: (row: InventorySurface) => (
				<input
					type='checkbox'
					aria-label={`Select ${row.normalized_path}`}
					checked={selectedIds.has(row.surface_id)}
					onChange={(e) => {
						e.stopPropagation();
						toggleSelect(row.surface_id);
					}}
					onClick={(e) => e.stopPropagation()}
					className='h-4 w-4 cursor-pointer rounded border-edge bg-surface-inset accent-accent'
				/>
			),
		},
		{
			key: "label",
			label: tc("surface"),
			render: (row: InventorySurface) => (
				<div>
					<div className='text-sm text-content-secondary'>{row.label}</div>
					<div className='font-mono text-xs text-content-faint'>
						<span>{row.host}</span>
						<span className='opacity-50'> · </span>
						<span>{row.path}</span>
					</div>
				</div>
			),
		},
		{
			key: "page_type",
			label: tc("type"),
			render: (row: InventorySurface) => {
				const pts = getPageTypeStyle(row.page_type);
				return (
					<span
						className={`rounded px-2 py-0.5 text-xs font-medium ${pts.bg} ${pts.text}`}
						title={
							row.classification_confidence !== null
								? `Confidence: ${row.classification_confidence}%`
								: undefined
						}
					>
						{localizePageType(row.page_type)}
					</span>
				);
			},
		},
		{
			key: "is_live",
			label: tc("status"),
			render: (row: InventorySurface) => {
				const state = classifySurfaceStatus(row);
				const tone = state === "live"
					? { text: "text-emerald-400", dot: "bg-emerald-400" }
					: state === "down"
						? { text: "text-red-400", dot: "bg-red-400" }
						: { text: "text-amber-400", dot: "bg-amber-400" };
				return (
					<span className={`inline-flex items-center gap-1 text-xs ${tone.text}`}>
						<span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
						{t(`status.${state}`)}
					</span>
				);
			},
		},
		{
			key: "http_status",
			label: t("columns.response"),
			render: (row: InventorySurface) => {
				const { label, cls } = humanizeStatus(row.http_status, t);
				return (
					<span className={`text-xs font-medium ${cls}`}>
						{label}
					</span>
				);
			},
		},
		// session_count and finding_count columns are conditionally included
		// below based on hasAnySessionData / hasAnyFindingData. Until the
		// pixel + findings persistence Waves ship, all rows are null and the
		// columns get hidden entirely (we don't want to render an empty col).
		...(hasAnySessionData
			? [
					{
						key: "session_count",
						label: tc("sessions"),
						render: (row: InventorySurface) => (
							<span className='font-mono text-xs text-content-muted'>
								{row.session_count?.toLocaleString() ?? "—"}
							</span>
						),
					} as Column<InventorySurface>,
				]
			: []),
		...(hasAnyFindingData
			? [
					{
						key: "finding_count",
						label: tc("findings"),
						render: (row: InventorySurface) => (
							<button
								onClick={(e) => {
									e.stopPropagation();
									if ((row.finding_count ?? 0) > 0) {
										router.push(
											`/analysis?surface=${encodeURIComponent(row.normalized_path)}`
										);
									}
								}}
								className={`font-mono text-xs ${(row.finding_count ?? 0) > 0 ? "cursor-pointer font-semibold text-amber-400 hover:text-amber-300" : "text-content-faint"}`}
								disabled={(row.finding_count ?? 0) === 0}
							>
								{row.finding_count ?? "—"}
							</button>
						),
					} as Column<InventorySurface>,
				]
			: []),
		{
			key: "discovery_sources",
			label: tc("sources"),
			render: (row: InventorySurface) => (
				<div className='flex gap-1'>
					{row.discovery_sources.map((src) => (
						<span
							key={src}
							className='rounded bg-surface-inset px-1.5 py-0.5 text-[10px] text-content-faint'
						>
							{titleCase(src)}
						</span>
					))}
				</div>
			),
		},
	];

	return (
		<div className='space-y-6 p-4 sm:p-6'>
			<PageHeader
				title={t("title")}
				tooltip={tTooltip("page_tooltips.inventory")}
			/>

			<ConsoleState
				state={dataState}
				loadingLabel={t("loading")}
				emptyLabel={`${t("empty.title")}. ${t("empty.description")}`}
			>
				{() => (
					<>
						{lookups && (!lookups.findings || !lookups.sessions) && (
							<div className='mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-300'>
								{!lookups.findings && <div>{t("lookup_warning.findings_failed")}</div>}
								{!lookups.sessions && <div>{t("lookup_warning.sessions_failed")}</div>}
							</div>
						)}
						<div className='flex flex-col items-stretch gap-4 lg:flex-row'>
							<div className='min-w-0 flex-1'>
								<SummaryCards cards={summaryCards} />
							</div>

							{/* Live / Stale / Down split card — three buckets sum
							    to surfaces.length so the table count always
							    matches the cards. Each bucket toggles the
							    status filter on/off. */}
							<div className='flex w-full shrink-0 overflow-hidden rounded-xl border border-edge bg-surface-card lg:w-64'>
								<button
									onClick={() =>
										setLiveFilter(liveFilter === "live" ? "all" : "live")
									}
									className={`flex flex-1 flex-col items-center justify-center gap-1 py-3 transition-colors ${
										liveFilter === "live"
											? "bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/30"
											: "hover:bg-surface-card-hover"
									}`}
								>
									<span className='font-mono text-xl font-medium tabular-nums text-emerald-600 dark:text-emerald-400'>
										{liveCount}
									</span>
									<span className='text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-600/70 dark:text-emerald-400/70'>
										{t("status.live")}
									</span>
								</button>
								<div className='w-px bg-edge' />
								<button
									onClick={() =>
										setLiveFilter(liveFilter === "stale" ? "all" : "stale")
									}
									className={`flex flex-1 flex-col items-center justify-center gap-1 py-3 transition-colors ${
										liveFilter === "stale"
											? "bg-amber-500/10 ring-1 ring-inset ring-amber-500/30"
											: "hover:bg-surface-card-hover"
									}`}
								>
									<span className='font-mono text-xl font-medium tabular-nums text-amber-600 dark:text-amber-400'>
										{staleCount}
									</span>
									<span className='text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-600/70 dark:text-amber-400/70'>
										{t("status.stale")}
									</span>
								</button>
								<div className='w-px bg-edge' />
								<button
									onClick={() =>
										setLiveFilter(liveFilter === "down" ? "all" : "down")
									}
									className={`flex flex-1 flex-col items-center justify-center gap-1 py-3 transition-colors ${
										liveFilter === "down"
											? "bg-red-500/10 ring-1 ring-inset ring-red-500/30"
											: "hover:bg-surface-card-hover"
									}`}
								>
									<span className='font-mono text-xl font-medium tabular-nums text-red-600 dark:text-red-400'>
										{downCount}
									</span>
									<span className='text-[10px] font-semibold uppercase tracking-[0.14em] text-red-600/70 dark:text-red-400/70'>
										{t("status.down")}
									</span>
								</button>
							</div>
						</div>

						<SelectionBar
							count={selectedIds.size}
							onUseAsContext={handleUseAsContext}
							onAnalyzeTogether={() =>
								copilot.open({ prompt: tp("inventory_cross_signal", { count: String(selectedIds.size) }) })
							}
							onClear={clearSelection}
						/>

						<div className='no-scrollbar mb-4 flex items-center gap-2 overflow-x-auto sm:flex-wrap sm:gap-3'>
							<FilterDropdown
								value={liveFilter}
								onChange={setLiveFilter}
								options={[
									{ value: "all", label: t("status.all") },
									{ value: "live", label: t("status.live") },
									{ value: "stale", label: t("status.stale") },
									{ value: "down", label: t("status.down") },
								]}
							/>
							<FilterDropdown
								value={typeFilter}
								onChange={setTypeFilter}
								options={[
									{ value: "all", label: t("type_filter.all") },
									{ value: "commercial", label: t("type_filter.commercial") },
									{ value: "support", label: t("type_filter.support") },
									{ value: "policy", label: t("type_filter.policy") },
									{ value: "other", label: t("type_filter.other") },
								]}
							/>
							<FilterDropdown
								value={httpStatusFilter}
								onChange={setHttpStatusFilter}
								options={[
									{ value: "all", label: t("http_status_filter.all") },
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
									{ value: "all", label: t("findings_filter.all") },
									{ value: "with", label: t("findings_filter.with") },
									{ value: "without", label: t("findings_filter.without") },
								]}
							/>
							<FilterDropdown
								value={tierFilter}
								onChange={setTierFilter}
								options={[
									{ value: "all", label: t("tier_filter.all") },
									{ value: "critical", label: t("tier_filter.critical") },
									{ value: "high", label: t("tier_filter.high") },
									{ value: "medium", label: t("tier_filter.medium") },
									{ value: "low", label: t("tier_filter.low") },
								]}
							/>
							<FilterDropdown
								value={responseTimeFilter}
								onChange={setResponseTimeFilter}
								options={[
									{ value: "all", label: t("response_time_filter.all") },
									{ value: "lt500", label: t("response_time_filter.lt500") },
									{
										value: "500_2000",
										label: t("response_time_filter.500_2000"),
									},
									{ value: "gt2000", label: t("response_time_filter.gt2000") },
								]}
							/>
							<FilterDropdown
								value={discoverySourceFilter}
								onChange={setDiscoverySourceFilter}
								options={discoverySourceOptions}
							/>
							<input
								type='text'
								placeholder={t("search_placeholder")}
								value={searchText}
								onChange={(e) => setSearchText(e.target.value)}
								className='whitespace-nowrap rounded-md border border-edge bg-surface-card py-1.5 pl-2.5 pr-6 text-xs text-content-secondary transition-colors placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30'
							/>
							{(liveFilter !== "all" ||
								typeFilter !== "all" ||
								httpStatusFilter !== "all" ||
								hasFindingsFilter !== "all" ||
								tierFilter !== "all" ||
								responseTimeFilter !== "all" ||
								discoverySourceFilter !== "all" ||
								searchText) && (
								<button
									onClick={() => {
										setLiveFilter("all");
										setTypeFilter("all");
										setHttpStatusFilter("all");
										setHasFindingsFilter("all");
										setTierFilter("all");
										setResponseTimeFilter("all");
										setDiscoverySourceFilter("all");
										setSearchText("");
									}}
									className='rounded-lg px-3 py-1.5 text-xs text-content-faint transition-colors hover:text-content-secondary'
								>
									{t("clear_filters")}
								</button>
							)}
							<span className='ml-auto text-xs text-content-faint'>
								{t("n_of_total", {
									filtered: filtered.length,
									total: surfaces.length,
								})}
							</span>
							<button
								type="button"
								onClick={() => exportToCsv(filtered, "vestigio-inventory.csv")}
								className='rounded border border-edge bg-surface-card px-2.5 py-1 text-xs text-content-secondary transition-colors hover:bg-surface-card-hover hover:text-content'
								title={t("export_csv")}
							>
								{t("export_csv")}
							</button>
						</div>

						{filtered.length === 0 && !isAuditOngoing ? (
							<div className='py-16 text-center text-content-faint'>
								<p className='text-lg'>{t("no_results.title")}</p>
								<p className='mt-2 text-sm'>{t("no_results.description")}</p>
							</div>
						) : (
							<div className='overflow-x-auto rounded-md border border-edge'>
								<table className='w-full text-left text-sm'>
									<thead>
										<tr className='sticky top-0 z-10 border-b border-edge bg-surface-inset/95 backdrop-blur-sm'>
											<th className='w-10 px-4 py-3'>
												<input
													type='checkbox'
													aria-label="Select all rows"
													checked={isAllSelected}
													onChange={toggleSelectAll}
													className='h-4 w-4 cursor-pointer rounded border-edge bg-surface-inset accent-accent'
												/>
											</th>
											{columns.slice(1).map((col) => {
												const sortable = ["label", "page_type", "tier", "http_status", "session_count", "finding_count", "response_time_ms"].includes(col.key);
												const active = sortKey === col.key;
												return (
													<th
														key={col.key}
														className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted ${col.className || ""} ${sortable ? "cursor-pointer select-none hover:text-content-secondary" : ""}`}
														onClick={sortable ? () => handleSort(col.key) : undefined}
														aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
													>
														<span className="inline-flex items-center gap-1">
															{col.label}
															{active && (
																<span className="text-[10px] text-accent">
																	{sortDir === "asc" ? "▲" : "▼"}
																</span>
															)}
														</span>
													</th>
												);
											})}
										</tr>
									</thead>
									<tbody>
										{/* Live audit banner-row — appears between header and the
                        first data row while the latest AuditCycle is pending
                        or running. Disappears once the cycle completes (the
                        polling effect re-fetches and stops the banner). */}
										{isAuditOngoing && (
											<tr className='border-b border-edge bg-emerald-500/5'>
												<td colSpan={columns.length} className='px-4 py-2.5'>
													<div className='flex items-center gap-2.5 text-xs'>
														<span className='relative flex h-2 w-2'>
															<span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75' />
															<span className='relative inline-flex h-2 w-2 rounded-full bg-emerald-500' />
														</span>
														<span className='font-medium text-emerald-300'>
															{auditStatus?.status === "pending"
																? t("audit_banner.queued")
																: t("audit_banner.running")}
														</span>
														<span className='text-emerald-500/60'>
															{t("audit_banner.live_updates")}
														</span>
													</div>
												</td>
											</tr>
										)}
										{sorted.map((row) => (
											<tr
												key={row.surface_id}
												onClick={() => setDrawerSurface(row)}
												className='cursor-pointer border-b border-edge transition-colors hover:bg-surface-card-hover'
											>
												{columns.map((col) => (
													<td
														key={col.key}
														className={`px-4 py-3 text-content-tertiary ${col.className || ""}`}
													>
														{col.render
															? col.render(row)
															: String((row as any)[col.key] ?? "")}
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
