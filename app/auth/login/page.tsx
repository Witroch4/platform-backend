// app/auth/login/page.tsx

"use client";

import React, { Suspense } from "react";
import LoginForm from "@/components/auth/login-form";
import { useRouter } from "next/navigation";
import type { z } from "zod";
import type { LoginSchema } from "@/schemas"; // Se o alias @ estiver configurado

const Login = () => {
	const router = useRouter();

	const onSubmit = async (values: z.infer<typeof LoginSchema>) => {
		// Adicione o código para definir a variável result
		// Por exemplo, fazendo uma chamada de API para autenticação
		const result = await fetch("/api/auth/login", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(values),
		});

		if (result?.ok) {
			// Definir flag para indicar que acabamos de fazer login
			if (typeof window !== "undefined") {
				sessionStorage.setItem("postLogin", "true");
			}

			// Redirecionar para a página de redes sociais com um parâmetro que indica login recente
			router.push("/registro/redesocial?fromLogin=true");
		}
	};

	return (
		<Suspense fallback={<div>Carregando...</div>}>
			<div className="flex items-center justify-center min-h-screen bg-gray-100">
				<LoginForm />
			</div>
		</Suspense>
	);
};

export default Login;
