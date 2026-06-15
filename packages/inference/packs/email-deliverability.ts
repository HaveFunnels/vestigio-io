// ──────────────────────────────────────────────
// Pack: email_deliverability (Wave 23.1)
//
// Domain-level findings on email authentication posture: DMARC, SPF,
// DKIM, BIMI. Each finding cites the exact DNS record (or its
// absence) so the operator can copy-paste the fix.
//
// Six rules:
//   - dmarc_record_absent   (critical) — no DMARC at all → phishing
//                                        is trivially possible
//   - dmarc_policy_weak     (high)     — p=none / p=quarantine; the
//                                        record exists but isn't
//                                        actually blocking
//   - spf_record_absent     (high)     — no SPF on the apex; receivers
//                                        can't validate the sender
//   - spf_includes_too_broad (medium)  — +all (open relay) or
//                                        include_count > 10 (resolver
//                                        will reject)
//   - dkim_selector_missing (medium)   — no DKIM signature on common
//                                        provider selectors
//   - bimi_unconfigured     (low)      — brand-logo opportunity in
//                                        Gmail / Apple Mail / Yahoo
//
// Signal field convention (set by extractEmailDeliverabilitySignals):
//   - subject_label = apex domain
//   - value         = primary discriminator (policy / qualifier / "false")
//   - numeric_value = secondary scalar (include_count, has_rua flag)
//   - description   = raw DNS record text (already truncated to 280 chars)
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

function apexOf(sig: Signal): string {
	return sig.subject_label || "seu domínio";
}

function rawOf(sig: Signal): string {
	return sig.description && sig.description.length > 0
		? sig.description
		: "(registro ausente)";
}

function inferDmarcAbsent(
	byKey: Map<string, Signal>,
	scoping: Scoping,
	cycle_ref: string,
	ids: IdGenerator,
): Inference[] {
	const sig = byKey.get("email.dmarc_absent");
	if (!sig) return [];
	const apex = apexOf(sig);
	return [
		createInference({
			inference_key: "dmarc_record_absent",
			category: InferenceCategory.DmarcRecordAbsent,
			conclusion: "dmarc_record_absent",
			conclusion_value: "critical",
			severity_hint: "critical",
			confidence: sig.confidence,
			scoping,
			cycle_ref,
			ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Sem DMARC em \`_dmarc.${apex}\`. Receivers (Gmail, Outlook, Yahoo) não têm como saber se uma mensagem assinando como @${apex} é legítima. Qualquer atacante pode mandar phishing se passando por sua marca e os destinatários veem como "vindo de você". DMARC é a primeira camada de defesa contra spoofing de marca, e a ausência total é table-stakes para reputação. Mesmo um \`p=none\` inicial (monitoramento) já estabelece a chain of trust.`,
			reasoning_slots: { apex },
		}),
	];
}

function inferDmarcPolicyWeak(
	byKey: Map<string, Signal>,
	scoping: Scoping,
	cycle_ref: string,
	ids: IdGenerator,
): Inference[] {
	const sig = byKey.get("email.dmarc_policy_weak");
	if (!sig) return [];
	const policy = sig.value;
	const apex = apexOf(sig);
	const hasRua = (sig.numeric_value ?? 0) > 0;
	const raw = rawOf(sig);
	// Severity: p=none with no `rua=` is high (nem monitora nem bloqueia);
	// p=quarantine is high (atacante consegue ainda entregar no spam);
	// p=none com rua é medium (pelo menos monitora pra calibrar).
	const severity = policy === "quarantine" ? "high" : hasRua ? "medium" : "high";
	return [
		createInference({
			inference_key: "dmarc_policy_weak",
			category: InferenceCategory.DmarcPolicyWeak,
			conclusion: "dmarc_policy_weak",
			conclusion_value: severity,
			severity_hint: severity,
			confidence: sig.confidence,
			scoping,
			cycle_ref,
			ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `DMARC presente mas com política fraca (\`p=${policy}\`) em \`_dmarc.${apex}\`. Registro atual: \`${raw}\`. Com \`p=none\` o receiver registra a violação mas entrega a mensagem; com \`p=quarantine\` cai no spam (atacante ainda alcança quem garimpa lixeira). Só \`p=reject\` bloqueia phishing de marca de forma efetiva. ${hasRua ? "Você já recebe relatórios via `rua=`. Boa base para calibrar antes de subir pra reject." : "Sem `rua=` configurado, você nem sabe quem está spoofando seu domínio."} Migração padrão: 2 semanas em \`none\` + \`rua\`, 2 semanas em \`quarantine\` (com \`pct=10\` crescendo), depois \`reject\`.`,
			reasoning_slots: { policy, severity, apex, hasRua: hasRua ? "yes" : "no" },
		}),
	];
}

function inferSpfAbsent(
	byKey: Map<string, Signal>,
	scoping: Scoping,
	cycle_ref: string,
	ids: IdGenerator,
): Inference[] {
	const sig = byKey.get("email.spf_absent");
	if (!sig) return [];
	const apex = apexOf(sig);
	return [
		createInference({
			inference_key: "spf_record_absent",
			category: InferenceCategory.SpfRecordAbsent,
			conclusion: "spf_record_absent",
			conclusion_value: "high",
			severity_hint: "high",
			confidence: sig.confidence,
			scoping,
			cycle_ref,
			ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Sem registro SPF (\`v=spf1\`) em ${apex}. SPF declara quais servidores podem enviar email pelo seu domínio; sem ele, receivers não conseguem validar a origem e suas mensagens transacionais (confirmação de pedido, reset de senha) caem no spam com mais facilidade. Configure pelo menos \`v=spf1 include:<seu-provedor> -all\`. Onde \`<seu-provedor>\` é o include padrão do seu ESP (ex: \`include:_spf.google.com\` para Workspace, \`include:spf.protection.outlook.com\` para Microsoft 365).`,
			reasoning_slots: { apex },
		}),
	];
}

function inferSpfTooBroad(
	byKey: Map<string, Signal>,
	scoping: Scoping,
	cycle_ref: string,
	ids: IdGenerator,
): Inference[] {
	const sig = byKey.get("email.spf_includes_too_broad");
	if (!sig) return [];
	const apex = apexOf(sig);
	const qualifier = sig.value;
	const includeCount = sig.numeric_value ?? 0;
	const limit = 10;
	const raw = rawOf(sig);

	const isOpenRelay = qualifier === "+";
	const isOverLimit = includeCount > limit;
	const severity = isOpenRelay ? "high" : "medium";
	const issue = isOpenRelay
		? `terminação \`+all\` deixa qualquer servidor enviar email se passando pelo ${apex}. Efetivamente o registro não bloqueia nada (open relay).`
		: `${includeCount} \`include:\` mechanisms. Acima do limite de ${limit} lookups DNS do SPF (RFC 7208 §4.6.4). Receivers retornam permerror e ignoram o registro inteiro, então sua política de "quem pode enviar" deixa de valer.`;

	return [
		createInference({
			inference_key: "spf_includes_too_broad",
			category: InferenceCategory.SpfIncludesTooBroad,
			conclusion: "spf_includes_too_broad",
			conclusion_value: severity,
			severity_hint: severity,
			confidence: sig.confidence,
			scoping,
			cycle_ref,
			ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `SPF do ${apex} mal-configurado: ${issue} Registro atual: \`${raw}\`. ${isOpenRelay ? "Troque `+all` por `-all` (hardfail) ou `~all` (softfail) após validar que todos os ESPs legítimos estão nos includes." : "Reduza o número de includes: consolide ESPs em um sub-domínio dedicado (`mail.seudominio.com`) ou use SPF flattening (UI: spf-flatten, EasyDMARC, etc) para trazer os includes pra dentro do registro."}`,
			reasoning_slots: { apex, qualifier, includeCount: String(includeCount), severity },
		}),
	];
}

function inferDkimSelectorMissing(
	byKey: Map<string, Signal>,
	scoping: Scoping,
	cycle_ref: string,
	ids: IdGenerator,
): Inference[] {
	const sig = byKey.get("email.dkim_selector_missing");
	if (!sig) return [];
	const apex = apexOf(sig);
	// description format: "probed: <selector1>, <selector2>, ..."
	const probedRaw = sig.description ?? "";
	const probed = probedRaw.startsWith("probed: ")
		? probedRaw.slice("probed: ".length).split(", ")
		: [];
	return [
		createInference({
			inference_key: "dkim_selector_missing",
			category: InferenceCategory.DkimSelectorMissing,
			conclusion: "dkim_selector_missing",
			conclusion_value: "medium",
			severity_hint: "medium",
			confidence: sig.confidence,
			scoping,
			cycle_ref,
			ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Nenhuma assinatura DKIM (\`v=DKIM1\`) encontrada em selectors comuns para ${apex} (testamos: ${probed.slice(0, 6).join(", ")}${probed.length > 6 ? "…" : ""}). DKIM assina criptograficamente cada email para o receiver verificar que o conteúdo não foi adulterado em trânsito. Sem ele, DMARC com \`p=reject\` ainda bloqueia spoofing mas a mensagem pode ser modificada por proxies maliciosos. Confirme com seu ESP qual selector eles usam (Google: \`google\`, SendGrid: \`s1.domainkey\`, Mailgun: \`k1\`/\`pic\`) e publique o registro \`<selector>._domainkey.${apex}\`.`,
			reasoning_slots: { apex },
		}),
	];
}

function inferBimiUnconfigured(
	byKey: Map<string, Signal>,
	scoping: Scoping,
	cycle_ref: string,
	ids: IdGenerator,
): Inference[] {
	const sig = byKey.get("email.bimi_unconfigured");
	if (!sig) return [];
	const apex = apexOf(sig);
	return [
		createInference({
			inference_key: "bimi_unconfigured",
			category: InferenceCategory.BimiUnconfigured,
			conclusion: "bimi_unconfigured",
			conclusion_value: "low",
			severity_hint: "low",
			confidence: sig.confidence,
			scoping,
			cycle_ref,
			ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `BIMI não configurado em \`default._bimi.${apex}\`. BIMI faz seu logo de marca aparecer ao lado de cada email na inbox do Gmail, Apple Mail e Yahoo. Sinal visual de autenticidade que aumenta open-rate em emails transacionais (~10% em estudos). Pré-requisito: DMARC com \`p=quarantine\` ou \`p=reject\`. Passos: publique seu SVG no formato BIMI no domínio, obtenha um VMC (Verified Mark Certificate) se quiser logo no Gmail (custo: ~$1k/ano, opcional fora do Gmail), adicione o registro \`v=BIMI1; l=<url-do-svg>; a=<url-do-vmc>\` em \`default._bimi.${apex}\`.`,
			reasoning_slots: { apex },
		}),
	];
}

export function computeEmailDeliverabilityPack(input: PackInput): Inference[] {
	const { byKey, scoping, cycle_ref, ids } = input;
	const out: Inference[] = [];
	out.push(...inferDmarcAbsent(byKey, scoping, cycle_ref, ids));
	out.push(...inferDmarcPolicyWeak(byKey, scoping, cycle_ref, ids));
	out.push(...inferSpfAbsent(byKey, scoping, cycle_ref, ids));
	out.push(...inferSpfTooBroad(byKey, scoping, cycle_ref, ids));
	out.push(...inferDkimSelectorMissing(byKey, scoping, cycle_ref, ids));
	out.push(...inferBimiUnconfigured(byKey, scoping, cycle_ref, ids));
	return out;
}
