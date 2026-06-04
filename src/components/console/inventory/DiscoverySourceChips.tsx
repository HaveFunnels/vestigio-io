"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import toast from "react-hot-toast";
import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import type { InventorySurface } from "@/lib/console-data";

// ──────────────────────────────────────────────
// DiscoverySourceChips — Wave-22.6 review fix P2.3
//
// Replaces the old discoverySource FilterDropdown with a chip row
// that doubles as audit-scope at-a-glance: each chip shows the
// source + its count, so the user reads "what did we look at and
// from where?" without opening anything. Clicking a chip filters
// the table by that source.
//
// Trailing "+ Add URL" inline-popover lets the user surface any URL
// the crawler missed (POST /api/inventory/manual).
//
// Skipped count + top reasons render as a quiet subline after the
// chips — visible context, not a competing CTA.
// ──────────────────────────────────────────────

const SOURCE_LABEL_PT: Record<string, string> = {
	homepage_link: "home",
	sitemap: "sitemap",
	critical_path: "rotas críticas",
	internal_link: "links internos",
	pagination: "paginação",
	behavioral_event: "eventos",
	manual: "manual",
};
const SOURCE_LABEL_EN: Record<string, string> = {
	homepage_link: "homepage",
	sitemap: "sitemap",
	critical_path: "critical paths",
	internal_link: "internal links",
	pagination: "pagination",
	behavioral_event: "events",
	manual: "manual",
};

const SKIP_LABEL_PT: Record<string, string> = {
	robots_disallow: "robots.txt",
	out_of_scope: "fora do domínio",
	budget_exceeded: "limite do ciclo",
	duplicate: "duplicada",
	noindex: "noindex",
};
const SKIP_LABEL_EN: Record<string, string> = {
	robots_disallow: "robots.txt",
	out_of_scope: "off-domain",
	budget_exceeded: "cycle budget",
	duplicate: "duplicate",
	noindex: "noindex",
};

interface Props {
	surfaces: InventorySurface[];
	value: string;
	onChange: (next: string) => void;
}

export default function DiscoverySourceChips({ surfaces, value, onChange }: Props) {
	const locale = useLocale();
	const isPt = locale.startsWith("pt");
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const { sourceCounts, skipCounts, totalSkipped } = useMemo(() => {
		const srcMap = new Map<string, number>();
		const skipMap = new Map<string, number>();
		let skipped = 0;
		for (const s of surfaces) {
			if (s.skip_reason) {
				skipped += 1;
				skipMap.set(s.skip_reason, (skipMap.get(s.skip_reason) ?? 0) + 1);
			} else if (s.discovery_source) {
				srcMap.set(s.discovery_source, (srcMap.get(s.discovery_source) ?? 0) + 1);
			}
		}
		return {
			sourceCounts: [...srcMap.entries()].sort((a, b) => b[1] - a[1]),
			skipCounts: [...skipMap.entries()].sort((a, b) => b[1] - a[1]),
			totalSkipped: skipped,
		};
	}, [surfaces]);

	const localizeSource = (s: string) =>
		(isPt ? SOURCE_LABEL_PT : SOURCE_LABEL_EN)[s] ?? s;
	const localizeSkip = (s: string) =>
		(isPt ? SKIP_LABEL_PT : SKIP_LABEL_EN)[s] ?? s;

	const topSkips = skipCounts
		.slice(0, 2)
		.map(([reason, n]) => `${n} ${localizeSkip(reason)}`)
		.join(", ");

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

	function chipClass(isActive: boolean) {
		return `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
			isActive
				? "border-edge-focus bg-surface-card-hover text-content"
				: "border-edge bg-surface-card text-content-muted hover:border-edge-focus hover:text-content"
		}`;
	}

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex flex-wrap items-center gap-1.5">
				<button
					type="button"
					onClick={() => onChange("all")}
					className={chipClass(value === "all")}
				>
					{isPt ? "Todas as fontes" : "All sources"}
				</button>
				{sourceCounts.map(([src, n]) => (
					<button
						key={src}
						type="button"
						onClick={() => onChange(value === src ? "all" : src)}
						className={chipClass(value === src)}
					>
						<span>{localizeSource(src)}</span>
						<span className="font-mono tabular-nums text-content-faint">{n}</span>
					</button>
				))}
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					className="ml-1 inline-flex items-center gap-1 rounded-full border border-dashed border-edge px-2.5 py-1 text-[11px] font-medium text-content-muted transition-colors hover:border-edge-focus hover:text-content"
				>
					<PlusIcon size={11} weight="bold" />
					{isPt ? "Adicionar URL" : "Add URL"}
				</button>
			</div>

			{totalSkipped > 0 && (
				<div className="text-[10px] text-content-faint">
					<span className="font-mono tabular-nums">{totalSkipped}</span>{" "}
					{isPt ? "puladas" : "skipped"}
					{topSkips && <span> · {topSkips}</span>}
				</div>
			)}

			{open && (
				<form
					onSubmit={handleSubmit}
					className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-edge bg-surface-card-hover p-2"
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
		</div>
	);
}
