// ──────────────────────────────────────────────
// Pack: competitive_lens (Wave 24)
//
// Domain-level findings comparing your env to the user-curated
// competitor set. Reads signals emitted by competitive-signals.ts
// (which in turn read CompetitorPageSnapshot evidence emitted by
// the competitor-fetch enrichment pass).
//
// Two rules in Wave 24:
//
//   - copy_mirror_detected   (low/medium/high based on # competitors)
//       Frases hero/value-prop suas aparecem em N competidores —
//       diferenciação está sendo encurtada. Reasoning lista os
//       competidores e os exemplos de frases compartilhadas.
//
//   - trust_posture_lag      (low/medium/high based on delta)
//       Seu trust posture composite está abaixo da mediana do peer
//       set por X pontos. Reasoning explica os 4 sub-eixos
//       (headers, DMARC, SPF, HSTS) e qual deles mais penaliza.
//
// Signal field convention (set by extractCompetitiveSignals):
//   - copy_mirror_detected
//     • subject_label = top-mirrored competitor domain
//     • value         = count of competitors mirroring (string)
//     • numeric_value = total matching shingles across all
//     • description   = "<domain>: N frases (ex1 / ex2 / ex3) | ..."
//   - trust_posture_lag
//     • subject_label = "peer set"
//     • value         = "leve" | "moderado" | "severo"
//     • numeric_value = delta in points (peer_median - own_score)
//     • description   = "Você: X/100 — mediana de N concorrentes: Y/100"
// ──────────────────────────────────────────────

import {
	Inference,
	InferenceCategory,
	Signal,
	Scoping,
	IdGenerator,
	makeRef,
} from "../../domain";
import { createInference } from "../shared/builders";
import type { PackInput } from "../shared/types";

function inferCopyMirrorDetected(
	byKey: Map<string, Signal>,
	scoping: Scoping,
	cycle_ref: string,
	ids: IdGenerator,
): Inference[] {
	const sig = byKey.get("competitive.copy_mirror_detected");
	if (!sig) return [];
	const competitorCount = Number(sig.value) || 0;
	const totalMatches = sig.numeric_value ?? 0;
	const topDomain = sig.subject_label || "competidor";
	const summary = sig.description || "";

	// Severity:
	// - 1 competitor mirroring → low (pode ser coincidência ou cópia legítima)
	// - 2-3 competitors        → medium (padrão emergindo no mercado)
	// - 4+ competitors         → high (sua copy virou commodity de categoria)
	const severity =
		competitorCount >= 4 ? "high" : competitorCount >= 2 ? "medium" : "low";

	return [
		createInference({
			inference_key: "copy_mirror_detected",
			category: InferenceCategory.CopyMirrorDetected,
			conclusion: "copy_mirror_detected",
			conclusion_value: severity,
			severity_hint: severity,
			confidence: sig.confidence,
			scoping,
			cycle_ref,
			ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `${competitorCount} concorrente(s) compartilham frases-chave de hero / heading / CTA com você — ${totalMatches} fragmentos no total. Detalhe: ${summary}. ${
				severity === "high"
					? "Quando 4+ players ocupam o mesmo vocabulário, o termo virou commodity da categoria e você perdeu o ângulo de diferenciação que tinha. Reforce um pilar único (um benefício, um caso de uso, uma promessa de prazo) que nenhum dos outros entrega — e mude a hero pra liderar com ele."
					: severity === "medium"
						? "Padrão emergindo no mercado: outros estão copiando sua posição (ou todos chegaram à mesma frase paralelamente). Considere um teste A/B substituindo a hero por um ângulo que só você consegue defender — diferencial-de-produto concreto, prova social específica, ou um novo verbo de ação."
						: `Pode ser coincidência (vocabulário padrão da categoria) ou cópia legítima de ${topDomain}. Monitore — se um segundo competidor adotar nos próximos ciclos, o sinal cresce de severidade.`
			}`,
			reasoning_slots: {
				count: String(competitorCount),
				top_domain: topDomain,
				severity,
			},
		}),
	];
}

function inferTrustPostureLag(
	byKey: Map<string, Signal>,
	scoping: Scoping,
	cycle_ref: string,
	ids: IdGenerator,
): Inference[] {
	const sig = byKey.get("competitive.trust_posture_lag");
	if (!sig) return [];
	const delta = sig.numeric_value ?? 0;
	const bucket = sig.value;
	const description = sig.description || "";

	const severity = delta >= 30 ? "high" : delta >= 20 ? "medium" : "low";

	// Identify the weakest sub-eixo from existing signals so the
	// reasoning can name what's most penalizing you.
	const weaknesses: string[] = [];
	if (byKey.has("email.dmarc_absent")) weaknesses.push("DMARC ausente");
	else if (byKey.has("email.dmarc_policy_weak"))
		weaknesses.push("DMARC fraco (p=none ou p=quarantine)");
	if (byKey.has("email.spf_absent")) weaknesses.push("SPF ausente");
	if (byKey.has("hsts_missing")) weaknesses.push("HSTS ausente");
	if (byKey.has("csp_missing_or_weak"))
		weaknesses.push("CSP ausente ou fraco");
	const weaknessSummary =
		weaknesses.length > 0
			? `Subdomínios que mais penalizam: ${weaknesses.slice(0, 3).join(", ")}.`
			: "Os sub-eixos individuais estão razoáveis — o lag é cumulativo.";

	return [
		createInference({
			inference_key: "trust_posture_lag",
			category: InferenceCategory.TrustPostureLag,
			conclusion: "trust_posture_lag",
			conclusion_value: severity,
			severity_hint: severity,
			confidence: sig.confidence,
			scoping,
			cycle_ref,
			ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Seu trust posture composite está ${bucket} (${delta} pontos) abaixo da mediana dos concorrentes que você monitora. ${description}. ${weaknessSummary} O score combina 4 eixos observáveis (security headers HTTP, DMARC, SPF, HSTS) — cada eixo vale 25% do total. Em B2B esse é o sinal silencioso que separa "fornecedor sério" de "site qualquer um" antes do prospect chegar a falar com vendas. Atacar o eixo mais fraco primeiro normalmente fecha 60-70% do gap.`,
			reasoning_slots: {
				delta: String(delta),
				bucket,
				severity,
				weaknesses: weaknesses.slice(0, 3).join(", ") || "n/a",
			},
		}),
	];
}

function inferBrandSerpEncroachment(
	byKey: Map<string, Signal>,
	scoping: Scoping,
	cycle_ref: string,
	ids: IdGenerator,
): Inference[] {
	const sig = byKey.get("competitive.brand_serp_encroachment");
	if (!sig) return [];
	const encroacherCount = Number(sig.value) || 0;
	const bestRank = sig.numeric_value ?? 99;
	const topHost = sig.subject_label || "concorrente";
	const description = sig.description || "";

	// Severity:
	// - 1 encroacher at rank ≥4 → medium (visível mas baixo)
	// - 1 encroacher em top-3   → high (intercepta tráfego de marca)
	// - 2+ encroachers          → high (sua marca virou commodity de busca)
	const severity =
		encroacherCount >= 2 ? "high" : bestRank <= 3 ? "high" : "medium";

	return [
		createInference({
			inference_key: "brand_serp_encroachment",
			category: InferenceCategory.BrandSerpEncroachment,
			conclusion: "brand_serp_encroachment",
			conclusion_value: severity,
			severity_hint: severity,
			confidence: sig.confidence,
			scoping,
			cycle_ref,
			ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `${encroacherCount} concorrente(s) aparecem nos top-${5} resultados orgânicos quando alguém busca pela sua marca. Detalhe: ${description}. Esse é o sinal mais valioso de SERP — usuário digitou seu nome (alta intenção de compra) e encontrou outra coisa. ${
				severity === "high"
					? bestRank <= 3
						? `${topHost} está em rank #${bestRank} — captura prospects que iam pra você. Auditar (1) se a página deles cita você no copy (concorrência direta), (2) se rankeiam pra termo similar mas não comparativo (commodity de categoria), ou (3) se é um afiliado ou marketplace listando você. Cada caso pede ação diferente: produção de conteúdo defensivo, comparativos honestos, ou cease-and-desist.`
						: `Múltiplos concorrentes ocupam o espaço da sua marca. Sua SERP de marca está saturada — produza páginas próprias respondendo às top-related queries ("vs", "review", "preço", "alternativas") pra retomar posições.`
					: `Encroachment leve. Monitore — se mais um competidor entrar nos próximos ciclos ou subir pra top-3, o sinal escala. Considere publicar conteúdo institucional na home (FAQ, comparativos, depoimentos) que ranqueie pela sua marca antes de competidores chegarem.`
			}`,
			reasoning_slots: {
				count: String(encroacherCount),
				best_rank: String(bestRank),
				top_host: topHost,
				severity,
			},
		}),
	];
}

function inferSerpOverlapDetected(
	byKey: Map<string, Signal>,
	scoping: Scoping,
	cycle_ref: string,
	ids: IdGenerator,
): Inference[] {
	const sig = byKey.get("competitive.serp_overlap_detected");
	if (!sig) return [];
	const overlapCount = Number(sig.value) || 0;
	const topQueries = sig.numeric_value ?? 0;
	const topHost = sig.subject_label || "concorrente";
	const description = sig.description || "";

	// Severity:
	// - 1-2 overlapping competitors  → low (campo amplo, normal)
	// - 3-4                          → medium (concentração começando)
	// - 5+                           → high (mercado saturado, atenção dispersa)
	const severity =
		overlapCount >= 5 ? "high" : overlapCount >= 3 ? "medium" : "low";

	return [
		createInference({
			inference_key: "serp_overlap_detected",
			category: InferenceCategory.SerpOverlapDetected,
			conclusion: "serp_overlap_detected",
			conclusion_value: severity,
			severity_hint: severity,
			confidence: sig.confidence,
			scoping,
			cycle_ref,
			ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `${overlapCount} concorrente(s) ocupam SERPs de categoria com você — mais relevante: ${topHost} (aparece em ${topQueries} das queries observadas). Detalhe: ${description}. Esses são candidatos a peer set ainda não curados — ${
				severity === "high"
					? "categoria saturada. Foque diferenciação clara em vez de competir em volume de keywords — quando 5+ players ocupam as mesmas SERPs, vencer em busca genérica vira concurso de orçamento de SEO."
					: severity === "medium"
						? "concentração emergindo. Avalie cada um: se ranqueiam acima de você em queries com intenção de compra, é hora de fortalecer landing pages pra essas queries específicas."
						: "campo ainda amplo. Marque os mais ranqueados como concorrentes pra entrar no monitoramento de copy mirror + trust posture dos próximos ciclos."
			}. ${overlapCount > 0 ? "Os candidatos já foram adicionados ao Radar como 'Auto-descobertos' — abra a Lente Competitiva pra pinar os que importam." : ""}`,
			reasoning_slots: {
				count: String(overlapCount),
				top_host: topHost,
				top_queries: String(topQueries),
				severity,
			},
		}),
	];
}

export function computeCompetitiveLensPack(input: PackInput): Inference[] {
	const { byKey, scoping, cycle_ref, ids } = input;
	const out: Inference[] = [];
	out.push(...inferCopyMirrorDetected(byKey, scoping, cycle_ref, ids));
	out.push(...inferTrustPostureLag(byKey, scoping, cycle_ref, ids));
	// Wave 25 — offensive radar
	out.push(...inferBrandSerpEncroachment(byKey, scoping, cycle_ref, ids));
	out.push(...inferSerpOverlapDetected(byKey, scoping, cycle_ref, ids));
	return out;
}
