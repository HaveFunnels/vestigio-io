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
import { DownloadSimple, Flask } from "@phosphor-icons/react/dist/ssr";

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

type LiveFilter = "all" | "live" | "down" | "not_checked";

// Status states surfaced to the user. Driven by the last known HTTP
// response — not by *when* we last checked. The "when" is shown as
// freshness metadata (tooltip / drawer subtext), not as a state.
//
//   live        — last response was 2xx/3xx (page works)
//   down        — last response was 4xx/5xx (page broke — customer-side)
//   not_checked — we never got a response (timeout, DNS, connection
//                 refused — our fetcher couldn't reach the page).
//                 Distinct from `down` because it's NOT the customer's
//                 page being broken; it's our crawl failing.
type StatusState = "live" | "down" | "not_checked";

function classifySurfaceStatus(s: { http_status: number | null }): StatusState {
	if (s.http_status === null || s.http_status === 0) return "not_checked";
	if (s.http_status >= 400) return "down";
	return "live";
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
		"Last Seen", "Discovery Source", "Skip Reason",
		"Locale", "A/B Test Platform",
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
			r.discovery_source ?? "",
			r.skip_reason ?? "",
			r.locale_code ?? "",
			r.ab_test_platform ?? "",
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

// ── Pagination controls ────────────────────────
//
// Page number window: always shows first + last, the active page, and
// one neighbor on each side. Pages outside that window collapse to "…".
// For ≤7 pages the window is large enough to show everything inline.

function PaginationControls({
	currentPage,
	totalPages,
	pageRangeFrom,
	pageRangeTo,
	total,
	onChange,
}: {
	currentPage: number;
	totalPages: number;
	pageRangeFrom: number;
	pageRangeTo: number;
	total: number;
	onChange: (page: number) => void;
}) {
	const t = useTranslations("console.inventory.pagination");

	// Build the visible page-number set. Index is 0-based internally,
	// 1-based when shown to the user.
	const pages: Array<number | "ellipsis"> = [];
	const push = (p: number | "ellipsis") => {
		const last = pages[pages.length - 1];
		if (p === "ellipsis" && last === "ellipsis") return;
		pages.push(p);
	};
	for (let i = 0; i < totalPages; i++) {
		if (
			i === 0 ||
			i === totalPages - 1 ||
			(i >= currentPage - 1 && i <= currentPage + 1)
		) {
			push(i);
		} else {
			push("ellipsis");
		}
	}

	const baseBtn =
		"flex h-7 min-w-[1.75rem] items-center justify-center rounded-md border border-edge bg-surface-card px-2 text-xs text-content-secondary transition-colors hover:bg-surface-card-hover hover:text-content disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-card disabled:hover:text-content-secondary";

	return (
		<div className='mt-3 flex flex-wrap items-center justify-between gap-3 text-xs'>
			<span className='text-content-faint'>
				{t("showing", { from: pageRangeFrom, to: pageRangeTo, total })}
			</span>
			<div className='flex items-center gap-1'>
				<button
					type='button'
					onClick={() => onChange(currentPage - 1)}
					disabled={currentPage === 0}
					className={baseBtn}
					aria-label={t("prev")}
				>
					{t("prev")}
				</button>
				{pages.map((p, idx) =>
					p === "ellipsis" ? (
						<span
							key={`gap-${idx}`}
							className='px-1 text-content-faint'
							aria-hidden='true'
						>
							…
						</span>
					) : (
						<button
							key={p}
							type='button'
							onClick={() => onChange(p)}
							aria-current={p === currentPage ? "page" : undefined}
							className={`${baseBtn} ${p === currentPage ? "border-accent/40 bg-accent/10 text-accent" : ""}`}
						>
							{p + 1}
						</button>
					),
				)}
				<button
					type='button'
					onClick={() => onChange(currentPage + 1)}
					disabled={currentPage >= totalPages - 1}
					className={baseBtn}
					aria-label={t("next")}
				>
					{t("next")}
				</button>
			</div>
		</div>
	);
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
	const tDiscovery = useTranslations("console.inventory.discovery_source_labels");
	const tSkipReason = useTranslations("console.inventory.skip_reason_labels");
	const tAbTest = useTranslations("console.inventory.ab_test_platforms");
	const localizePageType = (type: string) => tPageType.has(type) ? tPageType(type) : titleCase(type);
	const localizeSource = (src: string) => tDiscovery.has(src) ? tDiscovery(src) : titleCase(src);
	const localizeSkipReason = (reason: string) => tSkipReason.has(reason) ? tSkipReason(reason) : titleCase(reason);
	const localizeAbPlatform = (platform: string) => tAbTest.has(platform) ? tAbTest(platform) : titleCase(platform.replace(/_/g, " "));
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
											<span className="text-[10px] font-mono text-content-faint" title={t("classification_confidence_tooltip")}>
												{surface.classification_confidence}%
											</span>
										)}
									</div>
									); })()}
									{/* Multi-signal transparency: show how each signal
									    voted so the classification isn't a black box. */}
									{surface.classification_signals && surface.classification_signals.length > 0 && (
										<details className='mt-2 group'>
											<summary className='cursor-pointer text-[10px] font-medium uppercase tracking-wider text-content-faint hover:text-content-muted'>
												{t("classification_signals_label")}
											</summary>
											<ul className='mt-1.5 space-y-1'>
												{surface.classification_signals.map((sig, idx) => (
													<li key={`${sig.source}-${idx}`} className='flex items-center justify-between gap-2 rounded bg-surface-inset px-2 py-1 text-[11px]'>
														<span className='font-mono text-content-faint'>{sig.source}</span>
														<span className='flex items-center gap-1.5'>
															<span className='text-content-secondary'>{localizePageType(sig.vote)}</span>
															<span className='font-mono text-content-faint' title={t("classification_signals_weight_tooltip")}>
																w{sig.weight.toFixed(1)}
															</span>
														</span>
													</li>
												))}
											</ul>
										</details>
									)}
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
												: { text: "text-zinc-400", dot: "bg-zinc-400" };
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

							{/* Audit trail — where this URL was first surfaced
							    from and (when applicable) why we didn't get
							    a fresh fetch this cycle. */}
							{(surface.discovery_source || surface.skip_reason) && (
								<div className='grid grid-cols-2 gap-4'>
									{surface.discovery_source && (
										<div>
											<div className='mb-1 text-[10px] font-medium uppercase tracking-wider text-content-faint'>
												{t("discovery_source")}
											</div>
											<span className='inline-block rounded bg-surface-inset px-1.5 py-0.5 text-[11px] text-content-secondary'>
												{localizeSource(surface.discovery_source)}
											</span>
										</div>
									)}
									{surface.skip_reason && (
										<div>
											<div className='mb-1 text-[10px] font-medium uppercase tracking-wider text-content-faint'>
												{t("skip_reason")}
											</div>
											<span className='inline-block rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300'>
												{localizeSkipReason(surface.skip_reason)}
											</span>
										</div>
									)}
								</div>
							)}

							{/* Locale advertised by the page. Useful when
							    multiple variants of the same path exist
							    (English vs. Portuguese, US vs. UK, …). */}
							{surface.locale_code && (
								<div>
									<div className='mb-1 text-[10px] font-medium uppercase tracking-wider text-content-faint'>
										{t("locale")}
									</div>
									<span className='inline-block rounded bg-blue-500/10 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-blue-300'>
										{surface.locale_code}
									</span>
								</div>
							)}

							{/* A/B test platform — only show when something was
							    detected. Surfacing the platform helps the
							    customer reason about variance in their
							    analytics ("results unstable because Optimizely
							    is splitting traffic"). */}
							{surface.ab_test_platform && (
								<div>
									<div className='mb-1 text-[10px] font-medium uppercase tracking-wider text-content-faint'>
										{t("ab_test_platform")}
									</div>
									<span className='inline-flex items-center gap-1.5 rounded bg-fuchsia-500/10 px-2 py-1 text-xs text-fuchsia-300'>
										<Flask size={12} weight='regular' />
										{localizeAbPlatform(surface.ab_test_platform)}
									</span>
								</div>
							)}
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
	const tDiscovery = useTranslations("console.inventory.discovery_source_labels");
	const tSkipReason = useTranslations("console.inventory.skip_reason_labels");
	const tAbTest = useTranslations("console.inventory.ab_test_platforms");
	const localizeSource = useCallback(
		(src: string) => (tDiscovery.has(src) ? tDiscovery(src) : titleCase(src)),
		[tDiscovery],
	);
	const localizeSkipReason = useCallback(
		(reason: string) => (tSkipReason.has(reason) ? tSkipReason(reason) : titleCase(reason)),
		[tSkipReason],
	);
	const localizeAbPlatform = useCallback(
		(platform: string) => (tAbTest.has(platform) ? tAbTest(platform) : titleCase(platform.replace(/_/g, " "))),
		[tAbTest],
	);
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
	const [localeFilter, setLocaleFilter] = useState<string>("all");
	const [searchText, setSearchText] = useState("");
	// Default sort surfaces broken pages first (Down → Live → Not checked).
	// The Not checked bucket sits last on purpose: it represents URLs our
	// fetcher couldn't reach, so the customer can't act on them until we
	// re-attempt the crawl — putting them above working pages would bury
	// the rows the customer actually needs to look at.
	const [sortKey, setSortKey] = useState<string | null>("is_live");
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
			if (discoverySourceFilter !== "all" && s.discovery_source !== discoverySourceFilter) {
				return false;
			}
			if (localeFilter !== "all" && s.locale_code !== localeFilter) {
				return false;
			}
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
		localeFilter,
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
				case "is_live": {
					// Map status states to numeric priorities so DESC sort
					// surfaces broken pages first (Down → Live → Not checked).
					// Down ranks highest because it's the most actionable
					// signal; Not checked ranks lowest because it's our
					// fetcher's failure, not the customer's.
					const state = classifySurfaceStatus(s);
					return state === "down" ? 2 : state === "live" ? 1 : 0;
				}
				default: return s.normalized_path;
			}
		};
		return [...filtered].sort((a, b) => {
			const va = getVal(a), vb = getVal(b);
			if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
			return String(va).localeCompare(String(vb)) * dir;
		});
	}, [filtered, sortKey, sortDir]);

	// ── Client-side pagination ──
	//
	// The API already returns up to 500 rows in one shot; we paginate
	// over the filtered+sorted result so the table never renders more
	// than PAGE_SIZE rows at once. Page state resets to 0 whenever the
	// filter/sort context changes (otherwise users could be looking at
	// "page 5 of 2" after narrowing the filter).
	const PAGE_SIZE = 50;
	const [currentPage, setCurrentPage] = useState(0);
	const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
	// Clamp the current page if the filtered result shrank. Doing this
	// in render (not useEffect) avoids a flash of "no rows on this page".
	const safePage = Math.min(currentPage, totalPages - 1);
	useEffect(() => {
		if (currentPage !== safePage) setCurrentPage(safePage);
	}, [currentPage, safePage]);
	useEffect(() => {
		// Reset to page 0 whenever a filter/sort/search input flips.
		// Listing them explicitly so the effect doesn't fire on row
		// data changes (which would yank the user back to page 0 on
		// every poll).
		setCurrentPage(0);
	}, [
		liveFilter, typeFilter, httpStatusFilter, hasFindingsFilter,
		tierFilter, responseTimeFilter, discoverySourceFilter, localeFilter,
		searchText, sortKey, sortDir,
	]);
	const paged = useMemo(
		() => sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
		[sorted, safePage],
	);
	const pageRangeFrom = sorted.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
	const pageRangeTo = Math.min(sorted.length, (safePage + 1) * PAGE_SIZE);

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
	// Three buckets so live + down + not_checked = surfaces.length and
	// the header card matches the table.
	//
	//   live        — last HTTP response was 2xx/3xx
	//   down        — last HTTP response was 4xx/5xx (customer's page broken)
	//   not_checked — fetch never returned a response (timeout, DNS,
	//                 connection refused → status 0 or null). Separated
	//                 from `down` so the customer doesn't read it as
	//                 "my page is broken" when it's actually our crawler
	//                 that couldn't reach it.
	const { liveCount, notCheckedCount, downCount } = useMemo(() => {
		let live = 0, notChecked = 0, down = 0;
		for (const s of surfaces) {
			const state = classifySurfaceStatus(s);
			if (state === "live") live++;
			else if (state === "down") down++;
			else notChecked++;
		}
		return { liveCount: live, notCheckedCount: notChecked, downCount: down };
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
					<div className='flex items-center gap-1.5'>
						<span className='text-sm text-content-secondary'>{row.label}</span>
						{row.locale_code && (
							<span
								className='inline-flex items-center rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-400'
								title={t("locale_badge_tooltip", { locale: row.locale_code })}
							>
								{row.locale_code}
							</span>
						)}
						{row.ab_test_platform && (
							<span
								className='inline-flex items-center gap-1 rounded bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] font-medium text-fuchsia-400'
								title={t("ab_test_detected", { platform: localizeAbPlatform(row.ab_test_platform) })}
							>
								<Flask size={10} weight='regular' />
								{localizeAbPlatform(row.ab_test_platform)}
							</span>
						)}
					</div>
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
						: { text: "text-zinc-400", dot: "bg-zinc-400" };
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
			key: "discovery_source",
			label: tc("source"),
			render: (row: InventorySurface) => {
				if (!row.discovery_source) return <span className='text-content-faint'>—</span>;
				return (
					<span className='rounded bg-surface-inset px-1.5 py-0.5 text-[10px] text-content-faint'>
						{localizeSource(row.discovery_source)}
					</span>
				);
			},
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
							{/* Grid-rows layout pins the number to a fixed
							    vertical center across all three buckets.
							    Row 1 (`1fr`) holds the number and absorbs
							    any extra card height; row 2 (`auto`) sizes
							    to the label. Because every button shares the
							    same py-3 + same row heights, the number's
							    baseline lines up across cards regardless of
							    whether a label wraps. */}
							<div className='flex w-full shrink-0 overflow-hidden rounded-xl border border-edge bg-surface-card lg:w-72'>
								<button
									onClick={() =>
										setLiveFilter(liveFilter === "live" ? "all" : "live")
									}
									className={`grid flex-1 grid-rows-[1fr_auto] gap-1 py-3 transition-colors ${
										liveFilter === "live"
											? "bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/30"
											: "hover:bg-surface-card-hover"
									}`}
								>
									<span className='self-center font-mono text-xl font-medium tabular-nums leading-none text-emerald-600 dark:text-emerald-400'>
										{liveCount}
									</span>
									<span className='text-[9px] font-semibold uppercase tracking-wider text-emerald-600/70 dark:text-emerald-400/70'>
										{t("status.live")}
									</span>
								</button>
								<div className='w-px bg-edge' />
								<button
									onClick={() =>
										setLiveFilter(liveFilter === "not_checked" ? "all" : "not_checked")
									}
									className={`grid flex-1 grid-rows-[1fr_auto] gap-1 py-3 transition-colors ${
										liveFilter === "not_checked"
											? "bg-zinc-500/15 ring-1 ring-inset ring-zinc-500/30"
											: "hover:bg-surface-card-hover"
									}`}
								>
									<span className='self-center font-mono text-xl font-medium tabular-nums leading-none text-zinc-600 dark:text-zinc-300'>
										{notCheckedCount}
									</span>
									<span className='text-[9px] font-semibold uppercase tracking-wider text-zinc-600/80 dark:text-zinc-400'>
										{t("status.not_checked")}
									</span>
								</button>
								<div className='w-px bg-edge' />
								<button
									onClick={() =>
										setLiveFilter(liveFilter === "down" ? "all" : "down")
									}
									className={`grid flex-1 grid-rows-[1fr_auto] gap-1 py-3 transition-colors ${
										liveFilter === "down"
											? "bg-red-500/10 ring-1 ring-inset ring-red-500/30"
											: "hover:bg-surface-card-hover"
									}`}
								>
									<span className='self-center font-mono text-xl font-medium tabular-nums leading-none text-red-600 dark:text-red-400'>
										{downCount}
									</span>
									<span className='text-[9px] font-semibold uppercase tracking-wider text-red-600/70 dark:text-red-400/70'>
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
									{ value: "down", label: t("status.down") },
									{ value: "not_checked", label: t("status.not_checked") },
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
								options={(() => {
									const unique = Array.from(
										new Set(
											surfaces
												.map((s) => s.discovery_source)
												.filter((src): src is string => Boolean(src)),
										),
									).sort();
									return [
										{ value: "all" as const, label: t("discovery_source_filter.all") },
										...unique.map((src) => ({ value: src, label: localizeSource(src) })),
									];
								})()}
							/>
							{(() => {
								const uniqueLocales = Array.from(
									new Set(
										surfaces
											.map((s) => s.locale_code)
											.filter((l): l is string => Boolean(l)),
									),
								).sort();
								// Only render the locale filter when there is
								// at least one localized variant beyond the
								// default — single-locale sites don't need it.
								if (uniqueLocales.length < 2) return null;
								return (
									<FilterDropdown
										value={localeFilter}
										onChange={setLocaleFilter}
										options={[
											{ value: "all" as const, label: t("locale_filter.all") },
											...uniqueLocales.map((l) => ({ value: l, label: l.toUpperCase() })),
										]}
									/>
								);
							})()}
							<input
								type='text'
								placeholder={t("search_placeholder")}
								value={searchText}
								onChange={(e) => setSearchText(e.target.value)}
								className='whitespace-nowrap rounded-md border border-edge bg-surface-card py-1.5 pl-2.5 pr-6 text-xs text-content-secondary transition-colors placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30'
							/>
							<button
								type='button'
								onClick={() => exportToCsv(filtered, "vestigio-inventory.csv")}
								aria-label={t("export_csv")}
								title={t("export_csv")}
								className='flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-edge bg-surface-card text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content'
							>
								<DownloadSimple size={14} weight='regular' />
							</button>
							{(liveFilter !== "all" ||
								typeFilter !== "all" ||
								httpStatusFilter !== "all" ||
								hasFindingsFilter !== "all" ||
								tierFilter !== "all" ||
								responseTimeFilter !== "all" ||
								discoverySourceFilter !== "all" ||
								localeFilter !== "all" ||
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
										setLocaleFilter("all");
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
												const sortable = ["label", "page_type", "tier", "is_live", "http_status", "session_count", "finding_count", "response_time_ms"].includes(col.key);
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
										{paged.map((row) => (
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
						{/* Pagination footer — only render when there's more
						    than one page of results. Showing it on a single
						    page would just add visual noise. */}
						{sorted.length > 0 && totalPages > 1 && (
							<PaginationControls
								currentPage={safePage}
								totalPages={totalPages}
								pageRangeFrom={pageRangeFrom}
								pageRangeTo={pageRangeTo}
								total={sorted.length}
								onChange={setCurrentPage}
							/>
						)}
					</>
				)}
			</ConsoleState>

			<SurfaceDrawer surface={drawerSurface} onClose={closeDrawer} />
		</div>
	);
}
