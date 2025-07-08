import { NextResponse } from 'next/server';
import axios from 'axios';
import prisma from '@/lib/prisma';
import { parse } from 'papaparse';
import { auth } from '@/auth';
import { getWhatsAppConfig, getWhatsAppApiUrl } from '@/app/lib';

// Endpoint para disparo específico do template satisfacao_oab
export async function POST(request: Request) {
  try {
    // Verificação de autenticação
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    const { csvData, imageUrl } = await request.json();
    
    if (!csvData) {
      return NextResponse.json(
        { error: 'Dados CSV são obrigatórios' },
        { status: 400 }
      );
    }

    // Processar o CSV
    const contacts = processCSV(csvData);
    
    if (contacts.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum contato válido encontrado no CSV' },
        { status: 400 }
      );
    }

    // Obter configurações do WhatsApp
    const config = await getWhatsAppConfig(session.user.id);
    const whatsappApiUrl = getWhatsAppApiUrl(config);
    
    // Configuração para a API do WhatsApp
    const configWhatsapp = {
      headers: {
        'Authorization': `Bearer ${config.whatsappToken}`,
        'Content-Type': 'application/json',
      }
    };

    // URL padrão da imagem caso não seja fornecida
    const headerImageUrl = imageUrl || 'https://amandasousaprev.adv.br/wp-content/uploads/2024/10/AmandaFOTO.jpg';

    // Resultados do envio
    const results = {
      total: contacts.length,
      enviados: 0,
      falhas: 0,
      detalhes: [] as any[]
    };

    // Enviar mensagens para cada contato
    for (const contact of contacts) {
      try {
        // Garante que o número tem o formato correto (com código do país)
        let numero = contact.numero;
        if (!numero.startsWith('55')) {
          numero = '55' + numero;
        }

        // Preparar dados para envio
        const data = {
          messaging_product: 'whatsapp',
          to: numero,
          type: 'template',
          template: {
            name: 'satisfacao_oab',
            language: {
              code: 'pt_BR',
            },
            components: [
              {
                type: 'header',
                parameters: [
                  {
                    type: 'image',
                    image: {
                      link: headerImageUrl,
                    },
                  },
                ],
              },
              {
                type: 'body',
                parameters: [
                  {
                    type: 'text',
                    text: contact.nome
                  }
                ]
              },
            ],
          },
        };

        // Enviar mensagem
        console.log(`Enviando template satisfacao_oab para ${numero}`);
        const response = await axios.post(whatsappApiUrl, data, configWhatsapp);
        
        results.enviados++;
        results.detalhes.push({
          nome: contact.nome,
          numero: contact.numero,
          status: 'enviado',
        });

        // Adicionar um pequeno delay para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Erro ao processar contato ${contact.nome}:`, error);
        results.falhas++;
        results.detalhes.push({
          nome: contact.nome,
          numero: contact.numero,
          status: 'falha',
          erro: (error as Error).message
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Disparo OAB concluído. Enviadas ${results.enviados} mensagens de ${results.total}.`,
      results
    });
  } catch (error) {
    console.error('Erro ao disparar mensagens OAB:', error);
    return NextResponse.json(
      { error: 'Erro ao disparar mensagens OAB', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// Função para processar CSV
function processCSV(csvContent: string) {
  const { data } = parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  return data.map((row: any) => ({
    nome: row.Nome || '',
    numero: row.Numero?.replace(/\D/g, '') || ''
  })).filter((contact: any) => contact.numero);
} 