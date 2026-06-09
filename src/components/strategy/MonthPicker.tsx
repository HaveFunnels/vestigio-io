"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, FileText } from "lucide-react";

/*
 * MonthPicker — header dropdown that lists the env's available plan
 * months, most recent first.
 *
 * Replaces the historical /app/library "Plans gallery" tab. Customer
 * navigates between months without leaving the plan reading flow.
 *
 * API: /api/library/strategy?envId=<id> returns up to 24 plan
 * summaries (id, month, status, generatedAt, heroMetrics).
 */

const MONTH_NAMES_PT = [
	"Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
	"Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatMonth(month: string): string {
	const [y, m] = month.split("-").map(Number);
	if (!y || !m || m < 1 || m > 12) return month;
	return `${MONTH_NAMES_PT[m - 1]} de ${y}`;
}

function formatTimestamp(iso: string): string {
	try {
		const d = new Date(iso);
		return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
	} catch {
		return "";
	}
}

interface PlanSummary {
	id: string;
	month: string;
	status: string;
	generatedAt: string;
}

interface Props {
	envId: string;
	currentMonth: string;
}

export default function MonthPicker({ envId, currentMonth }: Props) {
	const [open, setOpen] = useState(false);
	const [plans, setPlans] = useState<PlanSummary[] | null>(null);
	const [loading, setLoading] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const router = useRouter();

	// Lazy-load on first open so the header doesn't pay for the fetch
	// on every plan view.
	useEffect(() => {
		if (!open || plans !== null) return;
		setLoading(true);
		void fetch(`/api/library/strategy?envId=${encodeURIComponent(envId)}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (data?.plans) setPlans(data.plans);
				else setPlans([]);
			})
			.catch(() => setPlans([]))
			.finally(() => setLoading(false));
	}, [open, plans, envId]);

	// Click outside / Esc to close.
	useEffect(() => {
		if (!open) return;
		function onDocClick(e: MouseEvent) {
			if (!containerRef.current) return;
			if (!containerRef.current.contains(e.target as Node)) setOpen(false);
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		document.addEventListener("mousedown", onDocClick);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDocClick);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	function handlePick(month: string) {
		setOpen(false);
		if (month === currentMonth) return;
		router.push(`/app/library/strategy/${encodeURIComponent(month)}`);
	}

	return (
		<div ref={containerRef} className="relative inline-block">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-surface-card px-2.5 py-1 text-[12px] font-medium text-content-secondary transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content"
				aria-haspopup="listbox"
				aria-expanded={open}
			>
				<FileText className="h-3 w-3 text-content-faint" aria-hidden />
				<span>Plano de {formatMonth(currentMonth)}</span>
				<ChevronDown
					className={`h-3 w-3 text-content-faint transition-transform ${open ? "rotate-180" : ""}`}
					aria-hidden
				/>
			</button>

			{open && (
				<div
					className="absolute left-0 top-full z-40 mt-1.5 w-[280px] overflow-hidden rounded-lg border border-edge bg-surface-card shadow-dropdown"
					role="listbox"
				>
					<div className="border-b border-edge/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
						Histórico do ambiente
					</div>
					{loading && (
						<div className="px-3 py-4 text-[12px] text-content-muted">
							Carregando…
						</div>
					)}
					{!loading && plans && plans.length === 0 && (
						<div className="px-3 py-4 text-[12px] text-content-muted">
							Nenhum outro plano disponível.
						</div>
					)}
					{!loading && plans && plans.length > 0 && (
						<ul className="max-h-[360px] overflow-y-auto">
							{plans.map((p) => {
								const isCurrent = p.month === currentMonth;
								return (
									<li key={p.id}>
										<button
											type="button"
											onClick={() => handlePick(p.month)}
											className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left transition-colors ${
												isCurrent
													? "bg-surface-inset/40 text-content"
													: "text-content-secondary hover:bg-surface-card-hover/60 hover:text-content"
											}`}
											aria-current={isCurrent ? "true" : undefined}
										>
											<div className="min-w-0">
												<div className="text-[13px] font-medium">
													{formatMonth(p.month)}
												</div>
												<div className="text-[10.5px] text-content-muted">
													Gerado {formatTimestamp(p.generatedAt)}
													{isCurrent ? " · este mês" : ""}
												</div>
											</div>
											{p.status === "generating" && (
												<span className="text-[10px] text-amber-300">
													gerando
												</span>
											)}
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			)}
		</div>
	);
}
