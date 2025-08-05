import { db } from "../lib/db";

async function testUnifiedTemplateQuery() {
  console.log("Testing unified template query structure...");

  try {
    // Test the query structure I implemented in the webhook
    const mapeamento = await db.mapeamentoIntencao.findFirst({
      include: {
        template: true,
        unifiedTemplate: {
          include: {
            interactiveContent: {
              include: {
                header: true,
                body: true,
                footer: true,
                actionReplyButton: true,
              },
            },
            whatsappOfficialInfo: true,
          },
        },
        mensagemInterativa: {
          include: {
            botoes: true,
          },
        },
      },
    });

    console.log("✅ Query structure is valid");
    console.log("Found mapeamento:", mapeamento ? "Yes" : "No");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.error("❌ Query failed:", message);
  }

  await db.$disconnect();
}

testUnifiedTemplateQuery().catch(console.error);
