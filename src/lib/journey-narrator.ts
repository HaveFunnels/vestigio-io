import { callModel, isLlmEnabled } from "../../apps/mcp/llm/client";
import type { JourneyReplay, NormalizedTimelineEvent } from "@/lib/journey-replays";
import { humanizePath, humanizePathSlot } from "@/lib/humanize-path";
import { voiceRulesFor } from "../../packages/strategy-plan/voice-rules";

// ──────────────────────────────────────────────
// Wave 22.9 · Onda 2 — Journey narrator rewrite
//
// The prior version fed the LLM `pattern_kind` as a noun ("form_friction",
// "oscillation") and asked for a 3-block narrative. Result: the LLM
// echoed the label back verbatim in every diagnostic ("Sinais indicam
// friction em form. Chegou no checkout, mas a sessão terminou sem
// conversão.") — vague, non-actionable, and violated the customer's
// explicit ask to "não ter medo de fazer suposições."
//
// Council-approved rewrite:
//   1. Prompt REMOVES pattern_kind from the model's vocabulary. The
//      model must reconstruct meaning from raw enriched events + CTA
//      texts + specific aggregates.
//   2. Output schema flips from 3 blocks to 4:
//        tier                    — confidence label (Padrão claro |
//                                  Hipótese consistente | Sinal isolado)
//        padrao                  — one-noun label the model coins
//        momento_critico         — the specific frictional moment
//                                  (which CTA / field / page pair /
//                                  timestamp)
//        comprador_provavelmente — 1-sentence controlled inference of
//                                  buyer expectation
//        o_que_testar            — one testable "Vestigio testaria X"
//                                  hypothesis
//      Sales-tracking + page-cro + ecommerce-checkout seats all
//      converged on this shape.
//   3. Prompt bans "sinais indicam", "oscilação", "friction" as
//      surface words — those are engine labels, not buyer reality.
//   4. Fallback template rewritten to match the same schema so the
//      UI never renders a legacy 3-block diagnostic even under LLM
//      outage.
// ──────────────────────────────────────────────

export interface JourneyNarrative {
	tier: "padrao_claro" | "hipotese_consistente" | "sinal_isolado";
	padrao: string; // "Choque de preço no checkout" — noun, not "friction"
	momento_critico: string; // 1 sentence naming the specific event
	comprador_provavelmente: string; // 1 sentence controlled inference
	o_que_testar: string; // 1 sentence starting with "Vestigio testaria"
}

const NARRATOR_TOOL_NAME = "render_journey_narrative";

const NARRATOR_TOOL = {
	name: NARRATOR_TOOL_NAME,
	description:
		"Renderiza o diagnóstico estruturado de uma jornada. SEMPRE chame esta ferramenta como única resposta. NUNCA use as palavras 'sinais indicam', 'oscilação', 'friction', 'desvio' na saída.",
	input_schema: {
		type: "object" as const,
		properties: {
			tier: {
				type: "string",
				enum: ["padrao_claro", "hipotese_consistente", "sinal_isolado"],
				description:
					"Confiança no diagnóstico. 'padrao_claro' quando 2+ sinais convergem na mesma surface. 'hipotese_consistente' quando 1 sinal forte + surface identificada. 'sinal_isolado' quando 1 sinal fraco isolado. Calculado a partir dos sinais fornecidos, não pedido ao LLM inventar.",
			},
			padrao: {
				type: "string",
				description:
					"Rótulo do padrão em português brasileiro. Máx 6 palavras. NUNCA repita literalmente 'form_friction', 'oscillation', 'trust_break' ou qualquer label de engine. Cunhe o padrão em linguagem de operador ('Choque de preço no checkout', 'Cadastro obrigatório antes de pagar', 'Travou aplicando cupom').",
			},
			momento_critico: {
				type: "string",
				description:
					"Uma frase em português brasileiro nomeando O MOMENTO ESPECÍFICO onde a venda quebrou. Cite: (a) qual CTA (usar o texto entre aspas se disponível), OU (b) qual formulário e o quê aconteceu nele, OU (c) qual par de páginas foi visitado em loop, OU (d) o timestamp aproximado. NUNCA use 'sinais indicam' nem 'oscilação'.",
			},
			comprador_provavelmente: {
				type: "string",
				description:
					"Uma frase em português brasileiro começando com 'Este comprador provavelmente' e inferindo a expectativa que não foi atendida. Especulação CONTROLADA — deve derivar da sequência de eventos, não inventar detalhes. Ex: 'Este comprador provavelmente esperava ver o valor com frete antes do checkout.'",
			},
			o_que_testar: {
				type: "string",
				description:
					"Uma frase em português brasileiro começando com 'Vestigio testaria' e nomeando UMA mudança concreta em UMA surface específica. Deve ser testável em uma semana. Ex: 'Vestigio testaria mostrar o frete estimado no PDP para os CEPs mais frequentes.'",
			},
		},
		required: ["tier", "padrao", "momento_critico", "comprador_provavelmente", "o_que_testar"],
	},
};

// Wave 22.9 · Bloco 3 — locale-aware system prompt. Threads
// language_name + vocab_positive + vocab_banned from voice-rules.ts
// so en/es/de plans stop getting a pt-BR-mandated Haiku prompt (Onda 2
// bug: "Português brasileiro obrigatório" was hardcoded).
function buildSystemPrompt(locale: string): string {
	const rules = voiceRulesFor(locale);
	return `You are the senior analyst at Vestigio. Your task: diagnose a buyer journey that abandoned conversion.

Respond in ${rules.language_name}. Every sentence in ${rules.language_name} only.

Voice:
- Name what happened in the store operator's language, not in analytics-tool language.
- Make controlled hypotheses grounded in the observed event sequence.
- Close with ONE testable bet the operator can run this week.

MANDATORY vocabulary: ${rules.vocab_positive}
FORBIDDEN phrases (do not use, do not paraphrase): ${rules.vocab_banned.join(", ")}

Additional hard rules:
- FORBIDDEN to assert mental state without a supporting signal.
- FORBIDDEN to invent values, product names, or events not present in the data.
- FORBIDDEN em-dash (—).
- FORBIDDEN exclamation.
- FORBIDDEN markdown, emojis, links.
- Always respond by calling render_journey_narrative.
`;
}

/**
 * Compute confidence tier from the aggregated signal strength — this
 * doesn't ask the LLM to invent it, it derives from the actual event
 * counts. The LLM receives the pre-computed value in the prompt and
 * echoes it back through the tool call.
 */
function computeTier(journey: JourneyReplay): JourneyNarrative["tier"] {
	// Convergent signals in the timeline (money-adjacent kinds).
	let convergent = 0;
	for (const ev of journey.timeline) {
		if (
			ev.kind === "form_error" ||
			ev.kind === "form_retry" ||
			ev.kind === "hesitation" ||
			ev.kind === "backtrack" ||
			ev.kind === "cta_click" ||
			ev.kind === "exit"
		) {
			convergent++;
		}
	}
	const hasSurface = !!journey.metrics.exit_path;
	const hasAttribution = journey.persona.source_label !== "Direto";
	// Rule from sales-tracking-tool seat, minus the score formula.
	if (convergent >= 4 && hasSurface) return "padrao_claro";
	if (convergent >= 2 && hasSurface) return "hipotese_consistente";
	if (convergent >= 2 && hasAttribution) return "hipotese_consistente";
	return "sinal_isolado";
}

export const TIER_HUMAN_LABEL: Record<JourneyNarrative["tier"], string> = {
	padrao_claro: "Padrão claro",
	hipotese_consistente: "Hipótese consistente",
	sinal_isolado: "Sinal isolado",
};

/**
 * Gera narrativa estruturada via LLM. Se a chamada falhar OU LLM
 * estiver desabilitado, retorna fallback template-based (sempre OK).
 */
export async function narrateJourney(
	journey: JourneyReplay,
	context: {
		organizationId?: string;
		environmentId?: string;
		cycleId?: string;
		/** Locale locked at plan generation time — threaded through so
		 *  the LLM system prompt speaks the right language + bans the
		 *  right per-locale boilerplate. Defaults to pt-BR to preserve
		 *  behavior for the callers that haven't wired locale yet. */
		locale?: string;
	},
): Promise<JourneyNarrative> {
	const tier = computeTier(journey);
	if (!isLlmEnabled()) {
		return templateNarrative(journey, tier);
	}

	try {
		const locale = context.locale ?? "pt-BR";
		const userMessage = buildUserPrompt(journey, tier);
		const result = await callModel(
			"haiku_4_5",
			[{ role: "user", content: userMessage }],
			{
				max_tokens: 600,
				temperature: 0.2,
				system: buildSystemPrompt(locale),
				tools: [NARRATOR_TOOL as any],
			},
			{
				purpose: "narrative_synthesis",
				organizationId: context.organizationId ?? null,
				environmentId: context.environmentId ?? null,
				cycleId: context.cycleId ?? null,
				userId: null,
				conversationId: null,
			},
		);

		const toolUse = result.content.find(
			(block: any) => block.type === "tool_use" && block.name === NARRATOR_TOOL_NAME,
		);
		if (!toolUse || (toolUse as any).type !== "tool_use") {
			return templateNarrative(journey, tier);
		}
		const input = (toolUse as any).input as Partial<JourneyNarrative>;
		if (
			typeof input.padrao === "string" &&
			typeof input.momento_critico === "string" &&
			typeof input.comprador_provavelmente === "string" &&
			typeof input.o_que_testar === "string"
		) {
			// Prompt-guard: strip any banned phrases the LLM smuggled in,
			// using the locale's banned_regex so an en/es/de output
			// doesn't get scrubbed for pt-BR strings that would never
			// appear there.
			const rules = voiceRulesFor(locale);
			const clean = (s: string) => s.replace(rules.banned_regex, "").replace(/\s{2,}/g, " ").trim();
			return {
				tier: (input.tier as JourneyNarrative["tier"]) ?? tier,
				padrao: clean(input.padrao),
				momento_critico: clean(input.momento_critico),
				comprador_provavelmente: clean(input.comprador_provavelmente),
				o_que_testar: clean(input.o_que_testar),
			};
		}
		return templateNarrative(journey, tier);
	} catch {
		return templateNarrative(journey, tier);
	}
}

function buildUserPrompt(j: JourneyReplay, tier: JourneyNarrative["tier"]): string {
	const minutes = Math.round((j.metrics.duration_ms / 60000) * 10) / 10;
	const frictionCounts = countFrictionSignals(j.timeline);
	// Council rule: feed the LAST 5 enriched events verbatim — the
	// narrative should be reconstructed from these, not from the pre-
	// classified pattern_kind label.
	const lastEvents = j.timeline
		.slice(-5)
		.map((ev) => renderEventForPrompt(ev))
		.join("\n");

	return [
		`Diagnostique esta jornada de comprador que NÃO converteu. Use APENAS os dados abaixo. Chame render_journey_narrative uma única vez.`,
		``,
		`# Persona`,
		`- Descritor: ${j.persona.descriptor}`,
		`- Dispositivo: ${j.persona.device}`,
		`- Origem: ${j.persona.source_label}`,
		`- Campanha: ${j.persona.campaign_label ?? "(nenhuma)"}`,
		``,
		`# Intento e duração`,
		`- Intento alcançado: ${j.metrics.intent_label}`,
		`- Duração: ${minutes} min`,
		`- Páginas visitadas: ${j.metrics.surface_count}`,
		`- Saiu ${humanizePathSlot(j.metrics.exit_path)}`,
		``,
		`# Últimos 5 eventos da timeline (o momento crítico está aqui)`,
		lastEvents || "(nenhum evento reconstruído)",
		``,
		`# Contadores de fricção`,
		`- form_error: ${frictionCounts.form_error}`,
		`- form_retry: ${frictionCounts.form_retry}`,
		`- hesitation: ${frictionCounts.hesitation}`,
		`- backtrack: ${frictionCounts.backtrack}`,
		``,
		`# Confiança pré-calculada`,
		`- tier: ${tier} (não altere — apenas ecoe no output)`,
		``,
		`INSTRUÇÕES DE VOZ (repetindo o essencial):`,
		`1. PROIBIDO: "sinais indicam", "sinais sugerem", "friction", "oscilação".`,
		`2. Nomeie o momento crítico com detalhe FÍSICO — qual CTA, qual campo, qual par de páginas.`,
		`3. Se um CTA foi clicado, USE o texto do botão entre aspas.`,
		`4. Feche com "Vestigio testaria [X específico] em [surface específica]."`,
		`5. Fale como consultor de e-commerce, não como analytics.`,
	].join("\n");
}

function renderEventForPrompt(ev: NormalizedTimelineEvent): string {
	const t = `[${formatSeconds(ev.t_seconds)}]`;
	// Emit the enriched label so the model has the physical detail
	// (CTA text, pause duration, near_cta, cluster range) available.
	const extras: string[] = [];
	if (ev.cta_label && !ev.label.includes(`"${ev.cta_label}"`)) extras.push(`botão="${ev.cta_label}"`);
	if (ev.near_cta) extras.push("near_cta=true");
	if (ev.pause_ms) extras.push(`pause=${Math.round(ev.pause_ms / 1000)}s`);
	if (ev.scroll_depth_pct && !ev.label.includes(`${ev.scroll_depth_pct}%`))
		extras.push(`depth=${ev.scroll_depth_pct}%`);
	if (ev.render_delay_ms) extras.push(`render_delay=${Math.round(ev.render_delay_ms / 1000)}s`);
	if (ev.from_path) extras.push(`from=${ev.from_path}`);
	if (ev.cluster_count && ev.cluster_count > 1) extras.push(`cluster=${ev.cluster_count}`);
	const extrasStr = extras.length ? ` (${extras.join(", ")})` : "";
	return `- ${t} ${ev.kind}: ${ev.label}${extrasStr}`;
}

function formatSeconds(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function countFrictionSignals(timeline: JourneyReplay["timeline"]): {
	form_error: number;
	form_retry: number;
	hesitation: number;
	backtrack: number;
} {
	const counts = { form_error: 0, form_retry: 0, hesitation: 0, backtrack: 0 };
	for (const ev of timeline) {
		if (ev.kind === "form_error") counts.form_error++;
		else if (ev.kind === "form_retry") counts.form_retry++;
		else if (ev.kind === "hesitation") counts.hesitation++;
		else if (ev.kind === "backtrack") counts.backtrack++;
	}
	return counts;
}

// ──────────────────────────────────────────────
// Template fallback — mirrors the 4-block schema so the UI never
// renders legacy 3-block content under LLM outage. Voice is muted
// compared to the LLM path (fewer specifics available without an LLM
// to synthesize), but the shape stays consistent.
// ──────────────────────────────────────────────

function templateNarrative(j: JourneyReplay, tier: JourneyNarrative["tier"]): JourneyNarrative {
	const exitLabel = humanizePath(j.metrics.exit_path ?? null, "esta página");
	const lastCta = [...j.timeline].reverse().find((e) => e.kind === "cta_click" && e.cta_label);
	const momento = lastCta?.cta_label
		? `O último toque do comprador foi "${lastCta.cta_label}" em ${humanizePath(lastCta.path ?? null)}, sem ação depois.`
		: `A sessão terminou em ${exitLabel} sem completar a conversão.`;

	return {
		tier,
		padrao: j.pattern.short_label,
		momento_critico: momento,
		comprador_provavelmente:
			j.metrics.intent_label === "Chegou no checkout"
				? "Este comprador provavelmente estava pronto para comprar; algo específico no checkout o segurou."
				: "Este comprador provavelmente esperava encontrar algo que não estava visível no fluxo.",
		o_que_testar: `Vestigio testaria revisar ${exitLabel} focando no ponto onde a jornada quebrou.`,
	};
}
