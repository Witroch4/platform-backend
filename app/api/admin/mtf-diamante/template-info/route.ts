// app/api/admin/mtf-diamante/template-info/route.ts
import { NextResponse } from 'next/server';
import axios from 'axios';
import { auth } from '@/auth';
import { mtfDiamanteConfig } from '@/app/config/atendimento';
import prisma from '@/lib/prisma';

/**
 * Função auxiliar para obter as configurações da API do WhatsApp.
 * Certifique-se de definir as variáveis de ambiente:
 *  - FB_GRAPH_API_BASE (ex.: https://graph.facebook.com/v22.0)
 *  - WHATSAPP_BUSINESS_ID (deve ser o ID da conta do WhatsApp, WABA)
 *  - WHATSAPP_TOKEN (Token do System User com as permissões necessárias)
 */
function getWhatsAppApiConfig() {
  return {
    fbGraphApiBase:
      process.env.FB_GRAPH_API_BASE || 'https://graph.facebook.com/v22.0',
    whatsappBusinessAccountId:
      process.env.WHATSAPP_BUSINESS_ID || '294585820394901',
    whatsappToken:
      process.env.WHATSAPP_TOKEN ||
      mtfDiamanteConfig.whatsappToken ||
      '',
  };
}

/**
 * Função para obter detalhes do template diretamente da API do WhatsApp
 * e sincronizá‑lo no banco de dados.
 */
async function getWhatsAppTemplateDetailsFromAPI(templateId: string) {
  try {
    const config = getWhatsAppApiConfig();
    const url = `${config.fbGraphApiBase}/${config.whatsappBusinessAccountId}/message_templates?fields=name,status,category,language,components,sub_category,quality_score,correct_category,cta_url_link_tracking_opted_out,library_template_name,message_send_ttl_seconds,parameter_format,previous_category&limit=1000`;
    console.log('Consultando API do WhatsApp em:', url);
    
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${config.whatsappToken}`,
        'Content-Type': 'application/json',
      }
    });
    
    if (!response.data || !response.data.data || response.data.data.length === 0) {
      throw new Error('Nenhum template encontrado na API');
    }
    
    const template = response.data.data.find((t: any) => t.id === templateId);
    if (!template) {
      throw new Error(`Template com ID ${templateId} não encontrado na API`);
    }
    
    try {
      const session = await auth();
      if (session?.user) {
        const existingTemplate = await prisma.whatsAppTemplate.findFirst({
          where: { templateId }
        });
        
        const data = {
          name: template.name,
          category: template.category,
          status: template.status,
          language: template.language,
          components: template.components,
          subCategory: template.sub_category || null,
          qualityScore: template.quality_score?.score || null,
          correctCategory: template.correct_category || null,
          ctaUrlLinkTrackingOptedOut: template.cta_url_link_tracking_opted_out || null,
          libraryTemplateName: template.library_template_name || null,
          messageSendTtlSeconds: template.message_send_ttl_seconds || null,
          parameterFormat: template.parameter_format || null,
          previousCategory: template.previous_category || null,
          lastEdited: new Date(),
        };

        if (existingTemplate) {
          await prisma.whatsAppTemplate.update({
            where: { id: existingTemplate.id },
            data,
          });
          console.log(`Template ${template.name} atualizado no banco de dados`);
        } else {
          await prisma.whatsAppTemplate.create({
            data: {
              templateId: template.id,
              userId: session.user.id,
              ...data,
            },
          });
          console.log(`Template ${template.name} criado no banco de dados`);
        }
      }
    } catch (dbError) {
      console.error(`Erro ao salvar template no banco:`, dbError);
    }
    
    return template;
  } catch (error) {
    console.error(`Erro ao obter detalhes do template da API:`, error);
    throw error;
  }
}

/**
 * Endpoint GET /api/admin/mtf-diamante/template-info
 * Recebe o parâmetro de query "template" (ID do template) e retorna os detalhes.
 * Apenas usuários autenticados com role ADMIN têm acesso.
 */
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const url = new URL(req.url);
    const templateId = url.searchParams.get("template");
    if (!templateId) {
      return NextResponse.json({ error: "ID do template não fornecido" }, { status: 400 });
    }
    console.log("Buscando template com ID:", templateId);
    
    const template = await getWhatsAppTemplateDetailsFromAPI(templateId);
    if (!template) {
      return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
    }
    console.log("Template encontrado: Sim");
    
    // Buscar URL pública da mídia armazenada no banco de dados
    const dbTemplate = await prisma.whatsAppTemplate.findFirst({
      where: { templateId }
    });
    
    const publicMediaUrl = dbTemplate?.publicMediaUrl || null;
    console.log("URL pública da mídia:", publicMediaUrl || "Não encontrada");
    
    return NextResponse.json({
      success: true,
      template: {
        nome: template.name,
        categoria: template.category,
        idioma: template.language,
        status: template.status,
        subCategoria: template.sub_category || null,
        qualidadeScore: template.quality_score?.score || null,
        categoriaCorreta: template.correct_category || null,
        ctaUrlLinkTrackingOptedOut: template.cta_url_link_tracking_opted_out || null,
        nomeTemplateBiblioteca: template.library_template_name || null,
        mensagemSendTtlSegundos: template.message_send_ttl_seconds || null,
        formatoParametro: template.parameter_format || null,
        categoriaAnterior: template.previous_category || null,
        publicMediaUrl: publicMediaUrl,
        componentes: Array.isArray(template.components)
          ? template.components.map((component: any) => {
              const mappedComponent: any = {
                tipo: component.type,
                formato: component.format,
                texto: component.text,
              };
              if (component.example) {
                mappedComponent.example = component.example;
              }
              if (component.text && component.example) {
                const varRegex = /{{(\d+)}}/g;
                const matches = [...component.text.matchAll(varRegex)];
                if (matches.length > 0) {
                  mappedComponent.variaveis = matches.map((m: any, idx: number) => ({
                    nome: m[1],
                    descricao: `Variável ${m[1]}`,
                    exemplo:
                      component.example.body_text?.[0]?.[idx] ||
                      component.example[component.type.toLowerCase()]?.[0] ||
                      ''
                  }));
                } else {
                  mappedComponent.variaveis = false;
                }
              } else {
                mappedComponent.variaveis = false;
              }
              if (component.buttons) {
                mappedComponent.botoes = component.buttons.map((btn: any) => ({
                  tipo: btn.type,
                  texto: btn.text,
                  url: btn.url || null,
                  telefone: btn.phone_number || null,
                  example: btn.example || []
                }));
              }
              return mappedComponent;
            })
          : [],
      },
    });
  } catch (error) {
    console.error("Erro ao buscar informações do template:", error);
    return NextResponse.json({ error: "Erro ao buscar informações do template" }, { status: 500 });
  }
}
