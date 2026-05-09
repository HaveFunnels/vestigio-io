"use client";

/**
 * /lp/audit — 3-screen lead form.
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
} from "@/components/form-steps";
import type { CardOption } from "@/components/form-steps";
import useLpAuditForm from "./useLpAuditForm";
import type { BusinessType } from "./useLpAuditForm";

const BUSINESS_TYPE_OPTIONS: CardOption<BusinessType>[] = [
	{ value: "ecommerce", label: "Ecommerce", description: "Vendas online diretas" },
	{ value: "lead_gen", label: "Lead Gen", description: "Captura e nutrição de leads" },
	{ value: "saas", label: "SaaS", description: "Software por assinatura" },
	{ value: "hybrid", label: "Híbrido", description: "Modelo misto de negócio" },
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

				{/* ── Screen 3: Email ── */}
				{f.currentScreen === "email" && (
					<TextInputStep
						title="Para onde devemos enviar seu diagnóstico?"
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
