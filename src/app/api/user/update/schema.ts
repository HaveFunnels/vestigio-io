import { z } from "zod";
import { registerSchema } from "../register/schema";

export const updateUserSchema = registerSchema
	.omit({ password: true })
	.extend({
		image: z.string(),
		locale: z.enum(["en", "de", "pt-BR", "es"]),
	})
	.partial();
