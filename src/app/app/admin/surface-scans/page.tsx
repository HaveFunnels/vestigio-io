"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ──────────────────────────────────────────────
// Admin → Growth → Surface Scans
//
// Sales/marketing tool for running shallow_plus audits against
// prospect domains. Each scan generates a shareable public link
// (/scans/[token]) that can be pasted into cold emails / LinkedIn
// DMs / WhatsApp messages.
//
// UI is modeled after the Organizations admin page:
//   - Stat cards on top
//   - List of scans with expandable rows
//   - Click a row → expands inline showing the 5 visible findings
//     and the share link
//   - "New scan" button opens a modal
//   - Status filter chips (all, pending, running, complete, failed)
//   - Polling re-fetches every 5s while any row is pending/running
// ──────────────────────────────────────────────

interface ScanRow {
	id: string;
	shareToken: string;
	domain: string;
	label: string | null;
	status: "pending" | "running" | "complete" | "failed";
	pagesScanned: number;
	durationMs: number | null;
	createdAt: string;
	completedAt: string | null;
	createdByUserId: string | null;
	createdBy: { name: string | null; email: string | null } | null;
}

interface ScanDetail {
	id: string;
	shareToken: string;
	domain: string;
	label: string | null;
	notes: string | null;
	status: string;
	pagesScanned: number;
	durationMs: number | null;
	errorMsg: string | null;
	createdAt: string;
	completedAt: string | null;
	createdBy: { name: string | null; email: string | null } | null;
	preview: {
		title: string | null;
		description: string | null;
		og_image_url: string | null;
		favicon_url: string | null;
		h1: string | null;
		http_status: number;
		response_time_ms: number;
		host: string;
	} | null;
	visibleFindings: Array<{
		id: string;
		severity: "critical" | "high" | "medium" | "positive";
		category: string;
		title: string;
		body: string;
		impact_hint: string;
	}>;
	blurredFindings: Array<{
		id: string;
		category: string;
		teaser_title: string;
	}>;
}

interface Summary {
	total: number;
	pending: number;
	running: number;
	complete: number;
	failed: number;
}

type StatusFilter = "all" | "pending" | "running" | "complete" | "failed";

function timeAgo(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	return `${days}d ago`;
}

export default function SurfaceScansPage() {
	const [scans, setScans] = useState<ScanRow[]>([]);
	const [summary, setSummary] = useState<Summary | null>(null);
	const [loading, setLoading] = useState(true);
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [search, setSearch] = useState("");
	const [expanded, setExpanded] = useState<string | null>(null);
	const [detail, setDetail] = useState<ScanDetail | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [showNewModal, setShowNewModal] = useState(false);
	const [copiedScanId, setCopiedScanId] = useState<string | null>(null);
	const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// ── Fetch list ──
	const fetchScans = useCallback(async () => {
		try {
			const params = new URLSearchParams();
			if (statusFilter !== "all") params.set("status", statusFilter);
			if (search) params.set("search", search);
			const res = await fetch(`/api/admin/surface-scans?${params.toString()}`);
			if (!res.ok) return;
			const data = await res.json();
			setScans(data.data || []);
			setSummary(data.summary || null);
		} catch {
			// ignore
		} finally {
			setLoading(false);
		}
	}, [statusFilter, search]);

	useEffect(() => {
		fetchScans();
	}, [fetchScans]);

	// ── Polling: re-fetch every 5s while any row is pending/running ──
	useEffect(() => {
		const hasInProgress = scans.some(
			(s) => s.status === "pending" || s.status === "running",
		);
		if (!hasInProgress) {
			if (pollRef.current) {
				clearTimeout(pollRef.current);
				pollRef.current = null;
			}
			return;
		}
		pollRef.current = setTimeout(fetchScans, 5000);
		return () => {
			if (pollRef.current) clearTimeout(pollRef.current);
		};
	}, [scans, fetchScans]);

	// ── Fetch detail when expanding a row ──
	const fetchDetail = useCallback(async (scanId: string) => {
		setDetailLoading(true);
		try {
			const res = await fetch(`/api/admin/surface-scans/${scanId}`);
			if (res.ok) {
				const data = await res.json();
				setDetail(data);
			}
		} catch {
			// ignore
		} finally {
			setDetailLoading(false);
		}
	}, []);

	function toggleExpand(scanId: string) {
		if (expanded === scanId) {
			setExpanded(null);
			setDetail(null);
		} else {
			setExpanded(scanId);
			setDetail(null);
			fetchDetail(scanId);
		}
	}

	function copyShareLink(scan: ScanRow) {
		if (typeof window === "undefined") return;
		const url = `${window.location.origin}/scans/${scan.shareToken}`;
		navigator.clipboard.writeText(url).then(() => {
			setCopiedScanId(scan.id);
			setTimeout(() => setCopiedScanId(null), 2000);
		});
	}

	async function handleDelete(scan: ScanRow) {
		if (!confirm(`Delete the scan for "${scan.domain}"? This is permanent.`)) return;
		try {
			const res = await fetch(`/api/admin/surface-scans/${scan.id}`, {
				method: "DELETE",
			});
			if (res.ok) {
				fetchScans();
				if (expanded === scan.id) {
					setExpanded(null);
					setDetail(null);
				}
			}
		} catch {
			alert("Delete failed");
		}
	}

	async function handleCreate(payload: {
		domain: string;
		label: string;
		notes: string;
	}) {
		const res = await fetch("/api/admin/surface-scans", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			throw new Error(data.message || "Create failed");
		}
		setShowNewModal(false);
		fetchScans();
	}

	const placeholder = loading ? "..." : "--";

	return (
		<div className="space-y-6 p-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-xl font-semibold text-content">Surface Scans</h1>
					<p className="mt-1 text-sm text-content-muted">
						Run shallow audits on prospect domains and share the result via a
						public link. Used for cold outreach and sales motion.
					</p>
				</div>
				<div className="flex items-center gap-3">
					<input
						type="text"
						placeholder="Search domain or label..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="rounded-lg border border-edge bg-surface-card px-4 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
					/>
					<button
						onClick={() => setShowNewModal(true)}
						className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
					>
						+ New scan
					</button>
				</div>
			</div>

			{/* Stat Cards */}
			<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
				<StatCard
					label="Total"
					value={summary ? String(summary.total) : placeholder}
				/>
				<StatCard
					label="In Progress"
					value={summary ? String(summary.pending + summary.running) : placeholder}
					variant={summary && summary.pending + summary.running > 0 ? "info" : undefined}
				/>
				<StatCard
					label="Complete"
					value={summary ? String(summary.complete) : placeholder}
					variant="positive"
				/>
				<StatCard
					label="Failed"
					value={summary ? String(summary.failed) : placeholder}
					variant={summary && summary.failed > 0 ? "warning" : undefined}
				/>
			</div>

			{/* Status filter chips */}
			<div className="flex items-center gap-1 rounded-lg border border-edge bg-surface-card p-1">
				{(["all", "pending", "running", "complete", "failed"] as const).map((f) => (
					<button
						key={f}
						onClick={() => setStatusFilter(f)}
						className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
							statusFilter === f
								? "bg-surface-inset text-content shadow-sm"
								: "text-content-muted hover:text-content-secondary"
						}`}
					>
						{f}
					</button>
				))}
			</div>

			{/* List */}
			<div className="rounded-lg border border-edge bg-surface-card">
				<div className="border-b border-edge px-5 py-4">
					<h2 className="text-sm font-semibold text-content">
						{statusFilter === "all"
							? "All scans"
							: `${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} scans`}
					</h2>
				</div>

				{loading ? (
					<div className="px-5 py-12 text-center text-sm text-content-faint">
						Loading...
					</div>
				) : scans.length === 0 ? (
					<div className="px-5 py-12 text-center text-sm text-content-faint">
						{search
							? "No matches."
							: 'No scans yet. Click "New scan" to start one.'}
					</div>
				) : (
					<div className="divide-y divide-edge">
						{scans.map((scan) => {
							const isOpen = expanded === scan.id;
							const inProgress = scan.status === "pending" || scan.status === "running";
							return (
								<div key={scan.id}>
									{/* Row */}
									<div className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-card-hover">
										<button
											onClick={() => toggleExpand(scan.id)}
											className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-content-faint transition-colors hover:bg-surface-inset hover:text-content-secondary"
										>
											<svg
												className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
												fill="none"
												viewBox="0 0 24 24"
												strokeWidth={2}
												stroke="currentColor"
											>
												<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
											</svg>
										</button>

										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2.5">
												<button
													onClick={() => toggleExpand(scan.id)}
													className="truncate text-sm font-semibold text-content hover:text-emerald-400 focus:outline-none"
												>
													{scan.domain}
												</button>
												<StatusBadge status={scan.status} />
												{scan.label && (
													<span className="rounded bg-surface-inset px-2 py-0.5 text-[10px] font-medium text-content-muted">
														{scan.label}
													</span>
												)}
											</div>
											<p className="mt-0.5 text-xs text-content-faint">
												{scan.pagesScanned > 0 && `${scan.pagesScanned} pages · `}
												{scan.durationMs && scan.status === "complete"
													? `${(scan.durationMs / 1000).toFixed(1)}s · `
													: ""}
												{scan.createdBy?.name || scan.createdBy?.email || "Unknown admin"} ·{" "}
												{timeAgo(scan.createdAt)}
											</p>
										</div>

										<div className="flex shrink-0 items-center gap-2">
											{scan.status === "complete" && (
												<button
													onClick={() => copyShareLink(scan)}
													className="flex items-center gap-1.5 rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-card-hover hover:text-content"
												>
													{copiedScanId === scan.id ? (
														<>
															<svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
																<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
															</svg>
															Copied
														</>
													) : (
														<>
															<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
																<path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
															</svg>
															Copy link
														</>
													)}
												</button>
											)}
											{inProgress && (
												<span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
													<span className="relative flex h-2 w-2">
														<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
														<span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
													</span>
													Running
												</span>
											)}
											<button
												onClick={() => handleDelete(scan)}
												className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
											>
												Delete
											</button>
										</div>
									</div>

									{/* Expanded panel */}
									{isOpen && (
										<div className="border-t border-edge bg-surface-inset/30 px-5 py-5">
											{detailLoading ? (
												<div className="py-8 text-center text-sm text-content-faint">
													Loading scan details...
												</div>
											) : detail && detail.id === scan.id ? (
												<ScanDetailPanel detail={detail} />
											) : (
												<div className="py-8 text-center text-sm text-content-faint">
													Failed to load details.
												</div>
											)}
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>

			{/* New scan modal */}
			{showNewModal && (
				<NewScanModal
					onClose={() => setShowNewModal(false)}
					onSubmit={handleCreate}
				/>
			)}
		</div>
	);
}

// ──────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────

function StatCard({
	label,
	value,
	variant,
}: {
	label: string;
	value: string;
	variant?: "positive" | "warning" | "info";
}) {
	const valueColor =
		variant === "positive"
			? "text-emerald-400"
			: variant === "warning"
				? "text-amber-400"
				: variant === "info"
					? "text-blue-400"
					: "text-content";
	return (
		<div className="rounded-lg border border-edge bg-surface-card p-5">
			<p className="text-xs font-medium uppercase tracking-wider text-content-muted">
				{label}
			</p>
			<p className={`mt-2 text-2xl font-bold ${valueColor}`}>{value}</p>
		</div>
	);
}

function StatusBadge({ status }: { status: string }) {
	const styles =
		status === "complete"
			? "bg-emerald-500/10 text-emerald-400"
			: status === "running"
				? "bg-blue-500/10 text-blue-400"
				: status === "pending"
					? "bg-amber-500/10 text-amber-400"
					: status === "failed"
						? "bg-red-500/10 text-red-400"
						: "bg-zinc-500/10 text-zinc-400";
	return (
		<span className={`inline-block rounded px-2 py-0.5 text-xs font-medium capitalize ${styles}`}>
			{status}
		</span>
	);
}

function ScanDetailPanel({ detail }: { detail: ScanDetail }) {
	if (detail.status === "failed") {
		return (
			<div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
				<div className="text-sm font-semibold text-red-400">Scan failed</div>
				<div className="mt-2 font-mono text-xs text-red-300">
					{detail.errorMsg || "Unknown error"}
				</div>
			</div>
		);
	}

	if (detail.status !== "complete" || !detail.preview) {
		return (
			<div className="py-8 text-center text-sm text-content-faint">
				Scan in progress... rows refresh every 5 seconds.
			</div>
		);
	}

	const { preview } = detail;

	return (
		<div className="space-y-5">
			{/* Preview card */}
			<div className="flex items-start gap-4 rounded-lg border border-edge bg-surface-card p-4">
				<div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-edge bg-surface-inset">
					{preview.favicon_url ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={preview.favicon_url}
							alt=""
							className="h-7 w-7 object-contain"
							onError={(e) => {
								(e.currentTarget as HTMLImageElement).style.display = "none";
							}}
						/>
					) : (
						<svg className="h-5 w-5 text-content-faint" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3" />
						</svg>
					)}
				</div>
				<div className="min-w-0 flex-1">
					<div className="font-mono text-xs text-content-faint">{preview.host}</div>
					<div className="mt-0.5 truncate text-sm font-semibold text-content">
						{preview.title || preview.host}
					</div>
					{preview.description && (
						<div className="mt-1 line-clamp-2 text-xs text-content-muted">
							{preview.description}
						</div>
					)}
				</div>
				<div className="flex shrink-0 flex-col items-end gap-1 text-xs">
					<div className="font-mono text-content-secondary">
						{preview.response_time_ms}ms · HTTP {preview.http_status}
					</div>
					<div className="text-content-faint">{detail.pagesScanned} pages scanned</div>
				</div>
			</div>

			{/* Findings list */}
			<div>
				<h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
					{detail.visibleFindings.length} visible findings
				</h3>
				<div className="space-y-2">
					{detail.visibleFindings.map((f) => (
						<div
							key={f.id}
							className="rounded-lg border border-edge bg-surface-card p-4"
						>
							<div className="flex items-start gap-3">
								<span className={`mt-1.5 inline-flex h-2 w-2 shrink-0 rounded-full ${severityDot(f.severity)}`} />
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className={`text-[10px] font-semibold uppercase tracking-wider ${severityText(f.severity)}`}>
											{f.severity}
										</span>
										<span className="text-[10px] uppercase tracking-wider text-content-faint">
											· {f.category}
										</span>
									</div>
									<div className="mt-1 text-sm font-semibold text-content">
										{f.title}
									</div>
									<div className="mt-1.5 text-xs leading-relaxed text-content-muted">
										{f.body}
									</div>
									<div className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-400">
										↳ {f.impact_hint}
									</div>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Notes */}
			{detail.notes && (
				<div className="rounded-lg border border-edge bg-surface-card p-4">
					<div className="text-xs font-semibold uppercase tracking-wider text-content-muted">
						Internal notes
					</div>
					<div className="mt-2 whitespace-pre-wrap text-sm text-content-secondary">
						{detail.notes}
					</div>
				</div>
			)}

			{/* Share link */}
			<div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
				<div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
					Public share link
				</div>
				<div className="mt-2 flex items-center gap-2">
					<code className="flex-1 truncate rounded bg-surface-inset px-3 py-2 font-mono text-xs text-content-secondary">
						{typeof window !== "undefined"
							? `${window.location.origin}/scans/${detail.shareToken}`
							: `/scans/${detail.shareToken}`}
					</code>
					<a
						href={`/scans/${detail.shareToken}`}
						target="_blank"
						rel="noopener noreferrer"
						className="rounded-lg border border-edge bg-surface-card px-3 py-2 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-card-hover hover:text-content"
					>
						Open ↗
					</a>
				</div>
			</div>
		</div>
	);
}

function severityDot(severity: string): string {
	switch (severity) {
		case "critical":
			return "bg-red-400";
		case "high":
			return "bg-amber-400";
		case "medium":
			return "bg-yellow-400";
		case "positive":
			return "bg-emerald-400";
		default:
			return "bg-zinc-400";
	}
}

function severityText(severity: string): string {
	switch (severity) {
		case "critical":
			return "text-red-400";
		case "high":
			return "text-amber-400";
		case "medium":
			return "text-yellow-400";
		case "positive":
			return "text-emerald-400";
		default:
			return "text-zinc-400";
	}
}

// ──────────────────────────────────────────────
// New scan modal
// ──────────────────────────────────────────────

function NewScanModal({
	onClose,
	onSubmit,
}: {
	onClose: () => void;
	onSubmit: (payload: { domain: string; label: string; notes: string }) => Promise<void>;
}) {
	const [domain, setDomain] = useState("");
	const [label, setLabel] = useState("");
	const [notes, setNotes] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit() {
		if (!domain.trim()) {
			setError("Please enter a domain");
			return;
		}
		setError(null);
		setSubmitting(true);
		try {
			await onSubmit({
				domain: domain.trim(),
				label: label.trim(),
				notes: notes.trim(),
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create scan");
			setSubmitting(false);
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
			<div className="w-full max-w-md rounded-lg border border-edge bg-surface-card shadow-xl">
				<div className="flex items-center justify-between border-b border-edge px-5 py-4">
					<h2 className="text-sm font-semibold text-content">New surface scan</h2>
					<button
						onClick={onClose}
						className="text-content-faint transition-colors hover:text-content"
					>
						<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<div className="space-y-4 px-5 py-5">
					<div>
						<label className="mb-1.5 block text-xs font-medium text-content-secondary">
							Domain
						</label>
						<input
							type="text"
							value={domain}
							onChange={(e) => setDomain(e.target.value)}
							placeholder="example.com"
							autoFocus
							className="w-full rounded-md border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
						/>
					</div>

					<div>
						<label className="mb-1.5 block text-xs font-medium text-content-secondary">
							Label <span className="text-content-faint">(optional)</span>
						</label>
						<input
							type="text"
							value={label}
							onChange={(e) => setLabel(e.target.value)}
							placeholder="Acme Corp · Outbound Q1"
							className="w-full rounded-md border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
						/>
					</div>

					<div>
						<label className="mb-1.5 block text-xs font-medium text-content-secondary">
							Internal notes <span className="text-content-faint">(optional, never shown publicly)</span>
						</label>
						<textarea
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							rows={3}
							placeholder="Why we're targeting them, who's the contact, etc."
							className="w-full resize-none rounded-md border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
						/>
					</div>

					{error && (
						<div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
							{error}
						</div>
					)}
				</div>

				<div className="flex items-center justify-end gap-3 border-t border-edge px-5 py-4">
					<button
						onClick={onClose}
						className="rounded-lg border border-edge px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-card-hover"
					>
						Cancel
					</button>
					<button
						onClick={handleSubmit}
						disabled={submitting}
						className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
					>
						{submitting ? "Starting…" : "Start scan"}
					</button>
				</div>
			</div>
		</div>
	);
}
