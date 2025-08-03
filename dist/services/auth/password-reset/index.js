"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createResetPasswordToken = exports.updatePassword = exports.deleteResetPasswordToken = exports.findResetPasswordTokenByEmail = exports.findResetPasswordTokenByToken = void 0;
const prisma_1 = require("@/lib/prisma");
const uuid_1 = require("uuid");
const findResetPasswordTokenByToken = async (token) => {
    const resetPasswordToken = await prisma_1.prisma.resetPasswordToken.findUnique({
        where: { token },
    });
    return resetPasswordToken;
};
exports.findResetPasswordTokenByToken = findResetPasswordTokenByToken;
const findResetPasswordTokenByEmail = async (email) => {
    const passwordResetToken = await prisma_1.prisma.resetPasswordToken.findFirst({
        where: { email },
    });
    return passwordResetToken;
};
exports.findResetPasswordTokenByEmail = findResetPasswordTokenByEmail;
const deleteResetPasswordToken = async (id) => {
    await prisma_1.prisma.resetPasswordToken.delete({
        where: { id },
    });
};
exports.deleteResetPasswordToken = deleteResetPasswordToken;
const updatePassword = async (id, password) => {
    await prisma_1.prisma.user.update({
        where: { id },
        data: { password },
    });
};
exports.updatePassword = updatePassword;
const createResetPasswordToken = async (email) => {
    const token = (0, uuid_1.v4)();
    const expires = new Date(new Date().getTime() + 2 * 60 * 60 * 1000); //two hours
    const existingToken = await (0, exports.findResetPasswordTokenByEmail)(email);
    if (existingToken) {
        await (0, exports.deleteResetPasswordToken)(existingToken.id);
    }
    const verificationToken = await prisma_1.prisma.resetPasswordToken.create({
        data: {
            email,
            token,
            expires,
        },
    });
    return verificationToken;
};
exports.createResetPasswordToken = createResetPasswordToken;
