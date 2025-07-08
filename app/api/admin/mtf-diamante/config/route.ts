import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const mtfConfigSchema = z.object({
  valorAnalise: z.string().min(1, "Valor da análise é obrigatório"),
  chavePix: z.string().min(1, "Chave PIX é obrigatória"),
  lotes: z.array(z.object({
    numero: z.number().min(1),
    nome: z.string().min(1),
    valor: z.string().min(1),
    dataInicio: z.string().datetime(),
    dataFim: z.string().datetime(),
    isActive: z.boolean()
  })).min(1, "Deve haver pelo menos um lote"),
  intentMappings: z.array(z.object({
    intentName: z.string(),
    templateName: z.string(),
    parameters: z.any().optional(),
    isActive: z.boolean()
  })).optional().default([])
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
        lotes: {
          orderBy: { numero: 'asc' }
        },
        intentMappings: {
          where: { isActive: true }
        }
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
              valorAnalise: "R$ 27,90",
              chavePix: "atendimento@amandasousaprev.adv.br",
              isActive: true
            }
          });
          configId = newConfig.id;

          // Criar lote padrão
          await tx.mtfDiamanteLote.create({
            data: {
              configId: newConfig.id,
              numero: 1,
              nome: "Primeiro Lote",
              valor: "R$ 287,90",
              dataInicio: new Date(),
              dataFim: new Date(),
              isActive: true
            }
          });
        }

        // Criar mapeamentos padrão (seed inicial) - sempre, mesmo se config já existir
        console.log('Criando mapeamentos padrão...');
        const defaultMappings = [
          {
            intentName: "oab",
            templateName: "oab",
            parameters: {},
            isActive: true
          },
          {
            intentName: "atendimentohumano",
            templateName: "welcome",
            parameters: {},
            isActive: true
          },
          {
            intentName: "oab - pix",
            templateName: "pix",
            parameters: {},
            isActive: true
          }
        ];

        await Promise.all(
          defaultMappings.map(mapping =>
            tx.mtfDiamanteIntentMapping.create({
              data: {
                configId: configId,
                intentName: mapping.intentName,
                templateName: mapping.templateName,
                parameters: mapping.parameters,
                isActive: mapping.isActive
              }
            })
          )
        );

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
          lotes: {
            orderBy: { numero: 'asc' }
          },
          intentMappings: {
            where: { isActive: true }
          }
        }
      });
    }

    return NextResponse.json({
      success: true,
      config: {
        id: config?.id,
        valorAnalise: config?.valorAnalise,
        chavePix: config?.chavePix,
        lotes: config?.lotes || [],
        intentMappings: config?.intentMappings || []
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
          valorAnalise: validatedData.valorAnalise,
          chavePix: validatedData.chavePix,
          updatedAt: new Date()
        }
      });

      // Remover lotes existentes
      await tx.mtfDiamanteLote.deleteMany({
        where: { configId: existingConfig.id }
      });

      // Criar novos lotes
      const lotes = await Promise.all(
        validatedData.lotes.map(lote =>
          tx.mtfDiamanteLote.create({
            data: {
              configId: existingConfig.id,
              numero: lote.numero,
              nome: lote.nome,
              valor: lote.valor,
              dataInicio: new Date(lote.dataInicio),
              dataFim: new Date(lote.dataFim),
              isActive: lote.isActive
            }
          })
        )
      );

      // Remover mapeamentos existentes
      await tx.mtfDiamanteIntentMapping.deleteMany({
        where: { configId: existingConfig.id }
      });

      // Criar novos mapeamentos
      const intentMappings = await Promise.all(
        validatedData.intentMappings.map(mapping =>
          tx.mtfDiamanteIntentMapping.create({
            data: {
              configId: existingConfig.id,
              intentName: mapping.intentName,
              templateName: mapping.templateName,
              parameters: mapping.parameters || {},
              isActive: mapping.isActive
            }
          })
        )
      );

      return { config: updatedConfig, lotes, intentMappings };
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