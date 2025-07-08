// app/api/admin/mtf-diamante/disparo/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import {
  sendTemplateMessage,
  testWhatsAppApiConnection,
} from '@/lib/whatsapp';

interface EnvioResult {
  nome: string;
  numero: string;
  status: 'enviado' | 'falha';
  erro?: string;
}

const disparoSchema = z.object({
  templateId: z.string().min(1, "Template é obrigatório"),
  selectedLeads: z.array(z.string()).min(1, "Selecione pelo menos um lead"),
  delayMinutes: z.number().min(0).default(0),
  parameters: z.record(z.string()).optional()
});

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
    const { templateId, selectedLeads, delayMinutes, parameters } = disparoSchema.parse(body);

    // Buscar informações do template
    const template = await prisma.template.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        name: true,
        status: true,
        language: true,
        category: true
      }
    });

    if (!template) {
      return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 });
    }

    if (template.status !== 'APPROVED') {
      return NextResponse.json({ error: 'Template não está aprovado' }, { status: 400 });
    }

    // Buscar leads selecionados
    const leads = await prisma.lead.findMany({
      where: {
        id: { in: selectedLeads },
        userId: session.user.id
      },
      select: {
        id: true,
        nome: true,
        telefone: true,
        email: true,
        statusContato: true
      }
    });

    if (leads.length === 0) {
      return NextResponse.json({ error: 'Nenhum lead válido encontrado' }, { status: 404 });
    }

    // Preparar dados do disparo
    const disparos = leads.map(lead => ({
      templateId: template.id,
      templateName: template.name,
      leadId: lead.id,
      leadNome: lead.nome,
      leadTelefone: lead.telefone,
      status: 'PENDING',
      scheduledAt: new Date(Date.now() + delayMinutes * 60 * 1000),
      parameters: parameters || {},
      userId: session.user.id
    }));

    // Salvar disparos no banco
    const savedDisparos = await prisma.disparoMtfDiamante.createMany({
      data: disparos,
      skipDuplicates: true
    });

    // Se não há delay, enviar imediatamente
    if (delayMinutes === 0) {
      const resultados = await Promise.allSettled(
        leads.map(async (lead) => {
          try {
            const success = await sendTemplateMessage(
              lead.telefone,
              template.name,
              parameters || {}
            );

            // Atualizar status do disparo
            await prisma.disparoMtfDiamante.updateMany({
              where: {
                leadId: lead.id,
                templateId: template.id,
                status: 'PENDING'
              },
              data: {
                status: success ? 'SENT' : 'FAILED',
                sentAt: success ? new Date() : null,
                errorMessage: success ? null : 'Falha no envio'
              }
            });

            return { leadId: lead.id, success, leadNome: lead.nome };
          } catch (error) {
            console.error(`Erro ao enviar para ${lead.nome}:`, error);
            
            // Atualizar status de erro
            await prisma.disparoMtfDiamante.updateMany({
              where: {
                leadId: lead.id,
                templateId: template.id,
                status: 'PENDING'
              },
              data: {
                status: 'FAILED',
                errorMessage: error instanceof Error ? error.message : 'Erro desconhecido'
              }
            });

            return { leadId: lead.id, success: false, leadNome: lead.nome, error: error instanceof Error ? error.message : 'Erro desconhecido' };
          }
        })
      );

      const sucessos = resultados.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const falhas = resultados.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;

      return NextResponse.json({
        success: true,
        message: `Disparo MTF Diamante concluído: ${sucessos} sucessos, ${falhas} falhas`,
        stats: {
          total: leads.length,
          sucessos,
          falhas,
          template: template.name
        },
        detalhes: resultados.map(r => 
          r.status === 'fulfilled' ? r.value : { error: r.reason }
        )
      });
    } else {
      // Disparo agendado - será processado pelo worker
      return NextResponse.json({
        success: true,
        message: `Disparo MTF Diamante agendado para ${delayMinutes} minutos`,
        stats: {
          total: leads.length,
          agendados: savedDisparos.count,
          template: template.name,
          scheduledAt: new Date(Date.now() + delayMinutes * 60 * 1000)
        }
      });
    }

  } catch (error) {
    console.error('Erro no disparo MTF Diamante:', error);
    
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

// Rota para listar disparos
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status');

    const whereClause: any = {
      userId: session.user.id
    };

    if (status) {
      whereClause.status = status;
    }

    const [disparos, total] = await Promise.all([
      prisma.disparoMtfDiamante.findMany({
        where: whereClause,
        include: {
          lead: {
            select: {
              id: true,
              nome: true,
              telefone: true,
              email: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.disparoMtfDiamante.count({
        where: whereClause
      })
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      data: {
        disparos,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Erro ao buscar disparos:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
