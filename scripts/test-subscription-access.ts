// scripts/test-subscription-access.ts
import { isExemptedEmail } from "@/lib/subscription-access";

const testEmails = [
	"amandasousa22.adv@gmail.com",
	"witalorocha216@gmail.com",
	"witalo_rocha@outlook.com",
	"usuario.normal@gmail.com",
];

console.log("=== Teste de Verificação de Emails Liberados ===");

testEmails.forEach((email) => {
	const isExempted = isExemptedEmail(email);
	console.log(`${email}: ${isExempted ? "✅ LIBERADO" : "❌ REQUER ASSINATURA"}`);
});

console.log("\n=== Lista de Emails Liberados ===");
console.log("- amandasousa22.adv@gmail.com");
console.log("- witalorocha216@gmail.com");
console.log("- witalo_rocha@outlook.com");
