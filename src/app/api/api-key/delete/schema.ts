import { z } from "zod";

export const deleteAPIKeyPayloadSchema = z.object({ id: z.string() });
