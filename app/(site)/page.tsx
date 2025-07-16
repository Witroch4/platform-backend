"use client";

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