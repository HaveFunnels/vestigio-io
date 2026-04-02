import { z } from "zod";

export const paddleCancelSubscriptionSchema = z.object({
	subscriptionId: z.string(),
});
