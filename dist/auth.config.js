"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtime = void 0;
// auth.config.ts
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const credentials_1 = __importDefault(require("next-auth/providers/credentials"));
const google_1 = __importDefault(require("next-auth/providers/google"));
const github_1 = __importDefault(require("next-auth/providers/github"));
const facebook_1 = __importDefault(require("next-auth/providers/facebook"));
const auth_1 = require("./lib/auth");
const auth_2 = require("./schemas/auth");
const services_1 = require("./services");
exports.runtime = "nodejs";
const authConfig = {
    providers: [
        (0, credentials_1.default)({
            name: "E-mail & Senha",
            credentials: {
                email: { label: "E-mail", type: "text" },
                password: { label: "Senha", type: "password" },
            },
            async authorize(credentials) {
                const parsed = auth_2.CredentialsSchema.safeParse(credentials);
                if (!parsed.success)
                    throw new auth_1.InvalidCredentials();
                const { email, password } = parsed.data;
                const user = await (0, services_1.findUserbyEmail)(email);
                if (!user?.password)
                    throw new auth_1.UserNotFound();
                const passOk = await bcryptjs_1.default.compare(password, user.password);
                if (!passOk)
                    throw new auth_1.InvalidCredentials();
                // ↓ Retorne apenas o que vai para o JWT
                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role, // UserRole
                    isTwoFactorAuthEnabled: user.isTwoFactorAuthEnabled, // boolean
                };
            },
        }),
        (0, google_1.default)({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
        }),
        (0, github_1.default)({
            clientId: process.env.AUTH_GITHUB_ID,
            clientSecret: process.env.AUTH_GITHUB_SECRET,
        }),
        (0, facebook_1.default)({
            clientId: process.env.FACEBOOK_CLIENT_ID,
            clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
        }),
    ],
};
exports.default = authConfig;
