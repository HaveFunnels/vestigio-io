"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Plus, Trash2, Radio } from "lucide-react";

/*
 * Workspaces hub — Concorrentes section.
 *
 * Visual language mirrors src/components/strategy/sections/* so the
 * customer never feels they jumped to a different product when leaving
 * the Plan. Card pattern, eyebrow + body + per-item rows, footer
 * inline-add form.
 *
 * Backed by /api/competitor-domains (GET / POST / PATCH / DELETE).
 */

interface CompetitorRow {
	id: string;
	domain: string;
	label: string | null;
	notes: string | null;
	discoveryMethod: string;
	active: boolean;
	addedBy: string | null;
	addedAt: string;
}

interface Props {
	envId: string;
}

function getEnvId(): string {
	if (typeof window !== "undefined") {
		const params = new URLSearchParams(window.location.search);
		const fromUrl = params.get("env");
		if (fromUrl) return fromUrl;
		const match = document.cookie.match(/(?:^|;\s*)active_env=([^;]*)/);
		if (match?.[1]) return match[1];
	}
	return "default_env";
}

export default function CompetitorsSection({ envId }: Props) {
	const [rows, setRows] = useState<CompetitorRow[]>([]);
	const [activeCount, setActiveCount] = useState(0);
	const [activeCap, setActiveCap] = useState(10);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Add form state
	const [newDomain, setNewDomain] = useState("");
	const [newLabel, setNewLabel] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);

	async function load() {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(
				`/api/competitor-domains?envId=${encodeURIComponent(envId)}`,
			);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.message ?? `HTTP ${res.status}`);
			}
			const data = await res.json();
			setRows(data.competitors ?? []);
			setActiveCount(data.active_count ?? 0);
			setActiveCap(data.active_cap ?? 10);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro ao carregar.");
		}
		setLoading(false);
	}

	useEffect(() => {
		void load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [envId]);

	async function handleAdd(e: React.FormEvent) {
		e.preventDefault();
		setFormError(null);
		const domain = newDomain.trim().toLowerCase();
		if (!domain) {
			setFormError("Informe um domínio.");
			return;
		}
		setSubmitting(true);
		try {
			const res = await fetch("/api/competitor-domains", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ envId, domain, label: newLabel.trim() || undefined }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.message ?? `HTTP ${res.status}`);
			}
			setNewDomain("");
			setNewLabel("");
			await load();
		} catch (err) {
			setFormError(err instanceof Error ? err.message : "Erro ao adicionar.");
		}
		setSubmitting(false);
	}

	async function handleToggle(row: CompetitorRow) {
		try {
			await fetch("/api/competitor-domains", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ envId, id: row.id, active: !row.active }),
			});
			await load();
		} catch {
			// Silent — UI will reflect server state on next load.
		}
	}

	async function handleDelete(row: CompetitorRow) {
		if (!confirm(`Remover ${row.domain}?`)) return;
		try {
			await fetch(
				`/api/competitor-domains?envId=${encodeURIComponent(envId)}&id=${encodeURIComponent(row.id)}`,
				{ method: "DELETE" },
			);
			await load();
		} catch {
			// Silent.
		}
	}

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
			className="mb-12"
		>
			<div className="mb-4 flex items-baseline justify-between">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					Concorrentes monitorados
				</h2>
				<div className="text-[11px] text-content-faint">
					{activeCount} de {activeCap} ativos
				</div>
			</div>

			<div data-vsgp-card className="rounded-2xl border border-edge bg-surface-card p-6">
				<p className="mb-5 border-b border-edge/40 pb-5 text-[13px] leading-snug text-content-secondary">
					Domínios listados aqui entram nas análises de copy mirroring, trust
					posture e overlap em SERP a cada ciclo. Auto-discovery via SERP
					adiciona candidatos como inativos; ative os que fazem sentido para
					seu radar competitivo.
				</p>

				{/* Inline add form */}
				<form
					onSubmit={handleAdd}
					className="mb-5 flex flex-col gap-2 border-b border-edge/40 pb-5 sm:flex-row sm:items-start"
				>
					<input
						type="text"
						value={newDomain}
						onChange={(e) => setNewDomain(e.target.value)}
						placeholder="dominio.com"
						className="flex-1 rounded-lg border border-edge bg-surface-inset/40 px-3 py-2 font-mono text-[13px] text-content placeholder:text-content-faint outline-none transition-colors focus:border-edge-focus"
						disabled={submitting}
					/>
					<input
						type="text"
						value={newLabel}
						onChange={(e) => setNewLabel(e.target.value)}
						placeholder="Rótulo (opcional)"
						className="flex-1 rounded-lg border border-edge bg-surface-inset/40 px-3 py-2 text-[13px] text-content placeholder:text-content-faint outline-none transition-colors focus:border-edge-focus"
						disabled={submitting}
					/>
					<button
						type="submit"
						disabled={submitting || activeCount >= activeCap}
						className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-edge bg-surface-inset/60 px-3 py-2 text-[12.5px] font-medium text-content-secondary transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content disabled:cursor-not-allowed disabled:opacity-50"
					>
						<Plus className="h-3.5 w-3.5" />
						Adicionar
					</button>
				</form>
				{formError && (
					<div className="mb-3 text-[12px] text-rose-300">{formError}</div>
				)}
				{activeCount >= activeCap && (
					<div className="mb-3 text-[12px] text-amber-300">
						Limite de {activeCap} ativos atingido. Desative algum para incluir
						novos.
					</div>
				)}

				{/* List */}
				{loading ? (
					<div className="py-6 text-center text-[12.5px] text-content-muted">
						Carregando…
					</div>
				) : error ? (
					<div className="rounded-xl border border-rose-500/30 bg-surface-inset/30 p-4 text-[12.5px] text-rose-300">
						{error}
					</div>
				) : rows.length === 0 ? (
					<div className="rounded-xl border border-dashed border-edge bg-surface-inset/30 p-4 text-center text-[12.5px] text-content-muted">
						Nenhum concorrente curado. Adicione o primeiro acima para começar.
					</div>
				) : (
					<ul className="space-y-2">
						{rows.map((r) => (
							<li
								key={r.id}
								className="flex flex-col gap-2 rounded-xl border border-edge/40 bg-surface-inset/20 p-3 sm:flex-row sm:items-center sm:gap-3"
							>
								<div className="flex flex-1 items-baseline gap-2">
									<Radio
										className={`h-3 w-3 shrink-0 ${r.active ? "text-emerald-300" : "text-content-faint"}`}
										aria-hidden
									/>
									<div className="min-w-0">
										<div className="truncate font-mono text-[13px] text-content">
											{r.domain}
										</div>
										{r.label && r.label !== r.domain && (
											<div className="truncate text-[11px] text-content-muted">
												{r.label}
											</div>
										)}
									</div>
									<span className="rounded-md bg-surface-inset px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-content-faint">
										{r.discoveryMethod}
									</span>
								</div>
								<div className="flex items-center gap-2 sm:justify-end">
									<button
										type="button"
										onClick={() => handleToggle(r)}
										className="rounded-md border border-edge bg-surface-inset/60 px-2.5 py-1 text-[11px] font-medium text-content-secondary transition-colors hover:border-edge-focus hover:text-content"
									>
										{r.active ? "Desativar" : "Ativar"}
									</button>
									<button
										type="button"
										onClick={() => handleDelete(r)}
										className="inline-flex items-center gap-1 rounded-md border border-edge bg-surface-inset/60 px-2.5 py-1 text-[11px] font-medium text-rose-300/90 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10"
										aria-label="Remover"
									>
										<Trash2 className="h-3 w-3" />
									</button>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>
		</motion.section>
	);
}

export { getEnvId };
