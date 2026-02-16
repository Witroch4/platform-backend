"use client";

import { ArrowLeft, Bot, MessageCircle, Settings, Users, CheckCircle, AlertCircle, BookOpen, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import Image from "next/image";

export default function SaibaMaisCapitaoPage() {
	return (
		<div className="p-6 max-w-4xl mx-auto space-y-8">
			{/* Header */}
			<div className="flex items-center gap-4">
				<Link href="/admin/capitao">
					<Button variant="ghost">
						<ArrowLeft className="w-4 h-4 mr-2" />
						Voltar
					</Button>
				</Link>
				<div className="flex items-center gap-3">
					<Image src="/captain.png" alt="IA Capitão" width={48} height={48} />
					<div>
						<h1 className="text-2xl font-bold">IA Capitão</h1>
						<p className="text-muted-foreground">Assistente inteligente para atendimento automatizado</p>
					</div>
				</div>
			</div>

			{/* Visão Geral */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Bot className="w-5 h-5" />O que é o IA Capitão?
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<p className="text-base leading-relaxed">
						O IA Capitão é um assistente inteligente projetado para automatizar e otimizar o atendimento ao cliente. Ele
						combina inteligência artificial avançada com aprendizado contínuo para oferecer respostas precisas e
						personalizadas aos seus clientes.
					</p>

					<div className="grid md:grid-cols-3 gap-4 mt-6">
						<div className="flex items-start gap-3 p-4 border rounded-lg">
							<MessageCircle className="w-6 h-6 text-blue-500 mt-1" />
							<div>
								<h4 className="font-medium">Respostas Automáticas</h4>
								<p className="text-sm text-muted-foreground">Responde perguntas dos clientes instantaneamente</p>
							</div>
						</div>
						<div className="flex items-start gap-3 p-4 border rounded-lg">
							<BookOpen className="w-6 h-6 text-green-500 mt-1" />
							<div>
								<h4 className="font-medium">Aprendizado Contínuo</h4>
								<p className="text-sm text-muted-foreground">Aprende com documentos e conversas anteriores</p>
							</div>
						</div>
						<div className="flex items-start gap-3 p-4 border rounded-lg">
							<Users className="w-6 h-6 text-purple-500 mt-1" />
							<div>
								<h4 className="font-medium">Handoff Inteligente</h4>
								<p className="text-sm text-muted-foreground">Transfere para humanos quando necessário</p>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Como Funciona */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Zap className="w-5 h-5" />
						Como o IA Capitão Funciona?
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-6">
						<div className="grid md:grid-cols-2 gap-6">
							<div>
								<h4 className="font-medium mb-3">Fontes de Aprendizado</h4>
								<ul className="space-y-2">
									<li className="flex items-center gap-2">
										<CheckCircle className="w-4 h-4 text-green-500" />
										<span className="text-sm">Documentos e manuais da empresa</span>
									</li>
									<li className="flex items-center gap-2">
										<CheckCircle className="w-4 h-4 text-green-500" />
										<span className="text-sm">Conversas anteriores resolvidas</span>
									</li>
									<li className="flex items-center gap-2">
										<CheckCircle className="w-4 h-4 text-green-500" />
										<span className="text-sm">Base de conhecimento (FAQs)</span>
									</li>
									<li className="flex items-center gap-2">
										<CheckCircle className="w-4 h-4 text-green-500" />
										<span className="text-sm">Instruções personalizadas</span>
									</li>
								</ul>
							</div>
							<div>
								<h4 className="font-medium mb-3">Capacidades</h4>
								<ul className="space-y-2">
									<li className="flex items-center gap-2">
										<CheckCircle className="w-4 h-4 text-blue-500" />
										<span className="text-sm">Classificação automática de intenções</span>
									</li>
									<li className="flex items-center gap-2">
										<CheckCircle className="w-4 h-4 text-blue-500" />
										<span className="text-sm">Extração de entidades importantes</span>
									</li>
									<li className="flex items-center gap-2">
										<CheckCircle className="w-4 h-4 text-blue-500" />
										<span className="text-sm">Geração de FAQs automáticas</span>
									</li>
									<li className="flex items-center gap-2">
										<CheckCircle className="w-4 h-4 text-blue-500" />
										<span className="text-sm">Captura de memórias do cliente</span>
									</li>
								</ul>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Como Criar um Assistente */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Settings className="w-5 h-5" />
						Como Criar um Assistente
					</CardTitle>
					<CardDescription>Siga estes passos para configurar seu primeiro assistente do IA Capitão</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-6">
						{/* Passo 1 */}
						<div className="flex gap-4">
							<div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium">
								1
							</div>
							<div className="flex-1">
								<h4 className="font-medium">Criar um Novo Assistente</h4>
								<p className="text-sm text-muted-foreground mt-1">
									Clique no botão "Criar um novo assistente" na página principal e preencha as informações básicas.
								</p>
							</div>
						</div>

						{/* Passo 2 */}
						<div className="flex gap-4">
							<div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium">
								2
							</div>
							<div className="flex-1">
								<h4 className="font-medium">Preencher Informações</h4>
								<p className="text-sm text-muted-foreground mt-1 mb-3">Configure os detalhes do seu assistente:</p>
								<div className="grid md:grid-cols-2 gap-4">
									<div className="space-y-2">
										<div className="flex items-center gap-2">
											<Badge variant="outline">Obrigatório</Badge>
											<span className="text-sm font-medium">Nome do Assistente</span>
										</div>
										<p className="text-xs text-muted-foreground">Nome interno para identificação</p>
									</div>
									<div className="space-y-2">
										<div className="flex items-center gap-2">
											<Badge variant="outline">Obrigatório</Badge>
											<span className="text-sm font-medium">Descrição</span>
										</div>
										<p className="text-xs text-muted-foreground">Explicação do propósito do assistente</p>
									</div>
									<div className="space-y-2">
										<div className="flex items-center gap-2">
											<Badge variant="outline">Obrigatório</Badge>
											<span className="text-sm font-medium">Nome do Produto</span>
										</div>
										<p className="text-xs text-muted-foreground">Contextualiza o assistente para seu negócio</p>
									</div>
									<div className="space-y-2">
										<div className="flex items-center gap-2">
											<Badge variant="secondary">Opcional</Badge>
											<span className="text-sm font-medium">Instruções (Prompt)</span>
										</div>
										<p className="text-xs text-muted-foreground">Define como o assistente deve agir</p>
									</div>
								</div>
							</div>
						</div>

						{/* Passo 3 */}
						<div className="flex gap-4">
							<div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium">
								3
							</div>
							<div className="flex-1">
								<h4 className="font-medium">Configurar Recursos Opcionais</h4>
								<p className="text-sm text-muted-foreground mt-1 mb-3">
									Habilite funcionalidades avançadas conforme sua necessidade:
								</p>
								<div className="space-y-2">
									<div className="flex items-center gap-2">
										<CheckCircle className="w-4 h-4 text-green-500" />
										<span className="text-sm">Gerar perguntas frequentes a partir de conversas resolvidas</span>
									</div>
									<div className="flex items-center gap-2">
										<CheckCircle className="w-4 h-4 text-green-500" />
										<span className="text-sm">Capturar memórias das interações do cliente</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Conectando a Inboxes */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<MessageCircle className="w-5 h-5" />
						Conectando o Assistente a Caixas de Entrada
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<p className="text-sm text-muted-foreground">
						Após criar o assistente, você precisa conectá-lo às caixas de entrada (inboxes) onde ele atuará.
					</p>

					<div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
						<h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Como Conectar:</h4>
						<ol className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
							<li>1. Clique no menu de três pontos do assistente</li>
							<li>2. Selecione "Ver caixas associadas"</li>
							<li>3. Escolha "Conectar Nova Caixa de Entrada"</li>
						</ol>
					</div>

					<div className="grid md:grid-cols-2 gap-4">
						<div className="p-4 border rounded-lg">
							<h4 className="font-medium text-green-600 mb-2">✅ Suporte a Múltiplos Canais</h4>
							<ul className="text-sm space-y-1">
								<li>• Chat ao vivo</li>
								<li>• WhatsApp Business</li>
								<li>• Instagram Direct</li>
								<li>• Email</li>
							</ul>
						</div>
						<div className="p-4 border rounded-lg">
							<h4 className="font-medium text-orange-600 mb-2">⚠️ Limitação Importante</h4>
							<p className="text-sm">Cada caixa de entrada pode ter apenas um assistente ativo por vez.</p>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Configuração Inicial */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<AlertCircle className="w-5 h-5" />
						Configuração Inicial e Melhores Práticas
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
						<h4 className="font-medium text-amber-900 dark:text-amber-100 mb-2">🚀 Primeiros Passos</h4>
						<p className="text-sm text-amber-800 dark:text-amber-200">
							Após a configuração inicial, o assistente precisará de documentos e contexto sobre seu negócio.
							Inicialmente, ele pode transferir a maioria das conversas para agentes humanos até adquirir conhecimento
							suficiente.
						</p>
					</div>

					<div className="space-y-3">
						<h4 className="font-medium">Recomendações para Melhor Performance:</h4>
						<ul className="space-y-2">
							<li className="flex items-start gap-2">
								<CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
								<div>
									<span className="text-sm font-medium">Adicione documentos relevantes</span>
									<p className="text-xs text-muted-foreground">Manuais, políticas, FAQs e informações sobre produtos</p>
								</div>
							</li>
							<li className="flex items-start gap-2">
								<CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
								<div>
									<span className="text-sm font-medium">Configure instruções detalhadas</span>
									<p className="text-xs text-muted-foreground">
										Defina como o assistente deve se comportar e responder
									</p>
								</div>
							</li>
							<li className="flex items-start gap-2">
								<CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
								<div>
									<span className="text-sm font-medium">Monitore e ajuste regularmente</span>
									<p className="text-xs text-muted-foreground">Analise conversas e refine as respostas do assistente</p>
								</div>
							</li>
							<li className="flex items-start gap-2">
								<CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
								<div>
									<span className="text-sm font-medium">Habilite captura de memórias</span>
									<p className="text-xs text-muted-foreground">
										Permite que o assistente lembre de interações anteriores
									</p>
								</div>
							</li>
						</ul>
					</div>
				</CardContent>
			</Card>

			{/* CTA */}
			<div className="text-center py-8">
				<Link href="/admin/capitao">
					<Button size="lg" className="text-base">
						Começar a Usar o IA Capitão
					</Button>
				</Link>
			</div>
		</div>
	);
}
