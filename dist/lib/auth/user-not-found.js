"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserNotFound = void 0;
const next_auth_1 = require("next-auth");
//https://authjs.dev/reference/core/providers/credentials#authorize
class UserNotFound extends next_auth_1.CredentialsSignin {
    code = "Usuário não encontrado";
}
exports.UserNotFound = UserNotFound;
