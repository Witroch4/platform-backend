"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidCredentials = void 0;
const next_auth_1 = require("next-auth");
//https://authjs.dev/reference/core/providers/credentials#authorize
class InvalidCredentials extends next_auth_1.CredentialsSignin {
    code = "Credenciais Inválidas";
}
exports.InvalidCredentials = InvalidCredentials;
