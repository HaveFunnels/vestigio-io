// ──────────────────────────────────────────────
// Action title catalog — single source of truth (Path 3)
//
// Every Action.title that the engine emits originates here. The
// previous architecture scattered the strings across 30+ `tr('key',
// 'English fallback')` call sites in decision/engine.ts, which had
// two side-effects: (a) titles drifted away from "verb-led
// prescription" toward "problem restated" prose, and (b) translation
// coverage was opaque — a missing locale just silently fell back to
// English.
//
// This catalog enforces:
//   1. Every (pack × tier × locale) combination is present at compile
//      time. The `satisfies Record<...>` clause makes TypeScript
//      reject a registration that omits a pack, tier, or locale.
//   2. Every title is VERB-LED. Strings start with an imperative verb
//      ("Pare", "Conserte", "Refine", etc.) so customers read them as
//      "what to do", not "what's wrong".
//   3. The lookup function is total — `getPackPrimary()` returns a
//      guaranteed non-empty string for every legal input, so callers
//      never need to provide an English fallback.
//
// HOW TO ADD A PACK:
//   1. Add the pack key to the `PackKey` union below.
//   2. Add an entry to `CATALOG` with all 4 tiers × 4 locales.
//   3. Ensure pt-BR / en / es / de all start with a verb (imperative).
//   4. Add a buildXActions function in decision/engine.ts that calls
//      `getPackPrimary(packKey, tier, translations?.locale)`.
//
// The module-load assertion at the bottom rejects an incomplete
// catalog at import time, so a missing combination crashes early
// (worker boot) instead of silently shipping English to a pt-BR
// customer.
// ──────────────────────────────────────────────

export type CatalogLocale = "en" | "pt-BR" | "es" | "de";

/** Tier of a decision pack's primary action — calibrated by impact. */
export type ActionTier = "incident" | "fix" | "optimize" | "strong";

/** Pack keys the engine knows how to emit primary actions for. */
export type PackKey =
	| "scale_readiness"
	| "revenue_integrity"
	| "chargeback"
	| "security_posture"
	| "copy_alignment"
	| "payment_health"
	| "discoverability"
	| "brand_integrity"
	| "saas_growth_readiness"
	| "channel_integrity"
	| "friction_tax"
	| "content_freshness"
	| "mobile_revenue_exposure"
	| "trust_revenue_gap"
	| "first_impression_revenue"
	| "action_value_map"
	| "acquisition_integrity"
	| "path_efficiency"
	| "default";

type LocalizedTitle = Record<CatalogLocale, string>;
type PackPrimaries = Record<ActionTier, LocalizedTitle>;

// ──────────────────────────────────────────────
// Catalog — every entry MUST be verb-led
// ──────────────────────────────────────────────

const CATALOG: Record<PackKey, PackPrimaries> = {
	scale_readiness: {
		incident: {
			en: "Stop scaling traffic until the critical scale-readiness gaps are closed.",
			"pt-BR": "Pare de escalar tráfego até fechar os bloqueios críticos de prontidão.",
			es: "Detenga el escalado de tráfico hasta cerrar las brechas críticas de preparación.",
			de: "Stoppen Sie die Traffic-Skalierung, bis die kritischen Skalierungslücken geschlossen sind.",
		},
		fix: {
			en: "Address the high-priority scale-readiness items before increasing traffic spend.",
			"pt-BR": "Trate os pontos críticos de prontidão antes de aumentar o investimento em tráfego.",
			es: "Atienda los puntos críticos de preparación antes de aumentar la inversión en tráfico.",
			de: "Adressieren Sie die kritischen Skalierungspunkte, bevor Sie die Traffic-Investitionen erhöhen.",
		},
		optimize: {
			en: "Refine secondary scale-readiness signals while traffic continues to scale.",
			"pt-BR": "Refine os sinais secundários de prontidão enquanto o tráfego continua escalando.",
			es: "Refine las señales secundarias de preparación mientras el tráfico sigue escalando.",
			de: "Verfeinern Sie die sekundären Skalierungssignale, während der Traffic weiter skaliert.",
		},
		strong: {
			en: "Maintain the current scale-readiness posture and monitor for regressions.",
			"pt-BR": "Mantenha a postura atual de prontidão e monitore regressões.",
			es: "Mantenga la postura actual de preparación y monitoree regresiones.",
			de: "Halten Sie die aktuelle Skalierungsbereitschaft aufrecht und überwachen Sie Regressionen.",
		},
	},
	revenue_integrity: {
		incident: {
			en: "Stop the active revenue leaks on the highest-impact surfaces this week.",
			"pt-BR": "Pare os vazamentos ativos de receita nos pontos de maior impacto esta semana.",
			es: "Detenga las fugas activas de ingresos en los puntos de mayor impacto esta semana.",
			de: "Stoppen Sie diese Woche die aktiven Umsatzlecks an den wirkungsvollsten Punkten.",
		},
		fix: {
			en: "Repair the structural revenue-path issues before scaling ad spend.",
			"pt-BR": "Conserte os problemas estruturais do caminho de receita antes de escalar o investimento em mídia.",
			es: "Repare los problemas estructurales del camino de ingresos antes de escalar la inversión publicitaria.",
			de: "Beheben Sie die strukturellen Probleme des Umsatzpfads, bevor Sie die Werbeausgaben skalieren.",
		},
		optimize: {
			en: "Optimize the revenue path to lift conversion at current traffic levels.",
			"pt-BR": "Otimize o caminho de receita para destravar conversão no volume de tráfego atual.",
			es: "Optimice el camino de ingresos para impulsar conversión en el volumen actual de tráfico.",
			de: "Optimieren Sie den Umsatzpfad, um die Conversion beim aktuellen Traffic-Niveau zu steigern.",
		},
		strong: {
			en: "Sustain the current revenue path and watch for new leakage signals.",
			"pt-BR": "Sustente o caminho de receita atual e fique de olho em novos sinais de vazamento.",
			es: "Sostenga el camino actual de ingresos y vigile nuevas señales de fuga.",
			de: "Erhalten Sie den aktuellen Umsatzpfad und achten Sie auf neue Leck-Signale.",
		},
	},
	chargeback: {
		incident: {
			en: "Treat chargeback exposure as an incident: publish refund/contact policies and add trust signals before processing more payments.",
			"pt-BR": "Trate a exposição a chargeback como incidente: publique políticas de reembolso/contato e sinais de confiança antes de aceitar mais pagamentos.",
			es: "Trate la exposición a chargeback como incidente: publique políticas de reembolso/contacto y señales de confianza antes de procesar más pagos.",
			de: "Behandeln Sie das Chargeback-Risiko als Vorfall: Veröffentlichen Sie Rückerstattungs-/Kontaktrichtlinien und Vertrauenssignale, bevor Sie weitere Zahlungen verarbeiten.",
		},
		fix: {
			en: "Strengthen refund policy, support channels, and trust signals before scaling acquisition.",
			"pt-BR": "Reforce política de reembolso, canais de suporte e sinais de confiança antes de escalar aquisição.",
			es: "Refuerce la política de reembolso, los canales de soporte y las señales de confianza antes de escalar adquisición.",
			de: "Stärken Sie Rückerstattungsrichtlinie, Support-Kanäle und Vertrauenssignale, bevor Sie die Akquise skalieren.",
		},
		optimize: {
			en: "Refine chargeback-prevention signals (clear refund copy, friendly support channels) while risk is low.",
			"pt-BR": "Refine os sinais de prevenção a chargeback (copy de reembolso clara, canais de suporte amigáveis) enquanto o risco está baixo.",
			es: "Refine las señales de prevención de chargeback (copy de reembolso clara, canales de soporte amigables) mientras el riesgo es bajo.",
			de: "Verfeinern Sie die Chargeback-Präventionssignale (klare Rückerstattungs-Copy, freundliche Support-Kanäle), solange das Risiko gering ist.",
		},
		strong: {
			en: "Keep chargeback resilience strong by maintaining policy + support presence on every commercial surface.",
			"pt-BR": "Mantenha a resiliência a chargeback forte preservando políticas e suporte em toda surface comercial.",
			es: "Mantenga la resiliencia a chargeback fuerte preservando políticas y soporte en cada superficie comercial.",
			de: "Erhalten Sie die Chargeback-Resilienz aufrecht, indem Sie Richtlinien und Support auf jeder Handelsoberfläche bewahren.",
		},
	},
	security_posture: {
		incident: {
			en: "Close the visible security gaps before processing another payment — buyers can see them today.",
			"pt-BR": "Feche os buracos de segurança visíveis antes de aceitar outro pagamento — compradores conseguem vê-los hoje.",
			es: "Cierre las brechas de seguridad visibles antes de procesar otro pago — los compradores pueden verlas hoy.",
			de: "Schließen Sie die sichtbaren Sicherheitslücken, bevor Sie eine weitere Zahlung verarbeiten — Käufer können sie heute sehen.",
		},
		fix: {
			en: "Harden security gaps that will be exploited at scale (HSTS, CSP, headers) before pushing more traffic.",
			"pt-BR": "Reforce as brechas de segurança que vão ser exploradas em escala (HSTS, CSP, headers) antes de empurrar mais tráfego.",
			es: "Refuerce las brechas de seguridad que serán explotadas a escala (HSTS, CSP, encabezados) antes de empujar más tráfico.",
			de: "Härten Sie Sicherheitslücken, die in großem Maßstab ausgenutzt werden (HSTS, CSP, Header), bevor Sie mehr Traffic generieren.",
		},
		optimize: {
			en: "Tighten remaining security hardening (modern TLS, granular CSP, redirect cleanup) while exposure is contained.",
			"pt-BR": "Aperte os ajustes de segurança restantes (TLS moderno, CSP granular, limpeza de redirects) enquanto a exposição está contida.",
			es: "Ajuste el endurecimiento de seguridad restante (TLS moderno, CSP granular, limpieza de redirects) mientras la exposición está contenida.",
			de: "Verschärfen Sie die verbleibende Sicherheitshärtung (modernes TLS, granulare CSP, Redirect-Bereinigung), solange die Belastung begrenzt ist.",
		},
		strong: {
			en: "Maintain the security posture; revisit on any new framework, deployment, or domain change.",
			"pt-BR": "Mantenha a postura de segurança; revise a cada novo framework, deploy ou mudança de domínio.",
			es: "Mantenga la postura de seguridad; revise ante cualquier framework, despliegue o cambio de dominio nuevo.",
			de: "Erhalten Sie die Sicherheitslage; überprüfen Sie bei jeder neuen Framework-, Deployment- oder Domain-Änderung.",
		},
	},
	copy_alignment: {
		incident: {
			en: "Rewrite the commercial copy that is actively losing high-intent buyers — start with hero + checkout messaging.",
			"pt-BR": "Reescreva a copy comercial que está perdendo compradores de alta intenção — comece pela copy de hero e checkout.",
			es: "Reescriba la copy comercial que está perdiendo compradores de alta intención — comience por copy de hero y checkout.",
			de: "Schreiben Sie die kommerzielle Copy neu, die hoch-intentionierte Käufer verliert — beginnen Sie mit Hero- und Checkout-Messaging.",
		},
		fix: {
			en: "Repair structural copy gaps (vague CTAs, missing outcomes, pricing context) before scaling acquisition.",
			"pt-BR": "Conserte as lacunas estruturais de copy (CTAs vagos, ausência de outcomes, contexto de preço) antes de escalar aquisição.",
			es: "Repare las brechas estructurales de copy (CTAs vagos, falta de resultados, contexto de precio) antes de escalar adquisición.",
			de: "Beheben Sie strukturelle Copy-Lücken (vage CTAs, fehlende Ergebnisse, Preiskontext), bevor Sie die Akquise skalieren.",
		},
		optimize: {
			en: "Refine the messaging — specificity, social proof, transformation language — to lift conversion at current traffic.",
			"pt-BR": "Refine a mensagem — especificidade, prova social, linguagem de transformação — para destravar conversão no tráfego atual.",
			es: "Refine el mensaje — especificidad, prueba social, lenguaje de transformación — para impulsar conversión en el tráfico actual.",
			de: "Verfeinern Sie das Messaging — Spezifität, Social Proof, Transformationssprache — um die Conversion beim aktuellen Traffic zu steigern.",
		},
		strong: {
			en: "Keep the copy aligned with the commercial intent; revisit when audience or product positioning shifts.",
			"pt-BR": "Mantenha a copy alinhada à intenção comercial; revise quando audiência ou posicionamento mudar.",
			es: "Mantenga la copy alineada con la intención comercial; revise cuando la audiencia o el posicionamiento cambien.",
			de: "Halten Sie die Copy auf die kommerzielle Absicht abgestimmt; überprüfen Sie bei Zielgruppen- oder Positionierungsänderungen.",
		},
	},
	payment_health: {
		incident: {
			en: "Intervene on the failing payment flow today — failed payments and silent churn are stacking month over month.",
			"pt-BR": "Intervenha hoje no fluxo de pagamento — falhas e churn silencioso estão acumulando mês a mês.",
			es: "Intervenga hoy en el flujo de pago — pagos fallidos y churn silencioso se acumulan mes a mes.",
			de: "Greifen Sie heute in den Zahlungsablauf ein — fehlgeschlagene Zahlungen und stilles Churn stapeln sich monatlich.",
		},
		fix: {
			en: "Fix the payment-health gaps (smart retries, dunning, card updater) before scaling subscriber acquisition.",
			"pt-BR": "Corrija as lacunas de payment health (smart retries, dunning, card updater) antes de escalar aquisição de assinantes.",
			es: "Corrija las brechas de payment health (reintentos inteligentes, dunning, actualización de tarjeta) antes de escalar adquisición.",
			de: "Beheben Sie die Payment-Health-Lücken (Smart Retries, Dunning, Card Updater), bevor Sie die Abonnenten-Akquise skalieren.",
		},
		optimize: {
			en: "Optimize payment recovery flows to shave a couple of basis points off involuntary churn.",
			"pt-BR": "Otimize os fluxos de recuperação de pagamento para reduzir uns pontos-base de churn involuntário.",
			es: "Optimice los flujos de recuperación de pagos para reducir algunos puntos básicos de churn involuntario.",
			de: "Optimieren Sie die Payment-Recovery-Flows, um einige Basispunkte unfreiwilliges Churn zu senken.",
		},
		strong: {
			en: "Maintain payment-health hygiene; review provider retry config once per quarter.",
			"pt-BR": "Mantenha a higiene de payment health; revise a configuração de retries do provider 1x por trimestre.",
			es: "Mantenga la higiene de payment health; revise la configuración de reintentos del proveedor 1 vez por trimestre.",
			de: "Erhalten Sie die Payment-Health-Hygiene; überprüfen Sie die Provider-Retry-Konfiguration einmal pro Quartal.",
		},
	},
	discoverability: {
		incident: {
			en: "Fix the discoverability gaps — AI assistants and search engines are silently routing buyers to competitors.",
			"pt-BR": "Feche as lacunas de discoverability — assistentes de IA e buscadores estão direcionando compradores silenciosamente pra concorrentes.",
			es: "Cierre las brechas de discoverability — los asistentes de IA y buscadores enrutan compradores silenciosamente a competidores.",
			de: "Schließen Sie die Discoverability-Lücken — KI-Assistenten und Suchmaschinen leiten Käufer still zu Wettbewerbern.",
		},
		fix: {
			en: "Add the high-leverage discoverability assets (llms.txt, schema, brand listings) before any paid-acquisition push.",
			"pt-BR": "Adicione os ativos de discoverability de alto leverage (llms.txt, schema, listings de marca) antes de qualquer push de mídia paga.",
			es: "Añada los activos de discoverability de alto apalancamiento (llms.txt, schema, listings de marca) antes de cualquier push de medios pagos.",
			de: "Fügen Sie die hochwirksamen Discoverability-Assets (llms.txt, Schema, Markeneinträge) hinzu, bevor Sie bezahlte Akquise starten.",
		},
		optimize: {
			en: "Refine AI-search visibility (structured data, content freshness, brand entity coverage) to compound organic reach.",
			"pt-BR": "Refine a visibilidade pra AI search (dados estruturados, freshness de conteúdo, cobertura de brand entity) pra compor alcance orgânico.",
			es: "Refine la visibilidad para AI search (datos estructurados, freshness de contenido, cobertura de marca) para componer alcance orgánico.",
			de: "Verfeinern Sie die AI-Search-Sichtbarkeit (strukturierte Daten, Content-Freshness, Marken-Entitätsabdeckung), um die organische Reichweite zu kumulieren.",
		},
		strong: {
			en: "Maintain content freshness and structured data; watch the AI Visibility Score for regressions.",
			"pt-BR": "Mantenha freshness de conteúdo e dados estruturados; acompanhe o AI Visibility Score atrás de regressões.",
			es: "Mantenga la freshness de contenido y los datos estructurados; vigile el AI Visibility Score por regresiones.",
			de: "Erhalten Sie Content-Freshness und strukturierte Daten; überwachen Sie den AI Visibility Score auf Regressionen.",
		},
	},
	brand_integrity: {
		incident: {
			en: "Defend brand integrity now — negative reputation, hijacked SERPs or phishing surfaces are bleeding buyers today.",
			"pt-BR": "Defenda a integridade da marca agora — reputação negativa, SERPs sequestradas ou superfícies de phishing estão sangrando compradores hoje.",
			es: "Defienda la integridad de marca ahora — reputación negativa, SERPs secuestradas o superficies de phishing pierden compradores hoy.",
			de: "Verteidigen Sie jetzt die Markenintegrität — negative Reputation, gekaperte SERPs oder Phishing-Oberflächen verlieren heute Käufer.",
		},
		fix: {
			en: "Close the brand-integrity gaps (review responses, SERP control, lookalike monitoring) before scaling brand awareness spend.",
			"pt-BR": "Feche as lacunas de brand integrity (respostas a review, controle de SERP, monitoramento de lookalikes) antes de escalar awareness paga.",
			es: "Cierre las brechas de brand integrity (respuestas a reseñas, control de SERP, monitoreo de lookalikes) antes de escalar awareness paga.",
			de: "Schließen Sie die Brand-Integrity-Lücken (Review-Antworten, SERP-Kontrolle, Lookalike-Monitoring), bevor Sie die Brand-Awareness-Ausgaben skalieren.",
		},
		optimize: {
			en: "Refine third-party platform presence (review cadence, social listening, brand SERP) while integrity is largely intact.",
			"pt-BR": "Refine a presença em plataformas terceiras (cadência de review, social listening, brand SERP) enquanto a integridade está largamente intacta.",
			es: "Refine la presencia en plataformas de terceros (cadencia de reseñas, social listening, brand SERP) mientras la integridad está mayormente intacta.",
			de: "Verfeinern Sie die Präsenz auf Drittplattformen (Review-Kadenz, Social Listening, Brand SERP), solange die Integrität weitgehend intakt ist.",
		},
		strong: {
			en: "Maintain review response cadence and lookalike monitoring; brand integrity is strong.",
			"pt-BR": "Mantenha a cadência de respostas a review e o monitoramento de lookalikes; integridade da marca está forte.",
			es: "Mantenga la cadencia de respuestas a reseñas y el monitoreo de lookalikes; la integridad de marca es fuerte.",
			de: "Erhalten Sie die Review-Antwort-Kadenz und das Lookalike-Monitoring; die Markenintegrität ist stark.",
		},
	},
	saas_growth_readiness: {
		incident: {
			en: "Fix trial-to-paid activation gaps before any new acquisition push — sign-ups are converting below baseline today.",
			"pt-BR": "Conserte as lacunas de ativação trial-to-paid antes de qualquer push novo de aquisição — sign-ups estão convertendo abaixo da baseline hoje.",
			es: "Corrija las brechas de activación trial-to-paid antes de cualquier push nuevo de adquisición — los sign-ups convierten por debajo de la baseline.",
			de: "Beheben Sie die Trial-to-Paid-Aktivierungslücken vor jedem neuen Akquise-Push — Sign-ups konvertieren heute unter der Baseline.",
		},
		fix: {
			en: "Close the structural activation + expansion gaps before scaling trial signups.",
			"pt-BR": "Feche as lacunas estruturais de ativação e expansão antes de escalar sign-ups de trial.",
			es: "Cierre las brechas estructurales de activación y expansión antes de escalar sign-ups de trial.",
			de: "Schließen Sie die strukturellen Aktivierungs- und Expansionslücken, bevor Sie Trial-Signups skalieren.",
		},
		optimize: {
			en: "Refine time-to-first-value and expansion paths while activation works at current scale.",
			"pt-BR": "Refine o time-to-first-value e os caminhos de expansão enquanto a ativação funciona no volume atual.",
			es: "Refine el time-to-first-value y los caminos de expansión mientras la activación funciona en el volumen actual.",
			de: "Verfeinern Sie Time-to-First-Value und Expansionspfade, während die Aktivierung im aktuellen Volumen funktioniert.",
		},
		strong: {
			en: "Maintain activation + expansion metrics; revisit when product or persona expands.",
			"pt-BR": "Mantenha as métricas de ativação e expansão; revise quando produto ou persona expandir.",
			es: "Mantenga las métricas de activación y expansión; revise cuando producto o persona se expanda.",
			de: "Erhalten Sie Aktivierungs- und Expansionsmetriken; überprüfen Sie bei Produkt- oder Persona-Erweiterung.",
		},
	},
	channel_integrity: {
		incident: {
			en: "Fix the broken channel attribution before scaling paid spend — campaigns are flying blind right now.",
			"pt-BR": "Conserte a atribuição de canal quebrada antes de escalar mídia paga — campanhas estão voando às cegas agora.",
			es: "Corrija la atribución de canal rota antes de escalar inversión paga — las campañas vuelan a ciegas ahora.",
			de: "Beheben Sie die kaputte Channel-Attribution, bevor Sie bezahlte Ausgaben skalieren — Kampagnen fliegen gerade blind.",
		},
		fix: {
			en: "Repair channel integrity (UTM hygiene, attribution windows, dedupe) before scaling acquisition budget.",
			"pt-BR": "Conserte a integridade de canal (higiene de UTM, janelas de atribuição, dedupe) antes de escalar orçamento de aquisição.",
			es: "Repare la integridad de canal (higiene de UTM, ventanas de atribución, dedupe) antes de escalar el presupuesto de adquisición.",
			de: "Reparieren Sie die Channel-Integrität (UTM-Hygiene, Attribution-Fenster, Dedupe), bevor Sie das Akquise-Budget skalieren.",
		},
		optimize: {
			en: "Refine channel reporting (incrementality, post-click cohorts) to sharpen budget allocation.",
			"pt-BR": "Refine o reporting de canal (incrementalidade, cohorts pós-clique) pra afiar a alocação de orçamento.",
			es: "Refine el reporting de canal (incrementalidad, cohortes post-clic) para afinar la asignación de presupuesto.",
			de: "Verfeinern Sie das Channel-Reporting (Inkrementalität, Post-Click-Kohorten), um die Budget-Allokation zu schärfen.",
		},
		strong: {
			en: "Maintain channel attribution hygiene; revisit when adding a new platform or campaign type.",
			"pt-BR": "Mantenha a higiene de atribuição de canal; revise ao adicionar plataforma nova ou tipo de campanha.",
			es: "Mantenga la higiene de atribución de canal; revise al añadir nueva plataforma o tipo de campaña.",
			de: "Erhalten Sie die Channel-Attribution-Hygiene; überprüfen Sie beim Hinzufügen einer neuen Plattform oder eines Kampagnentyps.",
		},
	},
	friction_tax: {
		incident: {
			en: "Cut the friction-tax surfaces that are pushing buyers out at the checkout — every redirect, extra field, or modal is bleeding revenue.",
			"pt-BR": "Corte as superfícies de friction-tax que empurram compradores pra fora no checkout — cada redirect, campo extra ou modal está sangrando receita.",
			es: "Reduzca las superficies de friction-tax que empujan compradores fuera del checkout — cada redirect, campo extra o modal pierde ingresos.",
			de: "Reduzieren Sie die Friction-Tax-Oberflächen, die Käufer aus dem Checkout drängen — jeder Redirect, jedes zusätzliche Feld oder Modal verliert Umsatz.",
		},
		fix: {
			en: "Reduce structural friction (form fields, redirects, forced logins) before scaling traffic to commercial pages.",
			"pt-BR": "Reduza a fricção estrutural (campos de formulário, redirects, logins obrigatórios) antes de escalar tráfego pra páginas comerciais.",
			es: "Reduzca la fricción estructural (campos de formulario, redirects, logins obligatorios) antes de escalar tráfico a páginas comerciales.",
			de: "Reduzieren Sie die strukturelle Friction (Formularfelder, Redirects, erzwungene Logins), bevor Sie den Traffic zu Handelsseiten skalieren.",
		},
		optimize: {
			en: "Trim residual friction (autofill, sticky CTAs, return-to-cart) to lift conversion in the current funnel.",
			"pt-BR": "Apare as fricções residuais (autofill, CTAs sticky, retorno ao carrinho) pra destravar conversão no funnel atual.",
			es: "Recorte las fricciones residuales (autofill, CTAs sticky, retorno al carrito) para impulsar conversión en el funnel actual.",
			de: "Beschneiden Sie die verbleibende Friction (Autofill, Sticky-CTAs, Rückkehr zum Warenkorb), um die Conversion im aktuellen Funnel zu steigern.",
		},
		strong: {
			en: "Keep the friction tax low; audit the checkout monthly to catch new fields creeping in.",
			"pt-BR": "Mantenha a friction tax baixa; audite o checkout mensalmente pra pegar campos novos infiltrando.",
			es: "Mantenga la friction tax baja; audite el checkout mensualmente para detectar nuevos campos infiltrándose.",
			de: "Halten Sie die Friction Tax niedrig; auditieren Sie den Checkout monatlich, um neue Felder zu entdecken.",
		},
	},
	content_freshness: {
		incident: {
			en: "Refresh the stale commercial pages today — prospects and AI assistants are reading outdated value props right now.",
			"pt-BR": "Atualize as páginas comerciais defasadas hoje — prospects e assistentes de IA estão lendo proposições de valor velhas agora.",
			es: "Actualice las páginas comerciales desactualizadas hoy — prospects y asistentes de IA leen propuestas de valor obsoletas ahora.",
			de: "Aktualisieren Sie heute die veralteten Handelsseiten — Interessenten und KI-Assistenten lesen gerade veraltete Value Props.",
		},
		fix: {
			en: "Refresh the high-traffic commercial pages on a quarterly cadence before scaling acquisition.",
			"pt-BR": "Atualize as páginas comerciais de alto tráfego em cadência trimestral antes de escalar aquisição.",
			es: "Actualice las páginas comerciales de alto tráfico en cadencia trimestral antes de escalar adquisición.",
			de: "Aktualisieren Sie die hoch-frequentierten Handelsseiten in einem Quartalsrhythmus, bevor Sie die Akquise skalieren.",
		},
		optimize: {
			en: "Maintain a content-freshness calendar to keep customer-facing copy on pace with the product.",
			"pt-BR": "Mantenha um calendário de content freshness pra manter a copy customer-facing no ritmo do produto.",
			es: "Mantenga un calendario de content freshness para mantener la copy de cara al cliente al ritmo del producto.",
			de: "Pflegen Sie einen Content-Freshness-Kalender, um die Customer-Facing-Copy im Produkttempo zu halten.",
		},
		strong: {
			en: "Sustain the current content-freshness cadence and audit annually.",
			"pt-BR": "Sustente a cadência atual de content freshness e audite anualmente.",
			es: "Sostenga la cadencia actual de content freshness y audite anualmente.",
			de: "Erhalten Sie die aktuelle Content-Freshness-Kadenz und auditieren Sie jährlich.",
		},
	},
	mobile_revenue_exposure: {
		incident: {
			en: "Repair the mobile checkout this week — most of your paid traffic is mobile and currently failing.",
			"pt-BR": "Conserte o checkout mobile esta semana — a maioria do seu tráfego pago é mobile e está falhando agora.",
			es: "Repare el checkout móvil esta semana — la mayoría de su tráfico pago es móvil y está fallando ahora.",
			de: "Reparieren Sie diese Woche den mobilen Checkout — der Großteil Ihres bezahlten Traffics ist mobil und fällt gerade aus.",
		},
		fix: {
			en: "Close the mobile-revenue gaps (form layout, tap targets, autofill) before scaling mobile spend.",
			"pt-BR": "Feche as lacunas de receita mobile (layout de formulário, tap targets, autofill) antes de escalar investimento mobile.",
			es: "Cierre las brechas de ingresos móviles (layout de formulario, tap targets, autofill) antes de escalar la inversión móvil.",
			de: "Schließen Sie die Mobile-Revenue-Lücken (Formular-Layout, Tap-Targets, Autofill), bevor Sie die mobile Investition skalieren.",
		},
		optimize: {
			en: "Refine mobile conversion details (sticky CTA, simplified pricing) to widen the lead the mobile funnel already has.",
			"pt-BR": "Refine os detalhes de conversão mobile (CTA sticky, pricing simplificado) pra ampliar a vantagem que o funnel mobile já tem.",
			es: "Refine los detalles de conversión móvil (CTA sticky, pricing simplificado) para ampliar la ventaja que el funnel móvil ya tiene.",
			de: "Verfeinern Sie die mobilen Conversion-Details (Sticky-CTA, vereinfachtes Pricing), um den Vorsprung des mobilen Funnels auszubauen.",
		},
		strong: {
			en: "Maintain the mobile experience; rerun a device-matrix test once per quarter.",
			"pt-BR": "Mantenha a experiência mobile; rode um teste de matriz de devices 1x por trimestre.",
			es: "Mantenga la experiencia móvil; ejecute un test de matriz de devices 1 vez por trimestre.",
			de: "Erhalten Sie die mobile Erfahrung; führen Sie einmal pro Quartal einen Geräte-Matrix-Test durch.",
		},
	},
	trust_revenue_gap: {
		incident: {
			en: "Restore visible trust signals at checkout immediately — buyers are landing and bouncing without seeing one.",
			"pt-BR": "Restaure sinais de confiança visíveis no checkout imediatamente — compradores chegam e desistem sem ver um.",
			es: "Restaure señales de confianza visibles en checkout inmediatamente — los compradores llegan y rebotan sin ver una.",
			de: "Stellen Sie sofort sichtbare Vertrauenssignale beim Checkout wieder her — Käufer landen und springen ab, ohne eines zu sehen.",
		},
		fix: {
			en: "Add the trust assets your peer set has (testimonials, security badges, guarantees) before scaling acquisition.",
			"pt-BR": "Adicione os ativos de confiança que seu peer set tem (depoimentos, selos de segurança, garantias) antes de escalar aquisição.",
			es: "Añada los activos de confianza que su peer set tiene (testimonios, sellos de seguridad, garantías) antes de escalar adquisición.",
			de: "Fügen Sie die Vertrauenssignale Ihres Peer-Sets hinzu (Testimonials, Sicherheitsbadges, Garantien), bevor Sie die Akquise skalieren.",
		},
		optimize: {
			en: "Refine trust placement (above the fold, near pricing, near checkout) to compound on the existing baseline.",
			"pt-BR": "Refine o posicionamento de trust (acima da dobra, perto de pricing, perto de checkout) pra compor na baseline existente.",
			es: "Refine la colocación de trust (sobre la línea de flotación, cerca de pricing, cerca de checkout) para componer en la baseline existente.",
			de: "Verfeinern Sie die Trust-Platzierung (über der Falte, bei Pricing, bei Checkout), um auf der bestehenden Baseline aufzubauen.",
		},
		strong: {
			en: "Maintain trust-asset hygiene; refresh testimonials annually and audit badges quarterly.",
			"pt-BR": "Mantenha a higiene de trust assets; atualize depoimentos anualmente e audite selos trimestralmente.",
			es: "Mantenga la higiene de trust assets; actualice testimonios anualmente y audite sellos trimestralmente.",
			de: "Erhalten Sie die Trust-Asset-Hygiene; aktualisieren Sie Testimonials jährlich und auditieren Sie Badges quartalsweise.",
		},
	},
	first_impression_revenue: {
		incident: {
			en: "Rewrite the homepage hero this week — first-impression conversion is leaking before buyers reach the second screen.",
			"pt-BR": "Reescreva o hero da homepage esta semana — a conversão de primeira impressão está vazando antes de comprador chegar à segunda tela.",
			es: "Reescriba el hero de la homepage esta semana — la conversión de primera impresión se fuga antes de que el comprador llegue a la segunda pantalla.",
			de: "Schreiben Sie diese Woche das Homepage-Hero neu — die First-Impression-Conversion läuft aus, bevor Käufer den zweiten Screen erreichen.",
		},
		fix: {
			en: "Close the first-impression gaps (above-the-fold CTA, outcome copy, social proof) before scaling top-of-funnel spend.",
			"pt-BR": "Feche as lacunas de primeira impressão (CTA acima da dobra, copy de outcome, prova social) antes de escalar gasto de topo de funil.",
			es: "Cierre las brechas de primera impresión (CTA sobre la línea de flotación, copy de resultado, prueba social) antes de escalar gasto de top-of-funnel.",
			de: "Schließen Sie die First-Impression-Lücken (Above-the-Fold-CTA, Outcome-Copy, Social Proof), bevor Sie die Top-of-Funnel-Ausgaben skalieren.",
		},
		optimize: {
			en: "Refine the hero (specificity, contrast, immediacy) to widen the first-impression conversion advantage you already have.",
			"pt-BR": "Refine o hero (especificidade, contraste, imediatismo) pra ampliar a vantagem de conversão de primeira impressão que já existe.",
			es: "Refine el hero (especificidad, contraste, inmediatez) para ampliar la ventaja de conversión de primera impresión que ya tiene.",
			de: "Verfeinern Sie das Hero (Spezifität, Kontrast, Unmittelbarkeit), um den First-Impression-Conversion-Vorteil auszubauen.",
		},
		strong: {
			en: "Maintain the first-impression performance; rerun a 5-second test when traffic source mix shifts.",
			"pt-BR": "Mantenha a performance de primeira impressão; rode um 5-second test quando o mix de tráfego mudar.",
			es: "Mantenga el desempeño de primera impresión; ejecute un 5-second test cuando el mix de tráfico cambie.",
			de: "Erhalten Sie die First-Impression-Performance; führen Sie einen 5-Second-Test durch, wenn sich der Traffic-Mix verschiebt.",
		},
	},
	action_value_map: {
		incident: {
			en: "Reconnect user actions to revenue immediately — the engine cannot tell which clicks drive value right now.",
			"pt-BR": "Reconecte ações de usuário a receita imediatamente — o engine não consegue dizer quais cliques geram valor agora.",
			es: "Reconecte acciones de usuario a ingresos inmediatamente — el engine no puede decir qué clics generan valor ahora.",
			de: "Verbinden Sie Nutzeraktionen sofort wieder mit Umsatz — die Engine kann derzeit nicht sagen, welche Klicks Wert erzeugen.",
		},
		fix: {
			en: "Wire action → revenue attribution (events, GA4 goals, server-side tracking) before scaling acquisition spend.",
			"pt-BR": "Conecte a atribuição ação → receita (eventos, goals GA4, tracking server-side) antes de escalar gasto de aquisição.",
			es: "Conecte la atribución acción → ingresos (eventos, goals GA4, tracking server-side) antes de escalar gasto de adquisición.",
			de: "Verdrahten Sie die Aktion → Umsatz-Attribution (Events, GA4-Ziele, Server-seitiges Tracking), bevor Sie die Akquise-Ausgaben skalieren.",
		},
		optimize: {
			en: "Refine the action-value map (event taxonomy, conversion funnels) to compound attribution clarity.",
			"pt-BR": "Refine o mapa ação-valor (taxonomia de eventos, funis de conversão) pra compor clareza de atribuição.",
			es: "Refine el mapa acción-valor (taxonomía de eventos, funnels de conversión) para componer claridad de atribución.",
			de: "Verfeinern Sie die Action-Value-Map (Event-Taxonomie, Conversion-Funnels), um die Attributions-Klarheit auszubauen.",
		},
		strong: {
			en: "Maintain the action-value map; reaudit when adding a new product surface or campaign type.",
			"pt-BR": "Mantenha o mapa ação-valor; reaudite ao adicionar surface de produto nova ou tipo de campanha.",
			es: "Mantenga el mapa acción-valor; reaudite al añadir nueva superficie de producto o tipo de campaña.",
			de: "Erhalten Sie die Action-Value-Map; auditieren Sie erneut beim Hinzufügen einer neuen Produkt-Oberfläche oder eines Kampagnentyps.",
		},
	},
	acquisition_integrity: {
		incident: {
			en: "Stop the paid traffic from leaking — landing pages, message match, and form completion are all underperforming today.",
			"pt-BR": "Pare o vazamento de tráfego pago — landing pages, match de mensagem e completion de formulário estão todos abaixo da baseline hoje.",
			es: "Detenga la fuga de tráfico pago — landing pages, match de mensaje y completion de formulario están todos por debajo de la baseline hoy.",
			de: "Stoppen Sie das Leck im bezahlten Traffic — Landing Pages, Message-Match und Formular-Completion sind heute alle unter der Baseline.",
		},
		fix: {
			en: "Repair the structural acquisition leaks (message match, page speed, conversion forms) before increasing budget.",
			"pt-BR": "Conserte os vazamentos estruturais de aquisição (match de mensagem, page speed, formulários de conversão) antes de aumentar o orçamento.",
			es: "Repare las fugas estructurales de adquisición (match de mensaje, page speed, formularios de conversión) antes de aumentar el presupuesto.",
			de: "Reparieren Sie die strukturellen Akquise-Lecks (Message-Match, Page-Speed, Conversion-Formulare), bevor Sie das Budget erhöhen.",
		},
		optimize: {
			en: "Refine the post-click journey (next-step clarity, social proof placement) to lift cost-per-acquisition.",
			"pt-BR": "Refine a jornada pós-clique (clareza de próximo passo, posicionamento de prova social) pra reduzir custo por aquisição.",
			es: "Refine la jornada post-clic (claridad de próximo paso, colocación de prueba social) para reducir el costo por adquisición.",
			de: "Verfeinern Sie die Post-Click-Journey (Next-Step-Klarheit, Social-Proof-Platzierung), um die Akquise-Kosten zu senken.",
		},
		strong: {
			en: "Maintain acquisition-integrity hygiene; audit landing pages quarterly against the active campaigns.",
			"pt-BR": "Mantenha a higiene de acquisition integrity; audite landing pages trimestralmente contra as campanhas ativas.",
			es: "Mantenga la higiene de acquisition integrity; audite landing pages trimestralmente contra las campañas activas.",
			de: "Erhalten Sie die Acquisition-Integrity-Hygiene; auditieren Sie Landing Pages quartalsweise gegen die aktiven Kampagnen.",
		},
	},
	path_efficiency: {
		incident: {
			en: "Shorten the conversion path immediately — buyers are clicking 4+ times where they should click 2.",
			"pt-BR": "Encurte o caminho de conversão imediatamente — compradores estão clicando 4+ vezes onde deveriam clicar 2.",
			es: "Acorte el camino de conversión inmediatamente — los compradores hacen clic 4+ veces donde deberían hacer clic 2.",
			de: "Verkürzen Sie sofort den Conversion-Pfad — Käufer klicken 4+ Mal, wo sie 2 Mal klicken sollten.",
		},
		fix: {
			en: "Repair the multi-step conversion paths (menu detours, content traps) before scaling acquisition.",
			"pt-BR": "Conserte os caminhos de conversão multi-etapa (desvios de menu, armadilhas de conteúdo) antes de escalar aquisição.",
			es: "Repare los caminos de conversión multi-etapa (desvíos de menú, trampas de contenido) antes de escalar adquisición.",
			de: "Reparieren Sie die Multi-Step-Conversion-Pfade (Menü-Umwege, Content-Fallen), bevor Sie die Akquise skalieren.",
		},
		optimize: {
			en: "Refine path efficiency (skip steps, persistent CTAs, smart defaults) to compound conversion gains.",
			"pt-BR": "Refine a eficiência de caminho (pular etapas, CTAs persistentes, defaults inteligentes) pra compor ganhos de conversão.",
			es: "Refine la eficiencia de camino (saltar etapas, CTAs persistentes, defaults inteligentes) para componer ganancias de conversión.",
			de: "Verfeinern Sie die Pfad-Effizienz (Schritte überspringen, persistente CTAs, intelligente Defaults), um Conversion-Gewinne auszubauen.",
		},
		strong: {
			en: "Sustain the current conversion path; rerun a click-count audit on each new product page launch.",
			"pt-BR": "Sustente o caminho de conversão atual; rode auditoria de cliques a cada lançamento de página de produto.",
			es: "Sostenga el camino de conversión actual; ejecute auditoría de clics en cada lanzamiento de página de producto.",
			de: "Erhalten Sie den aktuellen Conversion-Pfad; führen Sie bei jedem neuen Produktseiten-Launch ein Klick-Count-Audit durch.",
		},
	},
	default: {
		incident: {
			en: "Address the highest-severity findings this cycle before any traffic scale-up.",
			"pt-BR": "Trate os findings de severidade mais alta deste ciclo antes de qualquer escalada de tráfego.",
			es: "Atienda los findings de severidad más alta de este ciclo antes de cualquier escalada de tráfico.",
			de: "Adressieren Sie diesen Zyklus die Findings mit höchster Severity vor jeder Traffic-Skalierung.",
		},
		fix: {
			en: "Fix the top-priority findings before scaling acquisition.",
			"pt-BR": "Conserte os findings de maior prioridade antes de escalar aquisição.",
			es: "Corrija los findings de máxima prioridad antes de escalar adquisición.",
			de: "Beheben Sie die Top-Findings, bevor Sie die Akquise skalieren.",
		},
		optimize: {
			en: "Refine the secondary findings to lift conversion at current traffic.",
			"pt-BR": "Refine os findings secundários pra destravar conversão no tráfego atual.",
			es: "Refine los findings secundarios para impulsar conversión en el tráfico actual.",
			de: "Verfeinern Sie die sekundären Findings, um die Conversion beim aktuellen Traffic zu steigern.",
		},
		strong: {
			en: "Maintain the current posture and rerun the analysis on the next cycle.",
			"pt-BR": "Mantenha a postura atual e rode a análise no próximo ciclo.",
			es: "Mantenga la postura actual y ejecute el análisis en el próximo ciclo.",
			de: "Erhalten Sie die aktuelle Lage und führen Sie die Analyse im nächsten Zyklus erneut durch.",
		},
	},
} satisfies Record<PackKey, PackPrimaries>;

// ──────────────────────────────────────────────
// Total coverage assertion (runs at import time)
//
// If a new locale or tier is added to the union types above and a pack
// forgets to register it, this catches the gap at worker boot instead
// of silently shipping `undefined` to a customer. Throws with a clear
// list of missing combinations so the contributor knows exactly what
// to fill in.
// ──────────────────────────────────────────────

const REQUIRED_TIERS: ActionTier[] = ["incident", "fix", "optimize", "strong"];
const REQUIRED_LOCALES: CatalogLocale[] = ["en", "pt-BR", "es", "de"];

function assertCatalogCoverage(): void {
	const missing: string[] = [];
	for (const pack of Object.keys(CATALOG) as PackKey[]) {
		for (const tier of REQUIRED_TIERS) {
			const localeMap = CATALOG[pack]?.[tier];
			if (!localeMap) {
				missing.push(`${pack}.${tier} (entire tier missing)`);
				continue;
			}
			for (const locale of REQUIRED_LOCALES) {
				const value = localeMap[locale];
				if (typeof value !== "string" || value.trim().length === 0) {
					missing.push(`${pack}.${tier}.${locale}`);
				}
			}
		}
	}
	if (missing.length > 0) {
		throw new Error(
			`[action-title-catalog] Incomplete coverage. Missing ${missing.length} entries:\n  - ${missing.join("\n  - ")}\n` +
				`Every PackKey × ActionTier × CatalogLocale must have a verb-led title.`,
		);
	}
}

assertCatalogCoverage();

// ──────────────────────────────────────────────
// Lookup helper — total function, no English fallback needed
// ──────────────────────────────────────────────

/**
 * Returns the verb-led primary action title for a given pack/tier in the
 * requested locale. Guaranteed non-empty by the module-load coverage
 * assertion above — callers do not need to provide a fallback string.
 *
 * When `locale` is `undefined`, `null`, or any non-supported value,
 * falls back to English (the engine's canonical authoring locale).
 */
export function getPackPrimary(
	pack: PackKey,
	tier: ActionTier,
	locale: string | null | undefined,
): string {
	const resolvedLocale: CatalogLocale = isCatalogLocale(locale) ? locale : "en";
	return CATALOG[pack][tier][resolvedLocale];
}

function isCatalogLocale(locale: string | null | undefined): locale is CatalogLocale {
	return locale === "en" || locale === "pt-BR" || locale === "es" || locale === "de";
}

/**
 * Test helper — returns the list of missing (pack, tier, locale)
 * combinations. Used by the unit test that runs in CI to keep the
 * catalog complete. Returns an empty array on full coverage.
 */
export function listMissingPackPrimaries(): string[] {
	const missing: string[] = [];
	for (const pack of Object.keys(CATALOG) as PackKey[]) {
		for (const tier of REQUIRED_TIERS) {
			const localeMap = CATALOG[pack]?.[tier];
			if (!localeMap) {
				missing.push(`${pack}.${tier}`);
				continue;
			}
			for (const locale of REQUIRED_LOCALES) {
				const value = localeMap[locale];
				if (typeof value !== "string" || value.trim().length === 0) {
					missing.push(`${pack}.${tier}.${locale}`);
				}
			}
		}
	}
	return missing;
}

/**
 * Test helper — returns the list of titles that don't start with an
 * imperative verb. Heuristic: each locale has a short list of common
 * imperative-verb starts, and the title must begin with one (case
 * insensitive). This is the lint that enforces "verb-led prescription"
 * conceptually.
 */
export function listNonVerbLedTitles(): string[] {
	const offenders: string[] = [];
	for (const pack of Object.keys(CATALOG) as PackKey[]) {
		for (const tier of REQUIRED_TIERS) {
			for (const locale of REQUIRED_LOCALES) {
				const title = CATALOG[pack][tier][locale];
				if (!startsWithImperativeVerb(title, locale)) {
					offenders.push(`${pack}.${tier}.${locale}: "${title}"`);
				}
			}
		}
	}
	return offenders;
}

const IMPERATIVE_VERBS: Record<CatalogLocale, string[]> = {
	en: [
		"stop","close","fix","repair","refine","maintain","sustain","keep","add",
		"address","treat","tighten","harden","rewrite","reduce","trim","optimize",
		"refresh","intervene","reconnect","wire","shorten","restore","cut",
		"defend","strengthen",
	],
	"pt-BR": [
		"pare","feche","conserte","corrija","trate","reforce","refine","mantenha",
		"sustente","apare","reduza","atualize","intervenha","reconecte","conecte",
		"encurte","restaure","corte","defenda","reescreva","aperte","adicione",
		"ataque","aborde","otimize",
	],
	es: [
		"detenga","cierre","corrija","repare","trate","refuerce","refine",
		"mantenga","sostenga","reduzca","recorte","actualice","intervenga",
		"reconecte","conecte","acorte","restaure","defienda","reescriba",
		"ajuste","añada","atienda","optimice","reduce",
	],
	de: [
		"stoppen","schließen","beheben","reparieren","behandeln","stärken",
		"verfeinern","erhalten","aufrechterhalten","beschneiden","reduzieren",
		"aktualisieren","greifen","verbinden","verdrahten","verkürzen",
		"wiederherstellen","verteidigen","schreiben","verschärfen","härten",
		"halten","fügen","adressieren","optimieren","pflegen","stellen",
	],
};

function startsWithImperativeVerb(title: string, locale: CatalogLocale): boolean {
	const firstWord = title.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
	if (!firstWord) return false;
	// strip trailing punctuation
	const clean = firstWord.replace(/[.,;:!?]$/g, "");
	return IMPERATIVE_VERBS[locale].includes(clean);
}
