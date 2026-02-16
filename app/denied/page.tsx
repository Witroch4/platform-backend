import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldX } from "lucide-react";
import Link from "next/link";

export default function DeniedPage() {
	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-50">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
						<ShieldX className="h-6 w-6 text-red-600" />
					</div>
					<CardTitle className="text-2xl font-bold text-gray-900">Acesso Negado</CardTitle>
					<CardDescription className="text-gray-600">Você não tem permissão para acessar esta página.</CardDescription>
				</CardHeader>
				<CardContent className="text-center">
					<p className="mb-6 text-sm text-gray-500">
						Entre em contato com o administrador se você acredita que deveria ter acesso a esta área.
					</p>
					<div className="space-y-2">
						<Button asChild className="w-full">
							<Link href="/">Voltar ao Início</Link>
						</Button>
						<Button variant="outline" asChild className="w-full">
							<Link href="/auth/login">Fazer Login</Link>
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
