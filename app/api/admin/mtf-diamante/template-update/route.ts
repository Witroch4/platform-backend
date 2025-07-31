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
    if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    // Obter os dados do corpo da requisição
    const body = await req.json();
    const { templateId, name, components, submit_for_review } = body;

    if (!templateId || !name || !components) {
      return NextResponse.json({ 
        success: false, 
        error: "Informações incompletas do template" 
      }, { status: 400 });
    }

    try {
      // Verificar se o template existe no banco
      const existingTemplate = await prisma.template.findFirst({
        where: { 
          whatsappOfficialInfo: {
            metaTemplateId: templateId
          },
          createdById: session.user.id
        },
        include: {
          whatsappOfficialInfo: true
        }
      });

      if (!existingTemplate) {
        return NextResponse.json({ 
          success: false, 
          error: "Template não encontrado no banco de dados" 
        }, { status: 404 });
      }

      // Atualizar o template no banco de dados
      await prisma.template.update({
        where: { id: existingTemplate.id },
        data: {
          name: name,
          updatedAt: new Date(),
          whatsappOfficialInfo: {
            update: {
              components: components,
              updatedAt: new Date()
            }
          }
        }
      });

      // Se submit_for_review for true, enviar para análise no WhatsApp
      if (submit_for_review) {
        try {
          const config = {
            fbGraphApiBase: process.env.FB_GRAPH_API_BASE || 'https://graph.facebook.com/v22.0',
            whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ID || '294585820394901',
            whatsappToken: process.env.WHATSAPP_TOKEN || mtfDiamanteConfig.whatsappToken,
          };

          // Enviar template para análise no WhatsApp
          const url = `${config.fbGraphApiBase}/${config.whatsappBusinessAccountId}/message_templates`;
          const response = await axios.post(url, {
            name: name,
            category: existingTemplate.whatsappOfficialInfo?.category || 'UTILITY',
            components: components
          }, {
            headers: {
              Authorization: `Bearer ${config.whatsappToken}`,
              'Content-Type': 'application/json',
            }
          });

          console.log('Template enviado para análise no WhatsApp:', response.data);
        } catch (whatsappError) {
          console.error('Erro ao enviar template para análise no WhatsApp:', whatsappError);
          // Não falhar a operação se o envio para análise falhar
        }
      }

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