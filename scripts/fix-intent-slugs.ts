import { getPrismaInstance } from "@/lib/connections";

const prisma = getPrismaInstance();

async function fixIntentSlugs() {
	console.log("🔍 Verificando intents com slugs duplicados...");

	try {
		// Busca todos os intents ordenados por slug
		const intents = await prisma.intent.findMany({
			orderBy: { slug: "asc" },
			select: {
				id: true,
				name: true,
				slug: true,
				createdById: true,
				createdAt: true,
			},
		});

		console.log(`📊 Total de intents encontrados: ${intents.length}`);

		// Agrupa por slug para encontrar duplicados
		const slugGroups = new Map<string, typeof intents>();

		for (const intent of intents) {
			if (!slugGroups.has(intent.slug)) {
				slugGroups.set(intent.slug, []);
			}
			slugGroups.get(intent.slug)!.push(intent);
		}

		// Encontra slugs com múltiplos intents
		const duplicates = Array.from(slugGroups.entries()).filter(([slug, intents]) => intents.length > 1);

		if (duplicates.length === 0) {
			console.log("✅ Nenhum slug duplicado encontrado!");
			return;
		}

		console.log(`⚠️  Encontrados ${duplicates.length} slugs duplicados:`);

		for (const [slug, intents] of duplicates) {
			console.log(`\n📝 Slug: "${slug}" (${intents.length} intents)`);

			// Ordena por data de criação (mais antigo primeiro)
			const sortedIntents = intents.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

			// Mantém o primeiro (mais antigo) e renomeia os outros
			for (let i = 1; i < sortedIntents.length; i++) {
				const intent = sortedIntents[i];
				const newSlug = `${slug}-${i}`;

				console.log(`  🔄 Renomeando intent "${intent.name}" (${intent.id}) de "${slug}" para "${newSlug}"`);

				try {
					await prisma.intent.update({
						where: { id: intent.id },
						data: { slug: newSlug },
					});
					console.log(`  ✅ Intent "${intent.name}" renomeado com sucesso`);
				} catch (error) {
					console.error(`  ❌ Erro ao renomear intent "${intent.name}":`, error);
				}
			}
		}

		console.log("\n🎉 Processo de correção de slugs concluído!");
	} catch (error) {
		console.error("❌ Erro durante a correção de slugs:", error);
	} finally {
		await prisma.$disconnect();
	}
}

// Executa o script se chamado diretamente
if (require.main === module) {
	fixIntentSlugs()
		.then(() => {
			console.log("✅ Script executado com sucesso");
			process.exit(0);
		})
		.catch((error) => {
			console.error("❌ Erro no script:", error);
			process.exit(1);
		});
}

export { fixIntentSlugs };
