import { z } from "zod";

const REGEX = {
	uppercase: /[A-Z]/,
	lowercase: /[a-z]/,
	number: /\d/,
	specialChar: /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/]/,
};

export const passwordSchema = z
	.string()
	.min(8, { message: "Password must be at least 8 characters long" })
	.max(128, { message: "Password cannot exceed 128 characters" })
	.refine((val) => REGEX.uppercase.test(val), {
		message: "Password must contain at least one uppercase letter",
	})
	.refine((val) => REGEX.lowercase.test(val), {
		message: "Password must contain at least one lowercase letter",
	})
	.refine((val) => REGEX.number.test(val), {
		message: "Password must contain at least one number",
	})
	.refine((val) => REGEX.specialChar.test(val), {
		message: "Password must contain at least one special character",
	});
