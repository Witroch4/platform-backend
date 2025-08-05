// Função para obter Prisma compatível com Edge Runtime
function getPrismaForServices() {
  if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
    const { getPrismaInstanceEdge } = require("@/lib/edge-connections");
    return getPrismaInstanceEdge();
  }
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
