import { z } from "zod";

export const lemonSqueezyPaymentSchema = z.object({
	productId: z.string(),
});
