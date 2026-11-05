// ──────────────────────────────────────────────
// A positive finding may not contradict a measurement.
//
// The 2026-11 plan for a paying customer opened with "A continuidade de
// confiança na página inicial segue como ponto forte detectado neste
// ciclo" (trust_continuity_good, "O cliente fica no seu domínio durante
// o checkout") while another finding in the SAME cycle cited
// https://seguro.casamontelle.com/order/... The same document carried
// low_friction_checkout, "Seu caminho de compra está livre de fricção",
// while the behavioural section measured 37.7% of checkout sessions
// with friction.
//
// Positive checks are computed in the projection engine from the
// ABSENCE of problem inferences, and the engine cannot see either of
// those contradictions: the friction rates are aggregated in the plan
// layer from session data, and the checkout host comes from a sibling
// finding's source URL. So the gate belongs here, where both are in
// hand, and it is a gate rather than a rewrite because the honest
// move is to withhold the compliment, not to soften it.
//
// Pure on purpose: the rules are the thing worth asserting, and they
// should be assertable without a database.
// ──────────────────────────────────────────────

export interface PositiveCandidate {
	inferenceKey: string;
	surface: string;
}

export interface ContradictionEvidence {
	/** Measured friction per path, from the behavioural section. */
	frictionPages?: { path: string; frictionRatePct: number }[] | null;
	/** Hosts cited by other findings in the same cycle. */
	citedHosts?: string[] | null;
	/** The environment's own domain, for host comparison. */
	rootDomain?: string | null;
}

/** Above this measured share of sessions, "free of friction" is false.
 *  Set at 10%: the behavioural section already treats 5% as "low
 *  enough not to explain a drop", so a claim of NO friction has to
 *  clear a visibly higher bar than that. */
export const FRICTION_REFUTES_PCT = 10;

/** Paths that count as the purchase path for the friction rule. */
const CHECKOUT_PATH = /(^|\/)(c|cart|carrinho|checkout|pagamento|payment|order|pedido)(\/|$)/i;

function registrable(host: string): string {
	// Compare on the last two labels so seguro.casamontelle.com and
	// casamontelle.com read as the same business, while
	// pay.external.com does not.
	const parts = host.toLowerCase().replace(/^www\./, "").split(".");
	return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".");
}

function hostOf(raw: string): string | null {
	try {
		return new URL(raw).host;
	} catch {
		return null;
	}
}

/**
 * Why a positive finding may not be stated, or null when it may.
 * The string is a reason for a log or a test, never customer copy.
 */
export function contradictionFor(
	candidate: PositiveCandidate,
	ev: ContradictionEvidence,
): string | null {
	if (candidate.inferenceKey === "low_friction_checkout") {
		const worst = (ev.frictionPages ?? [])
			.filter((p) => CHECKOUT_PATH.test(p.path))
			.reduce<{ path: string; frictionRatePct: number } | null>(
				(w, p) => (!w || p.frictionRatePct > w.frictionRatePct ? p : w),
				null,
			);
		if (worst && worst.frictionRatePct >= FRICTION_REFUTES_PCT) {
			return `measured ${worst.frictionRatePct}% friction on ${worst.path}`;
		}
	}

	if (candidate.inferenceKey === "trust_continuity_good") {
		const root = ev.rootDomain ? registrable(ev.rootDomain) : null;
		if (root) {
			for (const raw of ev.citedHosts ?? []) {
				const host = raw.includes("://") ? hostOf(raw) : raw;
				if (!host) continue;
				if (registrable(host) !== root) {
					return `checkout path cited on a different host: ${host}`;
				}
			}
		}
	}

	return null;
}

/** Drop the positives a measurement refutes. */
export function suppressContradictedPositives<T extends PositiveCandidate>(
	candidates: T[],
	ev: ContradictionEvidence,
): { kept: T[]; suppressed: { candidate: T; reason: string }[] } {
	const kept: T[] = [];
	const suppressed: { candidate: T; reason: string }[] = [];
	for (const c of candidates) {
		const reason = contradictionFor(c, ev);
		if (reason) suppressed.push({ candidate: c, reason });
		else kept.push(c);
	}
	return { kept, suppressed };
}
