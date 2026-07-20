import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { getPlanConfigs, annualPriceCentsFromMonthly } from "@/libs/plan-config";
import { ActivatePaywall } from "./ActivatePaywall";

// ──────────────────────────────────────────────
// /activate (paywall)
//
// Post-signup checkout page. The unified funnel converges here from
// two paths:
//   A) /pricing → /auth/signup?callbackUrl=/activate&plan=X&cycle=Y
//   B) /audit/result/[leadId] → /auth/signup?callbackUrl=/activate
//      &leadId=X&domain=Y
//
// Server guard: needs an authenticated session — otherwise the user
// hasn't signed up yet and can't pay. (Mid-funnel direct hits land on
// /auth/signin with ?callbackUrl preserved.)
//
// The /activate/[token] route — Paddle's post-payment email-link
// activation — coexists with this one. Different URL shape (no token),
// different purpose. /activate/[token] will be deprecated when the
// Paddle path retires.
// ──────────────────────────────────────────────

export const dynamic = "force-dynamic";

export default async function ActivatePage() {
	const session = await getServerSession(authOptions);
	if (!session?.user) {
		redirect("/auth/signin?callbackUrl=/activate");
	}

	const plans = await getPlanConfigs();

	// Surface only what the client needs. Prices come through as cents
	// (BRL when present, fall back to USD-cents converted at a rough
	// fixed rate — TODO swap for live FX or admin-managed BRL field).
	// Annual price MUST route through annualPriceCentsFromMonthly (currently
	// × 9.6 = -20%) so display + Paddle sync + MP paywall all read the same
	// number. Previous hardcoded × 10 rendered "-20% economize" while
	// charging -17% — refund-lever + trust hit. See ANNUAL_DISCOUNT_MULTIPLIER
	// history note in src/libs/plan-config.ts.
	const publicPlans = plans.map((p) => {
		const monthly = (p as any).monthlyPriceCentsBrl || p.monthlyPriceCents;
		return {
			key: p.key,
			label: p.label,
			monthlyPriceCents: monthly,
			annualPriceCents: annualPriceCentsFromMonthly(monthly),
		};
	});

	return (
		<ActivatePaywall
			plans={publicPlans}
			userEmail={session.user.email ?? ""}
			userName={session.user.name ?? ""}
		/>
	);
}
