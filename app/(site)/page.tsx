"use client";

import { Instagram, Facebook, Twitter, MessageCircle, Users, BarChart, Zap, CheckCircle, ArrowRight, Smartphone, Bot, FileText, Gavel, Calendar, Shield, Star, Play, Pause, Volume2, VolumeX, Hash } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

export default function Home() {
	const [isVideoPlaying, setIsVideoPlaying] = useState(false);
	const [isVideoMuted, setIsVideoMuted] = useState(true);
	const [videoError, setVideoError] = useState(false);

	const toggleVideo = () => {
		const video = document.getElementById('hero-video') as HTMLVideoElement;
		if (video && !videoError) {
			if (isVideoPlaying) {
				video.pause();
				setIsVideoPlaying(false);
			} else {
				video.play().catch((error) => {
					console.error('Erro ao reproduzir vídeo:', error);
					setVideoError(true);
				});
				setIsVideoPlaying(true);
			}
		}
	};

	const toggleVideoMute = () => {
		const video = document.getElementById('hero-video') as HTMLVideoElement;
		if (video) {
			video.muted = !isVideoMuted;
			setIsVideoMuted(!isVideoMuted);
		}
	};

	return (
		<div className="flex min-h-screen w-full flex-col bg-white dark:bg-gray-900">
			{/* Hero Section */}
			<section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-blue-50 to-purple-50 dark:from-primary/20 dark:via-blue-900/20 dark:to-purple-900/20 pt-32 pb-20">
				<div className="container mx-auto px-4">
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
						<div className="text-center lg:text-left">
							<div className="flex items-center justify-center lg:justify-start mb-6">
								<Image
									src="/01 WitdeT.png"
									alt="Socialwise Chatwit Logo"
									width={80}
									height={80}
									className="mr-4"
								/>
								<h1 className="text-4xl md:text-5xl lg:text-6xl font-bold">
									<span className="bg-gradient-to-r from-primary via-blue-600 to-purple-600 text-transparent bg-clip-text">
										Socialwise Chatwit
									</span>
								</h1>
							</div>
							<p className="text-xl md:text-2xl mb-4 text-gray-700 dark:text-gray-300">
								Plataforma Completa de Atendimento com IA
							</p>
							<p className="text-lg mb-8 text-gray-600 dark:text-gray-400">
								Especializados em <strong>automação de redes sociais</strong> e <strong>apoio jurídico para advogados</strong>. 
								Transforme seguidores em clientes com inteligência artificial avançada.
							</p>
							
							{/* AI Models Integration */}
							<div className="flex items-center justify-center lg:justify-start mb-8 space-x-4">
								<div className="flex items-center space-x-2">
									<Image
										src="/gpt-logo.png"
										alt="OpenAI GPT"
										width={32}
										height={32}
										className="dark:hidden"
									/>
									<Image
										src="/gpt-dark-logo.png"
										alt="OpenAI GPT"
										width={32}
										height={32}
										className="hidden dark:block"
									/>
									<span className="text-sm text-gray-600 dark:text-gray-400">GPT-4</span>
								</div>
								<div className="flex items-center space-x-2">
									<Image
										src="/gemine-logo.png"
										alt="Google Gemini"
										width={32}
										height={32}
										className="dark:hidden"
									/>
									<Image
										src="/gemine-dack-logo.png"
										alt="Google Gemini"
										width={32}
										height={32}
										className="hidden dark:block"
									/>
									<span className="text-sm text-gray-600 dark:text-gray-400">Gemini</span>
								</div>
								<div className="flex items-center space-x-2">
									<Bot className="h-8 w-8 text-blue-600 dark:text-blue-400" />
									<span className="text-sm text-gray-600 dark:text-gray-400">Claude</span>
								</div>
							</div>
							
							<div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
								<Link
									href="/auth/login"
									className="bg-gray-800 hover:bg-gray-700 text-white border-2 border-gray-600 hover:border-gray-500 font-medium rounded-lg px-8 py-4 text-center inline-flex items-center justify-center text-lg transition-all duration-200 shadow-sm"
								>
									Começar Gratuitamente
									<ArrowRight className="ml-2 h-5 w-5" />
								</Link>
								<Link
									href="#demo"
									className="bg-gray-800 hover:bg-gray-700 text-white border-2 border-gray-600 hover:border-gray-500 font-medium rounded-lg px-8 py-4 text-center text-lg transition-all duration-200 shadow-sm"
								>
									Ver Demonstração
								</Link>
							</div>
							
							<div className="mt-8 flex items-center justify-center lg:justify-start">
								<div className="flex -space-x-2">
									{[1, 2, 3, 4, 5].map((i) => (
										<div key={i} className="w-12 h-12 rounded-full border-2 border-white dark:border-gray-800 bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
											<Star className="h-6 w-6 text-white" />
										</div>
									))}
								</div>
								<div className="ml-4">
									<p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
										+2.500 profissionais ativos
									</p>
									<p className="text-xs text-gray-600 dark:text-gray-400">
										Advogados, influencers e empresas
									</p>
								</div>
							</div>
						</div>
						
						{/* Video Section */}
						<div className="relative">
							<div className="relative z-10 mx-auto lg:ml-auto lg:mr-0 max-w-lg">
								<div className="relative bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-2xl">
									<div className="relative aspect-video bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden">
										{!videoError ? (
											<video
												id="hero-video"
												className="w-full h-full object-cover rounded-xl"
												poster="/01 WitdeT.png"
												preload="metadata"
												muted={isVideoMuted}
												loop
												playsInline
												onLoadedData={() => console.log('Video loaded')}
												onError={(e) => {
													console.error('Video error:', e);
													setVideoError(true);
												}}
											>
												<source src="/Vídeo_IA_ChatWit_Social_Prompts.mp4" type="video/mp4" />
												<source src="/Video_IA_ChatWit_Social_Prompts.mp4" type="video/mp4" />
												Seu navegador não suporta o elemento de vídeo.
											</video>
										) : (
											<div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
												<div className="text-center text-white">
													<div className="mb-4">
														<Image
															src="/01 WitdeT.png"
															alt="Socialwise Chatwit"
															width={100}
															height={100}
															className="mx-auto"
														/>
													</div>
													<h3 className="text-xl font-bold mb-2">Socialwise Chatwit</h3>
													<p className="text-sm opacity-90">Demonstração em Vídeo</p>
												</div>
											</div>
										)}
										
										{/* Video Controls */}
										<div className="absolute bottom-4 left-4 right-4 flex items-center justify-between bg-black/70 backdrop-blur-sm rounded-lg p-3">
											{!videoError ? (
												<>
													<button
														onClick={toggleVideo}
														className="flex items-center space-x-2 text-white hover:text-blue-400 transition-colors"
													>
														{isVideoPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
														<span className="text-sm font-medium">{isVideoPlaying ? 'Pausar' : 'Assistir Demo'}</span>
													</button>
													
													<button
														onClick={toggleVideoMute}
														className="text-white hover:text-blue-400 transition-colors"
													>
														{isVideoMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
													</button>
												</>
											) : (
												<div className="w-full text-center">
													<button
														onClick={() => setVideoError(false)}
														className="flex items-center space-x-2 text-white hover:text-blue-400 transition-colors mx-auto"
													>
														<ArrowRight className="h-5 w-5" />
														<span className="text-sm font-medium">Tentar Novamente</span>
													</button>
												</div>
											)}
										</div>
									</div>
								</div>
							</div>
							<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-full blur-3xl -z-10"></div>
						</div>
					</div>
				</div>
			</section>

			{/* Principais Funcionalidades */}
			<section className="py-20 bg-white dark:bg-gray-900">
				<div className="container mx-auto px-4">
					<div className="text-center mb-16">
						<h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900 dark:text-white">Principais Funcionalidades</h2>
						<p className="text-xl text-gray-600 dark:text-gray-400 max-w-4xl mx-auto">
							Uma plataforma completa que une inteligência artificial, automação de redes sociais e ferramentas especializadas para advogados
						</p>
						
						{/* Showcase das Imagens */}
						<div className="flex justify-center items-center space-x-8 mt-12 mb-8">
							<div className="relative group">
								<Image 
									src="/social-connection.svg" 
									alt="Social Connection" 
									width={80} 
									height={80} 
									className="opacity-60 group-hover:opacity-100 transition-opacity"
								/>
								<span className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-gray-500 dark:text-gray-400">Social</span>
							</div>
							<div className="relative group">
								<Image 
									src="/pdf.svg" 
									alt="PDF Processing" 
									width={80} 
									height={80} 
									className="opacity-60 group-hover:opacity-100 transition-opacity"
								/>
								<span className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-gray-500 dark:text-gray-400">PDF IA</span>
							</div>
						</div>
					</div>
					
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
						{/* ChatWit IA */}
						<div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-blue-200 dark:border-blue-800">
							<div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mb-6">
								<Bot className="h-8 w-8 text-white" />
							</div>
							<h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">ChatWit IA</h3>
							<p className="text-gray-600 dark:text-gray-400 mb-4">
								Assistente de IA avançado com GPT-4, Gemini e Claude para atendimento automatizado
							</p>
							<ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
								<li>• Conversas em tempo real</li>
								<li>• Geração de imagens</li>
								<li>• Transcrição de áudio</li>
								<li>• Análise de documentos</li>
							</ul>
						</div>

						{/* Automação de Redes Sociais */}
						<div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-purple-200 dark:border-purple-800">
							<div className="w-16 h-16 bg-purple-500 rounded-2xl flex items-center justify-center mb-6">
								<Zap className="h-8 w-8 text-white" />
							</div>
							<h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Automação Social</h3>
							<p className="text-gray-600 dark:text-gray-400 mb-4">
								Automatize Instagram, WhatsApp e outras redes sociais com inteligência
							</p>
							<ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
								<li>• Respostas automáticas</li>
								<li>• Chatbots personalizados</li>
								<li>• Gestão de leads</li>
								<li>• Análise de engajamento</li>
							</ul>
						</div>

						{/* Sistema Jurídico */}
						<div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-green-200 dark:border-green-800">
							<div className="w-16 h-16 bg-green-500 rounded-2xl flex items-center justify-center mb-6">
								<Gavel className="h-8 w-8 text-white" />
							</div>
							<h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Sistema Jurídico</h3>
							<p className="text-gray-600 dark:text-gray-400 mb-4">
								Ferramentas especializadas para advogados e profissionais do direito
							</p>
							<ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
								<li>• Gestão de leads OAB</li>
								<li>• Agendamento inteligente</li>
								<li>• Análise de documentos</li>
								<li>• Automação de processos</li>
							</ul>
						</div>

						{/* Processamento de Documentos */}
						<div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-orange-200 dark:border-orange-800">
							<div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mb-6">
								<FileText className="h-8 w-8 text-white" />
							</div>
							<h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Processamento IA</h3>
							<p className="text-gray-600 dark:text-gray-400 mb-4">
								Sistema completo de processamento de documentos com IA
							</p>
							<ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
								<li>• PDF para imagens</li>
								<li>• Manuscritos automáticos</li>
								<li>• Espelhos de correção</li>
								<li>• Análise automática</li>
							</ul>
						</div>
					</div>
				</div>
			</section>

			{/* Redes Sociais Integradas */}
			<section className="py-20 bg-gray-50 dark:bg-gray-800">
				<div className="container mx-auto px-4">
					<div className="text-center mb-16">
						<h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900 dark:text-white">Redes Sociais Integradas</h2>
						<p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
							Conecte-se com seus clientes em todas as plataformas com uma única solução inteligente
						</p>
					</div>
					
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
						{/* Instagram */}
						<div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700">
							<div className="w-20 h-20 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
								<Instagram className="h-10 w-10 text-white" />
							</div>
							<h3 className="text-2xl font-bold mb-4 text-center text-gray-900 dark:text-white">Instagram</h3>
							<p className="text-gray-600 dark:text-gray-400 text-center mb-6">
								Automatize DMs, Stories e comentários. Transforme seguidores em clientes reais.
							</p>
							<div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-full text-center font-medium">
								Integração Prioritária ⭐
							</div>
						</div>

						{/* WhatsApp */}
						<div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700">
							<div className="w-20 h-20 bg-green-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
								<MessageCircle className="h-10 w-10 text-white" />
							</div>
							<h3 className="text-2xl font-bold mb-4 text-center text-gray-900 dark:text-white">WhatsApp</h3>
							<p className="text-gray-600 dark:text-gray-400 text-center mb-6">
								Atendimento automatizado com chatbots inteligentes e gestão completa de conversas.
							</p>
							<div className="bg-green-500 text-white px-4 py-2 rounded-full text-center font-medium">
								Ativo e Funcional ✅
							</div>
						</div>

						{/* Facebook */}
						<div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700">
							<div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
								<Facebook className="h-10 w-10 text-white" />
							</div>
							<h3 className="text-2xl font-bold mb-4 text-center text-gray-900 dark:text-white">Facebook</h3>
							<p className="text-gray-600 dark:text-gray-400 text-center mb-6">
								Gerencie páginas, grupos e messenger com automação inteligente.
							</p>
							<div className="bg-gray-500 text-white px-4 py-2 rounded-full text-center font-medium">
								Em Desenvolvimento 🚧
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Fluxo de Automação */}
			<section id="demo" className="py-20 bg-white dark:bg-gray-900">
				<div className="container mx-auto px-4">
					<div className="text-center mb-16">
						<h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900 dark:text-white">Como Funciona a Automação</h2>
						<p className="text-xl text-gray-600 dark:text-gray-400 max-w-4xl mx-auto">
							Processo inteligente que transforma documentos em análises completas com IA
						</p>
					</div>
					
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
						{[
							{
								step: "1",
								title: "Upload PDF",
								description: "Faça upload do documento PDF para análise",
								icon: <FileText className="h-8 w-8 text-white" />,
								color: "bg-blue-500"
							},
							{
								step: "2", 
								title: "Conversão",
								description: "IA converte PDF em imagens de alta qualidade",
								icon: <FileText className="h-8 w-8 text-white" />,
								color: "bg-purple-500"
							},
							{
								step: "3",
								title: "Manuscrito",
								description: "Sistema gera manuscrito automaticamente",
								icon: <Hash className="h-8 w-8 text-white" />,
								color: "bg-green-500"
							},
							{
								step: "4",
								title: "Espelho",
								description: "Cria espelho de correção inteligente",
								icon: <CheckCircle className="h-8 w-8 text-white" />,
								color: "bg-orange-500"
							},
							{
								step: "5",
								title: "Análise IA",
								description: "IA analisa e gera insights automáticos",
								icon: <Bot className="h-8 w-8 text-white" />,
								color: "bg-red-500"
							}
						].map((step, index) => (
							<div key={index} className="relative text-center">
								<div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700">
									<div className={`w-16 h-16 ${step.color} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
										{step.icon}
									</div>
									<div className="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-4">
										{step.step}
									</div>
									<h3 className="text-lg font-bold mb-2 text-gray-900 dark:text-white">{step.title}</h3>
									<p className="text-sm text-gray-600 dark:text-gray-400">{step.description}</p>
								</div>
								
								{index < 4 && (
									<div className="hidden lg:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
										<ArrowRight className="h-6 w-6 text-primary" />
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Recursos Avançados */}
			<section className="py-20 bg-gray-50 dark:bg-gray-800">
				<div className="container mx-auto px-4">
					<div className="text-center mb-16">
						<h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900 dark:text-white">Recursos Avançados</h2>
						<p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
							Ferramentas poderosas para escalar seu negócio e automatizar processos complexos
						</p>
					</div>
					
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
						{[
							{
								icon: <Calendar className="h-8 w-8 text-primary" />,
								title: "Agendamento Inteligente",
								description: "Sistema automatizado de agendamento com IA que otimiza horários e reduz cancelamentos."
							},
							{
								icon: <Users className="h-8 w-8 text-primary" />,
								title: "Gestão de Leads",
								description: "CRM completo com automação de follow-up e segmentação inteligente de prospects."
							},
							{
								icon: <BarChart className="h-8 w-8 text-primary" />,
								title: "Analytics Avançado",
								description: "Dashboards em tempo real com insights de IA para otimizar suas estratégias."
							},
							{
								icon: <Shield className="h-8 w-8 text-primary" />,
								title: "Segurança LGPD",
								description: "Conformidade total com LGPD e criptografia avançada para proteger seus dados."
							},
							{
								icon: <Zap className="h-8 w-8 text-primary" />,
								title: "Automação Completa",
								description: "Fluxos de trabalho automatizados que economizam horas de trabalho manual."
							},
							{
								icon: <Smartphone className="h-8 w-8 text-primary" />,
								title: "Multi-Plataforma",
								description: "Acesse de qualquer dispositivo com sincronização em tempo real."
							}
						].map((feature, index) => (
							<div key={index} className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700">
								<div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
									{feature.icon}
								</div>
								<h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{feature.title}</h3>
								<p className="text-gray-600 dark:text-gray-400">{feature.description}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Depoimentos */}
			<section className="py-20 bg-white dark:bg-gray-900">
				<div className="container mx-auto px-4">
					<div className="text-center mb-16">
						<h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900 dark:text-white">Casos de Sucesso</h2>
						<p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
							Profissionais que transformaram seus negócios com Socialwise Chatwit
						</p>
					</div>
					
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
						{[
							{
								name: "Dra. Ana Silva",
								role: "Advogada Criminalista",
								testimonial: "O Socialwise Chatwit revolucionou meu escritório. Automatizei 80% dos atendimentos iniciais e aumentei minha carteira de clientes em 150% em 6 meses.",
								avatar: "👩‍⚖️",
								rating: 5
							},
							{
								name: "Carlos Mendes",
								role: "Influencer Digital",
								testimonial: "Com o Socialwise Chatwit, consigo responder todos os meus seguidores automaticamente. Minhas vendas aumentaram 300% e meu engajamento triplicou.",
								avatar: "👨‍💼",
								rating: 5
							},
							{
								name: "Mariana Costa",
								role: "Agência de Marketing",
								testimonial: "Gerenciamos 50+ contas de clientes com uma equipe de 3 pessoas. A automação do Socialwise Chatwit é simplesmente incrível.",
								avatar: "👩‍💻",
								rating: 5
							}
						].map((testimonial, index) => (
							<div key={index} className="bg-gray-50 dark:bg-gray-800 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700">
								<div className="flex items-center mb-6">
									<div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-2xl mr-4">
										{testimonial.avatar}
									</div>
									<div>
										<h4 className="font-bold text-lg text-gray-900 dark:text-white">{testimonial.name}</h4>
										<p className="text-sm text-gray-600 dark:text-gray-400">{testimonial.role}</p>
										<div className="flex items-center mt-1">
											{[...Array(testimonial.rating)].map((_, i) => (
												<Star key={i} className="h-4 w-4 text-yellow-400 fill-current" />
											))}
										</div>
									</div>
								</div>
								<p className="text-gray-700 dark:text-gray-300 italic">"{testimonial.testimonial}"</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* CTA Final */}
			<section className="py-20 bg-gradient-to-r from-primary via-blue-600 to-purple-600">
				<div className="container mx-auto px-4 text-center">
					<h2 className="text-4xl md:text-5xl font-bold mb-6 text-white">
						Revolucione Seu Atendimento com IA
					</h2>
					<p className="text-xl text-white/90 mb-8 max-w-4xl mx-auto">
						Junte-se a milhares de advogados, influencers e empresas que já estão usando Socialwise Chatwit 
						para automatizar atendimentos, aumentar vendas e transformar seguidores em clientes.
					</p>
					
					<div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
						<div className="text-center">
							<div className="text-4xl font-bold text-white mb-2">2.500+</div>
							<div className="text-white/80">Profissionais Ativos</div>
						</div>
						<div className="text-center">
							<div className="text-4xl font-bold text-white mb-2">98%</div>
							<div className="text-white/80">Satisfação dos Clientes</div>
						</div>
						<div className="text-center">
							<div className="text-4xl font-bold text-white mb-2">24/7</div>
							<div className="text-white/80">Suporte Especializado</div>
						</div>
					</div>
					
					<div className="flex flex-col sm:flex-row gap-4 justify-center">
						<Link
							href="/auth/login"
							className="bg-white hover:bg-gray-100 text-primary font-bold rounded-lg px-10 py-4 text-center inline-flex items-center justify-center text-xl transition-all duration-200 shadow-lg hover:shadow-xl"
						>
							Começar Agora - Grátis
							<ArrowRight className="ml-2 h-6 w-6" />
						</Link>
						<Link
							href="/auth/register"
							className="bg-transparent hover:bg-white/10 text-white border-2 border-white/80 hover:border-white font-bold rounded-lg px-10 py-4 text-center text-xl transition-all duration-200"
						>
							Agendar Demonstração
						</Link>
					</div>
				</div>
			</section>

			{/* Footer */}
			<footer className="bg-gray-900 text-white py-16">
				<div className="container mx-auto px-4">
					<div className="grid grid-cols-1 md:grid-cols-4 gap-8">
						<div>
							<Link href="/" className="inline-block mb-6">
								<div className="flex items-center">
									<Image
										src="/01 WitdeT.png"
										alt="Socialwise Chatwit Logo"
										width={50}
										height={50}
										className="mr-3"
									/>
									<span className="text-2xl font-bold">Socialwise Chatwit</span>
								</div>
							</Link>
							<p className="text-gray-400 mb-6">
								Plataforma completa de automação com IA para redes sociais e apoio jurídico.
							</p>
							<div className="flex space-x-4">
								<a href="#" className="text-gray-400 hover:text-white transition-colors">
									<Instagram className="h-6 w-6" />
								</a>
								<a href="#" className="text-gray-400 hover:text-white transition-colors">
									<Facebook className="h-6 w-6" />
								</a>
								<a href="#" className="text-gray-400 hover:text-white transition-colors">
									<Twitter className="h-6 w-6" />
								</a>
								<a href="#" className="text-gray-400 hover:text-white transition-colors">
									<MessageCircle className="h-6 w-6" />
								</a>
							</div>
						</div>
						
						<div>
							<h4 className="font-bold text-lg mb-4">Funcionalidades</h4>
							<ul className="space-y-2">
								<li><a href="#" className="text-gray-400 hover:text-white transition-colors">ChatWit IA</a></li>
								<li><a href="#" className="text-gray-400 hover:text-white transition-colors">Automação Social</a></li>
								<li><a href="#" className="text-gray-400 hover:text-white transition-colors">Sistema Jurídico</a></li>
								<li><a href="#" className="text-gray-400 hover:text-white transition-colors">Gestão de Leads</a></li>
							</ul>
						</div>
						
						<div>
							<h4 className="font-bold text-lg mb-4">Suporte</h4>
							<ul className="space-y-2">
								<li><a href="#" className="text-gray-400 hover:text-white transition-colors">Central de Ajuda</a></li>
								<li><a href="#" className="text-gray-400 hover:text-white transition-colors">Documentação</a></li>
								<li><a href="#" className="text-gray-400 hover:text-white transition-colors">Tutoriais</a></li>
								<li><a href="#" className="text-gray-400 hover:text-white transition-colors">Contato</a></li>
							</ul>
						</div>
						
						<div>
							<h4 className="font-bold text-lg mb-4">Empresa</h4>
							<ul className="space-y-2">
								<li><a href="#" className="text-gray-400 hover:text-white transition-colors">Sobre Nós</a></li>
								<li><a href="#" className="text-gray-400 hover:text-white transition-colors">Blog</a></li>
								<li><a href="#" className="text-gray-400 hover:text-white transition-colors">Termos de Uso</a></li>
								<li><a href="#" className="text-gray-400 hover:text-white transition-colors">Política de Privacidade</a></li>
							</ul>
						</div>
					</div>
					
					<div className="border-t border-gray-800 mt-12 pt-8 text-center text-gray-400">
						<p>&copy; {new Date().getFullYear()} Socialwise Chatwit. Todos os direitos reservados.</p>
						<p className="mt-2 text-sm">Desenvolvido com ❤️ para transformar o atendimento digital no Brasil</p>
					</div>
				</div>
			</footer>
		</div>
	);
}
