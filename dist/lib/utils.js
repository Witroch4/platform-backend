"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cn = cn;
exports.generateOTP = generateOTP;
const clsx_1 = require("clsx");
const tailwind_merge_1 = require("tailwind-merge");
function cn(...inputs) {
    return (0, tailwind_merge_1.twMerge)((0, clsx_1.clsx)(inputs));
}
function generateOTP(numberOfDigits) {
    const digits = "0123456789";
    let OTP = "";
    const len = digits.length;
    for (let i = 0; i < numberOfDigits; i++) {
        OTP += digits[Math.floor(Math.random() * len)];
    }
    return OTP;
}
