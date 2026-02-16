"use client";

import { useEffect } from "react";

interface GlobalErrorProps {
	error: Error & { digest?: string };
	reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
	useEffect(() => {
		console.error("Erro global na aplicação:", error);
	}, [error]);

	return (
		<html lang="pt-BR">
			<head>
				<title>Erro | Chatwit</title>
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<link rel="icon" href="/assets/favicon/favicon.ico" />
			</head>
			<body style={{ margin: 0, padding: 0, fontFamily: "system-ui, -apple-system, sans-serif" }}>
				<div
					style={{
						minHeight: "100vh",
						width: "100%",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						background: "linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%)",
						padding: "1rem",
					}}
				>
					<div
						style={{
							maxWidth: "28rem",
							width: "100%",
							textAlign: "center",
						}}
					>
						{/* Logo */}
						<div style={{ marginBottom: "2rem" }}>
							<img
								src="/assets/iconssvg/logo_thumbnail_w.svg"
								alt="Chatwit"
								style={{ width: "4rem", height: "4rem", opacity: 0.6, margin: "0 auto" }}
							/>
						</div>

						{/* Ilustração */}
						<div
							style={{
								width: "8rem",
								height: "8rem",
								margin: "0 auto 1.5rem",
								position: "relative",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							<div
								style={{
									position: "absolute",
									inset: 0,
									background: "linear-gradient(135deg, rgba(249, 115, 22, 0.2), rgba(239, 68, 68, 0.2))",
									borderRadius: "50%",
								}}
							/>
							<svg
								style={{ width: "4rem", height: "4rem", color: "#9ca3af" }}
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={1.5}
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
								/>
							</svg>
						</div>

						{/* Texto */}
						<h1
							style={{
								fontSize: "1.5rem",
								fontWeight: 600,
								color: "#1f2937",
								margin: "0 0 0.5rem",
							}}
						>
							Ops! Algo deu errado
						</h1>
						<p
							style={{
								fontSize: "0.875rem",
								color: "#6b7280",
								lineHeight: 1.6,
								margin: "0 0 2rem",
							}}
						>
							Encontramos um problema ao carregar a aplicação. Isso pode acontecer por instabilidade na conexão ou um
							erro temporário.
						</p>

						{/* Botões */}
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: "0.75rem",
								alignItems: "center",
							}}
						>
							<button
								onClick={reset}
								style={{
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
									gap: "0.5rem",
									padding: "0.625rem 1.5rem",
									backgroundColor: "#2563eb",
									color: "white",
									borderRadius: "0.5rem",
									fontSize: "0.875rem",
									fontWeight: 500,
									border: "none",
									cursor: "pointer",
									transition: "background-color 0.2s",
								}}
								onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#1d4ed8")}
								onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
							>
								<svg
									style={{ width: "1rem", height: "1rem" }}
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={2}
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
									/>
								</svg>
								Tentar novamente
							</button>
							<a
								href="/"
								style={{
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
									gap: "0.5rem",
									padding: "0.625rem 1.5rem",
									backgroundColor: "#f3f4f6",
									color: "#374151",
									borderRadius: "0.5rem",
									fontSize: "0.875rem",
									fontWeight: 500,
									textDecoration: "none",
									transition: "background-color 0.2s",
								}}
								onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#e5e7eb")}
								onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#f3f4f6")}
							>
								<svg
									style={{ width: "1rem", height: "1rem" }}
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={2}
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
									/>
								</svg>
								Ir para o início
							</a>
						</div>
					</div>
				</div>
			</body>
		</html>
	);
}
