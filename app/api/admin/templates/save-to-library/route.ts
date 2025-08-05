import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { TemplateLibraryService } from '@/app/lib/template-library-service';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Usuário não autenticado.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { templateData, messageType = 'template' } = body;

    if (!templateData.name || !templateData.bodyText) {
      return NextResponse.json(
        { error: 'Nome e texto do corpo são obrigatórios' },
        { status: 400 }
      );
    }

    // Extract variables from all text fields
    const allText = [
      templateData.headerText,
      templateData.bodyText,
      templateData.footerText
    ].filter(Boolean).join(' ');
    
    const variableMatches = allText.match(/\{\{([^}]+)\}\}/g) || [];
    const extractedVariables = [...new Set(variableMatches.map(match => match.slice(2, -2)))];

    // Prepare content based on message type
    const content = {
      header: templateData.headerText || undefined,
      body: templateData.bodyText,
      footer: templateData.footerText || undefined,
      variables: extractedVariables,
      mediaUrl: templateData.headerMetaMedia?.[0]?.url,
      mediaType: templateData.headerType !== 'TEXT' && templateData.headerType !== 'NONE' 
        ? templateData.headerType.toLowerCase() 
        : undefined,
      buttons: templateData.buttons?.map((btn: any) => ({
        type: btn.type,
        text: btn.text,
        url: btn.url,
        phone_number: btn.phone_number,
        code_example: btn.code_example
      }))
    };

    const libraryData = {
      name: templateData.name,
      description: `${messageType === 'template' ? 'Template' : 'Mensagem interativa'} criado via interface`,
      type: messageType === 'template' ? 'WHATSAPP_OFFICIAL' as const : 'INTERACTIVE_MESSAGE' as const,
      scope: 'GLOBAL' as const,
      content,
      language: templateData.language || 'pt_BR',
      tags: [messageType, templateData.category?.toLowerCase() || 'utility'],
      createdById: session.user.id,
    };

    const savedTemplate = await TemplateLibraryService.saveToLibrary(libraryData);

    return NextResponse.json({
      success: true,
      template: savedTemplate,
      message: `${messageType === 'template' ? 'Template' : 'Mensagem interativa'} salvo na biblioteca com sucesso!`
    });

  } catch (error) {
    console.error('Erro ao salvar na biblioteca:', error);
    return NextResponse.json(
      { error: 'Falha ao salvar na biblioteca' },
      { status: 500 }
    );
  }
} 