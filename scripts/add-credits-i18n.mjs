// Adds the `console.billing.credits` + `console.billing.errors.packs_unavailable`
// strings to every locale dictionary. Also updates the billing.errors namespace
// if the packs_unavailable key is missing.
//
// Run: node scripts/add-credits-i18n.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dictDir = resolve(here, "..", "dictionary");

const COPY = {
	"pt-BR": {
		credits: {
			section_title: "Créditos de Verificação",
			section_subtitle:
				"Créditos extras são usados quando você excede o limite mensal do seu plano. Não expiram.",
			balance_included: "Incluídos no plano",
			balance_purchased: "Comprados",
			balance_available: "Disponíveis",
			balance_consumed: "Consumidos neste ciclo",
			buy_more: "Comprar créditos",
			pack_heading: "Escolha um pacote",
			pack_subheading:
				"Pagamento único. Os créditos são adicionados automaticamente na sua conta após a confirmação.",
			pack_credits: "{credits} créditos",
			pack_small_desc: "Para meses com pico esporádico.",
			pack_medium_desc: "Melhor custo-benefício para uso recorrente.",
			pack_large_desc: "Para equipes que dependem de verificações contínuas.",
			pack_cta: "Comprar por {price}",
			only_max:
				"Pacotes de crédito extras estão disponíveis apenas no plano Max. Faça upgrade para desbloquear.",
			close: "Fechar",
			pricing_note:
				"Os preços são cobrados em USD fora do Brasil e em BRL no Brasil, definidos automaticamente pelo seu endereço de cobrança.",
			processing: "Abrindo checkout…",
		},
		packs_unavailable:
			"Os pacotes de crédito ainda não estão disponíveis. Tente novamente em instantes.",
	},
	en: {
		credits: {
			section_title: "Verification Credits",
			section_subtitle:
				"Extra credits kick in when you exceed your plan's monthly allowance. They never expire.",
			balance_included: "Included in plan",
			balance_purchased: "Purchased",
			balance_available: "Available",
			balance_consumed: "Consumed this cycle",
			buy_more: "Buy credits",
			pack_heading: "Pick a pack",
			pack_subheading:
				"One-time payment. Credits are added to your account automatically once the purchase clears.",
			pack_credits: "{credits} credits",
			pack_small_desc: "For months with an occasional spike.",
			pack_medium_desc: "Best value for recurring heavy usage.",
			pack_large_desc: "For teams that rely on continuous verification.",
			pack_cta: "Buy for {price}",
			only_max:
				"Credit packs are available on the Max plan only. Upgrade to unlock.",
			close: "Close",
			pricing_note:
				"Charged in USD outside Brazil and in BRL within Brazil, set automatically based on your billing address.",
			processing: "Opening checkout…",
		},
		packs_unavailable:
			"Credit packs are not available right now. Please try again in a moment.",
	},
	es: {
		credits: {
			section_title: "Créditos de Verificación",
			section_subtitle:
				"Los créditos adicionales se activan cuando superas el límite mensual de tu plan. No caducan.",
			balance_included: "Incluidos en el plan",
			balance_purchased: "Comprados",
			balance_available: "Disponibles",
			balance_consumed: "Consumidos este ciclo",
			buy_more: "Comprar créditos",
			pack_heading: "Elige un paquete",
			pack_subheading:
				"Pago único. Los créditos se agregan automáticamente a tu cuenta una vez confirmada la compra.",
			pack_credits: "{credits} créditos",
			pack_small_desc: "Para meses con picos puntuales.",
			pack_medium_desc: "Mejor relación calidad-precio para uso recurrente.",
			pack_large_desc: "Para equipos que dependen de verificaciones continuas.",
			pack_cta: "Comprar por {price}",
			only_max:
				"Los paquetes de créditos solo están disponibles en el plan Max. Mejora tu plan para desbloquearlos.",
			close: "Cerrar",
			pricing_note:
				"Se cobra en USD fuera de Brasil y en BRL dentro de Brasil, según tu dirección de facturación.",
			processing: "Abriendo el checkout…",
		},
		packs_unavailable:
			"Los paquetes de crédito no están disponibles por ahora. Inténtalo de nuevo en unos instantes.",
	},
	de: {
		credits: {
			section_title: "Verifizierungs-Credits",
			section_subtitle:
				"Zusätzliche Credits greifen, wenn Sie Ihr monatliches Kontingent überschreiten. Sie verfallen nicht.",
			balance_included: "Im Plan enthalten",
			balance_purchased: "Gekauft",
			balance_available: "Verfügbar",
			balance_consumed: "In diesem Zyklus verbraucht",
			buy_more: "Credits kaufen",
			pack_heading: "Paket auswählen",
			pack_subheading:
				"Einmalige Zahlung. Credits werden Ihrem Konto nach der Bestätigung automatisch gutgeschrieben.",
			pack_credits: "{credits} Credits",
			pack_small_desc: "Für Monate mit gelegentlichen Spitzen.",
			pack_medium_desc: "Bestes Preis-Leistungs-Verhältnis bei regelmäßigem Bedarf.",
			pack_large_desc: "Für Teams mit dauerhaft hohem Verifizierungsbedarf.",
			pack_cta: "Für {price} kaufen",
			only_max:
				"Credit-Pakete sind nur im Max-Plan verfügbar. Upgrade zum Freischalten.",
			close: "Schließen",
			pricing_note:
				"Abrechnung in USD außerhalb Brasiliens und in BRL innerhalb Brasiliens — automatisch anhand Ihrer Rechnungsadresse gesetzt.",
			processing: "Checkout wird geöffnet…",
		},
		packs_unavailable:
			"Credit-Pakete sind derzeit nicht verfügbar. Bitte versuchen Sie es gleich erneut.",
	},
};

function updateLocale(filename, locale) {
	const path = resolve(dictDir, filename);
	const raw = readFileSync(path, "utf8");
	const dict = JSON.parse(raw);

	if (!dict.console) throw new Error(`[${filename}] missing console namespace`);
	if (!dict.console.billing)
		throw new Error(`[${filename}] missing console.billing namespace`);

	dict.console.billing.credits = COPY[locale].credits;
	dict.console.billing.errors = dict.console.billing.errors || {};
	dict.console.billing.errors.packs_unavailable =
		COPY[locale].packs_unavailable;

	writeFileSync(path, JSON.stringify(dict, null, "\t") + "\n", "utf8");
	console.log(`[${filename}] credits namespace added (${locale})`);
}

updateLocale("pt-BR.json", "pt-BR");
updateLocale("en.json", "en");
updateLocale("es.json", "es");
updateLocale("de.json", "de");

console.log("✓ done");
