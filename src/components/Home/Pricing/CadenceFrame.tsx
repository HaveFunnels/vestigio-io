"use client";

/**
 * CadenceFrame — handles the "why monthly Plano, not real-time alerts?"
 * objection that the Pricing heading ("Um Plano de Estratégia por mês.")
 * triggers in cold/comparison-mode visitors.
 *
 * The buyer's reflex: "in 2026 everything is real-time — a monthly
 * cadence feels old." The honest answer: real-time is for the engine
 * (findings appear as the analysis runs); the monthly Plano is for the
 * human decision moment. Stream != decision.
 *
 * Editorial register: small eyebrow + Fraunces italic pull-statement +
 * short sans body. Sits between the pricing tiers and the social proof
 * row so the objection lands before the rationale-via-others.
 */

import { useTranslations } from "next-intl";

export default function CadenceFrame() {
	const t = useTranslations("homepage.pricing_cadence");

	return (
		<div className="border-t border-edge bg-[#080812] py-12 sm:py-16 lg:py-20">
			<div className="mx-auto max-w-[680px] px-4 text-center sm:px-8">
				<div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-content-faint">
					{t("eyebrow")}
				</div>
				<p className="font-serif text-[20px] italic leading-[1.4] text-zinc-100 sm:text-[24px] lg:text-[28px]">
					{t("statement")}
				</p>
				<p className="mx-auto mt-5 max-w-[520px] text-[14px] leading-relaxed text-content-muted sm:text-[15px]">
					{t("body")}
				</p>
			</div>
		</div>
	);
}
