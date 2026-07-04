import { z } from "zod";

// Client-facing intake for a Paddle plan change. `planKey` and
// `cadence` are the ONLY levers a caller controls — the actual
// paddle price_id is resolved server-side via resolvePriceIdForPlan
// so a client can't submit a legacy or promo priceId (that would
// still resolve to a paid tier via resolvePlanFromPriceId at webhook
// time) to escalate their plan at a cut rate.
export const paddleChangePlanSchema = z.object({
	subscriptionId: z.string(),
	planKey: z.enum(["vestigio", "pro", "max"]),
	cadence: z.enum(["monthly", "annual"]).default("monthly"),
});
