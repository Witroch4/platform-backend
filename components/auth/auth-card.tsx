import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";

interface AuthCardProps {
	title?: string;
	description?: string;
	children: React.ReactNode;
	showLogo?: boolean;
}

const AuthCard = ({ title, description, children, showLogo = false }: AuthCardProps) => {
	return (
		<Card className="mx-auto w-full max-w-md min-w-[350px] border-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl shadow-2xl shadow-cyan-500/10 dark:shadow-cyan-400/5">
			<CardHeader className="space-y-4 pb-4">
				{showLogo && (
					<div className="flex justify-center">
						<div className="relative w-48 h-12">
							<Image
								src="/assets/iconssvg/socialwise-logo.png"
								alt="SocialWise"
								fill
								className="object-contain"
								priority
								sizes="192px"
							/>
						</div>
					</div>
				)}
				{title && (
					<CardTitle className="text-2xl font-bold text-center bg-gradient-to-r from-[#004056] via-[#008BBD] to-[#00ADEF] dark:from-cyan-400 dark:via-sky-400 dark:to-blue-400 bg-clip-text text-transparent">
						{title}
					</CardTitle>
				)}
				{description && (
					<CardDescription className="text-center text-muted-foreground">
						{description}
					</CardDescription>
				)}
			</CardHeader>
			<CardContent className="pb-8">{children}</CardContent>
		</Card>
	);
};

export default AuthCard;
