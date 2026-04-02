import Stripe from "stripe";

let _stripe: Stripe | null = null;

export const stripe = new Proxy({} as Stripe, {
	get(_, prop) {
		if (!_stripe) {
			const key = process.env.STRIPE_SECRET_KEY;
			if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
			_stripe = new Stripe(key, { apiVersion: "2023-10-16", typescript: true });
		}
		return (_stripe as any)[prop];
	},
});
