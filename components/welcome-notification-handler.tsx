"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import axios from "axios";

export function WelcomeNotificationHandler() {
	const { data: session } = useSession();
	const [notificationSent, setNotificationSent] = useState(false);

	useEffect(() => {
		// Verificar se o usuário está logado e é um novo usuário
		if (session?.user?.isNewUser && !notificationSent) {
			console.log("Usuário novo detectado no WelcomeNotificationHandler:", session.user.id);

			const sendWelcomeNotification = async () => {
				try {
					console.log("Enviando requisição para /api/auth/welcome-notification");
					const response = await axios.post("/api/auth/welcome-notification");
					console.log("Resposta da API de notificação:", response.data);

					if (response.data.success) {
						console.log("Notificação de boas-vindas enviada com sucesso");
						setNotificationSent(true);
					} else {
						console.warn("API retornou falha ao enviar notificação:", response.data.message);
					}
				} catch (error) {
					console.error("Erro ao enviar notificação de boas-vindas:", error);
				}
			};

			sendWelcomeNotification();
		} else if (session?.user && !session.user.isNewUser) {
			console.log("Usuário não é novo, não enviando notificação de boas-vindas");
		}
	}, [session, notificationSent]);

	// Este componente não renderiza nada visualmente
	return null;
}
