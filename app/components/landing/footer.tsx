"use client";

import Image from "next/image";
import Link from "next/link";
import { Instagram, Facebook, Twitter, MessageCircle } from "lucide-react";

export function Footer() {
	return (
		<footer className="bg-gray-900 text-white py-16">
			<div className="container mx-auto px-4">
				<div className="grid grid-cols-1 md:grid-cols-4 gap-8">
					<div>
						<Link href="/" className="inline-block mb-6">
							<div className="flex items-center">
								<Image
									src="/01%20WitdeT.png"
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
	);
}