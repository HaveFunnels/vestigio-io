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

export function computeCompetitiveLensPack(input: PackInput): Inference[] {
	const { byKey, scoping, cycle_ref, ids } = input;
	const out: Inference[] = [];
	out.push(...inferCopyMirrorDetected(byKey, scoping, cycle_ref, ids));
	out.push(...inferTrustPostureLag(byKey, scoping, cycle_ref, ids));
	return out;
}
