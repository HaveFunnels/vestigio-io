"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/libs/utils";
import { Check, X } from "lucide-react";

// --- Types ---

type BillingCycle = "monthly" | "annually";

interface Feature {
	name: string;
	isIncluded: boolean;
	tooltip?: string;
}

interface PriceTier {
	id: string;
	name: string;
	description: string;
	priceMonthly: number;
	priceAnnually: number;
	isPopular: boolean;
	isCurrent?: boolean;
	buttonLabel: string;
	features: Feature[];
}

interface PricingComponentProps {
	plans: [PriceTier, PriceTier, PriceTier];
	billingCycle: BillingCycle;
	onCycleChange: (cycle: BillingCycle) => void;
	onPlanSelect: (planId: string, cycle: BillingCycle) => void;
	heading?: string;
	subheading?: string;
	className?: string;
	currencySymbol?: string;
	/**
	 * Show the Monthly/Annual toggle. Defaults to false because no plan
	 * ships with an annual Paddle price ID yet — keeping the toggle on
	 * lets users pick "Annual", see the discounted price + "Save X%",
	 * then get billed at the monthly rate. Flip back to true once
	 * `paddleAnnualPriceId` is wired through `/api/pricing` and
	 * `handlePlanSelect` in the billing page picks the right priceId
	 * based on the cycle.
	 */
	annualPricingEnabled?: boolean;
}

// --- Feature Row ---

const FeatureItem: React.FC<{ feature: Feature }> = ({ feature }) => {
	const Icon = feature.isIncluded ? Check : X;
	const [showTooltip, setShowTooltip] = useState(false);

	return (
		<li className='flex items-start gap-3 py-1.5'>
			<Icon
				className={cn(
					"mt-0.5 h-4 w-4 shrink-0",
					feature.isIncluded ? "text-emerald-400" : "text-zinc-600"
				)}
			/>
			<span
				className={cn(
					"text-sm",
					feature.isIncluded ? "text-zinc-200" : "text-zinc-500 line-through"
				)}
			>
				{feature.name}
				{feature.tooltip && (
					<span
						className='relative ml-1.5 inline-block'
						onMouseEnter={() => setShowTooltip(true)}
						onMouseLeave={() => setShowTooltip(false)}
					>
						<span className='inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-zinc-700 text-[9px] leading-none text-zinc-600'>
							+
						</span>
						{showTooltip && (
							<span className='absolute bottom-full left-1/2 z-50 mb-2 w-52 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs leading-relaxed text-zinc-300 shadow-lg'>
								{feature.tooltip}
								{/* Arrow */}
								<span className='absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-700'>
									<span className='absolute -top-[5px] left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-800' />
								</span>
							</span>
						)}
					</span>
				)}
			</span>
		</li>
	);
};

// --- Animated Price ---

function AnimatedPrice({ value }: { value: number }) {
	const [display, setDisplay] = useState(value);
	const frameRef = useRef<number | null>(null);
	const startRef = useRef(display);
	const startTimeRef = useRef(0);

	useEffect(() => {
		if (value === display) return;
		startRef.current = display;
		startTimeRef.current = performance.now();
		const duration = 400;

		function tick(now: number) {
			const elapsed = now - startTimeRef.current;
			const progress = Math.min(elapsed / duration, 1);
			// ease-out cubic
			const eased = 1 - Math.pow(1 - progress, 3);
			const current = Math.round(
				startRef.current + (value - startRef.current) * eased
			);
			setDisplay(current);
			if (progress < 1) {
				frameRef.current = requestAnimationFrame(tick);
			}
		}

		frameRef.current = requestAnimationFrame(tick);
		return () => {
			if (frameRef.current) cancelAnimationFrame(frameRef.current);
		};
	}, [value]);

	return <>{display}</>;
}

// --- Main Component ---

export default function PricingComponent({
	plans,
	billingCycle,
	onCycleChange,
	onPlanSelect,
	heading = "Veja exatamente o que est\u00e1 perdendo. Corrija. Escale.",
	subheading = "Intelig\u00eancia que se paga sozinha. Comece gr\u00e1tis, evolua quando quiser.",
	className,
	currencySymbol = "$",
	annualPricingEnabled = false,
}: PricingComponentProps) {
	const annualDiscountPercent = 20;
	const allFeatures = Array.from(
		new Set(plans.flatMap((p) => p.features.map((f) => f.name)))
	);

	return (
		<div className={cn("w-full py-16 md:py-24", className)}>
			{/* Header */}
			<div className='mx-auto mb-10 max-w-2xl px-4 text-center'>
				<h2 className='text-3xl font-bold tracking-tight text-white sm:text-4xl'>
					{heading}
				</h2>
				<p className='mt-3 text-base text-zinc-400'>{subheading}</p>
			</div>

			{/* Cycle Toggle — only shown when annual SKUs are wired
			    end-to-end. Otherwise users would pick "Annual", see the
			    discount, and be billed monthly. */}
			{annualPricingEnabled && (
				<div className='mb-12 flex flex-col items-center gap-2'>
					<div className='relative inline-flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-1'>
						{/* Sliding highlight */}
						<div
							className='absolute bottom-1 top-1 rounded-md bg-white/10 shadow-sm transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]'
							style={{
								left: billingCycle === "monthly" ? "4px" : "50%",
								width: "calc(50% - 4px)",
							}}
						/>
						<button
							onClick={() => onCycleChange("monthly")}
							className={cn(
								"relative z-10 rounded-md px-5 py-2 text-sm font-medium transition-colors duration-200",
								billingCycle === "monthly"
									? "text-white"
									: "text-zinc-400 hover:text-zinc-200"
							)}
						>
							Monthly
						</button>
						<button
							onClick={() => onCycleChange("annually")}
							className={cn(
								"relative z-10 rounded-md px-5 py-2 text-sm font-medium transition-colors duration-200",
								billingCycle === "annually"
									? "text-white"
									: "text-zinc-400 hover:text-zinc-200"
							)}
						>
							Annually
						</button>
					</div>
					{/* Save badge — below the toggle, fades in on annual */}
					<span
						className={cn(
							"rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400 transition-all duration-300",
							billingCycle === "annually"
								? "translate-y-0 opacity-100"
								: "-translate-y-1 opacity-0"
						)}
					>
						{annualDiscountPercent}% off
					</span>
				</div>
			)}

			{/* Cards */}
			<div className='mx-auto grid max-w-[1170px] gap-6 px-4 sm:px-8 md:grid-cols-3 xl:px-0'>
				{plans.map((plan) => {
					const price =
						billingCycle === "monthly" ? plan.priceMonthly : plan.priceAnnually;
					const suffix = billingCycle === "monthly" ? "/mês" : "/ano";

					return (
						<div
							key={plan.id}
							className={cn(
								"group relative flex flex-col rounded-2xl border p-6 transition-all duration-300",
								plan.isPopular
									? "border-emerald-500/50 bg-emerald-500/[0.06] pt-8 shadow-[0_12px_40px_-16px_rgba(16,185,129,0.4)] md:scale-[1.03]"
									: "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
							)}
						>
							{/* Subtle gradient highlight on the popular card — same
                  vocabulary as the dashboard's accent layers */}
							{plan.isPopular && (
								<div
									className='pointer-events-none absolute inset-0 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/[0.06] via-transparent to-transparent'
									aria-hidden
								/>
							)}

							{/* Popular badge */}
							{plan.isPopular && (
								<span className='absolute -top-3 left-6 rounded-full border border-emerald-400/40 bg-emerald-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_4px_16px_-4px_rgba(16,185,129,0.6)]'>
									Mais escolhido
								</span>
							)}

							{/* Current plan badge */}
							{plan.isCurrent && (
								<span className='absolute -top-3 right-6 rounded-full border border-white/20 bg-white/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300'>
									Plano atual
								</span>
							)}

							{/* Name & description */}
							<h3 className='relative text-xl font-bold text-white'>
								{plan.name}
							</h3>
							<p className='relative mt-1 text-sm text-zinc-400'>
								{plan.description}
							</p>

							{/* Price — JetBrains Mono + tabular-nums so digits never
                  jitter as the AnimatedPrice morphs between monthly
                  and annual values */}
							<div className='relative mt-5'>
								<span className='font-mono text-4xl font-medium tabular-nums tracking-tight text-white'>
									{currencySymbol}<AnimatedPrice value={price} />
								</span>
								<span className='ml-1 font-mono text-xs text-zinc-400'>
									{suffix}
								</span>
								<p
									className={cn(
										"mt-1 font-mono text-xs tabular-nums text-zinc-500 line-through transition-all duration-300",
										billingCycle === "annually"
											? "h-4 opacity-100"
											: "h-0 opacity-0"
									)}
								>
									{currencySymbol}{plan.priceMonthly}/mês
								</p>
							</div>

							{/* CTA */}
							<button
								onClick={() => onPlanSelect(plan.id, billingCycle)}
								disabled={plan.isCurrent}
								className={cn(
									"relative mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
									plan.isCurrent
										? "cursor-default border border-white/10 bg-white/[0.04] text-zinc-500"
										: plan.isPopular
											? "bg-emerald-500 text-white shadow-[0_8px_24px_-12px_rgba(16,185,129,0.7)] hover:bg-emerald-400"
											: "border border-white/15 bg-white/[0.04] text-white hover:border-white/25 hover:bg-white/[0.08]"
								)}
							>
								{plan.isCurrent ? "Plano atual" : plan.buttonLabel}
							</button>

							{/* Features */}
							<div className='relative mt-6 border-t border-white/10 pt-5'>
								<p className='mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500'>
									O que entra
								</p>
								<ul>
									{plan.features.map((f) => (
										<FeatureItem key={f.name} feature={f} />
									))}
								</ul>
							</div>
						</div>
					);
				})}
			</div>

			{/* Legend — loss-frame anchor under the grid. Declarative
			    rhythm to match Fraunces editorial cadence used elsewhere
			    on the homepage. */}
			<p className='mx-auto mt-8 max-w-[1170px] px-4 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500 sm:px-8 xl:px-0'>
				Um Plano por mês. Um vazamento identificado paga o Starter.
			</p>

			{/* Comparison Table (desktop) */}
			<div className='mx-auto mt-16 hidden max-w-[1170px] px-4 sm:px-8 md:block xl:px-0'>
				<h3 className='mb-6 text-center text-xl font-bold text-white'>
					Comparação completa
				</h3>
				<div className='overflow-hidden rounded-xl border border-zinc-800'>
					<table className='w-full'>
						<thead>
							<tr className='border-b border-zinc-800 bg-zinc-900/50'>
								<th className='px-6 py-4 text-left text-sm font-semibold text-zinc-400'>
									Item
								</th>
								{plans.map((plan) => (
									<th
										key={plan.id}
										className={cn(
											"px-6 py-4 text-center text-sm font-semibold",
											plan.isPopular
												? "bg-emerald-500/5 text-emerald-400"
												: "text-zinc-400"
										)}
									>
										{plan.name}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{allFeatures.map((name, i) => (
								<tr
									key={name}
									className={cn(
										"border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30",
										i % 2 === 0 ? "bg-transparent" : "bg-zinc-900/20"
									)}
								>
									<td className='px-6 py-3 text-sm text-zinc-300'>{name}</td>
									{plans.map((plan) => {
										const included = plan.features.find(
											(f) => f.name === name
										)?.isIncluded;
										const Icon = included ? Check : X;
										return (
											<td
												key={`${plan.id}-${name}`}
												className={cn(
													"px-6 py-3 text-center",
													plan.isPopular && "bg-emerald-500/5"
												)}
											>
												<Icon
													className={cn(
														"mx-auto h-4 w-4",
														included ? "text-emerald-400" : "text-zinc-700"
													)}
												/>
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}

// --- API → PriceTier transformer ---

export interface PublicPlanConfig {
	key: string;
	label: string;
	monthlyPriceCents: number;
	maxMcpCalls: number;
	continuousAudits: boolean;
	creditsEnabled: boolean;
	maxEnvironments: number;
	maxMembers: number;
}

const PLAN_DESCRIPTIONS: Record<string, string> = {
	vestigio: "1 domínio, análise contínua, 1 Plano de Estratégia por mês.",
	pro: "Análise mais funda, benchmark do seu setor, conversa sobre o Plano.",
	max: "3 Lens, histórico entre meses, ativação com o time.",
};

const PLAN_CTA: Record<string, string> = {
	vestigio: "Começar",
	pro: "Escolher Pro",
	max: "Começar",
};

/** Derive feature list from admin-configured plan features, or fall back to legacy logic */
function buildFeatures(
	plan: PublicPlanConfig,
	allPlans: PublicPlanConfig[]
): Feature[] {
	// If admin has configured features via platform config, use them directly
	if ((plan as any).features && Array.isArray((plan as any).features)) {
		return (plan as any).features.map((f: any) => ({
			name: f.name,
			isIncluded: f.included,
		}));
	}

	// Legacy fallback: derive features from plan limits
	const tierIndex = allPlans.indexOf(plan);
	const isTop = tierIndex === allPlans.length - 1;
	const isMid = tierIndex === 1;

	const envLabel =
		plan.maxEnvironments >= 100
			? "Domínios ilimitados"
			: `${plan.maxEnvironments} domínio${plan.maxEnvironments > 1 ? "s" : ""}`;
	const memberLabel =
		plan.maxMembers >= 100
			? "Lugares ilimitados"
			: `${plan.maxMembers} lugar${plan.maxMembers > 1 ? "es" : ""} na conta`;

	return [
		{ name: envLabel, isIncluded: true },
		{ name: memberLabel, isIncluded: true },
		{
			name: "Análise contínua",
			isIncluded: true,
			tooltip: "Findings em tempo real, sempre que o engine detecta um vazamento",
		},
		{
			name: "1 Plano de Estratégia por mês",
			isIncluded: true,
			tooltip: "Documento editorial assinado ao fim do ciclo mensal — o wow do Vestigio",
		},
		{ name: "Framework Lens", isIncluded: true, tooltip: "Lente que traduz o site em framework de decisão do buyer" },
		{
			name: "Buyer Trust Lens",
			isIncluded: isMid || isTop,
			tooltip: "Lente que analisa sinais de confiança do buyer no funil",
		},
		{
			name: "Lens comportamental",
			isIncluded: isTop,
			tooltip: "Lente que lê padrões de comportamento do buyer no site",
		},
		{
			name: "R$/finding (ROI por achado)",
			isIncluded: isMid || isTop,
			tooltip: "Cada finding com o impacto financeiro estimado no Plano",
		},
		{
			name: "Benchmark vs Vestigio Index",
			isIncluded: isMid || isTop,
			tooltip: "Comparação com o seu setor + porte no índice público Vestigio",
		},
		{
			name: "Conversar com o Plano",
			isIncluded: isMid || isTop,
			tooltip: "Chat ancorado no Plano do mês — pergunte, investigue, edite",
		},
		{
			name: "Histórico e comparação entre meses",
			isIncluded: isTop,
			tooltip: "Compare o Plano deste mês com meses anteriores",
		},
		{
			name: "Ativação com o time Vestigio",
			isIncluded: isTop,
			tooltip: "Onboarding assistido: leitura conjunta do primeiro Plano",
		},
		{
			name: isMid || isTop ? "Suporte prioritário" : "Suporte por email",
			isIncluded: true,
		},
	];
}

/** Transform API plan configs into PriceTier array for the pricing card */
export function planConfigsToPriceTiers(
	configs: PublicPlanConfig[]
): [PriceTier, PriceTier, PriceTier] | null {
	if (configs.length < 3) return null;

	const plans = configs.slice(0, 3);
	return plans.map((cfg, i) => {
		const monthly = Math.round(cfg.monthlyPriceCents / 100);
		const annually = Math.round(monthly * 12 * 0.8); // 20% annual discount
		return {
			id: cfg.key,
			name: cfg.label,
			description: PLAN_DESCRIPTIONS[cfg.key] || cfg.label,
			priceMonthly: monthly,
			priceAnnually: annually,
			isPopular: i === 1,
			buttonLabel: PLAN_CTA[cfg.key] || "Get Started",
			features: buildFeatures(cfg, plans),
		};
	}) as [PriceTier, PriceTier, PriceTier];
}

// --- Hook to fetch pricing from API ---

export function usePricingPlans() {
	const [plans, setPlans] = useState<[PriceTier, PriceTier, PriceTier] | null>(
		null
	);
	const [loading, setLoading] = useState(true);
	const [currencySymbol, setCurrencySymbol] = useState("$");
	// True once every plan has a synced Paddle annual price ID. The
	// home Pricing component uses this to decide whether to render the
	// Monthly/Annual toggle: showing "Save 20%" while the annual ID is
	// missing would mislead the visitor — the billing page would silently
	// fall back to monthly on checkout (the original #5 bug).
	const [annualReady, setAnnualReady] = useState(false);

	React.useEffect(() => {
		function computeAnnualReady(raw: any[]): boolean {
			return (
				Array.isArray(raw) &&
				raw.length > 0 &&
				raw.every((p) => !!p.paddleAnnualPriceId)
			);
		}
		// Try localized prices first, fall back to standard pricing
		fetch("/api/pricing-preview")
			.then((r) => r.json())
			.then((data) => {
				const tiers = planConfigsToPriceTiers(data.plans);
				if (tiers) setPlans(tiers);
				if (data.currencySymbol) setCurrencySymbol(data.currencySymbol);
				setAnnualReady(computeAnnualReady(data.plans));
			})
			.catch(() => {
				// Fallback to non-localized pricing
				fetch("/api/pricing")
					.then((r) => r.json())
					.then((data) => {
						const tiers = planConfigsToPriceTiers(data.plans);
						if (tiers) setPlans(tiers);
						setAnnualReady(computeAnnualReady(data.plans));
					})
					.catch(() => {});
			})
			.finally(() => setLoading(false));
	}, []);

	return { plans, loading, currencySymbol, annualReady };
}

// --- Static fallback (used only if API is unavailable) ---

// Shared feature-name catalog. Every plan lists the same names in
// the same order so the desktop comparison table renders a clean
// grid (each row = one feature, each column = one plan, ✓ or ✗).
// Scalar limits (domains, seats) get their own row per plan since
// the UI has no "value-per-tier" slot — accepted trade-off.
const TOOLTIPS = {
	continua: "Findings em tempo real, sempre que o engine detecta um vazamento",
	plano: "Documento editorial assinado ao fim do ciclo mensal — o wow do Vestigio",
	frameworkLens: "Lente que traduz o site em framework de decisão do buyer",
	buyerTrust: "Lente que analisa sinais de confiança do buyer no funil",
	comportamental: "Lente que lê padrões de comportamento do buyer no site",
	rsPerFinding: "Cada finding com o impacto financeiro estimado no Plano",
	benchmark: "Comparação com o seu setor + porte no índice público Vestigio",
	conversar: "Chat ancorado no Plano do mês — pergunte, investigue, edite",
	historico: "Compare o Plano deste mês com meses anteriores",
	ativacao: "Onboarding assistido: leitura conjunta do primeiro Plano",
} as const;

export const FALLBACK_PLANS: [PriceTier, PriceTier, PriceTier] = [
	{
		id: "vestigio",
		name: "Starter",
		description: PLAN_DESCRIPTIONS.vestigio,
		priceMonthly: 99,
		priceAnnually: 950,
		isPopular: false,
		buttonLabel: PLAN_CTA.vestigio,
		features: [
			{ name: "1 domínio", isIncluded: true },
			{ name: "1 lugar na conta", isIncluded: true },
			{ name: "Análise contínua", isIncluded: true, tooltip: TOOLTIPS.continua },
			{ name: "1 Plano de Estratégia por mês", isIncluded: true, tooltip: TOOLTIPS.plano },
			{ name: "Exportação PDF + link de compartilhamento", isIncluded: true },
			{ name: "Framework Lens", isIncluded: true, tooltip: TOOLTIPS.frameworkLens },
			{ name: "Buyer Trust Lens", isIncluded: false, tooltip: TOOLTIPS.buyerTrust },
			{ name: "Lens comportamental", isIncluded: false, tooltip: TOOLTIPS.comportamental },
			{ name: "R$/finding (ROI por achado)", isIncluded: false, tooltip: TOOLTIPS.rsPerFinding },
			{ name: "Benchmark vs Vestigio Index", isIncluded: false, tooltip: TOOLTIPS.benchmark },
			{ name: "Conversar com o Plano", isIncluded: false, tooltip: TOOLTIPS.conversar },
			{ name: "Histórico e comparação entre meses", isIncluded: false, tooltip: TOOLTIPS.historico },
			{ name: "Ativação com o time Vestigio", isIncluded: false, tooltip: TOOLTIPS.ativacao },
			{ name: "Suporte por email", isIncluded: true },
		],
	},
	{
		id: "pro",
		name: "Pro",
		description: PLAN_DESCRIPTIONS.pro,
		priceMonthly: 199,
		priceAnnually: 1910,
		isPopular: true,
		buttonLabel: PLAN_CTA.pro,
		features: [
			{ name: "3 domínios", isIncluded: true },
			{ name: "3 lugares na conta", isIncluded: true },
			{ name: "Análise contínua", isIncluded: true, tooltip: TOOLTIPS.continua },
			{ name: "1 Plano de Estratégia por mês", isIncluded: true, tooltip: TOOLTIPS.plano },
			{ name: "Exportação PDF + link de compartilhamento", isIncluded: true },
			{ name: "Framework Lens", isIncluded: true, tooltip: TOOLTIPS.frameworkLens },
			{ name: "Buyer Trust Lens", isIncluded: true, tooltip: TOOLTIPS.buyerTrust },
			{ name: "Lens comportamental", isIncluded: false, tooltip: TOOLTIPS.comportamental },
			{ name: "R$/finding (ROI por achado)", isIncluded: true, tooltip: TOOLTIPS.rsPerFinding },
			{ name: "Benchmark vs Vestigio Index", isIncluded: true, tooltip: TOOLTIPS.benchmark },
			{ name: "Conversar com o Plano", isIncluded: true, tooltip: TOOLTIPS.conversar },
			{ name: "Histórico e comparação entre meses", isIncluded: false, tooltip: TOOLTIPS.historico },
			{ name: "Ativação com o time Vestigio", isIncluded: false, tooltip: TOOLTIPS.ativacao },
			{ name: "Suporte prioritário", isIncluded: true },
		],
	},
	{
		id: "max",
		name: "Max",
		description: PLAN_DESCRIPTIONS.max,
		priceMonthly: 399,
		priceAnnually: 3830,
		isPopular: false,
		buttonLabel: PLAN_CTA.max,
		features: [
			{ name: "10 domínios", isIncluded: true },
			{ name: "10 lugares na conta", isIncluded: true },
			{ name: "Análise contínua", isIncluded: true, tooltip: TOOLTIPS.continua },
			{ name: "1 Plano de Estratégia por mês", isIncluded: true, tooltip: TOOLTIPS.plano },
			{ name: "Exportação PDF + link de compartilhamento", isIncluded: true },
			{ name: "Framework Lens", isIncluded: true, tooltip: TOOLTIPS.frameworkLens },
			{ name: "Buyer Trust Lens", isIncluded: true, tooltip: TOOLTIPS.buyerTrust },
			{ name: "Lens comportamental", isIncluded: true, tooltip: TOOLTIPS.comportamental },
			{ name: "R$/finding (ROI por achado)", isIncluded: true, tooltip: TOOLTIPS.rsPerFinding },
			{ name: "Benchmark vs Vestigio Index", isIncluded: true, tooltip: TOOLTIPS.benchmark },
			{ name: "Conversar com o Plano", isIncluded: true, tooltip: TOOLTIPS.conversar },
			{ name: "Histórico e comparação entre meses", isIncluded: true, tooltip: TOOLTIPS.historico },
			{ name: "Ativação com o time Vestigio", isIncluded: true, tooltip: TOOLTIPS.ativacao },
			{ name: "Suporte prioritário", isIncluded: true },
		],
	},
];

export type { PriceTier, BillingCycle, Feature, PricingComponentProps };
