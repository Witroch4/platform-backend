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
		// Se estiver autenticado, redirecionar para o Hub
		if (status === "authenticated" && session?.user) {
			router.push("/hub");
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
