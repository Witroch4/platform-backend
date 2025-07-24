"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVerificationToken = exports.deleteVerificationTokenbyId = exports.findVerificationTokenbyToken = exports.findVerificationTokenbyEmail = void 0;
const prisma_1 = require("@/lib/prisma");
const uuid_1 = require("uuid");
const findVerificationTokenbyEmail = async (email) => {
    const token = await prisma_1.prisma.verificationToken.findUnique({
        where: {
            email,
        },
    });
    return token;
};
exports.findVerificationTokenbyEmail = findVerificationTokenbyEmail;
const findVerificationTokenbyToken = async (token) => {
    const existingToken = await prisma_1.prisma.verificationToken.findUnique({
        where: {
            token,
        },
    });
    return existingToken;
};
exports.findVerificationTokenbyToken = findVerificationTokenbyToken;
const deleteVerificationTokenbyId = async (id) => {
    const token = await prisma_1.prisma.verificationToken.delete({
        where: {
            id,
        },
    });
    return token;
};
exports.deleteVerificationTokenbyId = deleteVerificationTokenbyId;
const createVerificationToken = async (email) => {
    const token = (0, uuid_1.v4)();
    const expires = new Date(new Date().getTime() + 2 * 60 * 60 * 1000); //two hours
    const existingToken = await (0, exports.findVerificationTokenbyEmail)(email);
    if (existingToken) {
        await (0, exports.deleteVerificationTokenbyId)(existingToken.id);
    }
    const verificationToken = await prisma_1.prisma.verificationToken.create({
        data: {
            email,
            token,
            expires,
        },
    });
    return verificationToken;
};
exports.createVerificationToken = createVerificationToken;
