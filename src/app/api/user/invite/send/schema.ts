import { z } from "zod";

export const invitationSendSchema = z.object({
	email: z.string().email(),
	role: z.enum(["ADMIN", "USER"]),
});
