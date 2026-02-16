const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function checkCurrentState() {
	try {
		console.log("=== Estado Atual do Banco de Dados ===\n");

		// Verificar se a reação foi corrigida corretamente
		const reactions = await prisma.mapeamentoBotao.findMany({
			where: {
				inboxId: "cmesej54l000tqj0k1v85tqln",
			},
		});

		console.log("Reações encontradas:", reactions.length);
		reactions.forEach((reaction) => {
			console.log("- Button ID:", reaction.buttonId);
			console.log("  Action Type:", reaction.actionType);
			console.log("  Action Payload:", JSON.stringify(reaction.actionPayload, null, 2));
			console.log("  Description:", reaction.description);
			console.log("---");
		});

		// Verificar se o botão da mensagem 2222222 existe
		const message = await prisma.template.findFirst({
			where: {
				name: "2222222",
				type: "INTERACTIVE_MESSAGE",
			},
			include: {
				interactiveContent: {
					include: {
						actionReplyButton: true,
					},
				},
			},
		});

		if (message?.interactiveContent?.actionReplyButton) {
			console.log("\nBotões da mensagem 2222222:");
			console.log(JSON.stringify(message.interactiveContent.actionReplyButton.buttons, null, 2));
		}
	} catch (error) {
		console.error("Erro:", error);
	} finally {
		await prisma.$disconnect();
	}
}

checkCurrentState();
