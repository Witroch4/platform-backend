// Função para obter Prisma (sempre usar versão normal)
function getPrismaForTwoFactor() {
	const { getPrismaInstance } = require("@/lib/connections");
	return getPrismaInstance();
}
// Create a local implementation instead of importing
function generateOTP(numberOfDigits: number) {
	const digits = "0123456789";
	let OTP = "";
	const len = digits.length;
	for (let i = 0; i < numberOfDigits; i++) {
		OTP += digits[Math.floor(Math.random() * len)];
	}

	return OTP;
}

export const findTwoFactorAuthTokenByEmail = async (email: string) => {
	const token = await getPrismaForTwoFactor().twoFactorToken.findFirst({
		where: {
			email,
		},
	});
	return token;
};
export const isTwoFactorAuthenticationEnabled = async (id: string) => {
	const user = await getPrismaForTwoFactor().user.findUnique({
		where: {
			id,
		},
		select: {
			isTwoFactorAuthEnabled: true,
		},
	});
	return user?.isTwoFactorAuthEnabled;
};

export const deleteTwoFactorAuthTokenById = async (id: string) => {
	const token = await getPrismaForTwoFactor().twoFactorToken.delete({
		where: {
			id,
		},
	});
	return token;
};

export const findTwoFactorAuthTokeByToken = async (token: string) => {
	const existingToken = await getPrismaForTwoFactor().twoFactorToken.findUnique({
		where: {
			token,
		},
	});
	return existingToken;
};

export const createTwoFactorAuthToken = async (email: string) => {
	const token = generateOTP(6);
	const expires = new Date(new Date().getTime() + 2 * 60 * 60 * 1000); //two hours

	const existingToken = await findTwoFactorAuthTokenByEmail(email);
	if (existingToken) {
		await deleteTwoFactorAuthTokenById(existingToken.id);
	}

	const twoFactorAuthToken = await getPrismaForTwoFactor().twoFactorToken.create({
		data: {
			email,
			token,
			expires,
		},
	});

	return twoFactorAuthToken;
};
