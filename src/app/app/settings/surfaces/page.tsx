"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/console/PageHeader";

// ──────────────────────────────────────────────
// Surfaces settings — Wave 22.5 Tier 3
//
// Lists declared Surface rows for the active env and lets operators
// add new ones (e.g. an authenticated subdomain "app.example.com").
// The engine uses these declarations to classify evidence into surface
// kinds; a missing declaration falls back to the URL-substring
// heuristic, which works for the common case but is less precise.
//
// The catch-all '*' surface is shown as a non-deletable row at the
// bottom — operators can rename its label but can't remove it (the
// engine relies on it as the fallback classifier).
// ──────────────────────────────────────────────

interface Surface {
	id: string;
	kind: string;
	urlPattern: string;
	label: string;
	authRequired: boolean;
	displayOrder: number;
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

const KIND_LABELS: Record<string, string> = {
	public: "Público",
	authenticated: "Autenticado",
	mixed: "Misto",
};

const KIND_DESCRIPTIONS: Record<string, string> = {
	public:
		"Páginas que qualquer visitante alcança: marketing, pricing, blog, checkout público.",
	authenticated:
		"Páginas atrás de login: app SaaS, área do cliente, portal autenticado.",
	mixed:
		"Surfaces que comparam o público com o autenticado (raro — use quando precisar ligar a promessa de aquisição à entrega real do produto).",
};

export default function SurfacesPage() {
	const envId = getEnvironmentId();
	const [surfaces, setSurfaces] = useState<Surface[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const [form, setForm] = useState({
		kind: "public",
		urlPattern: "",
		label: "",
		authRequired: false,
		displayOrder: 50,
	});

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/surfaces?envId=${envId}`);
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				setError(body.message || "Falha ao carregar surfaces");
				return;
			}
			const { surfaces } = (await res.json()) as { surfaces: Surface[] };
			setSurfaces(surfaces);
		} finally {
			setLoading(false);
		}
	}, [envId]);

	useEffect(() => {
		void load();
	}, [load]);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			const res = await fetch("/api/surfaces", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ envId, ...form }),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				setError(body.message || "Falha ao criar surface");
				return;
			}
			setForm({ kind: "public", urlPattern: "", label: "", authRequired: false, displayOrder: 50 });
			await load();
		} finally {
			setSubmitting(false);
		}
	};

	const onDelete = async (id: string) => {
		if (!confirm("Remover esta surface?")) return;
		setError(null);
		const res = await fetch(`/api/surfaces?envId=${envId}&id=${id}`, { method: "DELETE" });
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			setError(body.message || "Falha ao remover");
			return;
		}
		await load();
	};

	return (
		<div className="p-4 sm:p-6">
			<PageHeader
				title="Surfaces"
				tooltip="Declare quais URLs do seu domínio pertencem ao público (site/marketing) vs ao app autenticado. O engine usa essas declarações pra rotear findings — uma falha de checkout vai pro grupo Público; um problema de activação vai pro grupo Autenticado. Sem declarar nada, tudo é tratado como Público por padrão."
			/>

			{error && (
				<div className="mb-4 rounded-lg border border-red-900 bg-red-950/20 px-3.5 py-2.5 text-[13px] text-red-300">
					{error}
				</div>
			)}

			<div className="grid gap-6 lg:grid-cols-[1fr_360px]">
				{/* List */}
				<div className="rounded-xl border border-edge bg-surface-card">
					<div className="border-b border-edge px-4 py-3">
						<h2 className="text-[14px] font-semibold text-fg-primary">
							Surfaces declaradas
						</h2>
						<p className="mt-0.5 text-[12px] text-fg-muted">
							A surface mais específica vence sobre a genérica. A catch-all <code>*</code> nunca é removível — é o fallback que mantém URLs não-declaradas com classificação válida.
						</p>
					</div>
					{loading ? (
						<div className="px-4 py-6 text-[13px] text-fg-muted">Carregando…</div>
					) : surfaces.length === 0 ? (
						<div className="px-4 py-6 text-[13px] text-fg-muted">
							Nenhuma surface declarada. Adicione uma do lado direito.
						</div>
					) : (
						<ul className="divide-y divide-edge">
							{surfaces.map((s) => (
								<li key={s.id} className="flex items-start justify-between gap-3 px-4 py-3">
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<span className="text-[13px] font-medium text-fg-primary">{s.label}</span>
											<span className="rounded-full border border-edge bg-bg-elevated px-2 py-0.5 text-[11px] font-medium text-fg-secondary">
												{KIND_LABELS[s.kind] ?? s.kind}
											</span>
											{s.authRequired && (
												<span className="rounded-full border border-edge bg-bg-elevated px-2 py-0.5 text-[11px] font-medium text-fg-secondary">
													login obrigatório
												</span>
											)}
										</div>
										<div className="mt-1 font-mono text-[12px] text-fg-muted">
											{s.urlPattern}
										</div>
									</div>
									{s.urlPattern !== "*" && (
										<button
											type="button"
											onClick={() => void onDelete(s.id)}
											className="shrink-0 rounded-md border border-edge bg-bg-elevated px-2.5 py-1 text-[12px] text-fg-secondary hover:bg-surface-card-hover"
										>
											Remover
										</button>
									)}
								</li>
							))}
						</ul>
					)}
				</div>

				{/* Add form */}
				<form
					onSubmit={onSubmit}
					className="self-start rounded-xl border border-edge bg-surface-card p-4 space-y-3"
				>
					<h2 className="text-[14px] font-semibold text-fg-primary">Adicionar surface</h2>

					<div>
						<label className="block text-[12px] font-medium text-fg-secondary mb-1">
							Tipo
						</label>
						<select
							value={form.kind}
							onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
							className="w-full rounded-md border border-edge bg-bg-elevated px-2.5 py-1.5 text-[13px] text-fg-primary"
						>
							{Object.entries(KIND_LABELS).map(([k, lbl]) => (
								<option key={k} value={k}>
									{lbl}
								</option>
							))}
						</select>
						<p className="mt-1 text-[11px] text-fg-muted">{KIND_DESCRIPTIONS[form.kind]}</p>
					</div>

					<div>
						<label className="block text-[12px] font-medium text-fg-secondary mb-1">
							Padrão de URL
						</label>
						<input
							type="text"
							value={form.urlPattern}
							onChange={(e) => setForm((f) => ({ ...f, urlPattern: e.target.value }))}
							required
							placeholder="app.example.com ou https://example.com/app/"
							className="w-full rounded-md border border-edge bg-bg-elevated px-2.5 py-1.5 text-[13px] text-fg-primary font-mono"
						/>
						<p className="mt-1 text-[11px] text-fg-muted">
							Hostname (ex: <code>app.example.com</code>), prefixo HTTPS (ex: <code>https://example.com/app/</code>), ou <code>app.*</code> pra subdomínios.
						</p>
					</div>

					<div>
						<label className="block text-[12px] font-medium text-fg-secondary mb-1">
							Rótulo
						</label>
						<input
							type="text"
							value={form.label}
							onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
							required
							placeholder="Aplicação"
							className="w-full rounded-md border border-edge bg-bg-elevated px-2.5 py-1.5 text-[13px] text-fg-primary"
						/>
					</div>

					{form.kind === "authenticated" && (
						<label className="flex items-center gap-2 text-[12px] text-fg-secondary">
							<input
								type="checkbox"
								checked={form.authRequired}
								onChange={(e) => setForm((f) => ({ ...f, authRequired: e.target.checked }))}
							/>
							Páginas exigem login pra serem auditadas
						</label>
					)}

					<button
						type="submit"
						disabled={submitting}
						className="w-full rounded-md border border-edge bg-bg-elevated px-3 py-1.5 text-[13px] font-medium text-fg-primary hover:bg-surface-card-hover disabled:opacity-50"
					>
						{submitting ? "Salvando…" : "Adicionar surface"}
					</button>
				</form>
			</div>
		</div>
	);
}
