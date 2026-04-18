import bcrypt from "bcryptjs";

export default async function hashPassword(password: string) {
	return bcrypt.hash(password, 10);
};
