import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

// GET - Buscar detalhes de um template específico
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const templateId = params.id

    // Buscar template no banco de dados
    const template = await prisma.whatsappTemplate.findUnique({
      where: { id: templateId },
      include: {
        components: {
          orderBy: { order: 'asc' }
        }
      }
    })

    if (!template) {
      return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
    }

    // Processar componentes para extrair botões
    const processedComponents = template.components.map(component => {
      let parsedComponent
      try {
        parsedComponent = typeof component.content === 'string' 
          ? JSON.parse(component.content) 
          : component.content
      } catch (error) {
        console.error('Erro ao fazer parse do componente:', error)
        parsedComponent = component.content
      }

      return {
        type: component.type,
        content: parsedComponent,
        order: component.order
      }
    })

    // Extrair botões dos componentes
    const buttonComponent = processedComponents.find(c => c.type === 'BUTTONS')
    const buttons = buttonComponent?.content?.buttons || []

    const templateDetails = {
      id: template.id,
      name: template.name,
      category: template.category,
      language: template.language,
      status: template.status,
      components: processedComponents,
      buttons: buttons.map((btn: any, index: number) => ({
        id: `template_${templateId}_btn_${index}`,
        text: btn.text,
        type: btn.type,
        url: btn.url || null,
        phoneNumber: btn.phone_number || null
      }))
    }

    return NextResponse.json(templateDetails)
  } catch (error) {
    console.error('Erro ao buscar detalhes do template:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}