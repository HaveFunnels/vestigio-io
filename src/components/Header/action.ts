"use server";

import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { SUPPORTED_LOCALES } from "@/i18n/supported-locales";

export async function switchLanguage(code: string) {
	const cookieStore = await cookies();

	cookieStore.set("locale", code, {
		maxAge: 60 * 60 * 24 * 30,
	});

	// Persist the choice to the user record so it survives cookie clears
	// (new device, incognito, post-logout) AND so request.ts can prefer
	// the DB value over an inherited bootstrap cookie. Anonymous visitors
	// just keep the cookie — DB write is a no-op without a session.
	if (!SUPPORTED_LOCALES.includes(code)) return;
	try {
		const session = await getServerSession(authOptions);
		const userId = (session?.user as { id?: string } | undefined)?.id;
		if (!userId) return;
		await prisma.user.update({
			where: { id: userId },
			data: { locale: code },
		});
	} catch {
		// DB unavailable — cookie write above still gives them the chosen
		// locale for this device. Best-effort sync only.
	}
}

export async function getSelectedLangCode() {
	const cookieStore = await cookies();

	return cookieStore.get("locale")?.value;
}
