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
	HeartbeatIcon,
	GavelIcon,
	CalculatorIcon,
	CodeIcon,
	MegaphoneIcon,
	ShieldIcon,
	DeviceMobileIcon,
	AppleLogoIcon,
	AndroidLogoIcon,
	BankIcon,
	BuildingsIcon,
	StorefrontIcon,
	FactoryIcon,
	HospitalIcon,
	BroadcastIcon,
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
	ServiceCategory,
	AppPlatform,
	EnterpriseSegment,
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
	{ value: "app_conversion", label: "App mobile", description: "Meu site existe pra levar pro app na Play / App Store", icon: DeviceMobileIcon },
	{ value: "enterprise", label: "Enterprise / B2B", description: "Ciclo de venda longo, decisão em comitê, ACV alto", icon: BuildingsIcon },
	{ value: "hybrid", label: "Mais de um", description: "Misturo modelos diferentes", icon: StackIcon },
];

// Service category options — only shown when the visitor picks
// "services" on the previous step. Labels are buyer-natural (a
// dentista picks "Saúde" because that's how she describes her own
// office), descriptions give a 2-3 example anchor so the visitor
// recognizes themselves immediately. No "vertical" jargon, no
// "B2B / B2C" classification — just "o que vocês fazem".
const SERVICE_CATEGORY_OPTIONS: CardOption<ServiceCategory>[] = [
	{ value: "health", label: "Saúde", description: "Dentista, clínica, médico, fisio, psicólogo", icon: HeartbeatIcon },
	{ value: "legal", label: "Jurídico", description: "Advogado, escritório de advocacia", icon: GavelIcon },
	{ value: "accounting", label: "Contábil / financeiro", description: "Contador, escritório contábil", icon: CalculatorIcon },
	{ value: "software_house", label: "Software house / TI", description: "Desenvolvimento sob demanda, TI especializada", icon: CodeIcon },
	{ value: "marketing_agency", label: "Agência / marketing", description: "Agência, growth, social media, conteúdo", icon: MegaphoneIcon },
	{ value: "consulting", label: "Consultoria", description: "Estratégia, RH, negócios, processos", icon: BrainIcon },
	{ value: "security", label: "Segurança", description: "Vigilância patrimonial, segurança eletrônica", icon: ShieldIcon },
	{ value: "other", label: "Outro tipo", description: "Não me encaixo nas categorias acima", icon: QuestionIcon },
];

// App platform options — only shown when the visitor picks
// "app_conversion" on the previous step. Labels are concrete and
// instantly recognizable; descriptions name the store directly so
// the buyer doesn't have to translate "iOS" → "Apple" etc.
const APP_PLATFORM_OPTIONS: CardOption<AppPlatform>[] = [
	{ value: "ios_only", label: "Só iPhone", description: "App publicado só na App Store", icon: AppleLogoIcon },
	{ value: "android_only", label: "Só Android", description: "App publicado só na Play Store", icon: AndroidLogoIcon },
	{ value: "both", label: "iPhone e Android", description: "Publicado nas duas lojas", icon: DeviceMobileIcon },
];

// Enterprise segment options — shown only after the visitor picks
// "enterprise" on the business-type step. Technical jargon is OK
// here (audience: CTO / Head of Growth / Revenue Ops / CISO).
const ENTERPRISE_SEGMENT_OPTIONS: CardOption<EnterpriseSegment>[] = [
	{ value: "fintech", label: "Fintech / banking", description: "BaaS, payments, lending, crypto, insurtech", icon: BankIcon },
	{ value: "insurance", label: "Seguradora", description: "Seguros, previdência, planos de saúde", icon: HospitalIcon },
	{ value: "retail_chain", label: "Varejo / e-commerce de escala", description: "Rede de varejo, marketplace, D2C scaled", icon: StorefrontIcon },
	{ value: "industrial", label: "Indústria / logística", description: "Manufatura, supply chain, distribuição", icon: FactoryIcon },
	{ value: "healthcare", label: "Healthcare / operadora", description: "Operadora de saúde, rede hospitalar, healthtech", icon: HospitalIcon },
	{ value: "telecom", label: "Telecom / ISP", description: "Operadora de telecom, provedor de internet", icon: BroadcastIcon },
	{ value: "other_enterprise", label: "Outro segmento enterprise", description: "Não me encaixo nas categorias acima", icon: QuestionIcon },
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

// Step keys for the StepShell progress chip row. Mirrors the
// SCREENS order in useLpAuditForm. Two variants: the canonical
// 7-step flow and the 8-step variants when the visitor picks one
// of the Wave-22.7 verticals (services / app_conversion /
// enterprise) and goes through a sub-segmentation sub-step.
const LP_STEPS_BASE = [
	"domain",
	"business_type",
	"revenue",
	"concern",
	"current_method",
	"why_now",
	"email",
] as const;
const LP_STEPS_SERVICES = [
	"domain",
	"business_type",
	"service_category",
	"revenue",
	"concern",
	"current_method",
	"why_now",
	"email",
] as const;
const LP_STEPS_APP_CONVERSION = [
	"domain",
	"business_type",
	"app_platform",
	"revenue",
	"concern",
	"current_method",
	"why_now",
	"email",
] as const;
const LP_STEPS_ENTERPRISE = [
	"domain",
	"business_type",
	"enterprise_segment",
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

	// Pick the step labels list matching the visitor's vertical so
	// the progress chip row stays aligned with the actual screen
	// they're on. computeScreens in useLpAuditForm is the source of
	// truth for navigation; this list just mirrors its visual labels.
	const stepLabels =
		f.form.businessModel === "services"
			? LP_STEPS_SERVICES
			: f.form.businessModel === "app_conversion"
				? LP_STEPS_APP_CONVERSION
				: f.form.businessModel === "enterprise"
					? LP_STEPS_ENTERPRISE
					: LP_STEPS_BASE;

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
				steps={stepLabels}
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

				{/* ── Screen 2b (services only): Service category ──
				    Conditional follow-up to business_type. Shown
				    automatically by the navigation layer when the
				    visitor picked "services" on screen 2. Plain-
				    language labels (Saúde / Jurídico / Contábil /
				    etc.) so the buyer recognizes themselves in
				    half a glance. */}
				{f.currentScreen === "service_category" && (
					<CardSelectionStep
						title="O que vocês fazem?"
						subtitle="Escolha o que mais se aproxima — usamos isso pra calibrar a análise."
						options={SERVICE_CATEGORY_OPTIONS}
						onSelect={(v) => {
							f.update("serviceCategory", v);
							f.next();
						}}
					/>
				)}

				{/* ── Screen 2b (app_conversion only): Platform pick ──
				    Determines which mobile-specific detectors fire.
				    iOS-only sites need Smart App Banner; Android-only
				    need App Links setup; both-platform sites need
				    smart-banner-with-fallback. */}
				{f.currentScreen === "app_platform" && (
					<CardSelectionStep
						title="Em qual loja o seu app está?"
						subtitle="Diferentes lojas pedem ajustes diferentes no site pra puxar mais install."
						options={APP_PLATFORM_OPTIONS}
						onSelect={(v) => {
							f.update("appPlatform", v);
							f.next();
						}}
					/>
				)}

				{/* ── Screen 2b (enterprise only): Vertical pick ──
				    Gates compliance / regulatory / industry-specific
				    enterprise detectors. Audience is technical (CTO /
				    CISO / Head of Growth) so the labels and
				    descriptions can use industry jargon. */}
				{f.currentScreen === "enterprise_segment" && (
					<CardSelectionStep
						title="Qual o segmento da empresa?"
						subtitle="Drives which compliance, regulatory and trust signals we evaluate."
						options={ENTERPRISE_SEGMENT_OPTIONS}
						onSelect={(v) => {
							f.update("enterpriseSegment", v);
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
