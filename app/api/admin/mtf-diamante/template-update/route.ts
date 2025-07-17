import { NextResponse } from 'next/server';
import axios from 'axios';
import { auth } from '@/auth';
import { mtfDiamanteConfig } from '@/app/config/mtf-diamante';
import prisma from '@/lib/prisma';

/**
 * Função para atualizar um template do WhatsApp
 * Método PUT /api/admin/mtf-diamante/template-update
 */
export async function PUT(req: Request) {
  try {
    // Verificar autenticação
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    
    // Verificar se o usuário é admin
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    // Obter os dados do corpo da requisição
    const body = await req.json();
    const { templateId, name, components } = body;

    if (!templateId || !name || !components) {
      return NextResponse.json({ 
        success: false, 
        error: "Informações incompletas do template" 
      }, { status: 400 });
    }

    try {
      // Verificar se o template existe no banco
      const existingTemplate = await prisma.whatsAppTemplate.findFirst({
        where: { templateId: templateId }
      });

      if (!existingTemplate) {
        return NextResponse.json({ 
          success: false, 
          error: "Template não encontrado no banco de dados" 
        }, { status: 404 });
      }

      // Atualizar o template no banco de dados
      await prisma.whatsAppTemplate.update({
        where: { id: existingTemplate.id },
        data: {
          components: components,
          lastEdited: new Date()
        }
      });

      return NextResponse.json({ 
        success: true, 
        message: "Template atualizado com sucesso" 
      });
    } catch (dbError) {
      console.error("Erro ao atualizar template no banco:", dbError);
      return NextResponse.json({ 
        success: false, 
        error: "Erro ao atualizar template no banco de dados" 
      }, { status: 500 });
    }
  } catch (error) {
    console.error("Erro ao processar requisição:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Erro interno do servidor" 
    }, { status: 500 });
  }
} 