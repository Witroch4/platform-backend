"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Play, Pause, Volume2, VolumeX, Bot, Star } from "lucide-react";

export function HeroSection() {
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
											onLoadedData={() => {
												console.log('Video loaded successfully');
												setVideoError(false);
											}}
											onLoadStart={() => console.log('Video loading started')}
											onCanPlay={() => console.log('Video can play')}
											onError={(e) => {
												console.error('Video error:', e);
												console.error('Video error details:', {
													error: e,
													src: '/Vídeo_IA_ChatWit_Social_Prompts.mp4',
													videoElement: e.target
												});
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
													<div className="w-24 h-24 mx-auto bg-white/20 rounded-full flex items-center justify-center">
														<Bot className="h-12 w-12 text-white" />
													</div>
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
	);
}