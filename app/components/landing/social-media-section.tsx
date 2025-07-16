"use client";

import { Instagram, MessageCircle, Facebook } from "lucide-react";

const socialPlatforms = [
    {
        icon: <Instagram className="h-10 w-10 text-white" />,
        title: "Instagram",
        description: "Automatize DMs, Stories e comentários. Transforme seguidores em clientes reais.",
        status: "Integração Prioritária ⭐",
		gradient: "bg-gradient-to-r from-purple-500 to-pink-500"
    },
    {
        icon: <MessageCircle className="h-10 w-10 text-white" />,
        title: "WhatsApp",
        description: "Atendimento automatizado com chatbots inteligentes e gestão completa de conversas.",
        status: "Ativo e Funcional ✅",
		gradient: "bg-green-500"
    },
    {
        icon: <Facebook className="h-10 w-10 text-white" />,
        title: "Facebook",
        description: "Gerencie páginas, grupos e messenger com automação inteligente.",
        status: "Em Desenvolvimento 🚧",
		gradient: "bg-blue-600"
    },
];

export function SocialMediaSection() {
	return (
		<section className="py-20 bg-gray-50 dark:bg-gray-800">
			<div className="container mx-auto px-4">
				<div className="text-center mb-16">
					<h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900 dark:text-white">Redes Sociais Integradas</h2>
					<p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
						Conecte-se com seus clientes em todas as plataformas com uma única solução inteligente
					</p>
				</div>
				
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
					{socialPlatforms.map((platform, index) => (
						<div key={index} className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700">
							<div className={`w-20 h-20 ${platform.gradient} rounded-2xl flex items-center justify-center mx-auto mb-6`}>
								{platform.icon}
							</div>
							<h3 className="text-2xl font-bold mb-4 text-center text-gray-900 dark:text-white">{platform.title}</h3>
							<p className="text-gray-600 dark:text-gray-400 text-center mb-6">
								{platform.description}
							</p>
							<div className={`${platform.gradient} text-white px-4 py-2 rounded-full text-center font-medium`}>
								{platform.status}
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}