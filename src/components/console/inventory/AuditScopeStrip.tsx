"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import toast from "react-hot-toast";
import { PlusIcon, FunnelIcon } from "@phosphor-icons/react/dist/ssr";
import type { InventorySurface } from "@/lib/console-data";

// ──────────────────────────────────────────────
// AuditScopeStrip — Wave-22.6 review fix P2.3
//
// Compact one-line header above the inventory table answering
// "what did the crawler look at?". Three things in one strip:
//   1. Total + breakdown by discovery_source (sitemap, homepage_link,
//      manual, …) so the user can sanity-check the audit scope.
//   2. Skip count + top 2 reasons so they understand what we passed on.
//   3. An inline "+ Add URL" button to surface anything we missed.
//
// Reload triggers a full page refresh on success — keeps the strip
// honest (counts re-flow from /api/inventory) without plumbing a
// callback through 6 parent layers.
// ──────────────────────────────────────────────

const SOURCE_LABEL_PT: Record<string, string> = {
	homepage_link: "links da home",
	sitemap: "sitemap",
	critical_path: "rotas críticas",
	internal_link: "links internos",
	pagination: "paginação",
	behavioral_event: "eventos",
	manual: "adição manual",
};
const SOURCE_LABEL_EN: Record<string, string> = {
	homepage_link: "homepage links",
	sitemap: "sitemap",
	critical_path: "critical paths",
	internal_link: "internal links",
	pagination: "pagination",
	behavioral_event: "events",
	manual: "manual",
};

const SKIP_LABEL_PT: Record<string, string> = {
	robots_disallow: "bloqueado por robots.txt",
	out_of_scope: "fora do domínio",
	budget_exceeded: "limite do ciclo",
	duplicate: "duplicada",
	noindex: "marcada como noindex",
};
const SKIP_LABEL_EN: Record<string, string> = {
	robots_disallow: "robots.txt blocked",
	out_of_scope: "off-domain",
	budget_exceeded: "cycle budget",
	duplicate: "duplicate",
	noindex: "noindex",
};

interface Props {
	surfaces: InventorySurface[];
}

export default function AuditScopeStrip({ surfaces }: Props) {
	const locale = useLocale();
	const isPt = locale.startsWith("pt");
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const { sourceCounts, skipCounts, totalCrawled, totalSkipped } = useMemo(() => {
		const srcMap = new Map<string, number>();
		const skipMap = new Map<string, number>();
		let crawled = 0;
		let skipped = 0;
		for (const s of surfaces) {
			if (s.skip_reason) {
				skipped += 1;
				skipMap.set(s.skip_reason, (skipMap.get(s.skip_reason) ?? 0) + 1);
			} else {
				crawled += 1;
				const src = s.discovery_source ?? "unknown";
				srcMap.set(src, (srcMap.get(src) ?? 0) + 1);
			}
		}
		return {
			sourceCounts: [...srcMap.entries()].sort((a, b) => b[1] - a[1]),
			skipCounts: [...skipMap.entries()].sort((a, b) => b[1] - a[1]),
			totalCrawled: crawled,
			totalSkipped: skipped,
		};
	}, [surfaces]);

	const localizeSource = (s: string) =>
		(isPt ? SOURCE_LABEL_PT : SOURCE_LABEL_EN)[s] ?? s;
	const localizeSkip = (s: string) =>
		(isPt ? SKIP_LABEL_PT : SKIP_LABEL_EN)[s] ?? s;

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!url.trim() || submitting) return;
		setSubmitting(true);
		try {
			const res = await fetch("/api/inventory/manual", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: url.trim() }),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body?.message ?? (isPt ? "Erro ao adicionar URL" : "Failed to add URL"));
				return;
			}
			toast.success(isPt ? "URL adicionada à auditoria" : "URL added to audit");
			setUrl("");
			setOpen(false);
			window.location.reload();
		} finally {
			setSubmitting(false);
		}
	}

	const sourceSummary =
		sourceCounts.length === 0
			? isPt ? "nenhum URL coletado" : "no URLs collected"
			: sourceCounts
					.slice(0, 3)
					.map(([src, n]) => `${n} ${localizeSource(src)}`)
					.join(" · ");

	const topSkips = skipCounts
		.slice(0, 2)
		.map(([reason, n]) => `${n} ${localizeSkip(reason)}`)
		.join(", ");

	return (
		<section className="mb-5 rounded-2xl border border-edge bg-surface-card/60 p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
						{isPt ? "Escopo da auditoria" : "Audit scope"}
					</div>
					<div className="mt-1.5 text-[13px] text-content">
						<span className="font-mono font-semibold tabular-nums">{totalCrawled}</span>{" "}
						{isPt ? "URLs coletadas" : "URLs crawled"}
						<span className="ml-1 text-content-muted">— {sourceSummary}</span>
					</div>
					{totalSkipped > 0 && (
						<div className="mt-1 flex items-center gap-1.5 text-[11px] text-content-muted">
							<FunnelIcon size={11} weight="bold" />
							<span className="font-mono tabular-nums">{totalSkipped}</span>{" "}
							{isPt ? "puladas" : "skipped"}
							{topSkips && <span className="text-content-faint">· {topSkips}</span>}
						</div>
					)}
				</div>
				<button
					onClick={() => setOpen((o) => !o)}
					className="flex items-center gap-1.5 rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-[12px] font-medium text-content-secondary transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content"
				>
					<PlusIcon size={12} weight="bold" />
					{isPt ? "Adicionar URL" : "Add URL"}
				</button>
			</div>

			{open && (
				<form
					onSubmit={handleSubmit}
					className="mt-3 flex flex-wrap items-center gap-2 border-t border-edge pt-3"
				>
					<input
						type="url"
						required
						autoFocus
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder={
							isPt
								? "https://seusite.com/pagina-que-nao-foi-rastreada"
								: "https://yoursite.com/missed-page"
						}
						className="min-w-0 flex-1 rounded-md border border-edge bg-surface-inset px-3 py-1.5 text-[12px] text-content placeholder:text-content-faint focus:border-edge-focus focus:outline-none"
					/>
					<button
						type="submit"
						disabled={submitting}
						className="rounded-md border border-edge bg-surface-card px-3 py-1.5 text-[12px] font-medium text-content-secondary transition-colors hover:bg-surface-card-hover hover:text-content disabled:opacity-50"
					>
						{submitting
							? isPt ? "Adicionando…" : "Adding…"
							: isPt ? "Adicionar" : "Add"}
					</button>
					<button
						type="button"
						onClick={() => { setOpen(false); setUrl(""); }}
						className="text-[12px] text-content-faint hover:text-content-muted"
					>
						{isPt ? "Cancelar" : "Cancel"}
					</button>
				</form>
			)}
		</section>
	);
}
