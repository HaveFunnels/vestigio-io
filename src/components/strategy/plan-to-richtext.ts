import type { StrategyPlan } from "./types";
import { fmtCurrencyUnits } from "@/lib/format-currency";

// ──────────────────────────────────────────────
// plan-to-richtext — serialize a StrategyPlan into multiple clipboard-
// ready formats. Customer pastes into different surfaces — each format
// is optimized for its target:
//
//   email     → HTML with inline styles (Gmail/Outlook strip <style>)
//   notes     → semantic HTML, no inline styles (Apple Notes/OneNote)
//   whatsapp  → text with *bold* and >quote (WhatsApp's parser)
//   markdown  → CommonMark (Notion, Obsidian, Slack, dev tools)
//   plain     → text, no formatting (terminals, code editors, search)
//
// Each function returns a payload shaped for `navigator.clipboard.write`:
//   - HTML formats: { html, text } pair via ClipboardItem
//   - Text formats: string written via writeText
//
// Tradeoff: not a full re-export of every section (too verbose for
// inline paste). Captures the executive surface — thesis + hero metrics
// + top 5 next steps with impact + footer link. Full read goes via the
// link at the bottom.
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

function fmtBrl(value: number | undefined | null): string {
	if (value == null) return "—";
	return fmtCurrencyUnits(value, "BRL", { mode: "auto", zeroAsDash: true });
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function trimReasoning(s: string | undefined | null, max = 240): string | null {
	if (!s) return null;
	return s.length > max ? s.slice(0, max) + "…" : s;
}

// ──────────────────────────────────────────────
// Shared extraction — pre-build the data each format renders so the
// format functions stay focused on formatting, not on plan-shape
// quirks.
// ──────────────────────────────────────────────

interface PlanSummary {
	domain: string;
	monthDisplay: string;
	cycleNumber: number;
	generatedDate: string;
	thesis: string | null;
	heroLines: Array<{ value: string; label: string }>;
	topSteps: Array<{ title: string; range: string; reasoning: string | null }>;
	planUrl: string;
}

function extractSummary(plan: StrategyPlan, planUrl: string): PlanSummary {
	const hero = plan.heroMetrics;
	const heroLines: PlanSummary["heroLines"] = [];
	heroLines.push({
		value: fmtBrl(hero.retainedMid),
		label: `recuperados (${hero.retainedFindingCount ?? "—"} achados)`,
	});
	if (hero.capturedMid > 0) {
		heroLines.push({
			value: fmtBrl(hero.capturedMid),
			label: `em ação (${hero.capturedFindingCount ?? "—"} achados)`,
		});
	} else if (hero.exposureMid && hero.exposureMid > 0) {
		heroLines.push({
			value: fmtBrl(hero.exposureMid),
			label: `em exposição (${hero.exposureFindingCount ?? "—"} achados)`,
		});
	}
	heroLines.push({
		value: String(hero.criticalCount),
		label: `achado${hero.criticalCount === 1 ? "" : "s"} crítico${hero.criticalCount === 1 ? "" : "s"}`,
	});
	heroLines.push({
		value: String(hero.inProgressCount),
		label: "em andamento",
	});

	const topSteps = plan.nextSteps.slice(0, 5).map((step) => {
		const range =
			step.combinedImpact.min === step.combinedImpact.max
				? fmtBrl(step.combinedImpact.midpoint)
				: `${fmtBrl(step.combinedImpact.min)}–${fmtBrl(step.combinedImpact.max)}`;
		return {
			title: step.title,
			range: `${range}/mês`,
			reasoning: trimReasoning(step.reasoning),
		};
	});

	return {
		domain: plan.envDomain,
		monthDisplay: monthLabel(plan.month),
		cycleNumber: plan.cycleNumber,
		generatedDate: plan.generatedAt.toISOString().slice(0, 10),
		thesis: plan.thesisOfMonth ?? null,
		heroLines,
		topSteps,
		planUrl,
	};
}

// ──────────────────────────────────────────────
// Email — HTML with inline styles
// Gmail/Outlook/AppleMail strip <style> blocks; inline styles survive.
// Includes emerald accent (brand) on tese + impact values.
// ──────────────────────────────────────────────

export function planToEmailHtml(plan: StrategyPlan, planUrl: string): { html: string; text: string } {
	const s = extractSummary(plan, planUrl);
	const parts: string[] = [];
	parts.push(
		`<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #18181b; line-height: 1.5; max-width: 640px;">`,
	);
	parts.push(
		`<h2 style="font-size: 18px; font-weight: 700; margin: 0 0 4px 0; color: #18181b;">Plano de ${escapeHtml(s.domain)} · ${escapeHtml(s.monthDisplay)}</h2>`,
	);
	parts.push(
		`<p style="font-size: 12px; color: #71717a; margin: 0 0 16px 0;">Ciclo ${s.cycleNumber} · Publicado em ${escapeHtml(s.generatedDate)}</p>`,
	);
	if (s.thesis) {
		parts.push(
			`<p style="font-size: 14px; font-weight: 600; margin: 0 0 16px 0; padding: 12px 14px; background: #ecfdf5; border-left: 3px solid #10b981; color: #065f46;">${escapeHtml(s.thesis)}</p>`,
		);
	}
	parts.push(
		`<h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #71717a; margin: 0 0 8px 0;">Números do mês</h3>`,
	);
	parts.push(`<ul style="font-size: 14px; margin: 0 0 16px 0; padding-left: 18px;">`);
	for (const line of s.heroLines) {
		parts.push(
			`<li style="margin-bottom: 4px;"><strong>${escapeHtml(line.value)}</strong> ${escapeHtml(line.label)}</li>`,
		);
	}
	parts.push(`</ul>`);
	if (s.topSteps.length > 0) {
		parts.push(
			`<h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #71717a; margin: 0 0 8px 0;">Próximos passos</h3>`,
		);
		parts.push(`<ol style="font-size: 14px; margin: 0 0 16px 0; padding-left: 20px;">`);
		for (const step of s.topSteps) {
			parts.push(`<li style="margin-bottom: 10px;">`);
			parts.push(
				`<div><strong>${escapeHtml(step.title)}</strong> · <span style="color: #16a34a; font-weight: 600;">${escapeHtml(step.range)}</span></div>`,
			);
			if (step.reasoning) {
				parts.push(
					`<div style="font-size: 13px; color: #52525b; margin-top: 2px;">${escapeHtml(step.reasoning)}</div>`,
				);
			}
			parts.push(`</li>`);
		}
		parts.push(`</ol>`);
	}
	parts.push(
		`<p style="font-size: 12px; color: #71717a; margin: 16px 0 0 0;">Plano completo: <a href="${escapeHtml(planUrl)}" style="color: #10b981; text-decoration: underline;">${escapeHtml(planUrl)}</a></p>`,
	);
	parts.push(`</div>`);
	return { html: parts.join(""), text: planToPlainText(plan, planUrl) };
}

// ──────────────────────────────────────────────
// Notes — semantic HTML, NO inline styles
// Apple Notes / OneNote / Bear preserve semantic structure but ignore
// inline CSS aggressively. Cleaner output without color/background that
// the note app's own theme would clash with.
// ──────────────────────────────────────────────

export function planToNotesHtml(plan: StrategyPlan, planUrl: string): { html: string; text: string } {
	const s = extractSummary(plan, planUrl);
	const parts: string[] = [];
	parts.push(`<h2>Plano de ${escapeHtml(s.domain)} · ${escapeHtml(s.monthDisplay)}</h2>`);
	parts.push(`<p><em>Ciclo ${s.cycleNumber} · Publicado em ${escapeHtml(s.generatedDate)}</em></p>`);
	if (s.thesis) {
		parts.push(`<blockquote><strong>${escapeHtml(s.thesis)}</strong></blockquote>`);
	}
	parts.push(`<h3>Números do mês</h3>`);
	parts.push(`<ul>`);
	for (const line of s.heroLines) {
		parts.push(`<li><strong>${escapeHtml(line.value)}</strong> ${escapeHtml(line.label)}</li>`);
	}
	parts.push(`</ul>`);
	if (s.topSteps.length > 0) {
		parts.push(`<h3>Próximos passos</h3>`);
		parts.push(`<ol>`);
		for (const step of s.topSteps) {
			parts.push(`<li>`);
			parts.push(`<strong>${escapeHtml(step.title)}</strong> — ${escapeHtml(step.range)}`);
			if (step.reasoning) {
				parts.push(`<br><span>${escapeHtml(step.reasoning)}</span>`);
			}
			parts.push(`</li>`);
		}
		parts.push(`</ol>`);
	}
	parts.push(`<p>Plano completo: <a href="${escapeHtml(planUrl)}">${escapeHtml(planUrl)}</a></p>`);
	return { html: parts.join(""), text: planToPlainText(plan, planUrl) };
}

// ──────────────────────────────────────────────
// WhatsApp — text with WhatsApp markup
// WhatsApp parser supports:
//   *bold*  _italic_  ~strike~  ```mono```
//   > single-line quote (line starts with "> ")
// We use *bold* for emphasis + > on the thesis line.
// ──────────────────────────────────────────────

export function planToWhatsApp(plan: StrategyPlan, planUrl: string): string {
	const s = extractSummary(plan, planUrl);
	const lines: string[] = [];
	lines.push(`*Plano de ${s.domain} · ${s.monthDisplay}*`);
	lines.push(`_Ciclo ${s.cycleNumber} · Publicado em ${s.generatedDate}_`);
	lines.push("");
	if (s.thesis) {
		// WhatsApp quote works only on single-line; if the thesis has line
		// breaks we collapse them to a single quoted run.
		const oneLine = s.thesis.replace(/\s*\n+\s*/g, " ");
		lines.push(`> ${oneLine}`);
		lines.push("");
	}
	lines.push(`*NÚMEROS DO MÊS*`);
	for (const line of s.heroLines) {
		lines.push(`• *${line.value}* ${line.label}`);
	}
	lines.push("");
	if (s.topSteps.length > 0) {
		lines.push(`*PRÓXIMOS PASSOS*`);
		s.topSteps.forEach((step, i) => {
			lines.push(`${i + 1}. *${step.title}* — ${step.range}`);
			if (step.reasoning) {
				lines.push(`   ${step.reasoning}`);
			}
			lines.push("");
		});
	}
	lines.push(`Plano completo: ${planUrl}`);
	return lines.join("\n");
}

// ──────────────────────────────────────────────
// Markdown — standard CommonMark
// Works in Notion, Obsidian, GitHub, Slack (partially), most dev tools.
// ──────────────────────────────────────────────

export function planToMarkdown(plan: StrategyPlan, planUrl: string): string {
	const s = extractSummary(plan, planUrl);
	const lines: string[] = [];
	lines.push(`## Plano de ${s.domain} · ${s.monthDisplay}`);
	lines.push(`*Ciclo ${s.cycleNumber} · Publicado em ${s.generatedDate}*`);
	lines.push("");
	if (s.thesis) {
		// Markdown blockquote supports multi-line via "> " prefix per line
		const quoted = s.thesis.split("\n").map((l) => `> ${l}`).join("\n");
		lines.push(quoted);
		lines.push("");
	}
	lines.push(`### Números do mês`);
	for (const line of s.heroLines) {
		lines.push(`- **${line.value}** ${line.label}`);
	}
	lines.push("");
	if (s.topSteps.length > 0) {
		lines.push(`### Próximos passos`);
		s.topSteps.forEach((step, i) => {
			lines.push(`${i + 1}. **${step.title}** — ${step.range}`);
			if (step.reasoning) {
				lines.push(`   ${step.reasoning}`);
			}
			lines.push("");
		});
	}
	lines.push(`[Plano completo](${planUrl})`);
	return lines.join("\n");
}

// ──────────────────────────────────────────────
// Plain text — no formatting, just structure via whitespace + bullets
// For terminals, search bars, code editors, anywhere format chars
// would be visible noise.
// ──────────────────────────────────────────────

export function planToPlainText(plan: StrategyPlan, planUrl: string): string {
	const s = extractSummary(plan, planUrl);
	const lines: string[] = [];
	lines.push(`Plano de ${s.domain} · ${s.monthDisplay}`);
	lines.push(`Ciclo ${s.cycleNumber} · Publicado em ${s.generatedDate}`);
	lines.push("");
	if (s.thesis) {
		lines.push(s.thesis);
		lines.push("");
	}
	lines.push(`NÚMEROS DO MÊS`);
	for (const line of s.heroLines) {
		lines.push(`• ${line.value} ${line.label}`);
	}
	lines.push("");
	if (s.topSteps.length > 0) {
		lines.push(`PRÓXIMOS PASSOS`);
		s.topSteps.forEach((step, i) => {
			lines.push(`${i + 1}. ${step.title} — ${step.range}`);
			if (step.reasoning) {
				lines.push(`   ${step.reasoning}`);
			}
			lines.push("");
		});
	}
	lines.push(`Plano completo: ${planUrl}`);
	return lines.join("\n");
}

// ──────────────────────────────────────────────
// Format menu shape — exported so the panel can render the menu
// declaratively without duplicating labels/descriptions.
// ──────────────────────────────────────────────

export type CopyFormat = "email" | "notes" | "whatsapp" | "markdown" | "plain";

export const COPY_FORMATS: Array<{
	id: CopyFormat;
	label: string;
	hint: string;
}> = [
	{ id: "email", label: "Email", hint: "HTML rich · Gmail, Outlook" },
	{ id: "notes", label: "Notas", hint: "HTML limpo · Apple Notes, OneNote" },
	{ id: "whatsapp", label: "WhatsApp", hint: "*bold* · > quote" },
	{ id: "markdown", label: "Markdown", hint: "**bold** · Notion, Slack" },
	{ id: "plain", label: "Texto puro", hint: "Sem formatação" },
];

/**
 * Single entry point — given a format id, produces the clipboard payload
 * (html+text pair for rich formats, raw string for text formats). The
 * panel calls navigator.clipboard from this.
 */
export function buildCopyPayload(
	format: CopyFormat,
	plan: StrategyPlan,
	planUrl: string,
): { html?: string; text: string } {
	if (format === "email") return planToEmailHtml(plan, planUrl);
	if (format === "notes") return planToNotesHtml(plan, planUrl);
	if (format === "whatsapp") return { text: planToWhatsApp(plan, planUrl) };
	if (format === "markdown") return { text: planToMarkdown(plan, planUrl) };
	return { text: planToPlainText(plan, planUrl) };
}
