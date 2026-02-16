import bcryptjs from "bcryptjs";

export async function comparePassword(password: string, hashedPassword: string): Promise<boolean> {
	return await bcryptjs.compare(password, hashedPassword);
}

export async function hashPassword(password: string): Promise<string> {
	return await bcryptjs.hash(password, 12);
}
