import { z } from "zod";

export const paddleChangePlanSchema = z.object({
	subscriptionId: z.string(),
	priceId: z.string(),
});
