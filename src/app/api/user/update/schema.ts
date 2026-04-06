import { z } from "zod";
import { registerSchema } from "../register/schema";

// E.164 phone format (+ followed by 1-15 digits) — empty string clears the field
const phoneSchema = z
	.string()
	.regex(/^\+?[1-9]\d{1,14}$/, { message: "Phone must be in E.164 format e.g. +5511999999999" })
	.or(z.literal(""));

export const updateUserSchema = registerSchema
	.omit({ password: true })
	.extend({
		image: z.string(),
		locale: z.enum(["en", "de", "pt-BR", "es"]),
		phone: phoneSchema,
	})
	.partial();
