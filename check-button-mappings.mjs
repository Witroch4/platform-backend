/**
 * Script para verificar mapeamentos de botões no banco
 */
import { getPrismaInstance } from "./lib/connections.js";

async function checkButtonMappings() {
	const prisma = getPrismaInstance();

	console.log("🔍 Verificando mapeamentos de botões...\n");

	try {
		// Buscar todos os mapeamentos
		const mappings = await prisma.mapeamentoBotao.findMany({
			select: {
				id: true,
				buttonId: true,
				actionType: true,
				actionPayload: true,
				description: true,
				inboxId: true,
				inbox: {
					select: {
						inboxId: true,
						nome: true,
					},
				},
			},
			orderBy: {
				createdAt: "desc",
			},
		});

		console.log(`📊 Total de mapeamentos encontrados: ${mappings.length}\n`);

		if (mappings.length === 0) {
			console.log("⚠️ Nenhum mapeamento de botão encontrado!");
			console.log("💡 Execute a rota de criação de mensagens interativas primeiro.");
			return;
		}

		// Mostrar os mapeamentos
		mappings.forEach((mapping, index) => {
			console.log(`📌 Mapeamento ${index + 1}:`);
			console.log(`   ID: ${mapping.id}`);
			console.log(`   Button ID: ${mapping.buttonId}`);
			console.log(`   Inbox ID: ${mapping.inbox?.inboxId} (${mapping.inbox?.nome})`);
			console.log(`   Action Type: ${mapping.actionType}`);
			console.log(`   Action Payload:`, JSON.stringify(mapping.actionPayload, null, 2));
			console.log(`   Description: ${mapping.description || "N/A"}`);
			console.log("");
		});

		// Buscar pelos IDs específicos dos testes
		const testButtonIds = [
			"ig_btn_1755004696546_uekaa4clu", // Instagram test
			"btn_1754993780819_0_tqji", // WhatsApp test
		];

		console.log("🎯 Verificando botões específicos dos testes...\n");

		for (const buttonId of testButtonIds) {
			const mapping = await prisma.mapeamentoBotao.findFirst({
				where: { buttonId },
				include: {
					inbox: {
						select: {
							inboxId: true,
							nome: true,
						},
					},
				},
			});

			if (mapping) {
				console.log(`✅ Encontrado: ${buttonId}`);
				console.log(`   Inbox: ${mapping.inbox?.inboxId} (${mapping.inbox?.nome})`);
				console.log(`   Emoji: ${mapping.actionPayload?.emoji || "N/A"}`);
				console.log(`   Texto: ${mapping.actionPayload?.textReaction || "N/A"}`);
			} else {
				console.log(`❌ Não encontrado: ${buttonId}`);
			}
			console.log("");
		}
	} catch (error) {
		console.error("❌ Erro ao verificar mapeamentos:", error.message);
	} finally {
		await prisma.$disconnect();
	}
}

// Executar se chamado diretamente
if (process.argv[1] === new URL(import.meta.url).pathname) {
	checkButtonMappings().catch(console.error);
}

export { checkButtonMappings };
