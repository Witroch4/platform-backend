import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db as prisma } from '@/lib/db';
import axios from 'axios';

// GET - Buscar caixas de entrada do Chatwit
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Buscar configurações do usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
      select: {
        chatwitAccountId: true,
        chatwitAccessToken: true,
      }
    });

    if (!usuarioChatwit?.chatwitAccessToken || !usuarioChatwit?.chatwitAccountId) {
      return NextResponse.json({ 
        error: 'Configurações do Chatwit não encontradas',
        message: 'Configure seu Account ID e Token do Chatwit primeiro'
      }, { status: 400 });
    }

    const accountId = usuarioChatwit.chatwitAccountId;
    const apiToken = usuarioChatwit.chatwitAccessToken;

    try {
      const response = await axios.get(
        `https://chatwit.witdev.com.br/api/v1/accounts/${accountId}/inboxes`,
        {
          headers: {
            'api_access_token': apiToken,
            'Content-Type': 'application/json'
          }
        }
      );

      const inboxes = response.data.payload || [];
      
      // Mapear para formato simplificado
      const simplifiedInboxes = inboxes.map((inbox: any) => ({
        id: inbox.id.toString(),
        name: inbox.name,
        channel_type: inbox.channel_type
      }));

      return NextResponse.json({ inboxes: simplifiedInboxes });
    } catch (apiError: any) {
      console.error('Erro ao buscar inboxes da API Chatwit:', apiError.response?.data || apiError.message);
      return NextResponse.json({ 
        error: 'Erro ao conectar com a API do Chatwit',
        details: apiError.response?.data || apiError.message
      }, { status: 502 });
    }

  } catch (error) {
    console.error('Erro ao buscar caixas de entrada:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
} 