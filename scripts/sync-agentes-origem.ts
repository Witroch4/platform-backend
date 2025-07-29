/**
 * Script para sincronizar agentes Dialogflow da origem para caixas existentes
 * que ainda não têm agentes configurados
 */

import { db as prisma } from '../lib/db';
import axios from 'axios';

interface DialogflowHook {
  id: number;
  status: boolean;
  inbox: { id: number };
  settings: {
    project_id?: string;
    credentials?: any;
    region?: string;
    agent_name?: string;
  };
}

async function syncAgentesOrigem(usuarioChatwitId?: string) {
  console.log('🔄 Iniciando sincronização de agentes da origem...');
  
  try {
    // Buscar usuários Chatwit (ou um específico)
    const whereClause = usuarioChatwitId ? { id: usuarioChatwitId } : {};
    const usuariosChatwit = await prisma.usuarioChatwit.findMany({
      where: whereClause,
      include: {
        caixas: {
          include: {
            agentes: true
          }
        }
      }
    });

    console.log(`👥 Processando ${usuariosChatwit.length} usuário(s)...`);

    for (const usuario of usuariosChatwit) {
      console.log(`\n👤 Processando usuário: ${usuario.id}`);
      
      if (!usuario.chatwitAccessToken || !usuario.chatwitAccountId) {
        console.log('⚠️  Token ou Account ID não configurados, pulando...');
        continue;
      }

      const baseURL = process.env.CHATWIT_BASE_URL;
      if (!baseURL) {
        console.log('⚠️  CHATWIT_BASE_URL não configurado');
        continue;
      }

      try {
        // Buscar integrações Dialogflow da conta
        const appsResponse = await axios.get(
          `${baseURL}/api/v1/accounts/${usuario.chatwitAccountId}/integrations/apps`,
          {
            headers: {
              'api_access_token': usuario.chatwitAccessToken,
              'Content-Type': 'application/json'
            }
          }
        );

        const dialogflowApp = appsResponse.data.payload?.find((app: any) => app.id === 'dialogflow');
        
        if (!dialogflowApp?.hooks) {
          console.log('ℹ️  Nenhuma integração Dialogflow encontrada');
          continue;
        }

        console.log(`📋 Encontrados ${dialogflowApp.hooks.length} hooks Dialogflow`);

        // Processar cada caixa do usuário
        for (const caixa of usuario.caixas) {
          console.log(`\n📦 Processando caixa: ${caixa.nome} (inbox: ${caixa.inboxId})`);
          
          // Buscar hooks para esta inbox
          const hooksParaInbox = dialogflowApp.hooks.filter((h: DialogflowHook) => 
            h.inbox?.id === Number.parseInt(caixa.inboxId)
          );

          console.log(`  🔍 Encontrados ${hooksParaInbox.length} agentes na origem`);

          // Verificar quais agentes já existem
          const agentesExistentes = caixa.agentes || [];
          const hookIdsExistentes = new Set(
            agentesExistentes
              .filter(a => a.hookId)
              .map(a => a.hookId)
          );

          let agentesAdicionados = 0;
          let agentesAtualizados = 0;

          for (const hook of hooksParaInbox) {
            const hookIdStr = hook.id.toString();
            
            if (hookIdsExistentes.has(hookIdStr)) {
              // Agente já existe, verificar se precisa atualizar status
              const agenteExistente = agentesExistentes.find(a => a.hookId === hookIdStr);
              if (agenteExistente && agenteExistente.ativo !== hook.status) {
                await prisma.agenteDialogflow.update({
                  where: { id: agenteExistente.id },
                  data: { ativo: hook.status }
                });
                console.log(`  ✏️  Agente ${agenteExistente.nome} atualizado (${hook.status ? 'ATIVADO' : 'DESATIVADO'})`);
                agentesAtualizados++;
              }
            } else {
              // Criar novo agente
              const agenteNome = hook.settings?.agent_name || 
                               hook.settings?.project_id || 
                               `Dialogflow-${hook.id}`;

              // Debug detalhado das configurações do hook
              console.log(`  🔍 Configurações do hook ${hook.id}:`, {
                agent_name: hook.settings?.agent_name,
                project_id: hook.settings?.project_id,
                region: hook.settings?.region,
                status: hook.status,
                inbox_id: hook.inbox?.id
              });

              // Verificar se já existe um agente ativo nesta caixa
              const agenteAtivoExistente = await prisma.agenteDialogflow.findFirst({
                where: {
                  inboxId: caixa.id,
                  ativo: true,
                },
              });

              // Se já existe um agente ativo, criar este como inativo
              const deveSerAtivo = hook.status === true && !agenteAtivoExistente;

              try {
                const novoAgente = await prisma.agenteDialogflow.create({
                  data: {
                    nome: agenteNome,
                    projectId: hook.settings?.project_id || '',
                    credentials: JSON.stringify(hook.settings?.credentials || {}),
                    region: hook.settings?.region || 'global',
                    ativo: deveSerAtivo,
                    hookId: hookIdStr,
                    inboxId: caixa.id,
                    usuarioChatwitId: usuario.id
                  }
                });

                console.log(`  ✅ Agente "${agenteNome}" criado (${deveSerAtivo ? 'ATIVO' : 'INATIVO'})`);
                console.log(`     📍 Região salva: ${novoAgente.region}`);
                
                if (hook.status === true && !deveSerAtivo) {
                  console.log(`     ⚠️ Agente não foi ativado porque já existe outro agente ativo na caixa`);
                }
                
                agentesAdicionados++;
              } catch (error: any) {
                console.error(`  ❌ Erro ao criar agente ${agenteNome}:`, error.message);
              }
            }
          }

          console.log(`  📊 Resumo: ${agentesAdicionados} adicionados, ${agentesAtualizados} atualizados`);
        }

      } catch (apiError: any) {
        console.error(`❌ Erro ao buscar integrações para usuário ${usuario.id}:`, apiError.message);
      }
    }

    console.log('\n✅ Sincronização concluída!');

  } catch (error: any) {
    console.error('❌ Erro na sincronização:', error.message);
    throw error;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const usuarioId = process.argv[2]; // Opcional: ID específico do usuário
  syncAgentesOrigem(usuarioId)
    .then(() => {
      console.log('🎉 Script executado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Falha na execução:', error);
      process.exit(1);
    });
}

export { syncAgentesOrigem };