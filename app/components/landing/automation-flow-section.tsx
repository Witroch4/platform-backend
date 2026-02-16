"use client";

import { FileText, CheckCircle, Bot, ArrowRight, Hash } from "lucide-react";

const automationSteps = [
	{
		step: "1",
		title: "Upload PDF",
		description: "Faça upload do documento PDF para análise",
		icon: <FileText className="h-8 w-8 text-white" />,
		color: "bg-blue-500",
	},
	{
		step: "2",
		title: "Conversão",
		description: "IA converte PDF em imagens de alta qualidade",
		icon: <FileText className="h-8 w-8 text-white" />,
		color: "bg-purple-500",
	},
	{
		step: "3",
		title: "Manuscrito",
		description: "Sistema gera manuscrito automaticamente",
		icon: <Hash className="h-8 w-8 text-white" />,
		color: "bg-green-500",
	},
	{
		step: "4",
		title: "Espelho",
		description: "Cria espelho de correção inteligente",
		icon: <CheckCircle className="h-8 w-8 text-white" />,
		color: "bg-orange-500",
	},
	{
		step: "5",
		title: "Análise IA",
		description: "IA analisa e gera insights automáticos",
		icon: <Bot className="h-8 w-8 text-white" />,
		color: "bg-red-500",
	},
];

export function AutomationFlowSection() {
	return (
		<section id="demo" className="py-20 bg-white dark:bg-gray-900">
			<div className="container mx-auto px-4">
				<div className="text-center mb-16">
					<h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900 dark:text-white">
						Como Funciona a Automação
					</h2>
					<p className="text-xl text-gray-600 dark:text-gray-400 max-w-4xl mx-auto">
						Processo inteligente que transforma documentos em análises completas com IA
					</p>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
					{automationSteps.map((step, index) => (
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

							{index < automationSteps.length - 1 && (
								<div className="hidden lg:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
									<ArrowRight className="h-6 w-6 text-primary" />
								</div>
							)}
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
