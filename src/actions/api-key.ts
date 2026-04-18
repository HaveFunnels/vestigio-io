"use server";

import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";

export async function getApiKeys() {
	const user = await isAuthorized();

	return prisma.apiKey.findMany({
		where: { userId: user?.id },
	});
}

export async function createApiKey(keyName: string) {
	const user = await isAuthorized();

	if (!user) {
		return null;
	}

	// Generate a cryptographically secure random API key
	const rawKey = `vst_${crypto.randomBytes(32).toString("hex")}`;

	// Hash the key for storage (only the hash is stored)
	const hashedKey = await bcrypt.hash(rawKey, 10);

	await prisma.apiKey.create({
		data: {
			name: keyName,
			key: hashedKey,
			userId: user.id,
		},
	});

	revalidatePath("/admin/api");

	// Return the raw key so the UI can show it once
	return rawKey;
}

export async function deleteApiKey(id: string) {
	const user = await isAuthorized();

	if (!user) {
		throw new Error("Unauthorized");
	}

	// Verify ownership before deleting
	const apiKey = await prisma.apiKey.findUnique({
		where: { id },
	});

	if (!apiKey || apiKey.userId !== user.id) {
		throw new Error("Not found or not authorized");
	}

	const res = await prisma.apiKey.delete({
		where: { id },
	});

	revalidatePath("/admin/api");
	return res;
}
