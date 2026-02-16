import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conectar Redes Sociais | Socialwise",
  description: "Conecte suas contas de Instagram e outras redes sociais para automatizar interações e aumentar seu engajamento.",
};

export default function RedeSocialLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}