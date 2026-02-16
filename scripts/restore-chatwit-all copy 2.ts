#!/usr/bin/env tsx

import { PrismaClient, UserRole, LeadSource, EspecialidadeJuridica } from "@prisma/client";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import * as bcryptjs from "bcryptjs";

const prisma = getPrismaInstance();

async function seedAdminUsers() {
	console.log("🌱 Executando seed de usuários administradores...");

	try {
		const hashedPassword = await bcryptjs.hash("123456", 10);
		const dataAtual = new Date();

		// Criar usuário Amanda
		console.log("👤 Criando usuário Amanda...");
		const amanda = await prisma.user.upsert({
			where: { email: "amandasousa22.adv@gmail.com" },
			update: {
				name: "Amanda",
				emailVerified: dataAtual,
				role: UserRole.ADMIN,
				password: hashedPassword,
			},
			create: {
				email: "amandasousa22.adv@gmail.com",
				name: "Amanda",
				emailVerified: dataAtual,
				role: UserRole.ADMIN,
				password: hashedPassword,
				createdAt: dataAtual,
			},
		});

		// Criar usuário Witalo
		console.log("👤 Criando usuário Witalo...");
		const witalo = await prisma.user.upsert({
			where: { email: "witalo_rocha@hotmail.com" },
			update: {
				name: "Witalo",
				emailVerified: dataAtual,
				role: UserRole.ADMIN,
				password: hashedPassword,
			},
			create: {
				email: "witalo_rocha@hotmail.com",
				name: "Witalo",
				emailVerified: dataAtual,
				role: UserRole.ADMIN,
				password: hashedPassword,
				createdAt: dataAtual,
			},
		});

		// Criar UsuarioChatwit para Amanda
		console.log("📱 Criando UsuarioChatwit para Amanda...");
		const amandaChatwit = await prisma.usuarioChatwit.upsert({
			where: { appUserId: amanda.id },
			update: {
				name: "DraAmandaSousa",
				accountName: "DraAmandaSousa",
				channel: "Whatsapp",
				chatwitAccountId: "3",
			},
			create: {
				appUserId: amanda.id,
				name: "DraAmandaSousa",
				accountName: "DraAmandaSousa",
				channel: "Whatsapp",
				chatwitAccountId: "3",
			},
		});

		// Criar UsuarioChatwit para Witalo
		console.log("📱 Criando UsuarioChatwit para Witalo...");
		const witaloChatwit = await prisma.usuarioChatwit.upsert({
			where: { appUserId: witalo.id },
			update: {
				name: "WitDev MASTER",
				accountName: "WitDev MASTER",
				channel: "Api",
				chatwitAccountId: "1",
			},
			create: {
				appUserId: witalo.id,
				name: "WitDev MASTER",
				accountName: "WitDev MASTER",
				channel: "Api",
				chatwitAccountId: "1",
			},
		});

		console.log("✅ Seed de usuários concluído!");
		return { amanda, amandaChatwit };
	} catch (error) {
		console.error("❌ Erro durante o seed:", error);
		throw error;
	}
}

async function restoreAllChatwit(backupFileName?: string) {
	console.log("🔄 Iniciando restauração completa dos dados do Chatwit...");

	try {
		let backupPath: string;

		// Se um nome de arquivo de backup for fornecido, use-o
		if (backupFileName) {
			backupPath = join(process.cwd(), "backups", backupFileName);
			if (!existsSync(backupPath)) {
				console.error(`❌ Arquivo de backup não encontrado: ${backupPath}`);
				return;
			}
			console.log(`ℹ️ Usando arquivo de backup especificado: ${backupFileName}`);
		} else {
			// Se nenhum arquivo for fornecido, encontre o mais recente na pasta 'backups'
			const backupsDir = join(process.cwd(), "backups");
			if (!existsSync(backupsDir)) {
				console.error(`❌ O diretório de backups não foi encontrado em: ${backupsDir}`);
				return;
			}

			const backupFiles = readdirSync(backupsDir)
				.filter((file) => file.startsWith("backup-") && file.endsWith(".json"))
				.sort((a, b) => b.localeCompare(a));

			if (backupFiles.length === 0) {
				console.error(`❌ Nenhum arquivo de backup (.json) encontrado no diretório: ${backupsDir}`);
				return;
			}

			const latestBackupFile = backupFiles[0];
			backupPath = join(backupsDir, latestBackupFile);
			console.log(`ℹ️ Nenhum arquivo de backup especificado. Usando o mais recente: ${latestBackupFile}`);
		}

		console.log(`📁 Carregando backup: ${backupPath}`);
		const backupData = JSON.parse(readFileSync(backupPath, "utf-8"));

		// Detectar formato do backup
		let usuarios, leads, arquivos, espelhosBiblioteca, espelhosPadrao;
		if (backupData.data) {
			// Formato antigo
			usuarios = backupData.data.usuariosChatwit;
			leads = backupData.data.leadsChatwit;
			arquivos = backupData.data.arquivosLeadChatwit;
			espelhosBiblioteca = backupData.data.espelhosBiblioteca || [];
			espelhosPadrao = backupData.data.espelhosPadrao || [];
		} else {
			// Novo formato (direto na raiz)
			usuarios = backupData.UsuarioChatwit || [];
			leads = backupData.LeadChatwit || [];
			arquivos = backupData.ArquivoLeadChatwit || [];
			espelhosBiblioteca = backupData.EspelhoBiblioteca || [];
			espelhosPadrao = backupData.EspelhoPadrao || [];
		}

		let leadsRestaurados = 0;
		let arquivosRestaurados = 0;
		let espelhosRestaurados = 0;

		// Verificar se usuários existem
		const amandaUser = await prisma.user.findUnique({
			where: { email: "amandasousa22.adv@gmail.com" },
			include: { usuarioChatwit: true },
		});

		if (!amandaUser || !amandaUser.usuarioChatwit) {
			console.error("❌ Usuário Amanda ou UsuarioChatwit não encontrado. Execute o seed primeiro.");
			throw new Error("Usuários não encontrados. Execute o seed antes do restore.");
		}

		const amandaChatwit = amandaUser.usuarioChatwit;
		console.log(`✅ Usuário Amanda encontrado: ${amandaUser.name} (${amandaUser.email})`);
		console.log(`✅ UsuarioChatwit ID: ${amandaChatwit.id}`);

		// Encontrar o UsuarioChatwit da Amanda no backup
		const amandaBackup = usuarios.find((u: any) => u.name === "DraAmandaSousa");

		if (!amandaBackup) {
			console.error("❌ UsuarioChatwit da Amanda não encontrado no backup!");
			return;
		}

		console.log(`✅ UsuarioChatwit da Amanda no backup: ${amandaBackup.id}`);

		// Restaurar espelhos da biblioteca
		console.log("\n📚 Restaurando espelhos da biblioteca...");
		for (const espelho of espelhosBiblioteca) {
			try {
				await prisma.espelhoBiblioteca.upsert({
					where: { id: espelho.id },
					update: {
						nome: espelho.nome,
						descricao: espelho.descricao,
						textoDOEspelho: espelho.textoDOEspelho,
						espelhoCorrecao: espelho.espelhoCorrecao,
						isAtivo: espelho.isAtivo,
						totalUsos: espelho.totalUsos,
						espelhoBibliotecaProcessado: espelho.espelhoBibliotecaProcessado,
						aguardandoEspelho: espelho.aguardandoEspelho,
						criadoPorId: amandaChatwit.id,
						updatedAt: new Date(),
					},
					create: {
						id: espelho.id,
						nome: espelho.nome,
						descricao: espelho.descricao,
						textoDOEspelho: espelho.textoDOEspelho,
						espelhoCorrecao: espelho.espelhoCorrecao,
						isAtivo: espelho.isAtivo,
						totalUsos: espelho.totalUsos,
						espelhoBibliotecaProcessado: espelho.espelhoBibliotecaProcessado,
						aguardandoEspelho: espelho.aguardandoEspelho,
						criadoPorId: amandaChatwit.id,
						createdAt: new Date(espelho.createdAt),
						updatedAt: new Date(espelho.updatedAt),
					},
				});
				espelhosRestaurados++;
			} catch (error: any) {
				console.error(`❌ Erro ao restaurar espelho ${espelho.id}:`, error.message);
			}
		}

		// Restaurar espelhos padrão
		console.log("\n📋 Restaurando espelhos padrão...");
		for (const espelho of espelhosPadrao) {
			try {
				await prisma.espelhoPadrao.upsert({
					where: { especialidade: espelho.especialidade },
					update: {
						nome: espelho.nome,
						descricao: espelho.descricao,
						textoMarkdown: espelho.textoMarkdown,
						espelhoCorrecao: espelho.espelhoCorrecao,
						isAtivo: espelho.isAtivo,
						totalUsos: espelho.totalUsos,
						processado: espelho.processado,
						aguardandoProcessamento: espelho.aguardandoProcessamento,
						atualizadoPorId: amandaChatwit.id,
						updatedAt: new Date(),
					},
					create: {
						especialidade: espelho.especialidade,
						nome: espelho.nome,
						descricao: espelho.descricao,
						textoMarkdown: espelho.textoMarkdown,
						espelhoCorrecao: espelho.espelhoCorrecao,
						isAtivo: espelho.isAtivo,
						totalUsos: espelho.totalUsos,
						processado: espelho.processado,
						aguardandoProcessamento: espelho.aguardandoProcessamento,
						atualizadoPorId: amandaChatwit.id,
						createdAt: new Date(espelho.createdAt),
						updatedAt: new Date(espelho.updatedAt),
					},
				});
				espelhosRestaurados++;
			} catch (error: any) {
				console.error(`❌ Erro ao restaurar espelho padrão ${espelho.especialidade}:`, error.message);
			}
		}

		// Restaurar leads da Amanda - NOVA ESTRUTURA
		const leadsDaAmanda = leads.filter((l: any) => l && l.usuarioId === amandaBackup.id);
		console.log(`\n👥 Encontrados ${leadsDaAmanda.length} leads da Amanda no backup`);
		console.log("🔄 Iniciando restauração dos leads...");

		for (let i = 0; i < leadsDaAmanda.length; i++) {
			const lead = leadsDaAmanda[i];

			// Verificar se o lead é válido
			if (!lead || !lead.id) {
				console.log(`⚠️ Lead inválido encontrado no índice ${i}, pulando...`);
				continue;
			}

			try {
				// Primeiro, criar o Lead principal
				const leadPrincipal = await prisma.lead.upsert({
					where: { id: lead.id },
					update: {
						name: lead.name || lead.nomeReal,
						email: lead.email,
						phone: lead.phoneNumber,
						source: LeadSource.CHATWIT_OAB,
						sourceIdentifier: lead.sourceId || lead.id,
						userId: amandaUser!.id,
						updatedAt: new Date(),
					},
					create: {
						id: lead.id,
						name: lead.name || lead.nomeReal,
						email: lead.email,
						phone: lead.phoneNumber,
						source: LeadSource.CHATWIT_OAB,
						sourceIdentifier: lead.sourceId || lead.id,
						userId: amandaUser!.id,
						createdAt: new Date(lead.createdAt),
						updatedAt: new Date(lead.updatedAt),
					},
				});

				// Depois, criar o LeadOabData
				const leadOabData = await prisma.leadOabData.upsert({
					where: { leadId: lead.id },
					update: {
						concluido: lead.concluido,
						anotacoes: lead.anotacoes,
						pdfUnificado: lead.pdfUnificado,
						imagensConvertidas: lead.imagensConvertidas,
						leadUrl: lead.leadUrl,
						fezRecurso: lead.fezRecurso,
						datasRecurso: lead.datasRecurso,
						provaManuscrita: lead.provaManuscrita,
						manuscritoProcessado: lead.manuscritoProcessado,
						aguardandoManuscrito: lead.aguardandoManuscrito,
						espelhoCorrecao: lead.espelhoCorrecao,
						textoDOEspelho: lead.textoDOEspelho,
						espelhoProcessado: lead.espelhoProcessado,
						aguardandoEspelho: lead.aguardandoEspelho,
						analiseUrl: lead.analiseUrl,
						argumentacaoUrl: lead.argumentacaoUrl,
						analiseProcessada: lead.analiseProcessada,
						aguardandoAnalise: lead.aguardandoAnalise,
						analisePreliminar: lead.analisePreliminar,
						analiseValidada: lead.analiseValidada,
						consultoriaFase2: lead.consultoriaFase2,
						recursoPreliminar: lead.recursoPreliminar,
						recursoValidado: lead.recursoValidado,
						recursoUrl: lead.recursoUrl,
						recursoArgumentacaoUrl: lead.recursoArgumentacaoUrl,
						aguardandoRecurso: lead.aguardandoRecurso,
						seccional: lead.seccional,
						areaJuridica: lead.areaJuridica,
						notaFinal: lead.notaFinal,
						situacao: lead.situacao,
						inscricao: lead.inscricao,
						examesParticipados: lead.examesParticipados,
						especialidade: lead.especialidade ? (lead.especialidade as EspecialidadeJuridica) : null,
						usuarioChatwitId: amandaChatwit.id,
						espelhoBibliotecaId: lead.espelhoBibliotecaId,
					},
					create: {
						leadId: lead.id,
						concluido: lead.concluido,
						anotacoes: lead.anotacoes,
						pdfUnificado: lead.pdfUnificado,
						imagensConvertidas: lead.imagensConvertidas,
						leadUrl: lead.leadUrl,
						fezRecurso: lead.fezRecurso,
						datasRecurso: lead.datasRecurso,
						provaManuscrita: lead.provaManuscrita,
						manuscritoProcessado: lead.manuscritoProcessado,
						aguardandoManuscrito: lead.aguardandoManuscrito,
						espelhoCorrecao: lead.espelhoCorrecao,
						textoDOEspelho: lead.textoDOEspelho,
						espelhoProcessado: lead.espelhoProcessado,
						aguardandoEspelho: lead.aguardandoEspelho,
						analiseUrl: lead.analiseUrl,
						argumentacaoUrl: lead.argumentacaoUrl,
						analiseProcessada: lead.analiseProcessada,
						aguardandoAnalise: lead.aguardandoAnalise,
						analisePreliminar: lead.analisePreliminar,
						analiseValidada: lead.analiseValidada,
						consultoriaFase2: lead.consultoriaFase2,
						recursoPreliminar: lead.recursoPreliminar,
						recursoValidado: lead.recursoValidado,
						recursoUrl: lead.recursoUrl,
						recursoArgumentacaoUrl: lead.recursoArgumentacaoUrl,
						aguardandoRecurso: lead.aguardandoRecurso,
						seccional: lead.seccional,
						areaJuridica: lead.areaJuridica,
						notaFinal: lead.notaFinal,
						situacao: lead.situacao,
						inscricao: lead.inscricao,
						examesParticipados: lead.examesParticipados,
						especialidade: lead.especialidade ? (lead.especialidade as EspecialidadeJuridica) : null,
						usuarioChatwitId: amandaChatwit.id,
						espelhoBibliotecaId: lead.espelhoBibliotecaId,
					},
				});

				leadsRestaurados++;

				// Restaurar arquivos desse lead - NOVA ESTRUTURA
				const arquivosDoLead = arquivos.filter((a: any) => a && a.leadId === lead.id);
				for (const arquivo of arquivosDoLead) {
					// Verificar se o arquivo é válido
					if (!arquivo || !arquivo.id) {
						console.log(`⚠️ Arquivo inválido encontrado para lead ${lead.id}, pulando...`);
						continue;
					}

					try {
						await prisma.arquivoLeadOab.upsert({
							where: { id: arquivo.id },
							update: {
								fileType: arquivo.fileType,
								dataUrl: arquivo.dataUrl,
								pdfConvertido: arquivo.pdfConvertido,
								leadOabDataId: leadOabData.id,
							},
							create: {
								id: arquivo.id,
								fileType: arquivo.fileType,
								dataUrl: arquivo.dataUrl,
								pdfConvertido: arquivo.pdfConvertido,
								leadOabDataId: leadOabData.id,
							},
						});
						arquivosRestaurados++;
					} catch (error: any) {
						console.error(`❌ Erro ao restaurar arquivo ${arquivo.id}:`, error.message);
					}
				}

				// Mostrar progresso a cada 5 leads
				if ((i + 1) % 5 === 0) {
					console.log(
						`📊 Progresso: ${i + 1}/${leadsDaAmanda.length} leads restaurados (${Math.round(((i + 1) / leadsDaAmanda.length) * 100)}%)`,
					);
				}
			} catch (error: any) {
				console.error(`❌ Erro ao restaurar lead ${lead.id}:`, error.message);
			}
		}

		// Estatísticas finais
		console.log("\n📊 Resumo da restauração:");
		console.log(`   - Espelhos: ${espelhosRestaurados} restaurados`);
		console.log(`   - Leads: ${leadsRestaurados} restaurados`);
		console.log(`   - Arquivos: ${arquivosRestaurados} restaurados`);

		console.log("✅ Restauração completa concluída!");
	} catch (error) {
		console.error("❌ Erro durante a restauração:", error);
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}

// Executar se chamado diretamente
if (require.main === module) {
	const backupFile = process.argv[2];
	restoreAllChatwit(backupFile).catch(console.error);
}

export { restoreAllChatwit };
