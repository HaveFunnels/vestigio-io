import { passwordSchema } from "@/app/api/common-schema";
import { z } from "zod";

export const inviteSigninSchema = z.object({
	token: z.string(),
	password: passwordSchema,
});
