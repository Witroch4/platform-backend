// app/auth/reset-password/page.tsx

"use client";

import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import Image from "next/image";
import Link from "next/link";

const ResetPasswordPageContent = () => {
	return (
		<div className="min-h-screen w-full flex">
			{/* Painel esquerdo - Branding */}
			<div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
				{/* Gradiente de fundo */}
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
						<Link href="/auth/login">
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
						</Link>
					</div>

					{/* Texto principal */}
					<div className="space-y-6 max-w-lg">
						<h1 className="text-4xl xl:text-5xl font-bold leading-tight text-balance">
							Recupere o acesso à sua conta
						</h1>
						<p className="text-lg xl:text-xl text-white/80 leading-relaxed">
							Enviaremos um link seguro para seu e-mail para que você possa redefinir sua senha.
						</p>

						{/* Dicas de segurança */}
						<div className="space-y-3 pt-4">
							<div className="flex items-start gap-3 text-white/90">
								<div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
									<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
										<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
										<path d="M7 11V7a5 5 0 0 1 10 0v4"/>
									</svg>
								</div>
								<div>
									<span className="text-sm font-medium block">Link seguro</span>
									<span className="text-xs text-white/60">O link expira em 1 hora por segurança</span>
								</div>
							</div>
							<div className="flex items-start gap-3 text-white/90">
								<div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
									<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
										<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
									</svg>
								</div>
								<div>
									<span className="text-sm font-medium block">Suporte disponível</span>
									<span className="text-xs text-white/60">Entre em contato se precisar de ajuda</span>
								</div>
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
						<Link href="/auth/login">
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
						</Link>
					</div>

					<ResetPasswordForm />

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

const ResetPasswordPage = () => {
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
			<ResetPasswordPageContent />
		</Suspense>
	);
};

export default ResetPasswordPage;
