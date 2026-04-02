import { z } from "zod";

export const paymentSchema = z.object({
	userId: z.string().cuid(),
	priceId: z.string(),
	isSubscribed: z.coerce.boolean().optional(),
	stripeCustomerId: z.string().optional(),
});
