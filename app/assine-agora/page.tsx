"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function AssineAgoraPage() {
	const router = useRouter();

	return (
		<div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-neutral-900 p-4">
			<div className="max-w-2xl text-center">
				<h1 className="text-4xl font-bold mb-4 text-blue-600">Acesso Exclusivo ao Socialwise Chatwit</h1>
				<p className="text-lg mb-6 text-gray-700 dark:text-gray-300">
					Você ainda não possui uma assinatura ativa do Socialwise Chatwit. Para desbloquear todos os recursos e
					funcionalidades que podem revolucionar sua estratégia digital, é necessário assinar.
				</p>
				<p className="text-lg mb-8 text-gray-700 dark:text-gray-300">
					Ao assinar, você terá acesso imediato a ferramentas de automação avançada, insights exclusivos e suporte
					dedicado, eliminando qualquer barreira que impeça o seu sucesso. Não perca tempo e transforme seu negócio com
					o poder do Socialwise Chatwit!
				</p>
				<Button variant="default" onClick={() => router.push("/checkout")}>
					Assine Agora
				</Button>
			</div>
		</div>
	);
}
