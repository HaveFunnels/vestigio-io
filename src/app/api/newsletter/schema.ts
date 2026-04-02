import { z } from "zod";

export const newsletterPayloadSchema = z.object({
	email: z.string().email(),
});
