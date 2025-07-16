"use client";

import { Calendar, Users, BarChart, Shield, Zap, Smartphone } from "lucide-react";

const advancedFeatures = [
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
];

export function AdvancedFeaturesSection() {
	return (
		<section className="py-20 bg-gray-50 dark:bg-gray-800">
			<div className="container mx-auto px-4">
				<div className="text-center mb-16">
					<h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900 dark:text-white">Recursos Avançados</h2>
					<p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
						Ferramentas poderosas para escalar seu negócio e automatizar processos complexos
					</p>
				</div>
				
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
					{advancedFeatures.map((feature, index) => (
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
	);
}