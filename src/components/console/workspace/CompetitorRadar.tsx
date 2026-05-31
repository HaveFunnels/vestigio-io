"use client";

import { useCallback, useEffect, useState } from "react";

// ──────────────────────────────────────────────
// CompetitorRadar — Wave 24
//
// Bespoke widget for the competitive_lens workspace. Lists the
// user-curated competitor domains and lets the owner add / remove /
// toggle each one. Visible only on the competitive_lens workspace
// detail page; mirrors the surfaces-page pattern (cookie-based
// envId resolution, /api/competitor-domains for CRUD).
//
// What this widget is NOT: an Adjacency Map (deferred to Wave 25
// once SERP discovery is wired). Wave 24 ships the curation surface
// so customers can start populating the peer set; findings depend
// on at least 2 active competitors to fire.
// ──────────────────────────────────────────────

interface Competitor {
	id: string;
	domain: string;
	label: string | null;
	notes: string | null;
	discoveryMethod: string;
	active: boolean;
	addedBy: string | null;
	addedAt: string;
}

function getEnvironmentId(): string {
	if (typeof window !== "undefined") {
		const params = new URLSearchParams(window.location.search);
		const fromUrl = params.get("env");
		if (fromUrl) return fromUrl;
		const match = document.cookie.match(/(?:^|;\s*)active_env=([^;]*)/);
		if (match?.[1]) return match[1];
	}
	return "default_env";
}

export function CompetitorRadar() {
	const envId = getEnvironmentId();
	const [competitors, setCompetitors] = useState<Competitor[]>([]);
	const [activeCount, setActiveCount] = useState(0);
	const [activeCap, setActiveCap] = useState(20);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [form, setForm] = useState({ domain: "", label: "", notes: "" });

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/competitor-domains?envId=${envId}`);
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				setError(body.message || "Falha ao carregar competidores");
				return;
			}
			const data = (await res.json()) as {
				competitors: Competitor[];
				active_count: number;
				active_cap: number;
			};
			setCompetitors(data.competitors);
			setActiveCount(data.active_count);
			setActiveCap(data.active_cap);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Falha ao carregar");
		} finally {
			setLoading(false);
		}
	}, [envId]);

	useEffect(() => {
		void load();
	}, [load]);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.domain.trim()) return;
		setSubmitting(true);
		setError(null);
		try {
			const res = await fetch("/api/competitor-domains", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					envId,
					domain: form.domain.trim().toLowerCase(),
					label: form.label.trim() || undefined,
					notes: form.notes.trim() || undefined,
				}),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				setError(body.message || "Falha ao adicionar competidor");
				return;
			}
			setForm({ domain: "", label: "", notes: "" });
			await load();
		} finally {
			setSubmitting(false);
		}
	};

	const onToggleActive = async (id: string, nextActive: boolean) => {
		const res = await fetch("/api/competitor-domains", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ envId, id, active: nextActive }),
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			setError(body.message || "Falha ao atualizar");
			return;
		}
		await load();
	};

	const onDelete = async (id: string) => {
		if (!confirm("Remover este competidor?")) return;
		const res = await fetch(
			`/api/competitor-domains?envId=${envId}&id=${id}`,
			{ method: "DELETE" },
		);
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			setError(body.message || "Falha ao remover");
			return;
		}
		await load();
	};

	const remaining = activeCap - activeCount;

	return (
		<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
			<header className="mb-4 flex items-end justify-between gap-3">
				<div>
					<h2 className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
						Concorrentes vigiados
					</h2>
					<p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">
						Adicione domínios apex de competidores diretos. A cada audit cycle,
						vamos comparar trust posture e copy fingerprint do seu env contra o
						peer set.
					</p>
				</div>
				<div className="shrink-0 text-right text-[11px] text-zinc-500 dark:text-zinc-400">
					<div>
						<span className="text-zinc-700 dark:text-zinc-300">{activeCount}</span>
						<span className="text-zinc-500"> / {activeCap} ativos</span>
					</div>
					{remaining <= 3 && remaining > 0 && (
						<div className="mt-0.5 text-amber-500">{remaining} restantes</div>
					)}
				</div>
			</header>

			{/* Add form */}
			<form onSubmit={onSubmit} className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-[2fr_2fr_1fr_auto]">
				<input
					type="text"
					required
					value={form.domain}
					onChange={(e) => setForm({ ...form, domain: e.target.value })}
					placeholder="exemplo.com.br"
					autoComplete="off"
					spellCheck={false}
					className="rounded-md border border-edge bg-surface-input px-3 py-2 text-[13px] text-zinc-700 placeholder-zinc-400 focus:border-accent-border focus:outline-none dark:text-zinc-300"
				/>
				<input
					type="text"
					value={form.label}
					onChange={(e) => setForm({ ...form, label: e.target.value })}
					placeholder="Rótulo (opcional)"
					className="rounded-md border border-edge bg-surface-input px-3 py-2 text-[13px] text-zinc-700 placeholder-zinc-400 focus:border-accent-border focus:outline-none dark:text-zinc-300"
				/>
				<input
					type="text"
					value={form.notes}
					onChange={(e) => setForm({ ...form, notes: e.target.value })}
					placeholder="Notas (opcional)"
					className="rounded-md border border-edge bg-surface-input px-3 py-2 text-[13px] text-zinc-700 placeholder-zinc-400 focus:border-accent-border focus:outline-none dark:text-zinc-300"
				/>
				<button
					type="submit"
					disabled={submitting || activeCount >= activeCap}
					className="rounded-md border border-edge bg-surface-button px-4 py-2 text-[12px] font-medium text-zinc-700 transition hover:bg-surface-button-hover disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-200"
				>
					{submitting ? "Adicionando…" : "Adicionar"}
				</button>
			</form>

			{error && (
				<div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
					{error}
				</div>
			)}

			{/* Auto-discovery banner — when there are inactive auto candidates pending owner pin */}
			{(() => {
				const pendingAuto = competitors.filter(
					(c) => c.discoveryMethod === "auto" && !c.active,
				);
				if (pendingAuto.length === 0) return null;
				return (
					<div className="mb-3 rounded-md border border-sky-500/40 bg-sky-500/[0.06] px-3 py-2 text-[12px] text-zinc-700 dark:text-zinc-200">
						<span className="font-medium text-sky-400">
							{pendingAuto.length} candidato(s) auto-descobertos
						</span>{" "}
						a partir da observação de SERPs do peer set. Ative os que importam pra
						entrarem no monitoramento de copy mirror + trust posture.
					</div>
				);
			})()}

			{/* List */}
			{loading ? (
				<div className="py-6 text-center text-[12px] text-zinc-500">
					Carregando…
				</div>
			) : competitors.length === 0 ? (
				<div className="rounded-lg border border-dashed border-edge bg-surface-subtle px-4 py-6 text-center">
					<div className="text-[13px] text-zinc-600 dark:text-zinc-300">
						Nenhum competidor adicionado ainda.
					</div>
					<div className="mt-1 text-[11px] text-zinc-500">
						Adicione 3-5 competidores diretos pra ativar copy mirror e trust
						posture comparativo. Se a chave Brave Search estiver configurada,
						sugerimos candidatos automaticamente a cada audit cycle full.
					</div>
				</div>
			) : (
				<div className="divide-y divide-edge overflow-hidden rounded-lg border border-edge">
					{competitors.map((c) => (
						<div
							key={c.id}
							className={`flex items-center gap-3 px-4 py-3 ${c.active ? "" : "opacity-60"}`}
						>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<span className="font-mono text-[13px] text-zinc-700 dark:text-zinc-200">
										{c.domain}
									</span>
									{c.discoveryMethod === "auto" && (
										<span className="rounded-sm bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-sky-400">
											Auto
										</span>
									)}
									{!c.active && (
										<span className="rounded-sm bg-zinc-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-zinc-400">
											Inativo
										</span>
									)}
								</div>
								{c.label && (
									<div className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
										{c.label}
									</div>
								)}
								{c.notes && (
									<div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-500">
										{c.notes}
									</div>
								)}
							</div>
							<button
								type="button"
								onClick={() => onToggleActive(c.id, !c.active)}
								className="rounded-md border border-edge px-2 py-1 text-[11px] text-zinc-600 hover:bg-surface-button-hover dark:text-zinc-300"
							>
								{c.active ? "Desativar" : "Ativar"}
							</button>
							<button
								type="button"
								onClick={() => onDelete(c.id)}
								className="rounded-md border border-edge px-2 py-1 text-[11px] text-zinc-600 hover:bg-surface-button-hover dark:text-zinc-300"
							>
								Remover
							</button>
						</div>
					))}
				</div>
			)}

			<div className="mt-4 border-t border-edge pt-3 text-[11px] text-zinc-500">
				A cada audit cycle full, capturamos a homepage dos {Math.min(10, activeCap)} competidores
				ativos mais recentes — fetch educado equivalente a abrir o site num navegador. Sem
				autenticação, sem crawl, sem scanners pesados. Quando o Brave Search está
				configurado, também observamos SERPs da sua marca e da categoria pra
				detectar concorrência orgânica e sugerir candidatos.
			</div>
		</section>
	);
}
