import { getPrismaInstance } from "@/lib/connections"
export const getUsers = async () => {
	const users = await getPrismaInstance().user.findMany();
	return users;
};
