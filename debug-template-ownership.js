// Script para debugar a propriedade do template
const { getPrismaInstance } = require("./lib/connections.ts");

const debugTemplateOwnership = async () => {
	const prisma = getPrismaInstance();

	try {
		console.log("🔍 Investigando template 682491667610791...\n");

		const templateId = "682491667610791";
		const amandaUserId = "cmdzdrscq0000lm6sc08o2m6r";

		// 1. Verificar se o template existe
		console.log("1. Verificando se o template existe...");
		const template = await prisma.template.findFirst({
			where: { id: templateId },
			select: {
				id: true,
				name: true,
				status: true,
				scope: true,
				createdById: true,
				type: true,
				createdAt: true,
				createdBy: {
					select: {
						id: true,
						name: true,
						email: true,
					},
				},
			},
		});

		if (!template) {
			console.log("   ❌ Template não encontrado no banco de dados");
			return;
		}

		console.log("   ✅ Template encontrado:");
		console.log(`   📋 Nome: ${template.name}`);
		console.log(`   📋 Status: ${template.status}`);
		console.log(`   📋 Escopo: ${template.scope}`);
		console.log(`   📋 Tipo: ${template.type}`);
		console.log(`   📋 Criado por ID: ${template.createdById}`);
		console.log(`   📋 Criado por: ${template.createdBy?.name} (${template.createdBy?.email})`);
		console.log(`   📋 Data criação: ${template.createdAt}`);

		// 2. Verificar se Amanda é a criadora
		console.log("\n2. Verificando propriedade...");
		const isOwner = template.createdById === amandaUserId;
		console.log(`   Amanda (${amandaUserId}) é a criadora? ${isOwner ? "✅ SIM" : "❌ NÃO"}`);

		if (!isOwner) {
			console.log(`   💡 Template foi criado por: ${template.createdById}`);

			// Verificar se é um template global
			if (template.scope === "GLOBAL") {
				console.log("   ✅ Mas é um template GLOBAL - Amanda deveria ter acesso");
			} else {
				console.log("   ❌ Template é PRIVATE - Amanda não tem acesso direto");
			}
		}

		// 3. Verificar role da Amanda
		console.log("\n3. Verificando role da Amanda...");
		const amanda = await prisma.user.findFirst({
			where: { id: amandaUserId },
			select: {
				id: true,
				name: true,
				email: true,
				role: true,
			},
		});

		if (amanda) {
			console.log(`   👤 Amanda: ${amanda.name} (${amanda.email})`);
			console.log(`   🔑 Role: ${amanda.role}`);

			const isAdmin = amanda.role === "ADMIN" || amanda.role === "SUPERADMIN";
			if (isAdmin) {
				console.log("   ✅ Amanda é admin - deveria ter acesso a qualquer template");
			} else {
				console.log("   ℹ️ Amanda não é admin - precisa ser proprietária ou template global");
			}
		} else {
			console.log("   ❌ Amanda não encontrada no banco");
		}

		// 4. Verificar se há WhatsAppOfficialInfo
		console.log("\n4. Verificando informações do WhatsApp...");
		const whatsappInfo = await prisma.whatsAppOfficialInfo.findFirst({
			where: { templateId: templateId },
			select: {
				id: true,
				metaTemplateId: true,
				status: true,
				category: true,
			},
		});

		if (whatsappInfo) {
			console.log("   ✅ Template tem informações do WhatsApp:");
			console.log(`   📋 Meta Template ID: ${whatsappInfo.metaTemplateId}`);
			console.log(`   📋 Status: ${whatsappInfo.status}`);
			console.log(`   📋 Categoria: ${whatsappInfo.category}`);
		} else {
			console.log("   ❌ Template não tem informações do WhatsApp");
		}

		// 5. Resumo final
		console.log("\n📊 RESUMO:");
		const shouldHaveAccess =
			isOwner || template.scope === "GLOBAL" || (amanda && (amanda.role === "ADMIN" || amanda.role === "SUPERADMIN"));

		console.log(`Amanda deveria ter acesso? ${shouldHaveAccess ? "✅ SIM" : "❌ NÃO"}`);

		if (!shouldHaveAccess) {
			console.log("\n💡 SOLUÇÕES POSSÍVEIS:");
			console.log("1. Alterar o escopo do template para GLOBAL");
			console.log("2. Alterar o createdById para Amanda");
			console.log("3. Dar role de ADMIN para Amanda");
		}
	} catch (error) {
		console.error("❌ Erro durante a investigação:", error);
	} finally {
		// Não desconectar pois é uma instância singleton
	}
};

// Executar apenas se chamado diretamente
if (require.main === module) {
	debugTemplateOwnership();
}

module.exports = { debugTemplateOwnership };
