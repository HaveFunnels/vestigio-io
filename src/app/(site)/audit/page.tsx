"use client";

/**
 * /audit — 3-screen lead form.
 *
 * Screen 1: Domain (no authorization checkbox)
 * Screen 2: Business type (cards, auto-advance)
 * Screen 3: Email → fires mini-audit → redirect to result
 *
 * Revenue uses a sensible default (R$100k). Ticket and conversion
 * model are inferred from business type. This cuts the form from
 * 6 screens to 3 — reducing friction for a "free diagnostic."
 *
 * All anti-bot defenses preserved (token, header, honeypot, dwell
 * time, behavioral score). Logic lives in useLpAuditForm hook.
 */

import {
	StepShell,
	TextInputStep,
	CardSelectionStep,
	SliderInputStep,
} from "@/components/form-steps";
import type { CardOption } from "@/components/form-steps";
import {
	ShoppingCartIcon,
	UsersThreeIcon,
	CloudIcon,
	StackIcon,
	ChartLineUpIcon,
	TargetIcon,
	MagnifyingGlassIcon,
	RocketIcon,
	QuestionIcon,
	ChartLineIcon,
	VideoCameraIcon,
	HandshakeIcon,
	BriefcaseIcon,
	BrainIcon,
	TableIcon,
	XCircleIcon,
	TrendUpIcon,
	WarningIcon,
	CertificateIcon,
	SwordIcon,
	HourglassIcon,
	CompassIcon,
} from "@phosphor-icons/react/dist/ssr";
import useLpAuditForm from "./useLpAuditForm";
import type {
	BusinessType,
	PrimaryConcern,
	CurrentOptimizationMethod,
	WhyNow,
} from "./useLpAuditForm";

// Business model options shown in the audit form. Copy is written in
// the buyer's voice for each segment — small-business owners (contador,
// advogado, dentista, software house) don't think of themselves as
// "service vertical SMB"; they think "eu presto serviço". Labels are
// short and human, descriptions are one short concrete example so the
// visitor picks the right card without having to read jargon.
const BUSINESS_TYPE_OPTIONS: CardOption<BusinessType>[] = [
	{ value: "ecommerce", label: "Loja online", description: "Vendo produtos pela internet", icon: ShoppingCartIcon },
	{ value: "services", label: "Serviços", description: "Presto serviço pro meu cliente", icon: BriefcaseIcon },
	{ value: "lead_gen", label: "Captação de clientes", description: "Capto leads e fecho depois", icon: UsersThreeIcon },
	{ value: "saas", label: "SaaS / Software", description: "Software por assinatura", icon: CloudIcon },
	{ value: "hybrid", label: "Mais de um", description: "Misturo modelos diferentes", icon: StackIcon },
];

const CONCERN_OPTIONS: CardOption<PrimaryConcern>[] = [
	{ value: "traffic_no_sales", label: "Tenho tráfego mas poucas vendas", icon: ChartLineUpIcon },
	{ value: "low_conversion", label: "Minha conversão está abaixo do esperado", icon: TargetIcon },
	{ value: "unknown_leak", label: "Não sei onde estou perdendo dinheiro", icon: MagnifyingGlassIcon },
	{ value: "scale_efficiency", label: "Quero escalar sem desperdiçar orçamento", icon: RocketIcon },
	{ value: "prioritization", label: "Não sei qual gargalo corrigir primeiro", icon: QuestionIcon },
];

const CURRENT_METHOD_OPTIONS: CardOption<CurrentOptimizationMethod>[] = [
	{ value: "analytics_tools", label: "Olhando GA/Mixpanel/Amplitude", icon: ChartLineIcon },
	{ value: "session_replay", label: "Hotjar, FullStory ou outro session replay", icon: VideoCameraIcon },
	{ value: "agency_consultant", label: "Agência ou consultor faz pra gente", icon: HandshakeIcon },
	{ value: "team_judgment", label: "Palpite do time e experiência", icon: BrainIcon },
	{ value: "spreadsheets", label: "Planilhas e análise manual", icon: TableIcon },
	{ value: "nothing", label: "Sinceramente, ainda não sabemos", icon: XCircleIcon },
];

// Step icons for the StepShell progress chip row. Mirrors the
// SCREENS order in useLpAuditForm.
const LP_STEPS = [
	"domain",
	"business_type",
	"revenue",
	"concern",
	"current_method",
	"why_now",
	"email",
] as const;

const WHY_NOW_OPTIONS: CardOption<WhyNow>[] = [
	{ value: "scaling_paid_traffic", label: "Vamos aumentar investimento em mídia", icon: TrendUpIcon },
	{ value: "recent_drop", label: "Algo piorou e não sei o quê", icon: WarningIcon },
	{ value: "prove_roi", label: "Preciso provar ROI / justificar investimento", icon: CertificateIcon },
	{ value: "competitive_pressure", label: "Concorrente está crescendo mais que a gente", icon: SwordIcon },
	{ value: "chronic_pain", label: "Dor crônica que nunca foi resolvida", icon: HourglassIcon },
	{ value: "exploring", label: "Curiosidade — explorando opções", icon: CompassIcon },
];

export default function LpAuditPage() {
	const f = useLpAuditForm();

	return (
		<>
			{/* Honeypot */}
			<div
				aria-hidden="true"
				style={{
					position: "absolute",
					left: "-9999px",
					top: "-9999px",
					width: 1,
					height: 1,
					overflow: "hidden",
				}}
			>
				<label htmlFor="website">Website</label>
				<input
					id="website"
					type="text"
					name="website"
					tabIndex={-1}
					autoComplete="off"
					value={f.honeypot}
					onChange={(e) => f.setHoneypot(e.target.value)}
				/>
			</div>

			<StepShell
				stepIndex={f.stepIndex}
				totalSteps={f.totalSteps}
				onBack={f.prev}
				steps={LP_STEPS}
			>
				{/* ── Screen 1: Domain ── */}
				{f.currentScreen === "domain" && (
					<TextInputStep
						title="Qual site devemos analisar?"
						subtitle="Só analisamos páginas públicas. Nenhum acesso ao seu código ou dados."
						inputType="url"
						value={f.form.domain}
						onChange={(v) => {
							f.update("domain", v);
							f.setDomainWarning(null);
						}}
						placeholder="https://seusite.com.br"
						error={f.fieldError?.field === "domain" ? f.fieldError.message : null}
						warning={
							f.domainWarning ? (
								<>
									{f.domainWarning}{" "}
									<span className="font-medium">Você ainda pode prosseguir.</span>
								</>
							) : undefined
						}
						buttonLabel="Continuar"
						onSubmit={f.next}
						disabled={f.form.domain.length === 0 || f.domainChecking}
						loading={f.domainChecking || f.submitting}
					/>
				)}

				{/* ── Screen 2: Business Type (cards, auto-advance) ── */}
				{f.currentScreen === "business_type" && (
					<CardSelectionStep
						title="Que tipo de negócio é o seu?"
						subtitle="Isso muda como calculamos o impacto financeiro."
						options={BUSINESS_TYPE_OPTIONS}
						onSelect={(v) => {
							f.update("businessModel", v);
							f.next();
						}}
					/>
				)}

				{/* ── Screen 3: Monthly Revenue (slider) ── */}
				{f.currentScreen === "revenue" && (
					<SliderInputStep
						title="Quanto sua operação movimenta por mês?"
						subtitle="Isso calibra os intervalos em reais. Aproximado é suficiente."
						min={5000}
						max={2000000}
						step={5000}
						defaultValue={f.form.monthlyRevenue}
						formatValue={(v) =>
							v >= 1000000
								? `R$ ${(v / 1000000).toFixed(1).replace(".", ",")}M`
								: `R$ ${Math.round(v / 1000)}k`
						}
						onSubmit={(v) => {
							f.update("monthlyRevenue", v);
							f.next();
						}}
						buttonLabel="Continuar"
						loading={f.submitting}
					/>
				)}

				{/* ── Screen 4: Primary Concern (JTBD pain) ── */}
				{f.currentScreen === "concern" && (
					<CardSelectionStep
						title="O que mais te preocupa hoje?"
						subtitle="Vamos priorizar findings ligados a isso."
						options={CONCERN_OPTIONS}
						onSelect={(v) => {
							f.update("primaryConcern", v);
							f.next();
						}}
					/>
				)}

				{/* ── Screen 5: Current Optimization Method (JTBD push) ── */}
				{f.currentScreen === "current_method" && (
					<CardSelectionStep
						title="Como você sabe o que otimizar hoje?"
						subtitle="Sem julgamento — só queremos entender de onde a Vestigio está chegando."
						options={CURRENT_METHOD_OPTIONS}
						onSelect={(v) => {
							f.update("currentOptimizationMethod", v);
							f.next();
						}}
					/>
				)}

				{/* ── Screen 6: Why Now (JTBD pull / urgency) ── */}
				{f.currentScreen === "why_now" && (
					<CardSelectionStep
						title="Por que agora é a hora?"
						subtitle="Algo aconteceu que te trouxe aqui hoje. O que foi?"
						options={WHY_NOW_OPTIONS}
						onSelect={(v) => {
							f.update("whyNow", v);
							f.next();
						}}
					/>
				)}

				{/* ── Screen 7: Email ── */}
				{f.currentScreen === "email" && (
					<TextInputStep
						title="Para onde devemos enviar sua análise?"
						subtitle="Resultado em 60 segundos. Sem spam."
						inputType="email"
						value={f.form.email}
						onChange={(v) => f.update("email", v)}
						placeholder="voce@suaempresa.com"
						error={f.fieldError?.field === "email" ? f.fieldError.message : null}
						buttonLabel="Ver quanto estou perdendo"
						onSubmit={f.next}
						loading={f.submitting}
					/>
				)}

				{/* Global error */}
				{f.globalError && (
					<div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
						{f.globalError}
					</div>
				)}
			</StepShell>
		</>
	);
}
