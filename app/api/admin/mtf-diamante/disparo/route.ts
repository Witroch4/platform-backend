// app/api/admin/mtf-diamante/disparo/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { sendTemplateMessage } from '@/lib/whatsapp';

const disparoSchema = z.object({
  templateId: z.string().min(1, "Template é obrigatório"),
  selectedLeads: z.array(z.string()).min(1, "Selecione pelo menos um lead"),
  delayMinutes: z.number().min(0).default(0),
  parameters: z.record(z.any()).optional()
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const appUserId = session.user.id;
    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const body = await request.json();
    const { templateId, selectedLeads, delayMinutes, parameters } = disparoSchema.parse(body);

    const usuarioChatwit = await prisma.usuarioChatwit.findFirst({
      where: { appUserId: appUserId },
      select: { id: true }
    });

    if (!usuarioChatwit?.id) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado para o usuário logado' }, { status: 404 });
    }
    const usuarioChatwitId = usuarioChatwit.id;

    // A busca de template já está correta
    const template = await prisma.whatsAppTemplate.findFirst({
      where: {
        templateId: templateId,
        usuarioChatwitId: usuarioChatwitId
      },
      select: { id: true, name: true, status: true }
    });

    if (!template) {
      return NextResponse.json({ error: `Template com ID ${templateId} não encontrado para este usuário.` }, { status: 404 });
    }

    if (template.status !== 'APPROVED') {
      return NextResponse.json({ error: `Template não está aprovado (Status: ${template.status})` }, { status: 400 });
    }

    // --- CORREÇÃO APLICADA AQUI ---
    // Mapear os números de telefone para uma busca mais flexível, evitando duplicação
    const leadConditions = selectedLeads.flatMap(leadIdentifier => {
      const cleanNumber = leadIdentifier.replace(/\D/g, '');
      const isNumeric = /^\d+$/.test(leadIdentifier);
      
      if (isNumeric && cleanNumber.length >= 10) {
        // Se é um número, busca apenas por telefone
        return [{ phoneNumber: { endsWith: cleanNumber.slice(-11) } }];
      } else {
        // Se não é um número, busca apenas por ID
        return [{ id: leadIdentifier }];
      }
    });

    const leadsRaw = await prisma.leadChatwit.findMany({
      where: {
        AND: [
          { usuarioId: usuarioChatwitId }, // Garante que o lead é do usuário
          { OR: leadConditions } // Aplica as condições flexíveis de busca
        ]
      },
      select: { id: true, name: true, nomeReal: true, phoneNumber: true },
      distinct: ['id'] // Garante que não haverá leads duplicados
    });

    // Remove duplicatas por número de telefone (mantém apenas o primeiro lead de cada número)
    const phoneNumbersSeen = new Set<string>();
    const leads = leadsRaw.filter(lead => {
      if (!lead.phoneNumber) return false;
      const cleanPhone = lead.phoneNumber.replace(/\D/g, '');
      if (phoneNumbersSeen.has(cleanPhone)) {
        console.log(`[Disparo Debug] Lead duplicado ignorado: ${lead.id} (${lead.phoneNumber}) - já existe lead com este número`);
        return false;
      }
      phoneNumbersSeen.add(cleanPhone);
      return true;
    });
    // --- FIM DA CORREÇÃO ---
    
    if (leads.length === 0) {
      return NextResponse.json({ error: 'Nenhum lead válido encontrado na sua base de dados.' }, { status: 404 });
    }

    // O restante do código de disparo continua igual
    const disparosData = leads.map(lead => ({
      templateId: template.id,
      templateName: template.name,
      leadId: lead.id,
      leadNome: lead.nomeReal || lead.name,
      leadTelefone: lead.phoneNumber,
      status: 'PENDING',
      scheduledAt: new Date(Date.now() + delayMinutes * 60 * 1000),
      parameters: parameters || {},
      userId: appUserId
    }));

    await prisma.disparoMtfDiamante.createMany({
      data: disparosData,
      skipDuplicates: true
    });
    
    if (delayMinutes === 0) {
      const resultados = await Promise.allSettled(
        leads.map(async (lead) => {
          try {
            const success = await sendTemplateMessage(lead.phoneNumber || '', template.name, parameters || {});
            await prisma.disparoMtfDiamante.updateMany({
              where: { leadId: lead.id, templateId: template.id, status: 'PENDING' },
              data: { status: success ? 'SENT' : 'FAILED', sentAt: new Date(), errorMessage: success ? null : 'Falha no envio' }
            });
            return { success };
          } catch (error) {
            await prisma.disparoMtfDiamante.updateMany({
              where: { leadId: lead.id, templateId: template.id, status: 'PENDING' },
              data: { status: 'FAILED', errorMessage: error instanceof Error ? error.message : 'Erro desconhecido' }
            });
            return { success: false };
          }
        })
      );
      const sucessos = resultados.filter(r => r.status === 'fulfilled' && r.value.success).length;
      return NextResponse.json({
        success: true,
        message: `Disparo concluído: ${sucessos} sucessos, ${leads.length - sucessos} falhas.`,
      });
    } else {
      return NextResponse.json({ success: true, message: `Disparo agendado para ${delayMinutes} minutos.` });
    }

  } catch (error) {
    console.error('[API /disparo] ERRO FATAL:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// A função GET não precisa de alteraçõ


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
