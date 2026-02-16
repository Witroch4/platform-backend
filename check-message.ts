import { getPrismaInstance } from "./lib/connections";

async function checkInstagramMessage() {
	const prisma = getPrismaInstance();

	try {
		// ID da mensagem que acabou de ser criada
		const messageId = "cmeq6v0oy0001pf0k5i27i9vs";

		console.log("🔍 Verificando mensagem Instagram no banco de dados...\n");

		// Buscar o template
		const template = await prisma.template.findUnique({
			where: { id: messageId },
			include: {
				interactiveContent: {
					include: {
						header: true,
						body: true,
						footer: true,
						actionReplyButton: {
							include: {
								buttons: true,
							},
						},
						actionCtaUrl: true,
					},
				},
			},
		});

		if (!template) {
			console.log("❌ Template não encontrado!");
			return;
		}

		console.log("✅ Template encontrado:");
		console.log("📋 ID:", template.id);
		console.log("📋 Nome:", template.name);
		console.log("📋 Tipo:", template.type);
		console.log("📋 Escopo:", template.scope);
		console.log("📋 Ativo:", template.isActive);
		console.log("📋 InboxId:", template.inboxId);

		if (template.interactiveContent) {
			const content = template.interactiveContent;

			console.log("\n✅ Conteúdo Interativo:");

			if (content.header) {
				console.log("📸 Header:");
				console.log("   - Tipo:", content.header.type);
				console.log("   - URL:", content.header.content?.substring(0, 60) + "...");
			}

			if (content.body) {
				console.log("📝 Body:");
				console.log("   - Texto:", content.body.text);
			}

			if (content.footer) {
				console.log("📄 Footer:");
				console.log("   - Texto:", content.footer.text);
			}

			if (content.actionReplyButton) {
				console.log("🔘 Botões:", content.actionReplyButton.buttons?.length || 0);
			}

			if (content.actionCtaUrl) {
				console.log("🔗 CTA URL:", content.actionCtaUrl.displayText);
			}
		}

		console.log("\n🎯 RESULTADO: Mensagem Instagram (generic template) salva corretamente! ✅");
	} catch (error) {
		console.error("❌ Erro ao verificar mensagem:", error);
	}
}

checkInstagramMessage();
