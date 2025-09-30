"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
	HeroSection,
	FeaturesSection,
	SocialMediaSection,
	AutomationFlowSection,
	AdvancedFeaturesSection,
	TestimonialsSection,
	CtaSection,
	Footer,
} from "@/app/components/landing";

export default function Home() {
	const { data: session, status } = useSession();
	const router = useRouter();

	useEffect(() => {
		// Se estiver autenticado, redirecionar baseado na role
		if (status === "authenticated" && session?.user) {
			const role = session.user.role;

			// ADMIN/SUPERADMIN → /admin
			if (role === "ADMIN" || role === "SUPERADMIN") {
				router.push("/admin");
				return;
			}

			// USER → verificar Instagram
			const hasInstagram = !!session.user.providerAccountId;

			if (hasInstagram) {
				// Tem Instagram → Dashboard
				router.push(`/${session.user.providerAccountId}/dashboard`);
			} else {
				// Não tem Instagram → Registro
				router.push("/registro/redesocial");
			}
		}
	}, [session, status, router]);

	// Enquanto verifica autenticação, mostrar landing page
	return (
		<div className="flex min-h-screen w-full flex-col bg-white dark:bg-gray-900">
			<HeroSection />
			<FeaturesSection />
			<SocialMediaSection />
			<AutomationFlowSection />
			<AdvancedFeaturesSection />
			<TestimonialsSection />
			<CtaSection />
			<Footer />
		</div>
	);
}