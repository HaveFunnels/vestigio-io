"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import StrategyPlanPanel from "@/components/strategy/StrategyPlanPanel";
import PlanPageSkeleton from "@/components/strategy/PlanPageSkeleton";
import { useTrack } from "@/hooks/useProductTrack";
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
	status: "loading" | "ready" | "generating" | "missing" | "awaiting_first_cycle" | "error";
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
	const { track } = useTrack();
	const router = useRouter();

	const [state, setState] = useState<FetchState>({ status: "loading" });

	// Wave 22.9 — dynamic browser title for the plan page. The parent
	// /app/layout sets title="Console" which the root template renders
	// as "Console | Vestigio". For the plan page specifically we want
	// "Plano de {mês} · Vestigio" so a browser-tab reader spots the
	// month at a glance. document.title bypasses the root template
	// (fully qualified string), which is fine because the plan is
	// month-scoped and the template's brand suffix is baked in here.
	useEffect(() => {
		if (!month) return;
		const [y, m] = month.split("-");
		const monthNames: Record<string, string> = {
			"01": "janeiro", "02": "fevereiro", "03": "março", "04": "abril",
			"05": "maio", "06": "junho", "07": "julho", "08": "agosto",
			"09": "setembro", "10": "outubro", "11": "novembro", "12": "dezembro",
		};
		const label = monthNames[m] ? `${monthNames[m]} ${y}` : month;
		document.title = `Plano de ${label} · Vestigio`;
	}, [month]);

	// RSC cache invalidation: the parent /app layout pre-loads MCP
	// findings server-side from AuditCycle.projectionsCache. When the
	// user navigates here from elsewhere in /app via <Link>, the
	// previously-rendered RSC payload is reused from the Router Cache,
	// so MCP findings can be stale relative to a plan generated AFTER
	// that cached render. The drawer's id-match then misses and the
	// step opens to "Problemas indisponíveis" — a hard reload "fixes"
	// it because reload reruns the layout. router.refresh() forces an
	// RSC re-fetch on mount, costing one extra streaming render per
	// plan visit in exchange for guaranteed-fresh finding projections.
	const refreshedRef = useRef(false);
	useEffect(() => {
		if (refreshedRef.current) return;
		refreshedRef.current = true;
		router.refresh();
	}, [router]);

	// Phase 3.5 — telemetry for the Pulse-vs-Plan home decision.
	// Fires once per mount; consumes the first-surface sentinel so the
	// admin dashboard can split sessions that landed in the Plan first
	// from those that bounced over from /app/pulse.
	const visitFired = useRef(false);
	useEffect(() => {
		if (visitFired.current || !month) return;
		visitFired.current = true;
		let isFirst = false;
		try {
			const KEY = "vestigio.first_surface_this_session";
			if (!window.sessionStorage.getItem(KEY)) {
				window.sessionStorage.setItem(KEY, "plan");
				isFirst = true;
			}
		} catch { /* private mode — accept undefined attribution */ }
		track("plan.visit", { month, is_first_surface_this_session: isFirst });
		// Stalling-signal write — best-effort; failures are silent.
		// Re-engagement cron uses lastPlanVisitedAt to decide who's gone
		// quiet (>14d gap → soft re-engagement, >30d → at-risk report).
		fetch("/api/me/plan-visited", { method: "POST" }).catch(() => {});
	}, [month, track]);

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
					// New-customer onboarding path: API tells us the env has
					// never had any plan generated yet. Show the friendlier
					// "we're analyzing your site" empty state instead of the
					// generic missing-month one.
					let firstCycle = false;
					try {
						const body = await res.clone().json();
						firstCycle = body?.status === "awaiting_first_cycle";
					} catch { /* unparseable body — fall through to missing */ }
					setState({ status: firstCycle ? "awaiting_first_cycle" : "missing" });
					if (firstCycle) {
						// While the first cycle runs we poll just like the
						// generating state so the customer doesn't sit on a
						// dead page if their cycle finishes within the visit.
						pollTimer = setTimeout(load, 15000);
					}
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
		return <PlanPageSkeleton caption="Carregando plano…" />;
	}

	if (state.status === "generating") {
		return (
			<PlanPageSkeleton
				caption={`Gerando o plano de ${month}…`}
				subCaption="Atualiza automaticamente quando estiver pronto."
			/>
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
					href="/app"
					className="rounded-md border border-edge bg-surface-card px-4 py-2 text-[13px] text-content transition-colors hover:bg-surface-card-hover"
				>
					← Plano corrente
				</Link>
			</div>
		);
	}

	if (state.status === "awaiting_first_cycle") {
		// New-customer onboarding empty state. Shown when the env has
		// zero plans ever generated — first audit cycle is queued or
		// running. Polls every 15s; when the cycle completes, the API
		// returns the plan and the state flips to ready automatically.
		return (
			<div className="flex h-full flex-col items-center justify-center px-6 py-20 text-center">
				<div className="mb-5 flex items-center gap-3">
					<div className="relative h-2.5 w-2.5">
						<span className="absolute inset-0 animate-ping rounded-full bg-content-faint/40" />
						<span className="relative block h-2.5 w-2.5 rounded-full bg-content" />
					</div>
					<div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-faint">
						Análise em andamento
					</div>
				</div>
				<h1 className="mb-3 max-w-xl font-serif text-[26px] font-medium leading-tight text-content sm:text-[30px]">
					Estamos analisando o seu site agora.
				</h1>
				<p className="mb-6 max-w-md text-[14.5px] leading-relaxed text-content-secondary">
					A primeira análise costuma demorar entre <strong className="text-content">30 e 90 minutos</strong>.
					Você recebe um email assim que o seu plano de <strong className="text-content">{month}</strong> ficar pronto — pode fechar essa página sem perder nada.
				</p>
				<div className="mb-8 grid max-w-md grid-cols-1 gap-2 text-left text-[13px] text-content-muted">
					<div className="flex items-start gap-2">
						<span className="mt-0.5 text-content-faint">·</span>
						<span>Estamos rastreando vazamentos de receita, confiança e atrito.</span>
					</div>
					<div className="flex items-start gap-2">
						<span className="mt-0.5 text-content-faint">·</span>
						<span>O plano vem com tese do mês, ações priorizadas e impacto em R$.</span>
					</div>
					<div className="flex items-start gap-2">
						<span className="mt-0.5 text-content-faint">·</span>
						<span>Enquanto isso, você pode ajustar o que monitoramos em Workspaces.</span>
					</div>
				</div>
				<div className="flex flex-wrap items-center justify-center gap-2">
					<Link
						href="/app/workspaces"
						className="rounded-md border border-edge bg-surface-card px-4 py-2 text-[13px] text-content transition-colors hover:bg-surface-card-hover"
					>
						Configurar workspace →
					</Link>
				</div>
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
					completa. Use o seletor de mês no plano corrente para ver outros
					meses disponíveis.
				</p>
				<Link
					href="/app"
					className="rounded-md border border-edge bg-surface-card px-4 py-2 text-[13px] text-content transition-colors hover:bg-surface-card-hover"
				>
					← Plano corrente
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
