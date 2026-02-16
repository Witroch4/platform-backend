import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Registro de Redes Sociais | Socialwise",
	description: "Conecte suas contas de redes sociais para automatizar interações e mensagens.",
};

export default function RegistroLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <div className="min-h-screen bg-gradient-to-b from-primary/5 to-primary/10">{children}</div>;
}
