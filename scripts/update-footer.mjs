// Rewrites the `footer` namespace in each locale dictionary to match the
// current Footer component shape (tagline + 4 columns × items + copyright
// with {year} ICU placeholder). The previous namespace was orphaned —
// keys were present but no component consumed them, and the shape didn't
// match what the Footer actually rendered.
//
// Run: node scripts/update-footer.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dictDir = resolve(here, "..", "dictionary");

// Canonical shape — keep matched across locales.
const SHAPE = {
	tagline: null,
	social: { twitter: null, github: null },
	product: {
		title: null,
		features: null,
		solutions: null,
		pricing: null,
		demo: null,
	},
	resources: { title: null, blog: null, support: null, changelog: null },
	company: { title: null, about: null, contact: null },
	legal: { title: null, terms: null, privacy: null, refund: null },
	copyright: null,
};

// ── PT-BR (canonical) ─────────────────────────
const ptBR = {
	tagline:
		"A camada de inteligência que audita, monitora e otimiza a sua plataforma SaaS.",
	social: { twitter: "Twitter", github: "GitHub" },
	product: {
		title: "Produto",
		features: "Recursos",
		solutions: "Soluções",
		pricing: "Preços",
		demo: "Demonstração",
	},
	resources: {
		title: "Recursos",
		blog: "Blog",
		support: "Suporte",
		changelog: "Novidades",
	},
	company: {
		title: "Empresa",
		about: "Sobre",
		contact: "Contato",
	},
	legal: {
		title: "Legal",
		terms: "Termos de Uso",
		privacy: "Política de Privacidade",
		refund: "Política de Reembolso",
	},
	copyright: "© {year} Vestigio. Todos os direitos reservados.",
};

// ── EN ────────────────────────────────────────
const en = {
	tagline:
		"The intelligence layer that audits, monitors, and optimizes your SaaS platform.",
	social: { twitter: "Twitter", github: "GitHub" },
	product: {
		title: "Product",
		features: "Features",
		solutions: "Solutions",
		pricing: "Pricing",
		demo: "Demo",
	},
	resources: {
		title: "Resources",
		blog: "Blog",
		support: "Support",
		changelog: "Changelog",
	},
	company: {
		title: "Company",
		about: "About",
		contact: "Contact",
	},
	legal: {
		title: "Legal",
		terms: "Terms of Use",
		privacy: "Privacy Policy",
		refund: "Refund Policy",
	},
	copyright: "© {year} Vestigio. All rights reserved.",
};

// ── ES ────────────────────────────────────────
const es = {
	tagline:
		"La capa de inteligencia que audita, monitorea y optimiza tu plataforma SaaS.",
	social: { twitter: "Twitter", github: "GitHub" },
	product: {
		title: "Producto",
		features: "Funciones",
		solutions: "Soluciones",
		pricing: "Precios",
		demo: "Demostración",
	},
	resources: {
		title: "Recursos",
		blog: "Blog",
		support: "Soporte",
		changelog: "Novedades",
	},
	company: {
		title: "Empresa",
		about: "Acerca de",
		contact: "Contacto",
	},
	legal: {
		title: "Legal",
		terms: "Términos de Uso",
		privacy: "Política de Privacidad",
		refund: "Política de Reembolso",
	},
	copyright: "© {year} Vestigio. Todos los derechos reservados.",
};

// ── DE ────────────────────────────────────────
const de = {
	tagline:
		"Die Intelligence-Schicht, die Ihre SaaS-Plattform auditiert, überwacht und optimiert.",
	social: { twitter: "Twitter", github: "GitHub" },
	product: {
		title: "Produkt",
		features: "Funktionen",
		solutions: "Lösungen",
		pricing: "Preise",
		demo: "Demo",
	},
	resources: {
		title: "Ressourcen",
		blog: "Blog",
		support: "Support",
		changelog: "Änderungsprotokoll",
	},
	company: {
		title: "Unternehmen",
		about: "Über uns",
		contact: "Kontakt",
	},
	legal: {
		title: "Rechtliches",
		terms: "Nutzungsbedingungen",
		privacy: "Datenschutzrichtlinie",
		refund: "Rückerstattungsrichtlinie",
	},
	copyright: "© {year} Vestigio. Alle Rechte vorbehalten.",
};

// Cheap structural equality check to flag shape drift.
function verifyShape(obj, shape, path = "footer") {
	const missing = [];
	for (const key of Object.keys(shape)) {
		if (!(key in obj)) {
			missing.push(`${path}.${key}`);
			continue;
		}
		if (shape[key] && typeof shape[key] === "object") {
			missing.push(...verifyShape(obj[key], shape[key], `${path}.${key}`));
		}
	}
	return missing;
}

function writeLocale(filename, footer) {
	const missing = verifyShape(footer, SHAPE);
	if (missing.length) {
		throw new Error(`[${filename}] missing keys: ${missing.join(", ")}`);
	}
	const path = resolve(dictDir, filename);
	const raw = readFileSync(path, "utf8");
	const dict = JSON.parse(raw);
	dict.footer = footer;
	writeFileSync(path, JSON.stringify(dict, null, "\t") + "\n", "utf8");
	console.log(`[${filename}] footer updated`);
}

writeLocale("pt-BR.json", ptBR);
writeLocale("en.json", en);
writeLocale("es.json", es);
writeLocale("de.json", de);

console.log("✓ done");
