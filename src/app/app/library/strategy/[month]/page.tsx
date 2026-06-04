"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import StrategyPlanPanel from "@/components/strategy/StrategyPlanPanel";
import type { StrategyPlan } from "@/components/strategy/types";
import { MOCK_PLAN_HAVEFUNNELS_2026_06 } from "@/components/strategy/mock-data";

/*
 * Strategy plan detail route — Wave 22.6 Step 4 (generator wired)
 *
 * Fetches the persisted plan from /api/library/strategy/[month].
 * Three states:
 *   - 200 ready  → render StrategyPlanPanel with real data
 *   - 423 locked → "generating" — poll every 5s until ready
 *   - 404 missing → mock fallback when the URL matches the showcase
 *                   month (2026-06); friendly empty state otherwise
 *
 * Mock fallback exists so the Step 3 visual checkpoint URL keeps
 * working for review/screenshots even when no real plan has been
 * generated yet for the env.
 */

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

interface FetchState {
	status: "loading" | "ready" | "generating" | "missing" | "error";
	plan?: StrategyPlan;
	error?: string;
}

function adaptApiResponse(raw: any): StrategyPlan {
	// API returns ISO strings for dates; the UI contract wants Date
	// objects. Adapter lives here so the contract surfaces in the
	// component never need to know about the wire format.
	return {
		...raw,
		generatedAt: new Date(raw.generatedAt),
		lastRegenerated: new Date(raw.lastRegenerated),
		nextSteps: (raw.nextSteps ?? []).map((s: any) => ({
			...s,
			dueAt: s.dueAt ? new Date(s.dueAt) : null,
		})),
	};
}

export default function StrategyPlanPage() {
	const params = useParams<{ month: string }>();
	const month = params?.month;
	const envId = getEnvironmentId();

	const [state, setState] = useState<FetchState>({ status: "loading" });

	useEffect(() => {
		if (!month) return;
		let cancelled = false;
		let pollTimer: ReturnType<typeof setTimeout> | null = null;

		const load = async () => {
			try {
				// Wave 22.6 Step 10 — when the page is fetched by the
				// PDF exporter, ?export_token=X is forwarded so the
				// underlying API call accepts it as alt-auth.
				const sp = new URLSearchParams(window.location.search);
				const exportToken = sp.get("export_token");
				const qs = new URLSearchParams({ envId });
				if (exportToken) qs.set("export_token", exportToken);
				const res = await fetch(
					`/api/library/strategy/${encodeURIComponent(month)}?${qs.toString()}`,
				);
				if (cancelled) return;

				if (res.status === 423) {
					setState({ status: "generating" });
					// Poll every 5s while generating.
					pollTimer = setTimeout(load, 5000);
					return;
				}
				if (res.status === 404) {
					setState({ status: "missing" });
					return;
				}
				if (!res.ok) {
					setState({
						status: "error",
						error: `Falha ao carregar (HTTP ${res.status})`,
					});
					return;
				}
				const data = await res.json();
				setState({ status: "ready", plan: adaptApiResponse(data) });
			} catch (err) {
				if (cancelled) return;
				setState({
					status: "error",
					error: err instanceof Error ? err.message : "Erro desconhecido",
				});
			}
		};

		void load();
		return () => {
			cancelled = true;
			if (pollTimer) clearTimeout(pollTimer);
		};
	}, [month, envId]);

	// Wave-22.6-review fix: previously the Step-3 design-review fallback
	// activated for ANY customer hitting /app/library/strategy/2026-06
	// without a real plan — leaking havefunnels.com as envDomain in the
	// header (cross-tenant data exposure). Showcase mock is now gated
	// behind an explicit ?demo=1 query param so it only fires in the
	// reviewer's hand-test URL, never in production billing paths.
	const isDemoSession =
		typeof window !== "undefined" &&
		new URLSearchParams(window.location.search).get("demo") === "1";
	const showMockFallback =
		state.status === "missing" &&
		month === MOCK_PLAN_HAVEFUNNELS_2026_06.month &&
		isDemoSession;

	if (state.status === "loading") {
		return (
			<div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
				<div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-edge-subtle border-t-content" />
				<p className="text-[13px] text-content-muted">Carregando plano…</p>
			</div>
		);
	}

	if (state.status === "generating") {
		return (
			<div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
				<div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-edge-subtle border-t-content" />
				<p className="text-[13px] text-content-muted">
					Gerando o plano de {month}…
				</p>
				<p className="mt-1 text-[12px] text-content-faint">
					Atualiza automaticamente quando estiver pronto.
				</p>
			</div>
		);
	}

	if (state.status === "error") {
		return (
			<div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
				<div className="mb-3 text-4xl text-content-faint">⚠</div>
				<h1 className="mb-2 font-serif text-[20px] font-medium text-content">
					Erro ao carregar plano
				</h1>
				<p className="mb-6 max-w-md text-[13px] text-content-muted">{state.error}</p>
				<Link
					href="/app/library"
					className="rounded-md border border-edge bg-surface-card px-4 py-2 text-[13px] text-content transition-colors hover:bg-surface-card-hover"
				>
					← Voltar à Biblioteca
				</Link>
			</div>
		);
	}

	if (state.status === "missing" && !showMockFallback) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
				<div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-content-faint">
					Plano de Estratégia
				</div>
				<h1 className="mb-3 font-serif text-[28px] font-medium text-content">
					Plano de {month} ainda não foi gerado
				</h1>
				<p className="mb-6 max-w-md text-[14px] text-content-muted">
					Cada plano é gerado no dia 1º do mês ou após a primeira audit
					completa. Volte na Biblioteca para ver os planos disponíveis.
				</p>
				<Link
					href="/app/library"
					className="rounded-md border border-edge bg-surface-card px-4 py-2 text-[13px] text-content transition-colors hover:bg-surface-card-hover"
				>
					← Voltar à Biblioteca
				</Link>
			</div>
		);
	}

	const plan =
		state.status === "ready" ? state.plan! : MOCK_PLAN_HAVEFUNNELS_2026_06;

	// Suspense boundary required because StrategyPlanPanel calls
	// useSearchParams() to detect ?print=true mode.
	return (
		<Suspense fallback={null}>
			<StrategyPlanPanel plan={plan} />
		</Suspense>
	);
}
