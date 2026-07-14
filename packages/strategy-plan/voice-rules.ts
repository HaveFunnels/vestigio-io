// ──────────────────────────────────────────────
// Locale-aware voice rules — Wave 22.9 · Bloco 3
//
// The plan-generator LLM prompts (next-step reasoning, journey-narrator,
// narrative-what-happened) all had voice rules HARDCODED in pt-BR: the
// language name ("Português brasileiro"), the vocabulary list
// ("vazamento, perda potencial"), and the banned phrase list
// ("sinais indicam", "friction"). Locale=en/es/de users hit prompts
// that told Haiku to respond in Portuguese, or shipped ban regexes
// against Portuguese phrases that never appear in an English output.
//
// This module is the single point of truth for per-locale voice rules
// consumed by every LLM prompt in the plan pipeline. Adding a new
// locale = one new entry here; nothing else changes.
// ──────────────────────────────────────────────

export type PlanLocale = "pt-BR" | "en" | "es" | "de";

export interface LocaleVoiceRules {
	/** Language name to use in the system prompt's "respond in X" line. */
	language_name: string;
	/** Vocabulary the model SHOULD reach for — customer-facing loss
	 *  framing in the target locale. Threaded into the prompt as a
	 *  "MANDATORY vocabulary" bullet. */
	vocab_positive: string;
	/** Phrases the model MUST NOT use. Includes locale-specific
	 *  boilerplate that turns supporting-step reasoning into filler
	 *  (Wave 22.9 · Bloco 3 council additions: "em paralelo",
	 *  "movimento de apoio", "compõe com o Passo", "sem competir
	 *  por foco", plus the Wave 22.9 · Onda 2 bans on "sinais
	 *  indicam", "friction", "oscilação"). */
	vocab_banned: string[];
	/** Regex (case-insensitive) that matches the same banned phrases
	 *  for post-gen sanitization. Compiled here so callers can just
	 *  `.replace(rules.banned_regex, "")` without knowing per-locale
	 *  boundary conditions. */
	banned_regex: RegExp;
}

const PT_BR_BANNED = [
	// Onda 2 bans (journey-narrator)
	"sinais indicam",
	"sinais sugerem",
	"sinais apontam",
	"oscilação entre páginas",
	"desvio do caminho esperado",
	// Bloco 3 additions (next-step supporting-boilerplate killers)
	"em paralelo",
	"logo atrás",
	"seguindo na fila",
	"na mesma sprint",
	"movimento de apoio",
	"movimento principal",
	"compõe com o Passo",
	"se compõe com",
	"endereçar antes que",
	"sem competir por foco",
	"sem competir com",
	"resolver esse item primeiro",
	// Cross-cutting (existing rules survived here for one enforcement point)
	"exposição",
	"friction",
];

const EN_BANNED = [
	"signals suggest",
	"signals indicate",
	"friction detected",
	"in parallel",
	"same sprint",
	"supporting move",
	"composes with Step",
	"without competing for focus",
	"supports the primary move",
];

const ES_BANNED = [
	"las señales indican",
	"las señales sugieren",
	"friction",
	"en paralelo",
	"misma sprint",
	"movimiento de apoyo",
	"se compone con el Paso",
	"sin competir por foco",
];

const DE_BANNED = [
	"Signale deuten",
	"Signale legen nahe",
	"Friction",
	"parallel dazu",
	"gleicher Sprint",
	"Unterstützender Schritt",
	"ergänzt Schritt",
	"ohne um Fokus zu konkurrieren",
];

function buildBannedRegex(phrases: string[]): RegExp {
	// Escape special regex chars in each phrase, join as alternation.
	const escaped = phrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	return new RegExp(escaped.join("|"), "gi");
}

export const LOCALE_VOICE_RULES: Record<PlanLocale, LocaleVoiceRules> = {
	"pt-BR": {
		language_name: "português brasileiro",
		vocab_positive:
			"vazamento, perda potencial, receita em risco, comprador, movimento, alavanca",
		vocab_banned: PT_BR_BANNED,
		banned_regex: buildBannedRegex(PT_BR_BANNED),
	},
	en: {
		language_name: "English",
		vocab_positive: "leak, lost revenue, revenue at risk, buyer, lever, move",
		vocab_banned: EN_BANNED,
		banned_regex: buildBannedRegex(EN_BANNED),
	},
	es: {
		language_name: "español (LATAM)",
		vocab_positive:
			"fuga de ingresos, pérdida potencial, ingresos en riesgo, comprador, palanca",
		vocab_banned: ES_BANNED,
		banned_regex: buildBannedRegex(ES_BANNED),
	},
	de: {
		language_name: "Deutsch",
		vocab_positive:
			"Umsatzleck, potenzieller Verlust, gefährdeter Umsatz, Käufer, Hebel",
		vocab_banned: DE_BANNED,
		banned_regex: buildBannedRegex(DE_BANNED),
	},
};

/** Resolve the voice rules for a locale, falling back to pt-BR on
 *  unknown values. Unknown locales SHOULD never reach here (the plan
 *  generator locks locale at generation from the org's setting), but
 *  a defensive fallback keeps prompt-emission alive under drift. */
export function voiceRulesFor(locale: string): LocaleVoiceRules {
	if (locale === "en" || locale === "es" || locale === "de") return LOCALE_VOICE_RULES[locale];
	return LOCALE_VOICE_RULES["pt-BR"];
}
