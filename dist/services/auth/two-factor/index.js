"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTwoFactorAuthToken = exports.findTwoFactorAuthTokeByToken = exports.deleteTwoFactorAuthTokenById = exports.isTwoFactorAuthenticationEnabled = exports.findTwoFactorAuthTokenByEmail = void 0;
const prisma_1 = require("../../../lib/prisma");
// Create a local implementation instead of importing
function generateOTP(numberOfDigits) {
    const digits = "0123456789";
    let OTP = "";
    const len = digits.length;
    for (let i = 0; i < numberOfDigits; i++) {
        OTP += digits[Math.floor(Math.random() * len)];
    }
    return OTP;
}
const findTwoFactorAuthTokenByEmail = async (email) => {
    const token = await prisma_1.prisma.twoFactorToken.findUnique({
        where: {
            email,
        },
    });
    return token;
};
exports.findTwoFactorAuthTokenByEmail = findTwoFactorAuthTokenByEmail;
const isTwoFactorAuthenticationEnabled = async (id) => {
    const user = await prisma_1.prisma.user.findUnique({
        where: {
            id,
        },
        select: {
            isTwoFactorAuthEnabled: true,
        },
    });
    return user?.isTwoFactorAuthEnabled;
};
exports.isTwoFactorAuthenticationEnabled = isTwoFactorAuthenticationEnabled;
const deleteTwoFactorAuthTokenById = async (id) => {
    const token = await prisma_1.prisma.twoFactorToken.delete({
        where: {
            id,
        },
    });
    return token;
};
exports.deleteTwoFactorAuthTokenById = deleteTwoFactorAuthTokenById;
const findTwoFactorAuthTokeByToken = async (token) => {
    const existingToken = await prisma_1.prisma.twoFactorToken.findUnique({
        where: {
            token,
        },
    });
    return existingToken;
};
exports.findTwoFactorAuthTokeByToken = findTwoFactorAuthTokeByToken;
const createTwoFactorAuthToken = async (email) => {
    const token = generateOTP(6);
    const expires = new Date(new Date().getTime() + 2 * 60 * 60 * 1000); //two hours
    const existingToken = await (0, exports.findTwoFactorAuthTokenByEmail)(email);
    if (existingToken) {
        await (0, exports.deleteTwoFactorAuthTokenById)(existingToken.id);
    }
    const twoFactorAuthToken = await prisma_1.prisma.twoFactorToken.create({
        data: {
            email,
            token,
            expires,
        },
    });
    return twoFactorAuthToken;
};
exports.createTwoFactorAuthToken = createTwoFactorAuthToken;
