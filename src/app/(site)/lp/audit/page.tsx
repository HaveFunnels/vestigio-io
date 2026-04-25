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
						title="Qual domínio devemos diagnosticar?"
						subtitle="Só analisamos a landing page pública."
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
								Eu sou dono ou tenho autorização para analisar este domínio
							</span>
						</label>
					</TextInputStep>
				)}

				{/* ── Business Type (cards) ── */}
				{f.currentScreen === "business_type" && (
					<CardSelectionStep
						title="Que tipo de negócio?"
						subtitle="Para adaptarmos o diagnóstico ao seu modelo."
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
						title="Como seus clientes convertem?"
						subtitle="Isso determina quais caminhos analisamos."
						options={CONVERSION_OPTIONS}
						onSelect={(v) => {
							f.update("conversionModel", v);
							f.next();
						}}
					/>
				)}

				{/* ── Revenue ── */}
				{f.currentScreen === "revenue" && (
					<TextInputStep
						title="Qual sua receita mensal aproximada?"
						subtitle="Usamos isso para dimensionar o impacto financeiro no diagnóstico."
						value={f.form.monthlyRevenue}
						onChange={(v) => f.update("monthlyRevenue", v)}
						placeholder="ex: R$50k"
						hint="Você pode digitar R$50k, 1.5m, ou só um número."
						error={f.fieldError?.field === "monthlyRevenue" ? f.fieldError.message : null}
						buttonLabel="Continuar"
						onSubmit={f.next}
						loading={f.submitting}
					/>
				)}

				{/* ── Email ── */}
				{f.currentScreen === "email" && (
					<TextInputStep
						title="Onde devemos enviar seus resultados?"
						subtitle="Digite seu email para ver o diagnóstico."
						inputType="email"
						value={f.form.email}
						onChange={(v) => f.update("email", v)}
						placeholder="voce@suaempresa.com"
						error={f.fieldError?.field === "email" ? f.fieldError.message : null}
						buttonLabel="Ver meus resultados"
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
