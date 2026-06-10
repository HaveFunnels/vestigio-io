"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { COPY_FRAMEWORKS, pickText, type CopyFramework } from "@/lib/copy-frameworks";

/*
 * CopyLensRich — standalone-page detail surface.
 *
 * The plan's CopyLens card is intentionally compact (per-framework
 * row + one topGap). The standalone page used to show the same compact
 * card, leaving customers without anything actionable. This component
 * brings back the workspace-level richness:
 *   - Framework intro + useCase + whenToUse (from COPY_FRAMEWORKS catalog)
 *   - Per-page selector (chips) when a framework was audited on multiple
 *     surfaces
 *   - Each criterion: status icon + label + hint + evidence + fix
 *
 * Self-fetches via /api/library/strategy/[month]/copy-lens-full so the
 * standalone page doesn't have to thread the data through the plan
 * snapshot (the plan stays lean; the rich detail is on-demand).
 */

type Status = "pass" | "warn" | "fail" | "not_evaluated";

interface CriterionVerdict {
	id: string;
	status: Status;
	evidence: string | null;
	fix: string | null;
}

interface Audit {
	frameworkId: string;
	pageUrl: string;
	pageSlot: string;
	scorePct: number;
	criteria: CriterionVerdict[];
}

interface ApiResponse {
	cycleId: string | null;
	locale?: string;
	audits: Audit[];
}

interface Props {
	month: string;
	envId: string;
}

const STATUS_DOT: Record<Status, string> = {
	pass: "bg-emerald-500",
	warn: "bg-amber-500",
	fail: "bg-rose-500",
	not_evaluated: "bg-content-faint/40",
};

const STATUS_RING: Record<Status, string> = {
	pass: "ring-emerald-500/30",
	warn: "ring-amber-500/30",
	fail: "ring-rose-500/30",
	not_evaluated: "ring-edge",
};

const STATUS_LABEL: Record<Status, string> = {
	pass: "ok",
	warn: "alerta",
	fail: "falha",
	not_evaluated: "sem dados",
};

const PAGE_SLOT_LABEL: Record<string, string> = {
	home: "Home",
	pricing: "Pricing",
	features: "Features",
	about: "Sobre",
	other: "Outras",
};

function scoreTone(pct: number): string {
	if (pct >= 80) return "text-emerald-300";
	if (pct >= 60) return "text-amber-300";
	return "text-rose-300";
}

export default function CopyLensRich({ month, envId }: Props) {
	const [data, setData] = useState<ApiResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [activeFrameworkId, setActiveFrameworkId] = useState<string | null>(null);
	const [activePageUrl, setActivePageUrl] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setError(null);
		setData(null);
		(async () => {
			try {
				const res = await fetch(
					`/api/library/strategy/${encodeURIComponent(month)}/copy-lens-full?envId=${encodeURIComponent(envId)}`,
				);
				if (!res.ok) {
					if (cancelled) return;
					const body = await res.json().catch(() => ({}));
					setError(body.message || `Falha ao carregar (HTTP ${res.status})`);
					return;
				}
				const body = (await res.json()) as ApiResponse;
				if (cancelled) return;
				setData(body);
				// Pick the framework with the worst average so the most
				// actionable view loads first.
				if (body.audits.length > 0) {
					const byFw = new Map<string, number[]>();
					for (const a of body.audits) {
						const arr = byFw.get(a.frameworkId) ?? [];
						arr.push(a.scorePct);
						byFw.set(a.frameworkId, arr);
					}
					let worstFwId: string | null = null;
					let worstAvg = Infinity;
					for (const [fwId, scores] of byFw) {
						const avg = scores.reduce((s, n) => s + n, 0) / scores.length;
						if (avg < worstAvg) {
							worstAvg = avg;
							worstFwId = fwId;
						}
					}
					setActiveFrameworkId(worstFwId);
					if (worstFwId) {
						const firstAudit = body.audits
							.filter((a) => a.frameworkId === worstFwId)
							.sort((a, b) => a.scorePct - b.scorePct)[0];
						if (firstAudit) setActivePageUrl(firstAudit.pageUrl);
					}
				}
			} catch (e: any) {
				if (cancelled) return;
				setError(e?.message ?? "Erro de rede");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [month, envId]);

	// Group audits by framework
	const auditsByFramework = useMemo(() => {
		const map = new Map<string, Audit[]>();
		if (!data) return map;
		for (const a of data.audits) {
			const arr = map.get(a.frameworkId) ?? [];
			arr.push(a);
			map.set(a.frameworkId, arr);
		}
		return map;
	}, [data]);

	const presentFrameworks = useMemo(() => {
		if (!data) return [] as Array<{ fw: CopyFramework; avg: number; auditCount: number }>;
		const present: Array<{ fw: CopyFramework; avg: number; auditCount: number }> = [];
		for (const fw of COPY_FRAMEWORKS) {
			const audits = auditsByFramework.get(fw.id);
			if (!audits || audits.length === 0) continue;
			const avg = Math.round(
				audits.reduce((s, a) => s + a.scorePct, 0) / audits.length,
			);
			present.push({ fw, avg, auditCount: audits.length });
		}
		// Worst-first so the most-actionable framework is at the top.
		return present.sort((a, b) => a.avg - b.avg);
	}, [auditsByFramework, data]);

	const activeFramework = useMemo(
		() => COPY_FRAMEWORKS.find((f) => f.id === activeFrameworkId) ?? null,
		[activeFrameworkId],
	);

	const activeFrameworkAudits = useMemo(() => {
		if (!activeFrameworkId) return [];
		return (auditsByFramework.get(activeFrameworkId) ?? []).sort(
			(a, b) => a.scorePct - b.scorePct,
		);
	}, [auditsByFramework, activeFrameworkId]);

	const activeAudit = useMemo(
		() => activeFrameworkAudits.find((a) => a.pageUrl === activePageUrl) ?? activeFrameworkAudits[0] ?? null,
		[activeFrameworkAudits, activePageUrl],
	);

	if (error) {
		return (
			<div className="rounded-2xl border border-rose-500/30 bg-surface-card/60 p-8 text-center">
				<p className="text-[13px] text-rose-300">{error}</p>
			</div>
		);
	}

	if (!data) {
		return (
			<div className="space-y-3">
				<div className="h-16 w-full animate-pulse rounded-2xl bg-surface-card" />
				<div className="h-40 w-full animate-pulse rounded-2xl bg-surface-card" />
				<div className="h-40 w-full animate-pulse rounded-2xl bg-surface-card" />
			</div>
		);
	}

	if (presentFrameworks.length === 0) {
		return (
			<div className="rounded-2xl border border-dashed border-edge bg-surface-card/60 p-8 text-center">
				<p className="text-[13px] text-content-muted">
					Nenhuma análise de framework de copy disponível para este ciclo.
				</p>
			</div>
		);
	}

	const locale = data.locale ?? "pt-BR";

	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
			className="space-y-6"
		>
			{/* Framework selector — chips of every framework with audits.
			    Each chip carries a per-criterion dot row so the customer
			    spots the weakest framework before clicking. */}
			<section>
				<div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-content-faint">
					Frameworks auditados nesta janela
				</div>
				<div className="flex flex-wrap gap-2">
					{presentFrameworks.map(({ fw, avg, auditCount }) => {
						const isActive = activeFrameworkId === fw.id;
						const audits = auditsByFramework.get(fw.id) ?? [];
						// For the dot row, average per criterion across audits
						const dots = fw.criteria.map((crit) => {
							const statuses = audits
								.map((a) => a.criteria.find((c) => c.id === crit.id)?.status)
								.filter((s): s is Status => !!s);
							if (statuses.length === 0) return "not_evaluated" as Status;
							const failed = statuses.filter((s) => s === "fail").length;
							const warned = statuses.filter((s) => s === "warn").length;
							const passed = statuses.filter((s) => s === "pass").length;
							if (failed >= statuses.length / 2) return "fail" as Status;
							if (warned + failed >= statuses.length / 2) return "warn" as Status;
							if (passed > 0) return "pass" as Status;
							return "not_evaluated" as Status;
						});
						return (
							<button
								key={fw.id}
								type="button"
								onClick={() => {
									setActiveFrameworkId(fw.id);
									const firstAudit = (auditsByFramework.get(fw.id) ?? [])
										.slice()
										.sort((a, b) => a.scorePct - b.scorePct)[0];
									if (firstAudit) setActivePageUrl(firstAudit.pageUrl);
								}}
								className={`flex min-w-[120px] flex-col items-center gap-1.5 rounded-xl border px-4 py-2.5 transition-all ${
									isActive
										? "border-content/40 bg-surface-card shadow-sm"
										: "border-edge bg-surface-card/50 hover:border-edge-focus hover:bg-surface-card-hover"
								}`}
							>
								<span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-content">
									{pickText(fw.name, locale)}
								</span>
								<span className="flex items-center gap-[3px]">
									{dots.map((status, i) => (
										<span
											key={i}
											className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`}
										/>
									))}
								</span>
								<span className={`font-mono text-[11px] tabular-nums ${scoreTone(avg)}`}>
									{avg}/100
								</span>
								<span className="text-[9.5px] uppercase tracking-[0.12em] text-content-faint">
									{auditCount} {auditCount === 1 ? "página" : "páginas"}
								</span>
							</button>
						);
					})}
				</div>
			</section>

			{/* Active framework header — name + useCase + intro + whenToUse */}
			{activeFramework && (
				<section className="rounded-2xl border border-edge bg-surface-card p-5 sm:p-6">
					<div className="flex flex-col gap-3 border-b border-edge/40 pb-4 sm:flex-row sm:items-baseline sm:justify-between">
						<div className="min-w-0 max-w-2xl">
							<div className="flex flex-wrap items-baseline gap-2">
								<h3 className="font-serif text-[20px] font-semibold text-content">
									{pickText(activeFramework.name, locale)}
								</h3>
								<span className="rounded-full bg-content/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-content dark:bg-white/10">
									{pickText(activeFramework.useCase, locale)}
								</span>
							</div>
							<p className="mt-2 text-[13.5px] leading-relaxed text-content-secondary">
								{pickText(activeFramework.intro, locale)}
							</p>
							<p className="mt-1.5 text-[12px] leading-relaxed text-content-muted">
								<span className="font-semibold text-content-secondary">Quando usar:</span>{" "}
								{pickText(activeFramework.whenToUse, locale)}
							</p>
						</div>
					</div>

					{/* Page selector — chips for each audit URL within this
					    framework. Customer picks one to see criteria detail. */}
					{activeFrameworkAudits.length > 1 && (
						<div className="mt-4">
							<div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
								Páginas auditadas
							</div>
							<div className="flex flex-wrap gap-1.5">
								{activeFrameworkAudits.map((a) => {
									const isActive = activeAudit?.pageUrl === a.pageUrl;
									const slotLabel = PAGE_SLOT_LABEL[a.pageSlot] ?? a.pageSlot;
									const display = a.pageUrl.replace(/^https?:\/\/[^/]+/, "") || "/";
									return (
										<button
											key={a.pageUrl}
											type="button"
											onClick={() => setActivePageUrl(a.pageUrl)}
											className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
												isActive
													? "border-content/40 bg-surface-inset/80 text-content"
													: "border-edge bg-surface-inset/40 text-content-secondary hover:border-edge-focus hover:text-content"
											}`}
										>
											<span className="font-semibold uppercase tracking-[0.06em] text-content-faint">
												{slotLabel}
											</span>
											<span className="font-mono text-content-muted">{display}</span>
											<span className={`font-mono tabular-nums ${scoreTone(a.scorePct)}`}>
												{a.scorePct}
											</span>
										</button>
									);
								})}
							</div>
						</div>
					)}

					{/* Criteria detail */}
					{activeAudit && (
						<div className="mt-5 space-y-3">
							<div className="flex items-baseline justify-between">
								<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
									Critérios em{" "}
									<span className="normal-case text-content-muted">
										{activeAudit.pageUrl.replace(/^https?:\/\/[^/]+/, "") || "/"}
									</span>
								</div>
								<div className={`font-mono text-[14px] tabular-nums ${scoreTone(activeAudit.scorePct)}`}>
									{activeAudit.scorePct}/100
								</div>
							</div>

							{activeFramework.criteria.map((crit) => {
								const verdict = activeAudit.criteria.find((c) => c.id === crit.id);
								const status: Status = verdict?.status ?? "not_evaluated";
								return (
									<div
										key={crit.id}
										className={`rounded-xl border bg-surface-inset/30 p-4 ring-1 ring-inset ${STATUS_RING[status]} border-edge/60`}
									>
										<div className="flex items-start gap-3">
											<span
												className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${STATUS_DOT[status]} text-[11px] font-bold text-white`}
											>
												{status === "pass"
													? "✓"
													: status === "warn"
														? "!"
														: status === "fail"
															? "✗"
															: "—"}
											</span>
											<div className="min-w-0 flex-1">
												<div className="flex flex-wrap items-baseline gap-2">
													<span className="text-[14px] font-semibold text-content">
														{pickText(crit.label, locale)}
													</span>
													<span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-content-faint">
														{STATUS_LABEL[status]}
													</span>
												</div>
												<p className="mt-1 text-[12px] leading-snug text-content-muted">
													<span className="font-semibold text-content-secondary">
														O que avalia:
													</span>{" "}
													{pickText(crit.hint, locale)}
												</p>
												{verdict?.evidence && (
													<p className="mt-2 text-[12.5px] leading-snug text-content-secondary">
														<span className="font-semibold text-content">
															Evidência observada:
														</span>{" "}
														{verdict.evidence}
													</p>
												)}
												{verdict?.fix && status !== "pass" && (
													<div className="mt-2 rounded-md border border-edge/60 bg-surface-card px-3 py-2 text-[12.5px] leading-snug text-content-secondary">
														<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-content-faint">
															Como corrigir
														</div>
														{verdict.fix}
													</div>
												)}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</section>
			)}
		</motion.div>
	);
}
