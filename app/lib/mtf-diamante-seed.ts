import { getPrismaInstance } from "@/lib/connections"
import { Prisma } from "@prisma/client"

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

    // Usa transação para garantir atomicidade
    return await getPrismaInstance().$transaction(async (tx) => {
      // Busca ou cria a configuração do MTF Diamante
      let config = await tx.mtfDiamanteConfig.findFirst({
        where: { userId }
      });

      if (!config) {
        try {
          // Tenta criar a configuração
          config = await tx.mtfDiamanteConfig.create({
            data: {
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
        } catch (error) {
          // Se falhar por constraint única, significa que outro processo já criou
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            // Busca a configuração que foi criada por outro processo
            config = await tx.mtfDiamanteConfig.findFirst({
              where: { userId }
            });
            
            if (!config) {
              throw new Error('Falha ao criar ou encontrar configuração MTF Diamante');
            }
          } else {
            throw error;
          }
        }
      } else {
        // Se a configuração existe mas não tem variáveis, cria as padrão
        const variaveisExistentes = await tx.mtfDiamanteVariavel.count({
          where: { configId: config.id }
        });

        if (variaveisExistentes === 0) {
          await tx.mtfDiamanteVariavel.createMany({
            data: [
              { configId: config.id, chave: "chave_pix", valor: "57944155000101" },
              { configId: config.id, chave: "nome_do_escritorio_rodape", valor: "Dra. Amanda Sousa Advocacia e Consultoria Jurídica™" },
              { configId: config.id, chave: "valor_analise", valor: "R$ 27,90" }
            ]
          });
        }
      }

      // Marca o usuário como tendo as variáveis populadas
      await tx.user.update({
        where: { id: userId },
        data: { mtfVariaveisPopuladas: true }
      });

      console.log(`✅ Variáveis MTF Diamante populadas para usuário: ${userId}`);
      return true; // Indica que foi populado com sucesso
    });

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