"use client";

/**
 * /lp/audit — premium one-question-per-screen lead form.
 *
 * Screen 1: Domain + ownership
 * Screen 2: Business type (cards, auto-advance)
 * Screen 3: Conversion model (cards, auto-advance)
 * Screen 4: Monthly revenue
 * Screen 5: Email → fires mini-audit → redirect to result
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
import useLpAuditForm from "./useLpAuditForm";
import type { BusinessType, ConversionModel } from "./useLpAuditForm";

const BUSINESS_TYPE_OPTIONS: CardOption<BusinessType>[] = [
	{ value: "ecommerce", label: "Ecommerce", description: "Vendas online diretas" },
	{ value: "lead_gen", label: "Lead Gen", description: "Captura e nutrição de leads" },
	{ value: "saas", label: "SaaS", description: "Software por assinatura" },
	{ value: "hybrid", label: "Híbrido", description: "Modelo misto de negócio" },
];

const CONVERSION_OPTIONS: CardOption<ConversionModel>[] = [
	{ value: "checkout", label: "Checkout", description: "Compra online no site" },
	{ value: "whatsapp", label: "WhatsApp / Chat", description: "Vendas via mensagem" },
	{ value: "form", label: "Formulário", description: "Formulários de captura" },
	{ value: "external", label: "Externo", description: "Redirecionamento para pagamento externo" },
];

export default function LpAuditPage() {
	const f = useLpAuditForm();

	return (
		<>
			{/* Additional field */}
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
			>
				{/* ── Domain ── */}
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
						disabled={
							f.form.domain.length === 0 ||
							!f.form.ownershipConfirmed ||
							f.domainChecking
						}
						loading={f.domainChecking || f.submitting}
					>
						<label className="flex cursor-pointer items-center gap-3">
							<div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
								<input
									type="checkbox"
									checked={f.form.ownershipConfirmed}
									onChange={(e) => f.update("ownershipConfirmed", e.target.checked)}
									className="peer sr-only"
								/>
								<div className="h-5 w-5 rounded-md border-2 border-zinc-300 bg-white transition-colors peer-checked:border-zinc-900 peer-checked:bg-zinc-900 peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-400 peer-focus-visible:ring-offset-2" />
								<svg
									viewBox="0 0 12 12"
									fill="none"
									stroke="white"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									className="pointer-events-none absolute h-3 w-3 opacity-0 transition-opacity peer-checked:opacity-100"
								>
									<path d="M2.5 6L5 8.5L9.5 3.5" />
								</svg>
							</div>
							<span className="text-xs text-zinc-500">
								Tenho autorização para analisar este site
							</span>
						</label>
					</TextInputStep>
				)}

				{/* ── Business Type (cards) ── */}
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

				{/* ── Conversion Model (cards) ── */}
				{f.currentScreen === "conversion_model" && (
					<CardSelectionStep
						title="Como seus clientes compram?"
						subtitle="Analisamos os caminhos que levam à conversão."
						options={CONVERSION_OPTIONS}
						onSelect={(v) => {
							f.update("conversionModel", v);
							f.next();
						}}
					/>
				)}

				{/* ── Revenue (slider) ── */}
				{f.currentScreen === "revenue" && (
					<SliderInputStep
						title="Qual sua receita mensal?"
						subtitle="Para calcular quanto você pode estar perdendo."
						min={5000}
						max={10000000}
						step={5000}
						defaultValue={f.form.monthlyRevenue}
						formatValue={(v) => `R$${v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${Math.round(v / 1000)}k`}`}
						minLabel="R$5k"
						maxLabel="R$10M"
						buttonLabel="Continuar"
						onSubmit={(v) => {
							f.update("monthlyRevenue", v);
							f.next();
						}}
					/>
				)}

				{/* ── Average Ticket (slider) ── */}
				{f.currentScreen === "ticket" && (
					<SliderInputStep
						title="Qual o valor médio de cada venda?"
						subtitle="Quanto maior o ticket, maior o impacto de cada vazamento."
						min={20}
						max={40000}
						step={10}
						defaultValue={f.form.averageTicket}
						formatValue={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
						minLabel="R$20"
						maxLabel="R$40k"
						buttonLabel="Continuar"
						onSubmit={(v) => {
							f.update("averageTicket", v);
							f.next();
						}}
					/>
				)}

				{/* ── Email ── */}
				{f.currentScreen === "email" && (
					<TextInputStep
						title="Para onde devemos enviar seu diagnóstico inicial?"
						subtitle="Digite seu melhor e-mail."
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
