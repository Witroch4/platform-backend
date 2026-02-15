import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Conectar Redes Sociais | Socialwise Chatwit",
  description: "Conecte suas contas de Instagram e outras redes sociais para automatizar interações e aumentar seu engajamento.",
};

export default function RedeSocialLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="container max-w-6xl mx-auto py-6 px-4">
      <div className="flex justify-center mb-6">
        <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
          <div className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-full p-2">
            <Image src="/assets/iconssvg/logo_thumbnail_w.svg" alt="Socialwise Chatwit Logo" width={32} height={32} className="h-8 w-8" />
          </div>
          <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
            Socialwise Chatwit
          </span>
        </Link>
      </div>
      {children}
    </div>
  );
}