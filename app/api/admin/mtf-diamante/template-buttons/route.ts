import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from "@/lib/db";

/**
 * Endpoint para analisar e listar os botões de um template
 * GET /api/admin/mtf-diamante/template-buttons?name=TEMPLATE_NAME
 */
export async function GET(request: Request) {
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

    // Obter o nome do template da query string
    const url = new URL(request.url);
    const templateName = url.searchParams.get('name');
    
    if (!templateName) {
      return NextResponse.json({ error: "Nome do template não especificado" }, { status: 400 });
    }

    // Buscar template no banco de dados
    const template = await db.whatsAppTemplate.findFirst({
      where: { name: templateName }
    });

    if (!template) {
      return NextResponse.json({ 
        error: "Template não encontrado", 
        templateName 
      }, { status: 404 });
    }

    // Resultados
    const results = {
      templateId: template.id,
      templateName: template.name,
      status: template.status,
      language: template.language,
      buttons: [] as Array<{
        index: number;
        type: any;
        subType?: any;
        text: any;
        url?: any;
        phoneNumber?: any;
        buttonFormat: string;
        originalComponent: any;
      }>,
      allComponents: null as any[] | null,
      rawComponents: template.components,
    };

    // Extrair informações sobre os botões
    try {
      const components = template.components as any;
      
      // 1. Buscar botões em formato de array de componentes
      if (Array.isArray(components)) {
        results.allComponents = components;
        
        for (let i = 0; i < components.length; i++) {
          const component = components[i];
          if (component.type === 'BUTTON' || (component.type && component.type.toUpperCase() === 'BUTTON')) {
            results.buttons.push({
              index: component.index || i,
              type: component.type,
              subType: component.sub_type,
              text: component.text,
              url: component.url,
              phoneNumber: component.phone_number,
              buttonFormat: 'array_component',
              originalComponent: component
            });
          }
        }
      }
      
      // 2. Buscar botões em formato de objeto 'components'
      else if (components.components && Array.isArray(components.components)) {
        results.allComponents = components.components;
        
        for (let i = 0; i < components.components.length; i++) {
          const component = components.components[i];
          if (component.type === 'BUTTON' || (component.type && component.type.toUpperCase() === 'BUTTON')) {
            results.buttons.push({
              index: component.index || i,
              type: component.type,
              subType: component.sub_type,
              text: component.text,
              url: component.url,
              phoneNumber: component.phone_number,
              buttonFormat: 'component_object',
              originalComponent: component
            });
          }
        }
      }
      
      // 3. Buscar botões diretamente em 'buttons'
      if (components.buttons && Array.isArray(components.buttons)) {
        for (let i = 0; i < components.buttons.length; i++) {
          const button = components.buttons[i];
          results.buttons.push({
            index: i,
            type: button.type,
            text: button.text,
            url: button.url,
            phoneNumber: button.phone_number,
            buttonFormat: 'direct_buttons',
            originalComponent: button
          });
        }
      }
    } catch (error) {
      console.error("Erro ao processar componentes do template:", error);
      return NextResponse.json({ 
        error: "Erro ao processar componentes do template", 
        details: (error as Error).message,
        templateName,
        components: template.components
      }, { status: 500 });
    }

    // Retornar resultados
    return NextResponse.json({
      success: true,
      templateName,
      results
    });

  } catch (error: any) {
    console.error("Erro ao analisar botões do template:", error);
    
    return NextResponse.json({ 
      error: "Erro ao analisar botões do template",
      details: error.message 
    }, { status: 500 });
  }
} 