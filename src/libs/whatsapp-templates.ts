// ──────────────────────────────────────────────
// WhatsApp template registry — Meta Cloud API
//
// Each NotificationEvent maps to a pre-approved WhatsApp template.
// The template must be created in the Meta Business Manager (or via
// POST /{WABA_ID}/message_templates) and approved before it can be sent.
//
// The "body" here is the EXACT text that must be submitted to Meta for
// approval — Meta matches character-by-character, so if you change the
// template content here you must re-submit for approval.
//
// Variables use {{1}}, {{2}}, {{3}} numbered placeholders per Meta spec.
// ──────────────────────────────────────────────

import type { NotificationEvent } from "@/libs/notifications";

export type WhatsAppLanguage = "pt_BR" | "en_US" | "es_LA" | "de";

export interface WhatsAppTemplateDef {
	/** Template name as registered in Meta — lowercase, snake_case, ≤512 chars */
	name: string;
	/** Template category (Meta classifies for billing + deliverability rules) */
	category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
	/** Body text with {{1}}, {{2}}, ... placeholders */
	body: string;
	/** Human-readable param list for documentation + UI */
	params: readonly string[];
	/** Optional CTA button — Meta supports up to 2 URL buttons per template */
	button?: { type: "URL"; text: string; url: string };
}

/**
 * Every registered template per language.
 * Add new languages by duplicating a block and translating.
 *
 * IMPORTANT: after editing these you MUST re-run
 *   POST /api/admin/whatsapp/register-templates
 * to submit the new/updated templates for Meta approval.
 */
export const WHATSAPP_TEMPLATES: Record<WhatsAppLanguage, Record<string, WhatsAppTemplateDef>> = {
	pt_BR: {
		vestigio_incident: {
			name: "vestigio_incident",
			category: "UTILITY",
			body: "🚨 Incidente detectado no seu site {{1}}.\n\n*{{2}}*\n\n{{3}}\n\nAbra a Vestigio para ver detalhes e a causa raiz.",
			params: ["domain", "headline", "root_cause_summary"],
			button: { type: "URL", text: "Abrir na Vestigio", url: "https://vestigio.io/app/findings" },
		},
		vestigio_regression: {
			name: "vestigio_regression",
			category: "UTILITY",
			body: "📉 Regressão detectada em {{1}}.\n\n*{{2}}* ficou pior desde a última auditoria.\n\nTotal de regressões neste ciclo: {{3}}.",
			params: ["domain", "headline", "count"],
			button: { type: "URL", text: "Ver mudanças", url: "https://vestigio.io/app/findings" },
		},
		vestigio_page_down: {
			name: "vestigio_page_down",
			category: "UTILITY",
			body: "⚠️ Página fora do ar: {{1}}\n\nStatus HTTP: {{2}}\n\nVamos te avisar assim que voltar ao ar.",
			params: ["page_url", "status_code"],
			button: { type: "URL", text: "Ver incidente", url: "https://vestigio.io/app/findings" },
		},
		vestigio_magic_link: {
			name: "vestigio_magic_link",
			category: "AUTHENTICATION",
			body: "Seu código de acesso Vestigio é *{{1}}*.\n\nVálido por 10 minutos. Não compartilhe com ninguém.",
			params: ["code"],
		},
	},

	en_US: {
		vestigio_incident: {
			name: "vestigio_incident",
			category: "UTILITY",
			body: "🚨 Incident detected on {{1}}.\n\n*{{2}}*\n\n{{3}}\n\nOpen Vestigio to see details and root cause.",
			params: ["domain", "headline", "root_cause_summary"],
			button: { type: "URL", text: "Open in Vestigio", url: "https://vestigio.io/app/findings" },
		},
		vestigio_regression: {
			name: "vestigio_regression",
			category: "UTILITY",
			body: "📉 Regression detected on {{1}}.\n\n*{{2}}* got worse since your last audit.\n\nTotal regressions this cycle: {{3}}.",
			params: ["domain", "headline", "count"],
			button: { type: "URL", text: "View changes", url: "https://vestigio.io/app/findings" },
		},
		vestigio_page_down: {
			name: "vestigio_page_down",
			category: "UTILITY",
			body: "⚠️ Page down: {{1}}\n\nHTTP status: {{2}}\n\nWe'll notify you when it recovers.",
			params: ["page_url", "status_code"],
			button: { type: "URL", text: "View incident", url: "https://vestigio.io/app/findings" },
		},
		vestigio_magic_link: {
			name: "vestigio_magic_link",
			category: "AUTHENTICATION",
			body: "Your Vestigio access code is *{{1}}*.\n\nValid for 10 minutes. Do not share with anyone.",
			params: ["code"],
		},
	},

	es_LA: {
		vestigio_incident: {
			name: "vestigio_incident",
			category: "UTILITY",
			body: "🚨 Incidente detectado en {{1}}.\n\n*{{2}}*\n\n{{3}}\n\nAbre Vestigio para ver detalles y causa raíz.",
			params: ["domain", "headline", "root_cause_summary"],
			button: { type: "URL", text: "Abrir en Vestigio", url: "https://vestigio.io/app/findings" },
		},
		vestigio_regression: {
			name: "vestigio_regression",
			category: "UTILITY",
			body: "📉 Regresión detectada en {{1}}.\n\n*{{2}}* empeoró desde la última auditoría.\n\nRegresiones en este ciclo: {{3}}.",
			params: ["domain", "headline", "count"],
			button: { type: "URL", text: "Ver cambios", url: "https://vestigio.io/app/findings" },
		},
		vestigio_page_down: {
			name: "vestigio_page_down",
			category: "UTILITY",
			body: "⚠️ Página caída: {{1}}\n\nEstado HTTP: {{2}}\n\nTe avisaremos cuando vuelva.",
			params: ["page_url", "status_code"],
			button: { type: "URL", text: "Ver incidente", url: "https://vestigio.io/app/findings" },
		},
		vestigio_magic_link: {
			name: "vestigio_magic_link",
			category: "AUTHENTICATION",
			body: "Tu código de acceso Vestigio es *{{1}}*.\n\nVálido por 10 minutos. No lo compartas.",
			params: ["code"],
		},
	},

	de: {
		vestigio_incident: {
			name: "vestigio_incident",
			category: "UTILITY",
			body: "🚨 Vorfall auf {{1}} erkannt.\n\n*{{2}}*\n\n{{3}}\n\nÖffne Vestigio für Details und Ursache.",
			params: ["domain", "headline", "root_cause_summary"],
			button: { type: "URL", text: "In Vestigio öffnen", url: "https://vestigio.io/app/findings" },
		},
		vestigio_regression: {
			name: "vestigio_regression",
			category: "UTILITY",
			body: "📉 Regression auf {{1}} erkannt.\n\n*{{2}}* hat sich seit dem letzten Audit verschlechtert.\n\nGesamte Regressionen: {{3}}.",
			params: ["domain", "headline", "count"],
			button: { type: "URL", text: "Änderungen anzeigen", url: "https://vestigio.io/app/findings" },
		},
		vestigio_page_down: {
			name: "vestigio_page_down",
			category: "UTILITY",
			body: "⚠️ Seite nicht erreichbar: {{1}}\n\nHTTP-Status: {{2}}\n\nWir benachrichtigen dich, sobald sie wieder online ist.",
			params: ["page_url", "status_code"],
			button: { type: "URL", text: "Vorfall anzeigen", url: "https://vestigio.io/app/findings" },
		},
		vestigio_magic_link: {
			name: "vestigio_magic_link",
			category: "AUTHENTICATION",
			body: "Dein Vestigio-Zugangscode lautet *{{1}}*.\n\nGültig für 10 Minuten. Nicht weitergeben.",
			params: ["code"],
		},
	},
};

// ──────────────────────────────────────────────
// Event → template mapping
// ──────────────────────────────────────────────

export const EVENT_TO_TEMPLATE: Partial<Record<NotificationEvent, string>> = {
	incident: "vestigio_incident",
	regression: "vestigio_regression",
	page_down: "vestigio_page_down",
	magic_link: "vestigio_magic_link",
};

export function getTemplateForEvent(
	event: NotificationEvent,
	language: WhatsAppLanguage = "pt_BR",
): WhatsAppTemplateDef | null {
	const templateName = EVENT_TO_TEMPLATE[event];
	if (!templateName) return null;
	return WHATSAPP_TEMPLATES[language]?.[templateName] ?? WHATSAPP_TEMPLATES.en_US[templateName] ?? null;
}

/**
 * Normalise a user's `locale` field ("pt-BR", "en", etc.) to a Meta-supported language.
 * Meta only accepts specific locale codes for templates.
 */
export function localeToWhatsAppLanguage(locale: string | null | undefined): WhatsAppLanguage {
	if (!locale) return "pt_BR";
	const l = locale.toLowerCase();
	if (l.startsWith("pt")) return "pt_BR";
	if (l.startsWith("es")) return "es_LA";
	if (l.startsWith("de")) return "de";
	return "en_US";
}

/**
 * Flatten the registry into a list for bulk registration at Meta.
 */
export function listAllTemplates(): Array<WhatsAppTemplateDef & { language: WhatsAppLanguage }> {
	const out: Array<WhatsAppTemplateDef & { language: WhatsAppLanguage }> = [];
	for (const [lang, templates] of Object.entries(WHATSAPP_TEMPLATES) as [WhatsAppLanguage, Record<string, WhatsAppTemplateDef>][]) {
		for (const tpl of Object.values(templates)) {
			out.push({ ...tpl, language: lang });
		}
	}
	return out;
}
