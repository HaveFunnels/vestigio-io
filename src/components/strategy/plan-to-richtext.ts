import type { StrategyPlan } from "./types";
import { fmtCurrencyUnits } from "@/lib/format-currency";

// ──────────────────────────────────────────────
// plan-to-richtext — serialize a StrategyPlan into a clipboard-ready
// pair of HTML + plain text. Used by the "share" button to copy the
// plan structure into email/Slack/Notion with bold, headers and
// proper spacing preserved.
//
// Tradeoff: not a full re-export of every section (too verbose for
// inline paste). Captures the executive surface — thesis + hero
// metrics + top 5 next steps with impact + footer link. Anyone who
// needs the full read clicks the link at the bottom.
// ──────────────────────────────────────────────

const MONTH_NAMES_PT_BR: Record<string, string> = {
	"01": "Janeiro",
	"02": "Fevereiro",
	"03": "Março",
	"04": "Abril",
	"05": "Maio",
	"06": "Junho",
	"07": "Julho",
	"08": "Agosto",
	"09": "Setembro",
	"10": "Outubro",
	"11": "Novembro",
	"12": "Dezembro",
};

function monthLabel(monthIso: string): string {
	const [year, mm] = monthIso.split("-");
	return `${MONTH_NAMES_PT_BR[mm] ?? mm} ${year}`;
}

function fmtBrl(value: number | undefined | null, opts?: { mode?: "auto" | "k" | "full" }): string {
	if (value == null) return "—";
	return fmtCurrencyUnits(value, "BRL", { mode: opts?.mode ?? "auto", zeroAsDash: true });
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

export interface PlanRichText {
	html: string;
	text: string;
}

export function planToRichText(plan: StrategyPlan, planUrl: string): PlanRichText {
	const monthDisplay = monthLabel(plan.month);
	const hero = plan.heroMetrics;
	const topSteps = plan.nextSteps.slice(0, 5);

	// ── HTML — inline styles for email-client compatibility ──
	const htmlParts: string[] = [];
	htmlParts.push(
		`<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #18181b; line-height: 1.5; max-width: 640px;">`,
	);

	// Title
	htmlParts.push(
		`<h2 style="font-size: 18px; font-weight: 700; margin: 0 0 4px 0; color: #18181b;">Plano de ${escapeHtml(plan.envDomain)} · ${escapeHtml(monthDisplay)}</h2>`,
	);
	htmlParts.push(
		`<p style="font-size: 12px; color: #71717a; margin: 0 0 16px 0;">Ciclo ${plan.cycleNumber} · Publicado em ${plan.generatedAt.toISOString().slice(0, 10)}</p>`,
	);

	// Tese
	if (plan.thesisOfMonth) {
		htmlParts.push(
			`<p style="font-size: 14px; font-weight: 600; margin: 0 0 16px 0; padding: 12px 14px; background: #ecfdf5; border-left: 3px solid #10b981; color: #065f46;">${escapeHtml(plan.thesisOfMonth)}</p>`,
		);
	}

	// Hero metrics
	htmlParts.push(
		`<h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #71717a; margin: 0 0 8px 0;">Números do mês</h3>`,
	);
	htmlParts.push(`<ul style="font-size: 14px; margin: 0 0 16px 0; padding-left: 18px;">`);
	htmlParts.push(
		`<li style="margin-bottom: 4px;"><strong>${escapeHtml(fmtBrl(hero.retainedMid))}</strong> recuperados (${hero.retainedFindingCount ?? "—"} achados)</li>`,
	);
	if (hero.capturedMid > 0) {
		htmlParts.push(
			`<li style="margin-bottom: 4px;"><strong>${escapeHtml(fmtBrl(hero.capturedMid))}</strong> em ação (${hero.capturedFindingCount ?? "—"} achados)</li>`,
		);
	} else if (hero.exposureMid && hero.exposureMid > 0) {
		htmlParts.push(
			`<li style="margin-bottom: 4px;"><strong>${escapeHtml(fmtBrl(hero.exposureMid))}</strong> em exposição (${hero.exposureFindingCount ?? "—"} achados)</li>`,
		);
	}
	htmlParts.push(
		`<li style="margin-bottom: 4px;"><strong>${hero.criticalCount}</strong> achado${hero.criticalCount === 1 ? "" : "s"} crítico${hero.criticalCount === 1 ? "" : "s"}</li>`,
	);
	htmlParts.push(
		`<li style="margin-bottom: 4px;"><strong>${hero.inProgressCount}</strong> em andamento</li>`,
	);
	htmlParts.push(`</ul>`);

	// Top próximos passos
	if (topSteps.length > 0) {
		htmlParts.push(
			`<h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #71717a; margin: 0 0 8px 0;">Próximos passos</h3>`,
		);
		htmlParts.push(`<ol style="font-size: 14px; margin: 0 0 16px 0; padding-left: 20px;">`);
		for (const step of topSteps) {
			const range =
				step.combinedImpact.min === step.combinedImpact.max
					? fmtBrl(step.combinedImpact.midpoint)
					: `${fmtBrl(step.combinedImpact.min)}–${fmtBrl(step.combinedImpact.max)}`;
			htmlParts.push(`<li style="margin-bottom: 10px;">`);
			htmlParts.push(
				`<div><strong>${escapeHtml(step.title)}</strong> · <span style="color: #16a34a; font-weight: 600;">${escapeHtml(range)}/mês</span></div>`,
			);
			if (step.reasoning) {
				const trimmed = step.reasoning.length > 240 ? step.reasoning.slice(0, 240) + "…" : step.reasoning;
				htmlParts.push(
					`<div style="font-size: 13px; color: #52525b; margin-top: 2px;">${escapeHtml(trimmed)}</div>`,
				);
			}
			htmlParts.push(`</li>`);
		}
		htmlParts.push(`</ol>`);
	}

	// Footer
	htmlParts.push(
		`<p style="font-size: 12px; color: #71717a; margin: 16px 0 0 0;">Plano completo: <a href="${escapeHtml(planUrl)}" style="color: #10b981; text-decoration: underline;">${escapeHtml(planUrl)}</a></p>`,
	);
	htmlParts.push(`</div>`);

	const html = htmlParts.join("");

	// ── Plain text fallback ──
	const textLines: string[] = [];
	textLines.push(`Plano de ${plan.envDomain} · ${monthDisplay}`);
	textLines.push(`Ciclo ${plan.cycleNumber} · Publicado em ${plan.generatedAt.toISOString().slice(0, 10)}`);
	textLines.push("");
	if (plan.thesisOfMonth) {
		textLines.push(plan.thesisOfMonth);
		textLines.push("");
	}
	textLines.push("NÚMEROS DO MÊS");
	textLines.push(`• ${fmtBrl(hero.retainedMid)} recuperados (${hero.retainedFindingCount ?? "—"} achados)`);
	if (hero.capturedMid > 0) {
		textLines.push(`• ${fmtBrl(hero.capturedMid)} em ação (${hero.capturedFindingCount ?? "—"} achados)`);
	} else if (hero.exposureMid && hero.exposureMid > 0) {
		textLines.push(`• ${fmtBrl(hero.exposureMid)} em exposição (${hero.exposureFindingCount ?? "—"} achados)`);
	}
	textLines.push(`• ${hero.criticalCount} achado${hero.criticalCount === 1 ? "" : "s"} crítico${hero.criticalCount === 1 ? "" : "s"}`);
	textLines.push(`• ${hero.inProgressCount} em andamento`);
	textLines.push("");
	if (topSteps.length > 0) {
		textLines.push("PRÓXIMOS PASSOS");
		topSteps.forEach((step, i) => {
			const range =
				step.combinedImpact.min === step.combinedImpact.max
					? fmtBrl(step.combinedImpact.midpoint)
					: `${fmtBrl(step.combinedImpact.min)}–${fmtBrl(step.combinedImpact.max)}`;
			textLines.push(`${i + 1}. ${step.title} — ${range}/mês`);
			if (step.reasoning) {
				const trimmed = step.reasoning.length > 240 ? step.reasoning.slice(0, 240) + "…" : step.reasoning;
				textLines.push(`   ${trimmed}`);
			}
			textLines.push("");
		});
	}
	textLines.push(`Plano completo: ${planUrl}`);
	const text = textLines.join("\n");

	return { html, text };
}
