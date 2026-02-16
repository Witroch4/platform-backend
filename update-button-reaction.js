const { PrismaClient } = require("@prisma/client");

async function updateButtonReaction() {
	const prisma = new PrismaClient();

	try {
		const result = await prisma.buttonReaction.update({
			where: {
				id: "cmezifjkc000vmr0k67j1asf2",
			},
			data: {
				buttonId: "btn_1757352741118_lxb2nmtzf",
			},
		});

		console.log("✅ Reação atualizada com sucesso:");
		console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		console.error("❌ Erro ao atualizar reação:", error.message);
	} finally {
		await prisma.$disconnect();
	}
}

updateButtonReaction();
