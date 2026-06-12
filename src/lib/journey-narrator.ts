import { callModel, isLlmEnabled } from "../../apps/mcp/llm/client";
import type { JourneyReplay } from "@/lib/journey-replays";

// ──────────────────────────────────────────────
// Bundle D — Journey narrator (LLM com structured output)
//
// Recebe um JourneyReplay normalizado e pede pro Haiku 4.5 produzir
// uma narrativa estruturada via tool_use. O schema é fixo — sempre
// retorna {headline, diagnosis, pattern_attribution}, então a UI
// pode renderizar sem if/else por formato.
//
// Falha gracefully: se LLM tá off OU se chamada falha, retorna a
// versão template-based como fallback. Plan render nunca quebra.
// ──────────────────────────────────────────────

export interface JourneyNarrative {
	headline: string; // 1 frase: "Comprador X abandonou em Y por Z"
	diagnosis: string; // 1-2 frases explicando o porquê
	pattern_attribution: string; // 1 frase atribuindo padrão e frequência
}

const NARRATOR_TOOL_NAME = "render_journey_narrative";

const NARRATOR_TOOL = {
	name: NARRATOR_TOOL_NAME,
	description:
		"Renderiza uma narrativa estruturada explicando uma jornada de comprador. SEMPRE chame esta ferramenta como única resposta.",
	input_schema: {
		type: "object" as const,
		properties: {
			headline: {
				type: "string",
				description:
					"1 frase concisa em português brasileiro descrevendo o que aconteceu na jornada. Máx 18 palavras. Sem ponto final.",
			},
			diagnosis: {
				type: "string",
				description:
					"1-2 frases em português brasileiro explicando POR QUE o comprador abandonou. Baseie-se nos sinais de fricção (form_retry, hesitation, oscillation, etc) presentes nos dados. Não invente detalhes que não estão nos dados.",
			},
			pattern_attribution: {
				type: "string",
				description:
					"1 frase em português brasileiro atribuindo a jornada a um padrão maior. Use a `pattern_short_label` fornecida nos dados. Se houver informação sobre frequência, mencione (ex: 'aparece em X% das sessões mobile'). Caso contrário, descreva qualitativamente.",
			},
		},
		required: ["headline", "diagnosis", "pattern_attribution"],
	},
};

const SYSTEM_PROMPT = `Você é o sistema de análise da Vestigio. Sua tarefa é produzir narrativas curtas e técnicas explicando jornadas de compradores que abandonaram conversão.

Regras:
- Sempre responda chamando a ferramenta render_journey_narrative.
- Português brasileiro, sem anglicismos desnecessários.
- Baseie-se APENAS nos dados fornecidos. Nunca invente nomes, valores, ou eventos.
- Tom: analítico, factual, conciso. Sem hedging ("talvez", "parece que").
- Não use markdown. Texto puro.`;

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
	},
): Promise<JourneyNarrative> {
	if (!isLlmEnabled()) {
		return templateNarrative(journey);
	}

	try {
		const userMessage = buildUserPrompt(journey);
		const result = await callModel(
			"haiku_4_5",
			[{ role: "user", content: userMessage }],
			{
				max_tokens: 400,
				temperature: 0.2,
				system: SYSTEM_PROMPT,
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

		// Tool-use block carrega o output estruturado
		const toolUse = result.content.find(
			(block: any) => block.type === "tool_use" && block.name === NARRATOR_TOOL_NAME,
		);
		if (!toolUse || (toolUse as any).type !== "tool_use") {
			return templateNarrative(journey);
		}
		const input = (toolUse as any).input as Partial<JourneyNarrative>;
		// Schema validation defensiva — só aceita se tem as 3 propriedades
		if (
			typeof input.headline === "string" &&
			typeof input.diagnosis === "string" &&
			typeof input.pattern_attribution === "string"
		) {
			return {
				headline: input.headline.trim(),
				diagnosis: input.diagnosis.trim(),
				pattern_attribution: input.pattern_attribution.trim(),
			};
		}
		return templateNarrative(journey);
	} catch {
		// LLM falhou — não bloqueia o render do plano
		return templateNarrative(journey);
	}
}

function buildUserPrompt(j: JourneyReplay): string {
	const minutes = Math.round((j.metrics.duration_ms / 60000) * 10) / 10;
	const lostBrl = Math.round(j.estimated_lost_brl_cents / 100);

	// Conta sinais de fricção da timeline
	const frictionCounts = countFrictionSignals(j.timeline);

	return [
		`Analise esta jornada de comprador que NÃO converteu e produza a narrativa estruturada.`,
		``,
		`# Dados da jornada`,
		`- Persona: ${j.persona.descriptor}`,
		`- Dispositivo: ${j.persona.device}`,
		`- Origem: ${j.persona.source_label}`,
		`- Campanha: ${j.persona.campaign_label ?? "(sem campanha)"}`,
		`- Tipo de visitante: ${j.persona.visitor_type}`,
		`- Duração: ${minutes} minutos`,
		`- Páginas visitadas: ${j.metrics.surface_count}`,
		`- Saiu em: ${j.metrics.exit_path ?? "(não detectado)"}`,
		`- Intenção alcançada: ${j.metrics.intent_label}`,
		`- Estimativa de perda: R$ ${lostBrl}`,
		``,
		`# Padrão pré-classificado`,
		`- pattern_kind: ${j.pattern.kind}`,
		`- pattern_short_label: ${j.pattern.short_label}`,
		``,
		`# Sinais de fricção contados na timeline`,
		`- form_error: ${frictionCounts.form_error}`,
		`- form_retry: ${frictionCounts.form_retry}`,
		`- hesitation: ${frictionCounts.hesitation}`,
		`- backtrack: ${frictionCounts.backtrack}`,
		``,
		`Use os dados acima para produzir headline + diagnosis + pattern_attribution via render_journey_narrative.`,
	].join("\n");
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
// Template fallback
// ──────────────────────────────────────────────

function templateNarrative(j: JourneyReplay): JourneyNarrative {
	const minutes = Math.round((j.metrics.duration_ms / 60000) * 10) / 10;
	const lostBrl = Math.round(j.estimated_lost_brl_cents / 100);
	const exitPath = j.metrics.exit_path ?? "uma página interna";

	return {
		headline: `${j.persona.descriptor} abandonou em ${exitPath} após ${minutes} min`,
		diagnosis: `Sinais detectados na sessão indicam ${j.pattern.short_label.toLowerCase()}. ${j.metrics.intent_label}, mas a sessão terminou sem conversão.`,
		pattern_attribution: `Padrão "${j.pattern.short_label}" — perda estimada R$ ${lostBrl} nesta sessão.`,
	};
}
