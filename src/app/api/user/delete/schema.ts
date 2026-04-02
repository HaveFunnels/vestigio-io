import { z } from "zod";

export const userDeleteSchema = z.object({ email: z.string().email() });
