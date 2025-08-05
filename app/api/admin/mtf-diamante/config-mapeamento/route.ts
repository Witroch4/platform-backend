import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections'
const prisma = getPrismaInstance();;
import { z } from 'zod';

const mtfConfigSchema = z.object({
  valorAnalise: z.string().min(1, "Valor da análise é obrigatório"),
  chavePix: z.string().min(1, "Chave PIX é obrigatória")
});

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    // Verificar se o seed já foi executado para este usuário
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { mtfDiamanteSeedExecuted: true }
    });

    // Buscar configuração do usuário
    let config = await prisma.mtfDiamanteConfig.findFirst({
      where: {
        userId: session.user.id,
        isActive: true
      },
      include: {
        variaveis: true
      }
    });

    // Verificar se precisa executar seed (primeira vez ou quando seed não foi executado)
    if (!user?.mtfDiamanteSeedExecuted) {
      console.log('Executando seed MTF Diamante para usuário:', session.user.id);
      
      await prisma.$transaction(async (tx) => {
        let configId = config?.id;
        
        // Se não existe configuração, criar uma nova
        if (!config) {
          console.log('Criando configuração MTF Diamante inicial...');
          const newConfig = await tx.mtfDiamanteConfig.create({
            data: {
              userId: session.user.id,
              isActive: true,
              variaveis: {
                create: [
                  {
                    chave: "valor_analise",
                    valor: "R$ 27,90" as any
                  },
                  {
                    chave: "chave_pix",
                    valor: "atendimento@amandasousaprev.adv.br" as any
                  }
                ]
              }
            }
          });
          configId = newConfig.id;

        }

        // Marcar o seed como executado para este usuário
        await tx.user.update({
          where: { id: session.user.id },
          data: { mtfDiamanteSeedExecuted: true }
        });
      });

      // Buscar configuração completa após seed
      config = await prisma.mtfDiamanteConfig.findFirst({
        where: {
          userId: session.user.id,
          isActive: true
        },
        include: {
          variaveis: true
        }
      });
    }

    // Extrair valores das variáveis
    const valorAnalise = (config?.variaveis?.find(v => v.chave === "valor_analise")?.valor as string) || "";
    const chavePix = (config?.variaveis?.find(v => v.chave === "chave_pix")?.valor as string) || "";

    return NextResponse.json({
      success: true,
      config: {
        id: config?.id,
        valorAnalise,
        chavePix
      }
    });

  } catch (error) {
    console.error('Erro ao buscar configuração MTF Diamante:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = mtfConfigSchema.parse(body);

    // Buscar configuração existente
    const existingConfig = await prisma.mtfDiamanteConfig.findFirst({
      where: {
        userId: session.user.id,
        isActive: true
      }
    });

    if (!existingConfig) {
      return NextResponse.json(
        { error: 'Configuração não encontrada' },
        { status: 404 }
      );
    }

    // Usar transação para garantir consistência
    const result = await prisma.$transaction(async (tx) => {
      // Atualizar configuração existente
      const updatedConfig = await tx.mtfDiamanteConfig.update({
        where: { id: existingConfig.id },
        data: {
          updatedAt: new Date()
        }
      });

      // Atualizar ou criar variáveis
      await tx.mtfDiamanteVariavel.upsert({
        where: {
          configId_chave: {
            configId: existingConfig.id,
            chave: "valor_analise"
          }
        },
        update: {
          valor: validatedData.valorAnalise as any
        },
        create: {
          configId: existingConfig.id,
          chave: "valor_analise",
          valor: validatedData.valorAnalise as any
        }
      });

      await tx.mtfDiamanteVariavel.upsert({
        where: {
          configId_chave: {
            configId: existingConfig.id,
            chave: "chave_pix"
          }
        },
        update: {
          valor: validatedData.chavePix as any
        },
        create: {
          configId: existingConfig.id,
          chave: "chave_pix",
          valor: validatedData.chavePix as any
        }
      });

      return { config: updatedConfig };
    });

    return NextResponse.json({
      success: true,
      message: 'Configuração MTF Diamante atualizada com sucesso',
      configId: result.config.id
    });

  } catch (error) {
    console.error('Erro ao salvar configuração MTF Diamante:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 