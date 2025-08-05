import { getPrismaInstance } from "@/lib/connections"

/**
 * Popula automaticamente as variáveis padrão do MTF Diamante para um usuário
 * Executa apenas uma vez por usuário (controlado pelo campo mtfVariaveisPopuladas)
 */
export async function populateUserMtfVariaveis(userId: string): Promise<boolean> {
  try {
    // Verifica se o usuário já teve as variáveis populadas
    const user = await getPrismaInstance().user.findUnique({
      where: { id: userId },
      select: { mtfVariaveisPopuladas: true }
    });

    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    // Se já foi populado, não faz nada
    if (user.mtfVariaveisPopuladas) {
      return false; // Indica que não foi necessário popular
    }

    // Busca ou cria a configuração do MTF Diamante
    let config = await getPrismaInstance().mtfDiamanteConfig.findFirst({
      where: { userId }
    });

    if (!config) {
      // Cria configuração com variáveis padrão
      config = await getPrismaInstance().mtfDiamanteConfig.upsert({
        where: { userId },
        update: {},
        create: {
          userId,
          variaveis: {
            create: [
              { chave: "chave_pix", valor: "57944155000101" },
              { chave: "nome_do_escritorio_rodape", valor: "Dra. Amanda Sousa Advocacia e Consultoria Jurídica™" },
              { chave: "valor_analise", valor: "R$ 27,90" }
            ]
          }
        }
      });
    } else {
      // Se a configuração existe mas não tem variáveis, cria as padrão
      const variaveisExistentes = await getPrismaInstance().mtfDiamanteVariavel.count({
        where: { configId: config.id }
      });

      if (variaveisExistentes === 0) {
        await getPrismaInstance().mtfDiamanteVariavel.createMany({
          data: [
            { configId: config.id, chave: "chave_pix", valor: "57944155000101" },
            { configId: config.id, chave: "nome_do_escritorio_rodape", valor: "Dra. Amanda Sousa Advocacia e Consultoria Jurídica™" },
            { configId: config.id, chave: "valor_analise", valor: "R$ 27,90" }
          ]
        });
      }
    }

    // Marca o usuário como tendo as variáveis populadas
    await getPrismaInstance().user.update({
      where: { id: userId },
      data: { mtfVariaveisPopuladas: true }
    });

    console.log(`✅ Variáveis MTF Diamante populadas para usuário: ${userId}`);
    return true; // Indica que foi populado com sucesso

  } catch (error) {
    console.error('❌ Erro ao popular variáveis MTF Diamante:', error);
    throw error;
  }
}

/**
 * Middleware para verificar e popular variáveis automaticamente
 * Deve ser chamado sempre que o usuário acessa a rota do MTF Diamante
 */
export async function ensureMtfVariaveisPopulated(userId: string): Promise<void> {
  try {
    const wasPopulated = await populateUserMtfVariaveis(userId);
    if (wasPopulated) {
      console.log(`🌱 Variáveis MTF Diamante auto-populadas para usuário: ${userId}`);
    }
  } catch (error) {
    // Log do erro mas não quebra a aplicação
    console.error('⚠️ Erro no auto-seed MTF Diamante:', error);
  }
}