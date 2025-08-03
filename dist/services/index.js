"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findUserbyId = exports.findUserbyEmail = void 0;
const prisma_1 = require("@/lib/prisma");
const findUserbyEmail = async (email) => {
    const user = await prisma_1.prisma.user.findUnique({
        where: {
            email,
        },
    });
    return user;
};
exports.findUserbyEmail = findUserbyEmail;
const findUserbyId = async (id) => {
    const user = await prisma_1.prisma.user.findUnique({
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
exports.findUserbyId = findUserbyId;
