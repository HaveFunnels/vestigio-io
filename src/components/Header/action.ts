"use server";

import { cookies } from "next/headers";

export async function switchLanguage(code: string) {
	const cookieStore = await cookies();

	cookieStore.set("locale", code, {
		maxAge: 60 * 60 * 24 * 30,
	});
}

export async function getSelectedLangCode() {
	const cookieStore = await cookies();

	return cookieStore.get("locale")?.value;
}
