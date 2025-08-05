// app/api/admin/credentials/fallback-chain/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections';

/**
 * GET - Visualiza a cadeia de fallback de credenciais
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const inboxId = searchParams.get('inboxId'); // Visualizar cadeia específica

    // Buscar usuário Chatwit
    const usuarioChatwit = await getPrismaInstance().usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
      include: {
        configuracaoGlobalWhatsApp: {
          select: {
            id: true,
            whatsappApiKey: true,
            phoneNumberId: true,
            whatsappBusinessAccountId: true,
          },
        },
        inboxes: {
          include: {
            fallbackParaInbox: {
              select: { id: true, nome: true, inboxId: true },
            },
            fallbackDeInboxes: {
              select: { id: true, nome: true, inboxId: true },
            },
          },
        },
      },
    });

    if (!usuarioChatwit) {
      return NextResponse.json(
        { error: 'Usuário Chatwit não encontrado' },
        { status: 404 }
      );
    }

    // Função para resolver cadeia de fallback
    const resolveFallbackChain = async (startInboxId: string, visited: Set<string> = new Set()): Promise<any[]> => {
      if (visited.has(startInboxId)) {
        return [{ error: 'Loop detectado', inboxId: startInboxId }];
      }

      visited.add(startInboxId);

      const inbox = usuarioChatwit.inboxes.find(i => i.id === startInboxId);
      if (!inbox) {
        return [{ error: 'Inbox não encontrado', inboxId: startInboxId }];
      }

      const chainItem = {
        id: inbox.id,
        nome: inbox.nome,
        inboxId: inbox.inboxId,
        hasCredentials: !!(inbox.whatsappApiKey || inbox.phoneNumberId || inbox.whatsappBusinessAccountId),
        credentials: {
          whatsappApiKey: !!inbox.whatsappApiKey,
          phoneNumberId: !!inbox.phoneNumberId,
          whatsappBusinessAccountId: !!inbox.whatsappBusinessAccountId,
        },
        fallbackParaInboxId: inbox.fallbackParaInboxId,
        level: visited.size - 1,
      };

      if (inbox.fallbackParaInboxId) {
        const fallbackChain = await resolveFallbackChain(inbox.fallbackParaInboxId, new Set(visited));
        return [chainItem, ...fallbackChain];
      }

      return [chainItem];
    };

    // Se inboxId específico foi fornecido, mostrar apenas sua cadeia
    if (inboxId) {
      const inbox = usuarioChatwit.inboxes.find(i => i.id === inboxId);
      if (!inbox) {
        return NextResponse.json(
          { error: 'Inbox não encontrado' },
          { status: 404 }
        );
      }

      const chain = await resolveFallbackChain(inboxId);
      
      // Adicionar configuração global como último fallback se aplicável
      const lastItem = chain[chain.length - 1];
      if (!lastItem.error && !lastItem.hasCredentials && usuarioChatwit.configuracaoGlobalWhatsApp) {
        chain.push({
          id: 'global',
          nome: 'Configuração Global',
          inboxId: 'global',
          hasCredentials: !!usuarioChatwit.configuracaoGlobalWhatsApp.whatsappApiKey,
          credentials: {
            whatsappApiKey: !!usuarioChatwit.configuracaoGlobalWhatsApp.whatsappApiKey,
            phoneNumberId: !!usuarioChatwit.configuracaoGlobalWhatsApp.phoneNumberId,
            whatsappBusinessAccountId: !!usuarioChatwit.configuracaoGlobalWhatsApp.whatsappBusinessAccountId,
          },
          fallbackParaInboxId: null,
          level: chain.length,
          isGlobal: true,
        });
      }

      return NextResponse.json({
        inboxId,
        chain,
        totalLevels: chain.length,
        hasLoop: chain.some(item => item.error === 'Loop detectado'),
        finalCredentials: chain.find(item => item.hasCredentials && !item.error),
      });
    }

    // Mostrar todas as cadeias de fallback
    const allChains: any = {};
    const processedInboxes = new Set<string>();

    for (const inbox of usuarioChatwit.inboxes) {
      if (!processedInboxes.has(inbox.id)) {
        const chain = await resolveFallbackChain(inbox.id);
        
        // Marcar todos os inboxes desta cadeia como processados
        chain.forEach(item => {
          if (item.id !== 'global') {
            processedInboxes.add(item.id);
          }
        });

        // Adicionar configuração global se necessário
        const lastItem = chain[chain.length - 1];
        if (!lastItem.error && !lastItem.hasCredentials && usuarioChatwit.configuracaoGlobalWhatsApp) {
          chain.push({
            id: 'global',
            nome: 'Configuração Global',
            inboxId: 'global',
            hasCredentials: !!usuarioChatwit.configuracaoGlobalWhatsApp.whatsappApiKey,
            credentials: {
              whatsappApiKey: !!usuarioChatwit.configuracaoGlobalWhatsApp.whatsappApiKey,
              phoneNumberId: !!usuarioChatwit.configuracaoGlobalWhatsApp.phoneNumberId,
              whatsappBusinessAccountId: !!usuarioChatwit.configuracaoGlobalWhatsApp.whatsappBusinessAccountId,
            },
            fallbackParaInboxId: null,
            level: chain.length,
            isGlobal: true,
          });
        }

        allChains[inbox.id] = {
          rootInbox: {
            id: inbox.id,
            nome: inbox.nome,
            inboxId: inbox.inboxId,
          },
          chain,
          totalLevels: chain.length,
          hasLoop: chain.some(item => item.error === 'Loop detectado'),
          finalCredentials: chain.find(item => item.hasCredentials && !item.error),
        };
      }
    }

    // Estatísticas gerais
    const stats = {
      totalInboxes: usuarioChatwit.inboxes.length,
      inboxesWithCredentials: usuarioChatwit.inboxes.filter(i => 
        i.whatsappApiKey || i.phoneNumberId || i.whatsappBusinessAccountId
      ).length,
      inboxesWithFallback: usuarioChatwit.inboxes.filter(i => i.fallbackParaInboxId).length,
      inboxesUsedAsFallback: usuarioChatwit.inboxes.filter(i => i.fallbackDeInboxes.length > 0).length,
      hasGlobalConfig: !!usuarioChatwit.configuracaoGlobalWhatsApp,
      globalConfigHasCredentials: !!usuarioChatwit.configuracaoGlobalWhatsApp?.whatsappApiKey,
      chainsWithLoops: Object.values(allChains).filter((chain: any) => chain.hasLoop).length,
      chainsWithoutFinalCredentials: Object.values(allChains).filter((chain: any) => !chain.finalCredentials).length,
    };

    console.log(`[Fallback Chain API] ${Object.keys(allChains).length} cadeias de fallback analisadas`);

    return NextResponse.json({
      chains: allChains,
      stats,
      globalConfig: usuarioChatwit.configuracaoGlobalWhatsApp ? {
        hasCredentials: !!usuarioChatwit.configuracaoGlobalWhatsApp.whatsappApiKey,
        phoneNumberId: !!usuarioChatwit.configuracaoGlobalWhatsApp.phoneNumberId,
        whatsappBusinessAccountId: !!usuarioChatwit.configuracaoGlobalWhatsApp.whatsappBusinessAccountId,
      } : null,
    });

  } catch (error) {
    console.error('[Fallback Chain API] Erro ao analisar cadeias:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * POST - Valida e otimiza cadeias de fallback
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { action, inboxId, optimizations } = body; // action: 'validate' | 'optimize'

    // Buscar usuário Chatwit
    const usuarioChatwit = await getPrismaInstance().usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
      include: {
        inboxes: {
          include: {
            fallbackParaInbox: true,
            fallbackDeInboxes: true,
          },
        },
      },
    });

    if (!usuarioChatwit) {
      return NextResponse.json(
        { error: 'Usuário Chatwit não encontrado' },
        { status: 404 }
      );
    }

    if (action === 'validate') {
      // Validar todas as cadeias de fallback
      const validationResults: any = {
        loops: [],
        orphans: [],
        missingCredentials: [],
        recommendations: [],
      };

      // Detectar loops
      for (const inbox of usuarioChatwit.inboxes) {
        const visited = new Set<string>();
        let current: typeof inbox | null = inbox;

        while (current && current.fallbackParaInboxId) {
          if (visited.has(current.id)) {
            validationResults.loops.push({
              inboxId: inbox.id,
              inboxName: inbox.nome,
              loopPath: Array.from(visited),
            });
            break;
          }
          visited.add(current.id);
          const nextInbox = usuarioChatwit.inboxes.find(
            i => i.id === current!.fallbackParaInboxId
          );
          current = nextInbox ?? null;
        }
      }

      // Detectar inboxes órfãos (sem credenciais e sem fallback)
      validationResults.orphans = usuarioChatwit.inboxes
        .filter(inbox => 
          !inbox.whatsappApiKey && 
          !inbox.phoneNumberId && 
          !inbox.whatsappBusinessAccountId && 
          !inbox.fallbackParaInboxId
        )
        .map(inbox => ({
          inboxId: inbox.id,
          inboxName: inbox.nome,
        }));

      // Detectar cadeias sem credenciais finais
      for (const inbox of usuarioChatwit.inboxes) {
        let current: typeof inbox | null = inbox;
        let hasCredentials = false;

        while (current) {
          if (
            current.whatsappApiKey ||
            current.phoneNumberId ||
            current.whatsappBusinessAccountId
          ) {
            hasCredentials = true;
            break;
          }
          current = current.fallbackParaInboxId
            ? usuarioChatwit.inboxes.find(
                i => i.id === current!.fallbackParaInboxId
              ) ?? null
            : null;
        }

        if (!hasCredentials) {
          validationResults.missingCredentials.push({
            inboxId: inbox.id,
            inboxName: inbox.nome,
          });
        }
      }

      // Gerar recomendações
      if (validationResults.loops.length > 0) {
        validationResults.recommendations.push({
          type: 'fix_loops',
          message: `${validationResults.loops.length} loop(s) detectado(s). Remova as referências circulares.`,
          priority: 'high',
        });
      }

      if (validationResults.orphans.length > 0) {
        validationResults.recommendations.push({
          type: 'configure_orphans',
          message: `${validationResults.orphans.length} inbox(es) sem credenciais ou fallback. Configure credenciais ou defina fallback.`,
          priority: 'medium',
        });
      }

      if (validationResults.missingCredentials.length > 0) {
        validationResults.recommendations.push({
          type: 'add_global_config',
          message: `${validationResults.missingCredentials.length} cadeia(s) sem credenciais finais. Configure credenciais globais como fallback final.`,
          priority: 'medium',
        });
      }

      return NextResponse.json({
        action: 'validate',
        results: validationResults,
        isValid: validationResults.loops.length === 0 && validationResults.missingCredentials.length === 0,
      });
    }

    return NextResponse.json(
      { error: 'Ação não implementada' },
      { status: 400 }
    );

  } catch (error) {
    console.error('[Fallback Chain API] Erro ao processar ação:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}