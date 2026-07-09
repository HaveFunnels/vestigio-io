/**
 * scripts/set-payment-provider.ts
 *
 * One-shot ops script to change the platform's active payment provider.
 * Writes/deletes PlatformConfig.payment_provider (the admin override
 * read by getActiveProvider() at every checkout).
 *
 * Usage:
 *   DATABASE_URL="postgres://…" npx tsx scripts/set-payment-provider.ts paddle
 *   DATABASE_URL="postgres://…" npx tsx scripts/set-payment-provider.ts mercadopago
 *   DATABASE_URL="postgres://…" npx tsx scripts/set-payment-provider.ts default   # delete override, fall back to getDefaultProvider()
 *
 * Existing subscribers of the OTHER gateway are untouched — they keep
 * managing their sub through whichever gateway owns their row per
 * resolveUserProvider(). Only NEW checkouts follow the new default.
 */

import { PrismaClient } from "@prisma/client";

const PROVIDER_CONFIG_KEY = "payment_provider";

async function main() {
	const arg = process.argv[2]?.toLowerCase();
	if (arg !== "paddle" && arg !== "mercadopago" && arg !== "default") {
		console.error(
			"[set-payment-provider] Usage: tsx scripts/set-payment-provider.ts <paddle|mercadopago|default>",
		);
		process.exit(1);
	}

	const prisma = new PrismaClient();
	try {
		const current = await prisma.platformConfig.findUnique({
			where: { configKey: PROVIDER_CONFIG_KEY },
		});
		console.log(
			`[set-payment-provider] current override=${current?.value ?? "(none)"} target=${arg}`,
		);

		if (arg === "default") {
			if (!current) {
				console.log("[set-payment-provider] no override present — nothing to delete");
			} else {
				await prisma.platformConfig.delete({ where: { configKey: PROVIDER_CONFIG_KEY } });
				console.log("[set-payment-provider] deleted override — falls back to getDefaultProvider()");
			}
			return;
		}

		await prisma.platformConfig.upsert({
			where: { configKey: PROVIDER_CONFIG_KEY },
			update: { value: arg },
			create: { configKey: PROVIDER_CONFIG_KEY, value: arg },
		});
		console.log(`[set-payment-provider] override set to ${arg}`);
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((err) => {
	console.error("[set-payment-provider] failed:", err);
	process.exit(1);
});
