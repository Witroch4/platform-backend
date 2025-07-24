"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MagicLinkSignInSchema = exports.NewPasswordSchema = exports.ResetPasswordSchema = exports.UserSettingsSchema = exports.RegisterSchema = exports.CredentialsSchema = void 0;
const zod_1 = require("zod");
exports.CredentialsSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    code: zod_1.z.optional(zod_1.z.string()),
});
exports.RegisterSchema = zod_1.z.object({
    name: zod_1.z.string().min(5),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
});
// .refine(
//   (values) => {
//     console.log(`Values ${JSON.stringify(values)}`);
//     return values.password === values.matchPassword;
//   },
//   {
//     message: "Passwords must match!",
//     path: ["confirmPassword"],
//   }
// );
exports.UserSettingsSchema = zod_1.z
    .object({
    name: zod_1.z.optional(zod_1.z.string().min(5)),
    email: zod_1.z.optional(zod_1.z.string().email()),
    password: zod_1.z.optional(zod_1.z.string().min(6)),
    newPassword: zod_1.z.optional(zod_1.z.string().min(6)),
    isTwoFactorAuthEnabled: zod_1.z.optional(zod_1.z.boolean()),
})
    .refine((values) => {
    if (values.password && !values.newPassword)
        return false;
    return true;
}, {
    message: "Nova senha requerida",
    path: ["newPassword"],
})
    .refine((values) => {
    if (values.newPassword && !values.password)
        return false;
    return true;
}, {
    message: "Senha requerida",
    path: ["password"],
});
// .refine(
// 	(values) => {
// 		return values.password && values.newPassword && values.password === values.newPassword;
// 	},
// 	{
// 		message: "Os campos de Senha e Nova senha devem coincidir",
// 		path: ["password"],
// 	},
// );
exports.ResetPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
});
exports.NewPasswordSchema = zod_1.z.object({
    password: zod_1.z.string().min(6),
});
exports.MagicLinkSignInSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
});
