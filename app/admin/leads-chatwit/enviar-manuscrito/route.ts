import { NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
import { enqueueMirrorGeneration } from "@/lib/oab-eval/mirror-queue";

const prisma = getPrismaInstance();

// ============================================================================
// CONFIGURAÇÃO: Engine Híbrida de Agentes Dinâmicos
// ============================================================================
//
// USE_INTERNAL_MIRROR_AGENT: Quando true, usa o agente blueprint interno vinculado
// à coluna ESPELHO_CELL para processar o espelho. Quando false, envia para sistema externo.
//
// O agente interno:
// 1. Busca o blueprint configurado em MTF Agents Builder com linkedColumn=ESPELHO_CELL
// 2. Usa o modelo/prompt/temperatura configurados no blueprint
// 3. Se for Gemini, injeta instruções de Agentic Vision automaticamente
// 4. Processa via fila BullMQ (oab-mirror-generation) com retry automático
//
// Documentação completa: docs/ENGINE_HIBRIDA_AGENTES_DINAMICOS.md
// ============================================================================
const USE_INTERNAL_MIRROR_AGENT = process.env.USE_INTERNAL_MIRROR_AGENT !== "false";

/**
 * Handler da rota POST para enviar manuscrito ou espelho para processamento.
 *
 * ## Fluxo para ESPELHO (USE_INTERNAL_MIRROR_AGENT=true):
 * 1. Recebe payload com espelho: true e arquivos_imagens_espelho
 * 2. Busca especialidade do lead no banco
 * 3. Marca lead como aguardandoEspelho: true
 * 4. Enfileira job na fila oab-mirror-generation via enqueueMirrorGeneration()
 * 5. Worker processa usando generateMirrorLocally() que:
 *    - Busca blueprint vinculado a ESPELHO_CELL
 *    - Usa modelo/prompt configurados no blueprint
 *    - Extrai dados da imagem do espelho do aluno
 *    - Compara com espelho padrão (OabRubric)
 * 6. Worker notifica via webhook interno quando concluir
 *
 * ## Fluxo para MANUSCRITO:
 * - Continua usando sistema externo via WEBHOOK_URL
 */
export async function POST(request: Request): Promise<Response> {
	try {
		console.log("[Enviar Manuscrito/Espelho] Recebendo requisição POST");

		// Obter o payload completo
		const payload = await request.json();
		console.log("[Enviar Manuscrito/Espelho] Dados recebidos:", JSON.stringify(payload, null, 2));

		// Determinar se é manuscrito ou espelho
		const isManuscrito = payload.manuscrito === true;
		const isEspelho = payload.espelho === true;
		const leadId = payload.leadID;

		// ========================================================================
		// PROCESSAMENTO INTERNO DE ESPELHO (Engine Híbrida)
		// ========================================================================
		if (isEspelho && USE_INTERNAL_MIRROR_AGENT && leadId) {
			console.log("[Enviar Espelho] 🔄 Usando agente INTERNO (Engine Híbrida)");

			try {
				// 1. Buscar dados do lead para obter especialidade e espelhoPadraoId
				const lead = await prisma.leadOabData.findUnique({
					where: { id: leadId },
					select: {
						id: true,
						especialidade: true,
						espelhoPadraoId: true,
						nomeReal: true,
						lead: {
							select: {
								phone: true,
							},
						},
					},
				});

				if (!lead) {
					throw new Error(`Lead não encontrado: ${leadId}`);
				}

				// 2. Validar que tem especialidade definida
				const especialidade = lead.especialidade || payload.especialidade;
				if (!especialidade) {
					throw new Error(
						"Especialidade não definida para o lead. Selecione uma especialidade antes de processar o espelho.",
					);
				}

				// 3. Extrair imagens do espelho do payload
				const imagensEspelho = payload.arquivos_imagens_espelho || [];
				if (imagensEspelho.length === 0) {
					throw new Error("Nenhuma imagem de espelho foi enviada");
				}

				// Normalizar formato das imagens para o padrão esperado pela fila
				const images = imagensEspelho.map((img: any, index: number) => ({
					id: img.id || `espelho-${leadId}-${index}`,
					url: img.url,
					nome: img.nome || `Espelho ${index + 1}`,
					page: index + 1,
				}));

				console.log(`[Enviar Espelho] 📋 Lead: ${leadId}`);
				console.log(`[Enviar Espelho] 📋 Especialidade: ${especialidade}`);
				console.log(
					`[Enviar Espelho] 📋 Espelho Padrão ID: ${lead.espelhoPadraoId || payload.espelhoPadraoId || "auto"}`,
				);
				console.log(`[Enviar Espelho] 🖼️ Imagens: ${images.length}`);

				// 4. Marcar lead como aguardando processamento de espelho
				await prisma.leadOabData.update({
					where: { id: leadId },
					data: {
						aguardandoEspelho: true,
						espelhoProcessado: false,
					},
				});
				console.log("[Enviar Espelho] ✅ Lead marcado como aguardandoEspelho: true");

				// 5. Obter provider selecionado pelo frontend (padrão: GEMINI)
				const selectedProvider = payload.selectedProvider || "GEMINI";
				console.log(`[Enviar Espelho] 🎛️ Provider selecionado: ${selectedProvider}`);

				// 6. Enfileirar job na fila de processamento interno
				const job = await enqueueMirrorGeneration({
					leadId,
					especialidade,
					espelhoPadraoId: lead.espelhoPadraoId || payload.espelhoPadraoId,
					images,
					nome: lead.nomeReal || payload.nome,
					telefone: lead.lead?.phone || payload.telefone,
					priority: 2, // Prioridade média (1=manuscrito, 2=espelho, 3=análise)
					selectedProvider, // ⭐ NOVO: Passa o provider selecionado
				});

				console.log(`[Enviar Espelho] ✅ Job ${job.id} enfileirado com sucesso`);
				console.log(`[Enviar Espelho] 📊 Agente blueprint para ${selectedProvider} será usado`);

				return NextResponse.json({
					success: true,
					message: "Espelho enfileirado para processamento interno",
					mode: "internal",
					jobId: job.id,
					queueName: "oab-mirror-generation",
					totalImages: images.length,
				});
			} catch (internalError: any) {
				console.error("[Enviar Espelho] ❌ Erro no processamento interno:", internalError);

				// Resetar estado do lead em caso de erro
				if (leadId) {
					await prisma.leadOabData
						.update({
							where: { id: leadId },
							data: {
								aguardandoEspelho: false,
								espelhoProcessado: false,
							},
						})
						.catch((e) => {
							console.error("[Enviar Espelho] Erro ao resetar estado do lead:", e);
						});
				}

				throw internalError;
			}
		}

		// ========================================================================
		// PROCESSAMENTO EXTERNO (Sistema legado via WEBHOOK_URL)
		// ========================================================================
		console.log(`[Enviar ${isEspelho ? "Espelho" : "Manuscrito"}] 🌐 Usando sistema EXTERNO (webhook)`);

		// Obter a URL do webhook do ambiente
		const webhookUrl = process.env.WEBHOOK_URL;

		if (!webhookUrl) {
			console.error("[Enviar Manuscrito/Espelho] URL do webhook não configurada no ambiente");
			throw new Error("URL do webhook não configurada");
		}

		if (leadId) {
			if (isManuscrito && !isEspelho) {
				// Garantir que é apenas manuscrito, não espelho
				await prisma.leadOabData.update({
					where: { id: leadId },
					data: { aguardandoManuscrito: true },
				});
				console.log("[Enviar Manuscrito] Lead marcado como aguardando processamento");
			}

			// Se for espelho mas não está usando agente interno, marcar aguardandoEspelho
			if (isEspelho && !USE_INTERNAL_MIRROR_AGENT) {
				await prisma.leadOabData.update({
					where: { id: leadId },
					data: { aguardandoEspelho: true },
				});
				console.log("[Enviar Espelho] Lead marcado como aguardando processamento (externo)");
			}
		}

		// Enviar o payload para o sistema externo
		console.log(`[Enviar ${isEspelho ? "Espelho" : "Manuscrito"}] Enviando payload para processamento:`, webhookUrl);
		const response = await fetch(webhookUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ message: "Erro ao processar resposta" }));
			console.error(`[Enviar ${isEspelho ? "Espelho" : "Manuscrito"}] Erro na resposta do sistema externo:`, errorData);

			// Resetar estado em caso de erro
			if (leadId) {
				if (isManuscrito && !isEspelho) {
					await prisma.leadOabData
						.update({
							where: { id: leadId },
							data: { aguardandoManuscrito: false },
						})
						.catch((e) => {
							console.error("[Enviar Manuscrito] Erro ao resetar estado do lead:", e);
						});
				}
				if (isEspelho && !USE_INTERNAL_MIRROR_AGENT) {
					await prisma.leadOabData
						.update({
							where: { id: leadId },
							data: { aguardandoEspelho: false },
						})
						.catch((e) => {
							console.error("[Enviar Espelho] Erro ao resetar estado do lead:", e);
						});
				}
			}

			throw new Error(errorData.message || `Erro ao enviar ${isEspelho ? "espelho" : "manuscrito"} para processamento`);
		}

		console.log(`[Enviar ${isEspelho ? "Espelho" : "Manuscrito"}] Enviado com sucesso`);
		return NextResponse.json({
			success: true,
			message: `${isEspelho ? "Espelho" : "Manuscrito"} enviado para processamento`,
			mode: "external",
		});
	} catch (error: any) {
		console.error("[Enviar Manuscrito/Espelho] Erro ao enviar:", error);
		return NextResponse.json(
			{
				error: error.message || "Erro interno ao enviar manuscrito ou espelho",
			},
			{ status: 500 },
		);
	}
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
