// app/user/page.tsx
"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

interface InstagramData {
	id: string;
	username: string;
	media_count: number;
}

const UserPage = () => {
	const { data: session, status } = useSession();
	const [instagramData, setInstagramData] = useState<InstagramData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchInstagramData = async () => {
			if (status === "authenticated" && session?.user?.instagramAccessToken) {
				try {
					const response = await fetch(
						`https://graph.instagram.com/me?fields=id,username,media_count&access_token=${session.user.instagramAccessToken}`,
					);
					if (response.ok) {
						const data = await response.json();
						setInstagramData(data);
					} else {
						const errorText = await response.text();
						console.error("Erro ao buscar dados do Instagram:", errorText);
						setError("Não foi possível obter os dados do Instagram.");
					}
				} catch (err) {
					console.error("Erro ao conectar-se à API do Instagram:", err);
					setError("Erro ao conectar-se à API do Instagram.");
				} finally {
					setLoading(false);
				}
			} else {
				setLoading(false);
			}
		};

		fetchInstagramData();
	}, [session, status]);

	if (status === "loading") {
		return <div style={styles}>Carregando sessão...</div>;
	}

	if (status === "unauthenticated") {
		return (
			<div style={styles}>
				<h1>Usuário Não Autenticado</h1>
				<p>Por favor, faça login para ver suas informações.</p>
			</div>
		);
	}

	return (
		<div style={styles}>
			<h1>Informações do Usuário</h1>
			<p>
				<strong>Nome:</strong> {session!.user.name || "Sem nome"}
			</p>
			<p>
				<strong>Token do Instagram:</strong>{" "}
				{session!.user.instagramAccessToken || "Token do Instagram não disponível."}
			</p>
			<p>
				<strong>Role:</strong> {session!.user.role}
			</p>

			{loading ? (
				<p>Carregando dados do Instagram...</p>
			) : error ? (
				<p style={{ color: "red" }}>{error}</p>
			) : instagramData ? (
				<div>
					<h2>Dados do Instagram:</h2>
					<p>
						<strong>ID:</strong> {instagramData.id}
					</p>
					<p>
						<strong>Username:</strong> {instagramData.username}
					</p>
					<p>
						<strong>Quantidade de Postagens:</strong> {instagramData.media_count}
					</p>
				</div>
			) : (
				<p>Instagram não conectado ou dados não disponíveis.</p>
			)}
		</div>
	);
};

const styles: React.CSSProperties = {
	padding: "2rem",
	fontFamily: "Arial, sans-serif",
	lineHeight: "1.6",
	maxWidth: "600px",
	margin: "0 auto",
	textAlign: "left",
};

export default UserPage;
