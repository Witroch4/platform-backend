"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const resend_1 = require("resend");
const mail = new resend_1.Resend(process.env.AUTH_RESEND_KEY);
exports.default = mail;
