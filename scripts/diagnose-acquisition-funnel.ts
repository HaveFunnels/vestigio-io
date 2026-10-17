/**
 * The acquisition funnel, by campaign.
 *
 * This is the report that justifies or kills ad spend, and until the
 * instrumentation landed it could not be written: attribution did not
 * survive navigation, the two halves of the funnel used different
 * session ids, and five of the six ways a signup can end left no
 * trace at all.
 *
 * Usage: npx tsx scripts/diagnose-acquisition-funnel.ts [days]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function sourceOf(props: unknown): string {
	const p = props as { firstTouch?: Record<string, string | undefined> } | null;
	const ft = p?.firstTouch;
	if (!ft) return "(sem atribuição)";
	if (ft.utmSource) return ft.utmSource + (ft.utmCampaign ? ` / ${ft.utmCampaign}` : "");
	if (ft.fbclid) return "facebook (fbclid)";
	if (ft.gclid) return "google (gclid)";
	if (ft.ttclid) return "tiktok (ttclid)";
	if (ft.referrer) {
		try {
			return `referral: ${new URL(ft.referrer).hostname}`;
		} catch {
			return "referral";
		}
	}
	return "direto";
}

async function main() {
	const days = Number(process.argv[2] || "30");
	const since = new Date(Date.now() - days * 86400_000);
	console.log(`janela: últimos ${days} dias\n`);

	const events = await prisma.productEvent.findMany({
		where: { createdAt: { gte: since } },
		select: { event: true, properties: true, sessionId: true, userId: true, createdAt: true },
	});

	// ── Signup outcomes ───────────────────────────────────────────
	const signups = events.filter((e) => e.event === "signup.attempt");
	console.log(`TENTATIVAS DE CADASTRO: ${signups.length}`);
	if (signups.length === 0) {
		console.log(
			"  nenhuma. Antes de 2026-10-17 isto era indistinguível de 'ninguém tentou',\n" +
				"  que foi exatamente como os três meses de captcha quebrado foram lidos.",
		);
	} else {
		const byOutcome = new Map<string, number>();
		for (const s of signups) {
			const o = (s.properties as { outcome?: string } | null)?.outcome ?? "?";
			byOutcome.set(o, (byOutcome.get(o) ?? 0) + 1);
		}
		for (const [o, n] of [...byOutcome].sort((a, b) => b[1] - a[1])) {
			console.log(`  ${o.padEnd(20)} ${n}`);
		}
		const bySource = new Map<string, { attempts: number; created: number }>();
		for (const s of signups) {
			const src = sourceOf(s.properties);
			const acc = bySource.get(src) ?? { attempts: 0, created: 0 };
			acc.attempts++;
			if ((s.properties as { outcome?: string } | null)?.outcome === "created") acc.created++;
			bySource.set(src, acc);
		}
		console.log("\n  por origem de primeiro toque:");
		for (const [src, v] of [...bySource].sort((a, b) => b[1].attempts - a[1].attempts)) {
			console.log(`    ${src.padEnd(32)} ${v.attempts} tentativas, ${v.created} criados`);
		}
	}

	// ── LP audit funnel ───────────────────────────────────────────
	const STEPS = [
		"lp_audit_landing",
		"lp_audit_form_step",
		"lp_audit_audit_started",
		"lp_audit_result_viewed",
		"lp_audit_cta_clicked",
		"lp_audit_checkout_complete",
	];
	console.log("\nFUNIL DO AUDIT GRÁTIS (sessões distintas):");
    let prev: number | null = null;
	for (const step of STEPS) {
		const sessions = new Set(
			events.filter((e) => e.event === step).map((e) => e.sessionId),
		).size;
		const drop =
			prev !== null && prev > 0 ? ` (-${Math.round((100 * (prev - sessions)) / prev)}%)` : "";
		console.log(`  ${step.replace("lp_audit_", "").padEnd(18)} ${String(sessions).padStart(6)}${drop}`);
		prev = sessions;
	}

	// ── The join that did not exist ───────────────────────────────
	const signupSessions = new Set(signups.map((s) => s.sessionId));
	const auditSessions = new Set(
		events.filter((e) => e.event.startsWith("lp_audit_")).map((e) => e.sessionId),
	);
	const both = [...signupSessions].filter((s) => auditSessions.has(s));
	console.log(
		`\nSESSÕES QUE FIZERAM AUDIT E TENTARAM CADASTRO: ${both.length}\n` +
			"  (antes de unificar o id de sessão este número era sempre 0, por construção)",
	);

	await prisma.$disconnect();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
