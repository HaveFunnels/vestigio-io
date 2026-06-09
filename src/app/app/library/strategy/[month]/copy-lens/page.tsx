"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import CopyLens from "@/components/strategy/sections/CopyLens";
import { usePlanFetch } from "@/hooks/usePlanFetch";

/*
 * Wave 22.8 review move 2 — Copy Lens drilled out of the main plan
 * into its own page so the plan stays focused on action. The link to
 * here lives at the bottom of the BuyerSegments "Copy" card; the
 * breadcrumb up top returns the customer to the plan they came from.
 */

function pageTitle(month: string | undefined): string {
	if (!month) return "Lente de Framework de Copy";
	const [y, m] = month.split("-").map((s) => parseInt(s, 10));
	const monthNames = [
		"Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
		"Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
	];
	if (!y || !m || m < 1 || m > 12) return "Lente de Framework de Copy";
	return `Lente de Framework de Copy · ${monthNames[m - 1]} de ${y}`;
}

export default function CopyLensStandalonePage() {
	const params = useParams<{ month: string }>();
	const month = params?.month;
	const state = usePlanFetch(month);

	return (
		<div className="mx-auto max-w-[1100px] px-6 py-10 sm:py-14">
			{/* Breadcrumb back to the plan. Mirrors the back-to-context
			    pattern used on /app/findings/[id] when a back URL is
			    present — keeps the customer in their reading flow. */}
			<Link
				href={`/app/library/strategy/${encodeURIComponent(month ?? "")}`}
				className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-content-muted underline-offset-4 transition-colors hover:text-content hover:underline"
			>
				<ArrowLeft className="h-3.5 w-3.5" />
				Voltar ao plano
			</Link>

			<h1 className="mb-6 font-serif text-[24px] font-medium tracking-tight text-content sm:text-[28px]">
				{pageTitle(month)}
			</h1>

			{state.status === "loading" && (
				<div className="flex items-center justify-center py-16">
					<div className="h-6 w-6 animate-spin rounded-full border-2 border-edge-subtle border-t-content" />
				</div>
			)}

			{state.status === "generating" && (
				<div className="rounded-2xl border border-dashed border-edge bg-surface-card/60 p-8 text-center">
					<p className="text-[13px] text-content-muted">
						O plano está sendo gerado. Atualizando em alguns segundos…
					</p>
				</div>
			)}

			{state.status === "missing" && (
				<div className="rounded-2xl border border-dashed border-edge bg-surface-card/60 p-8 text-center">
					<p className="text-[13px] text-content-muted">
						Nenhum plano disponível para este mês.
					</p>
				</div>
			)}

			{state.status === "error" && (
				<div className="rounded-2xl border border-rose-500/30 bg-surface-card/60 p-8 text-center">
					<p className="text-[13px] text-rose-300">{state.error}</p>
				</div>
			)}

			{state.status === "ready" && state.plan?.copyLens && (
				<CopyLens copyLens={state.plan.copyLens} />
			)}

			{state.status === "ready" && !state.plan?.copyLens && (
				<div className="rounded-2xl border border-dashed border-edge bg-surface-card/60 p-8 text-center">
					<p className="text-[13px] text-content-muted">
						Nenhuma análise de framework de copy disponível para este ciclo.
						Auditorias de framework rodam para envs no plano Max com páginas
						comerciais detectadas.
					</p>
				</div>
			)}
		</div>
	);
}
