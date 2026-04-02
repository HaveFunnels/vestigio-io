import { z } from "zod";
import { passwordSchema } from "../../common-schema";

export const registerSchema = z.object({
	name: z
		.string()
		.min(2, { message: "Name must be at least 2 characters long" }),
	email: z.string().email(),
	password: passwordSchema,
});
