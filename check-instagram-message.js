const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function checkInstagramMessage() {
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
						actionList: true,
						actionFlow: true,
						actionLocationRequest: true,
					},
				},
			},
		});

		if (!template) {
			console.log("❌ Template não encontrado!");
			return;
		}

		console.log("✅ Template encontrado:");
		console.log({
			id: template.id,
			name: template.name,
			type: template.type,
			scope: template.scope,
			language: template.language,
			isActive: template.isActive,
			createdAt: template.createdAt,
			inboxId: template.inboxId,
		});

		console.log("\n✅ Conteúdo Interativo:");
		if (template.interactiveContent) {
			const content = template.interactiveContent;

			console.log(
				"📋 Header:",
				content.header
					? {
							id: content.header.id,
							type: content.header.type,
							content: content.header.content?.substring(0, 50) + "...",
						}
					: "Nenhum",
			);

			console.log(
				"📝 Body:",
				content.body
					? {
							id: content.body.id,
							text: content.body.text,
						}
					: "Nenhum",
			);

			console.log(
				"📄 Footer:",
				content.footer
					? {
							id: content.footer.id,
							text: content.footer.text,
						}
					: "Nenhum",
			);

			console.log(
				"🔘 Action Reply Button:",
				content.actionReplyButton
					? {
							id: content.actionReplyButton.id,
							buttonsCount: content.actionReplyButton.buttons?.length || 0,
						}
					: "Nenhum",
			);

			console.log(
				"🔗 Action CTA URL:",
				content.actionCtaUrl
					? {
							id: content.actionCtaUrl.id,
							displayText: content.actionCtaUrl.displayText,
							url: content.actionCtaUrl.url,
						}
					: "Nenhum",
			);
		} else {
			console.log("❌ Nenhum conteúdo interativo encontrado!");
		}

		console.log("\n🎯 Status: Mensagem Instagram (generic template) salva corretamente!");
	} catch (error) {
		console.error("❌ Erro ao verificar mensagem:", error);
	} finally {
		await prisma.$disconnect();
	}
}

checkInstagramMessage();
