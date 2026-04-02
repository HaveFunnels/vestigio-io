import { z } from "zod";
import { passwordSchema } from "../../common-schema";

export const updatePasswordSchema = z.object({
	email: z.string().email(),
	password: passwordSchema,
	token: z.string().min(1, "Reset token is required"),
});
