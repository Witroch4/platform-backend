"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function CtaSection() {
	return (
		<section className="py-20 bg-gradient-to-r from-primary via-blue-600 to-purple-600">
			<div className="container mx-auto px-4 text-center">
				<h2 className="text-4xl md:text-5xl font-bold mb-6 text-white">Revolucione Seu Atendimento com IA</h2>
				<p className="text-xl text-white/90 mb-8 max-w-4xl mx-auto">
					Junte-se a milhares de advogados, influencers e empresas que já estão usando Socialwise Chatwit para
					automatizar atendimentos, aumentar vendas e transformar seguidores em clientes.
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
	);
}
