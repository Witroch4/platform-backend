"use client";

import Image from "next/image";
import { Bot, Zap, Gavel, FileText } from "lucide-react";

const features = [
    {
        icon: <Bot className="h-8 w-8 text-white" />,
        title: "ChatWit IA",
        description: "Assistente de IA avançado com GPT-4, Gemini e Claude para atendimento automatizado",
        details: [
            "Conversas em tempo real",
            "Geração de imagens",
            "Transcrição de áudio",
            "Análise de documentos",
        ],
		gradient: "bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20",
		borderColor: "border-blue-200 dark:border-blue-800",
		iconBg: "bg-blue-500"
    },
    {
        icon: <Zap className="h-8 w-8 text-white" />,
        title: "Automação Social",
        description: "Automatize Instagram, WhatsApp e outras redes sociais com inteligência",
        details: [
            "Respostas automáticas",
            "Chatbots personalizados",
            "Gestão de leads",
            "Análise de engajamento",
        ],
		gradient: "bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20",
		borderColor: "border-purple-200 dark:border-purple-800",
		iconBg: "bg-purple-500"
    },
    {
        icon: <Gavel className="h-8 w-8 text-white" />,
        title: "Sistema Jurídico",
        description: "Ferramentas especializadas para advogados e profissionais do direito",
        details: [
            "Gestão de leads OAB",
            "Agendamento inteligente",
            "Análise de documentos",
            "Automação de processos",
        ],
		gradient: "bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20",
		borderColor: "border-green-200 dark:border-green-800",
		iconBg: "bg-green-500"
    },
    {
        icon: <FileText className="h-8 w-8 text-white" />,
        title: "Processamento IA",
        description: "Sistema completo de processamento de documentos com IA",
        details: [
            "PDF para imagens",
            "Manuscritos automáticos",
            "Espelhos de correção",
            "Análise automática",
        ],
		gradient: "bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20",
		borderColor: "border-orange-200 dark:border-orange-800",
		iconBg: "bg-orange-500"
    },
];

export function FeaturesSection() {
	return (
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
					{features.map((feature, index) => (
						<div key={index} className={`${feature.gradient} p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border ${feature.borderColor}`}>
							<div className={`w-16 h-16 ${feature.iconBg} rounded-2xl flex items-center justify-center mb-6`}>
								{feature.icon}
							</div>
							<h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{feature.title}</h3>
							<p className="text-gray-600 dark:text-gray-400 mb-4">
								{feature.description}
							</p>
							<ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
								{feature.details.map((detail, i) => (
									<li key={i}>• {detail}</li>
								))}
							</ul>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}