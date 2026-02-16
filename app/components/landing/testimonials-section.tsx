"use client";

import { Star } from "lucide-react";

const testimonials = [
	{
		name: "Dra. Ana Silva",
		role: "Advogada Criminalista",
		testimonial:
			"O Socialwise Chatwit revolucionou meu escritório. Automatizei 80% dos atendimentos iniciais e aumentei minha carteira de clientes em 150% em 6 meses.",
		avatar: "👩‍⚖️",
		rating: 5,
	},
	{
		name: "Carlos Mendes",
		role: "Influencer Digital",
		testimonial:
			"Com o Socialwise Chatwit, consigo responder todos os meus seguidores automaticamente. Minhas vendas aumentaram 300% e meu engajamento triplicou.",
		avatar: "👨‍💼",
		rating: 5,
	},
	{
		name: "Mariana Costa",
		role: "Agência de Marketing",
		testimonial:
			"Gerenciamos 50+ contas de clientes com uma equipe de 3 pessoas. A automação do Socialwise Chatwit é simplesmente incrível.",
		avatar: "👩‍💻",
		rating: 5,
	},
];

export function TestimonialsSection() {
	return (
		<section className="py-20 bg-white dark:bg-gray-900">
			<div className="container mx-auto px-4">
				<div className="text-center mb-16">
					<h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900 dark:text-white">Casos de Sucesso</h2>
					<p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
						Profissionais que transformaram seus negócios com Socialwise Chatwit
					</p>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
					{testimonials.map((testimonial, index) => (
						<div
							key={index}
							className="bg-gray-50 dark:bg-gray-800 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700"
						>
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
	);
}
