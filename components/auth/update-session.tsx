// components/auth/update-session.tsx

"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

export default function UpdateSession() {
	const { update } = useSession();

	useEffect(() => {
		// Função para forçar a atualização da sessão
		update();
	}, [update]);

	return null;
}
