/**
 * Script para limpar hooks duplicados no Chatwit
 * Remove hooks órfãos que não estão mais associados a agentes ativos
 */

import { getPrismaInstance } from "../lib/connections";
const prisma = getPrismaInstance();
import axios from "axios";

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

async function limparHooksDuplicados() {
	try {
		console.log("🧹 [Limpeza] Iniciando limpeza de hooks duplicados...");

		// Buscar todos os usuários Chatwit
		const usuarios = await prisma.usuarioChatwit.findMany({
			include: {
				caixas: {
					include: {
						agentes: {
							where: { ativo: true },
						},
					},
				},
			},
		});

		console.log(`👥 [Limpeza] Encontrados ${usuarios.length} usuários`);

		for (const usuario of usuarios) {
			if (!usuario.chatwitAccessToken || !usuario.chatwitAccountId) {
				console.log(`⚠️ [Limpeza] Usuário ${usuario.id} sem token configurado`);
				continue;
			}

			console.log(`\n🔍 [Limpeza] Processando usuário: ${usuario.name}`);

			try {
				// Buscar hooks no Chatwit
				const baseURL = process.env.CHATWIT_BASE_URL;
				if (!baseURL) {
					console.log("❌ [Limpeza] CHATWIT_BASE_URL não configurado");
					continue;
				}

				const appsResponse = await axios.get(
					`${baseURL}/api/v1/accounts/${usuario.chatwitAccountId}/integrations/apps`,
					{
						headers: {
							api_access_token: usuario.chatwitAccessToken,
							"Content-Type": "application/json",
						},
					},
				);

				const dialogflowApp = appsResponse.data.payload?.find((app: any) => app.id === "dialogflow");

				if (!dialogflowApp?.hooks) {
					console.log(`ℹ️ [Limpeza] Nenhum hook Dialogflow encontrado para usuário ${usuario.name}`);
					continue;
				}

				console.log(`📋 [Limpeza] Encontrados ${dialogflowApp.hooks.length} hooks no Chatwit`);

				// Para cada caixa do usuário
				for (const caixa of usuario.caixas) {
					console.log(`\n📦 [Limpeza] Processando caixa: ${caixa.nome} (inbox: ${caixa.inboxId})`);

					// Buscar hooks para esta inbox
					const hooksParaInbox = dialogflowApp.hooks.filter(
						(h: DialogflowHook) => h.inbox?.id === Number.parseInt(caixa.inboxId),
					);

					console.log(`  🔍 Encontrados ${hooksParaInbox.length} hooks para esta inbox`);

					// Verificar quais hooks estão ativos no Chatwit mas não têm agente ativo correspondente
					const agentesAtivos = caixa.agentes || [];
					const hookIdsAtivos = new Set(agentesAtivos.filter((a) => a.hookId).map((a) => a.hookId));

					console.log(`  🤖 Agentes ativos no banco: ${agentesAtivos.length}`);
					console.log(`  🔗 Hook IDs ativos: ${Array.from(hookIdsAtivos).join(", ")}`);

					// Encontrar hooks órfãos (ativos no Chatwit mas sem agente ativo correspondente)
					const hooksOrfaos = hooksParaInbox.filter((hook: DialogflowHook) => {
						const hookIdStr = hook.id.toString();
						return hook.status === true && !hookIdsAtivos.has(hookIdStr);
					});

					console.log(`  🗑️ Hooks órfãos encontrados: ${hooksOrfaos.length}`);

					// Deletar hooks órfãos
					for (const hook of hooksOrfaos) {
						try {
							console.log(`  🗑️ Deletando hook órfão ${hook.id}...`);

							await axios.delete(
								`${baseURL}/api/v1/accounts/${usuario.chatwitAccountId}/integrations/hooks/${hook.id}`,
								{
									headers: {
										api_access_token: usuario.chatwitAccessToken,
										"Content-Type": "application/json",
									},
								},
							);

							console.log(`  ✅ Hook ${hook.id} deletado com sucesso`);
						} catch (error: any) {
							console.error(`  ❌ Erro ao deletar hook ${hook.id}:`, error.message);
						}
					}
				}
			} catch (apiError: any) {
				console.error(`❌ [Limpeza] Erro ao processar usuário ${usuario.name}:`, apiError.message);
			}
		}

		console.log("\n✅ [Limpeza] Limpeza concluída!");
	} catch (error: any) {
		console.error("❌ [Limpeza] Erro na limpeza:", error.message);
		throw error;
	}
}

// Executar se chamado diretamente
if (require.main === module) {
	limparHooksDuplicados()
		.then(() => {
			console.log("🎉 Script de limpeza executado com sucesso!");
			process.exit(0);
		})
		.catch((error) => {
			console.error("💥 Falha na execução:", error);
			process.exit(1);
		});
}

export { limparHooksDuplicados };
