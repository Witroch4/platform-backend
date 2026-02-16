// components/auth/login-badge.tsx

"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import type { User } from "next-auth";
import Link from "next/link";
import { CircleUser, LogOut, Instagram, Home } from "lucide-react";
import { LineMdCogLoop } from "../icons";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import dynamic from "next/dynamic"; // Importação dinâmica
import coinsLightAnimation from "@/public/animations/coins-light.json";
import coinsDarkAnimation from "@/public/animations/coins-dark.json";
import LoginButton from "./login-button";
import LogoutButton from "./logout-button";
import { useTheme } from "next-themes";

type Props = {
	user?: User;
};

// Importa o Lottie dinamicamente com SSR desativado
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

const LoginBadge = ({ user }: Props) => {
	const { theme } = useTheme();
	const coinsAnimation = theme === "dark" ? coinsDarkAnimation : coinsLightAnimation;

	if (!user) {
		return (
			<div className="flex flex-col gap-2 p-2">
				<LoginButton>
					<Button variant="default">Entrar</Button>
				</LoginButton>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2 p-2">
			<div className="flex items-center gap-2">
				<Avatar>
					<AvatarImage src={user.image || ""} />
					<AvatarFallback className="bg-green-500">
						<CircleUser className="h-5 w-5" />
					</AvatarFallback>
				</Avatar>
				<div className="flex flex-col">
					<span className="font-medium text-foreground">{user.name ?? "Minha Conta"}</span>
					<span className="text-xs text-muted-foreground">{user.email ?? ""}</span>
				</div>
			</div>
			<hr className="w-full border-muted-foreground/20" />
			<div className="flex flex-col gap-1 w-full text-sm">
				<Link href={`/${user.id}/dashboard`} className="hover:underline flex items-center gap-2">
					<Home className="mr-2 h-5 w-5" />
					Home
				</Link>
				<Link href="/auth/settings" className="hover:underline flex items-center gap-2">
					<LineMdCogLoop className="mr-2" />
					Perfil
				</Link>
				<Link href="/contas" className="hover:underline flex items-center gap-2">
					<Instagram className="mr-2 h-5 w-5" />
					Minhas Contas
				</Link>
				<Link href="/cobranca" className="hover:underline flex items-center gap-2">
					<div className="w-6 h-6">
						{/* O Lottie já é importado dinamicamente, não precisa mais verificar isClient */}
						<Lottie animationData={coinsAnimation} loop={true} />
					</div>
					Cobrança
				</Link>
				<LogoutButton>
					<Button variant="ghost" className="flex items-center gap-2 justify-start text-sm">
						<LogOut /> Sair
					</Button>
				</LogoutButton>
			</div>
		</div>
	);
};

export default LoginBadge;
