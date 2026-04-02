"use server";

import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { excludeFields } from "@/utils/exclude-fields";

export async function getUsers(filter: any) {
	const currentUser = await isAuthorized();

	const res = await prisma.user.findMany({
		where: { role: filter, email: { not: currentUser?.email } },
	});

	const filteredUsers = res
		.filter((user) => !user.email?.includes("demo-"))
		.map((record) =>
			excludeFields(record, [
				"password",
				"passwordResetToken",
				"passwordResetTokenExp",
			])
		);

	return filteredUsers;
}

export async function updateUser(data: any) {
	const { email } = data;
	const user = await prisma.user.update({
		where: {
			email: email.toLowerCase(),
		},
		data: {
			email: email.toLowerCase(),
			...data,
		},
	});

	return excludeFields(user, [
		"password",
		"passwordResetToken",
		"passwordResetTokenExp",
	]);
}

export async function deleteUser(user: any) {
	if (user?.email?.includes("demo-")) {
		return new Error("Can't delete demo user");
	}

	if (!user) {
		return new Error("User not found");
	}

	await prisma.user.delete({
		where: {
			email: user?.email.toLowerCase() as string,
		},
	});
}
