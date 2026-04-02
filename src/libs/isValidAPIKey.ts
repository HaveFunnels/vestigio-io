import bcrypt from "bcrypt";
import { prisma } from "@/libs/prismaDb";

/**
 * Validates an API key by looking up all keys for the user
 * and comparing the raw key against each stored hash.
 * Returns the user if a matching key is found.
 */
const isValidKey = async (rawApiKey: string) => {
	// API keys have the vst_ prefix
	if (!rawApiKey || !rawApiKey.startsWith("vst_")) {
		return null;
	}

	// Find all API keys and check each one
	const apiKeys = await prisma.apiKey.findMany({
		include: { user: true },
	});

	for (const record of apiKeys) {
		const matches = await bcrypt.compare(rawApiKey, record.key);
		if (matches) {
			return record.user;
		}
	}

	return null;
};

export default isValidKey;
