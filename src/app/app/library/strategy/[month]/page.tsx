"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import StrategyPlanPanel from "@/components/strategy/StrategyPlanPanel";
import { MOCK_PLAN_HAVEFUNNELS_2026_06 } from "@/components/strategy/mock-data";

/*
 * Strategy plan detail route — Wave 22.6 Step 3 (visual checkpoint)
 *
 * Renders the StrategyPlanPanel with hardcoded mock data so the user
 * can review layout/typography/dataviz end-to-end before any LLM or
 * generator code is written. Step 4 swaps this for a real fetch of
 * GET /api/library/strategy/[month] (route lands in Step 4).
 *
 * The month param is read but currently ignored — the mock plan is
 * pinned to June 2026; future months will fall through the not-found
 * path the same way Step 4 will when the DB has no row.
 */

export default function StrategyPlanPage() {
	const params = useParams<{ month: string }>();
	const month = params?.month;

	// Step 3 — single hardcoded mock. Step 4 fetches by month.
	const plan = MOCK_PLAN_HAVEFUNNELS_2026_06;

	// Friendly empty state for non-matching months in mock mode.
	if (month !== plan.month) {
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

	return <StrategyPlanPanel plan={plan} />;
}
