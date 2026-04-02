import { z } from "zod";

export const generateAPIKeyPayloadSchema = z.object({
	keyName: z.string().min(1, "Key name is required"),
});
