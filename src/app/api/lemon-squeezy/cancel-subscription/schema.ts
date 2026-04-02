import { z } from "zod";

export const lemonSqueezyCancelSubscriptionSchema = z.object({
	subscriptionId: z.string(),
});
