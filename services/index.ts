// Função para obter Prisma (sempre usar versão normal)
function getPrismaForServices() {
	const { getPrismaInstance } = require("@/lib/connections");
	return getPrismaInstance();
}

export const findUserbyEmail = async (email: string) => {
	const user = await getPrismaForServices().user.findUnique({
		where: {
			email,
		},
	});
	return user;
};

export const findUserbyId = async (id: string) => {
	const user = await getPrismaForServices().user.findUnique({
		where: {
			id,
		},
		select: {
			id: true,
			name: true,
			email: true,
			password: true,
			isTwoFactorAuthEnabled: true,
		},
	});
	return user;
};
