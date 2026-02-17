// app/auth/login/page.tsx

"use client";

import React, { Suspense } from "react";
import LoginForm from "@/components/auth/login-form";
import Image from "next/image";
import Link from "next/link";

const LoginPageContent = () => {
	return (
		<div className="min-h-screen w-full flex">
			{/* Painel esquerdo - Branding */}
			<div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
				{/* Gradiente de fundo animado */}
				<div className="absolute inset-0 bg-gradient-to-br from-[#004056] via-[#007098] to-[#00ADEF]">
					{/* Padrão de ondas decorativo */}
					<div className="absolute inset-0 opacity-30">
						<svg
							className="absolute bottom-0 left-0 w-full"
							viewBox="0 0 1440 320"
							preserveAspectRatio="none"
							aria-hidden="true"
						>
							<path
								fill="rgba(255,255,255,0.1)"
								d="M0,160L48,170.7C96,181,192,203,288,192C384,181,480,139,576,138.7C672,139,768,181,864,197.3C960,213,1056,203,1152,181.3C1248,160,1344,128,1392,112L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
							/>
						</svg>
						<svg
							className="absolute bottom-0 left-0 w-full"
							viewBox="0 0 1440 320"
							preserveAspectRatio="none"
							aria-hidden="true"
						>
							<path
								fill="rgba(255,255,255,0.05)"
								d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,218.7C672,235,768,245,864,234.7C960,224,1056,192,1152,181.3C1248,171,1344,181,1392,186.7L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
							/>
						</svg>
					</div>

					{/* Círculos decorativos animados */}
					<div className="absolute top-20 left-20 w-72 h-72 bg-white/5 rounded-full blur-3xl animate-pulse" />
					<div className="absolute bottom-40 right-10 w-96 h-96 bg-cyan-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
					<div className="absolute top-1/2 left-1/3 w-48 h-48 bg-sky-300/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: "2s" }} />
				</div>

				{/* Conteúdo do painel */}
				<div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
					{/* Logo */}
					<div className="flex items-center gap-3">
						<div className="relative w-56 h-14">
							<Image
								src="/assets/iconssvg/socialwise-logo.png"
								alt="SocialWise"
								fill
								className="object-contain brightness-0 invert"
								priority
								sizes="224px"
							/>
						</div>
					</div>

					{/* Texto principal */}
					<div className="space-y-6 max-w-lg">
						<h1 className="text-4xl xl:text-5xl font-bold leading-tight text-balance">
							Transforme suas conversas em resultados
						</h1>
						<p className="text-lg xl:text-xl text-white/80 leading-relaxed">
							Automatize atendimentos, engaje clientes e potencialize suas vendas com inteligência artificial avançada.
						</p>

						{/* Features */}
						<div className="grid grid-cols-2 gap-4 pt-4">
							<div className="flex items-center gap-3 text-white/90">
								<div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
									<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
										<path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
										<path d="m9 12 2 2 4-4"/>
									</svg>
								</div>
								<span className="text-sm font-medium">WhatsApp Business</span>
							</div>
							<div className="flex items-center gap-3 text-white/90">
								<div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
									<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
										<path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
										<path d="m9 12 2 2 4-4"/>
									</svg>
								</div>
								<span className="text-sm font-medium">Instagram Direct</span>
							</div>
							<div className="flex items-center gap-3 text-white/90">
								<div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
									<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
										<path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
										<path d="m9 12 2 2 4-4"/>
									</svg>
								</div>
								<span className="text-sm font-medium">IA Avançada</span>
							</div>
							<div className="flex items-center gap-3 text-white/90">
								<div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
									<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
										<path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
										<path d="m9 12 2 2 4-4"/>
									</svg>
								</div>
								<span className="text-sm font-medium">Análise em Tempo Real</span>
							</div>
						</div>
					</div>

					{/* Rodapé */}
					<div className="text-sm text-white/60">
						<p>&copy; {new Date().getFullYear()} WitDev. Todos os direitos reservados.</p>
					</div>
				</div>
			</div>

			{/* Painel direito - Formulário */}
			<div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-8 lg:p-12 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 relative">
				{/* Decoração sutil no background */}
				<div className="absolute inset-0 overflow-hidden pointer-events-none">
					<div className="absolute -top-1/2 -right-1/2 w-[800px] h-[800px] bg-gradient-to-br from-cyan-100/40 to-transparent dark:from-cyan-900/20 rounded-full blur-3xl" />
					<div className="absolute -bottom-1/4 -left-1/4 w-[600px] h-[600px] bg-gradient-to-tr from-sky-100/30 to-transparent dark:from-sky-900/10 rounded-full blur-3xl" />
				</div>

				<div className="relative z-10 w-full max-w-md space-y-8">
					{/* Logo mobile */}
					<div className="lg:hidden flex justify-center mb-8">
						<div className="relative w-56 h-14">
							<Image
								src="/assets/iconssvg/socialwise-logo.png"
								alt="SocialWise"
								fill
								className="object-contain"
								priority
								sizes="224px"
							/>
						</div>
					</div>

					<LoginForm />

					{/* Link para suporte */}
					<div className="text-center text-sm text-muted-foreground">
						<p>
							Precisa de ajuda?{" "}
							<Link
								href="mailto:suporte@socialwise.com.br"
								className="text-[#008BBD] hover:text-[#00ADEF] dark:text-cyan-400 dark:hover:text-cyan-300 font-medium transition-colors"
							>
								Fale conosco
							</Link>
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};

const Login = () => {
	return (
		<Suspense
			fallback={
				<div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
					<div className="flex flex-col items-center gap-4">
						<div className="relative w-56 h-14 animate-pulse">
							<Image
								src="/assets/iconssvg/socialwise-logo.png"
								alt="SocialWise"
								fill
								className="object-contain"
								priority
								sizes="224px"
							/>
						</div>
						<div className="flex gap-1">
							<div className="w-2 h-2 rounded-full bg-[#008BBD] animate-bounce" style={{ animationDelay: "0ms" }} />
							<div className="w-2 h-2 rounded-full bg-[#00ADEF] animate-bounce" style={{ animationDelay: "150ms" }} />
							<div className="w-2 h-2 rounded-full bg-[#007098] animate-bounce" style={{ animationDelay: "300ms" }} />
						</div>
					</div>
				</div>
			}
		>
			<LoginPageContent />
		</Suspense>
	);
};

export default Login;
