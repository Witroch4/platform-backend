"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, FileText, Bot, Database, Activity, Zap } from "lucide-react";
import Link from "next/link";

export default function MTFDashboardPage() {
	return (
		<div className="container mx-auto px-4 py-8">
			<div className="mb-8">
				<h1 className="text-3xl font-bold text-foreground mb-2">MTF Dashboard</h1>
				<p className="text-muted-foreground">
					Ecosistema de Agentes LangGraph - Gestão centralizada de agentes AI nativos
				</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{/* Agentes Nativos */}
				<Card className="hover:shadow-lg transition-shadow">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Bot className="h-5 w-5 text-blue-500" />
							Agentes Nativos
						</CardTitle>
						<CardDescription>Criar e gerenciar agentes AI especializados com LangGraph</CardDescription>
					</CardHeader>
					<CardContent>
						<Link href="/admin/MTFdashboard/agentes">
							<Button className="w-full" variant="default">
								<Brain className="mr-2 h-4 w-4" />
								Gerenciar Agentes
							</Button>
						</Link>
					</CardContent>
				</Card>

				{/* OAB Upload */}
				<Card className="hover:shadow-lg transition-shadow">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<FileText className="h-5 w-5 text-green-500" />
							OAB Upload
						</CardTitle>
						<CardDescription>Upload de arquivos para agentes especializados em OAB</CardDescription>
					</CardHeader>
					<CardContent>
						<Link href="/admin/MTFdashboard/mtf-oab">
							<Button className="w-full" variant="default">
								<Database className="mr-2 h-4 w-4" />
								Upload OAB
							</Button>
						</Link>
					</CardContent>
				</Card>

				{/* Performance Monitor */}
				<Card className="hover:shadow-lg transition-shadow">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Activity className="h-5 w-5 text-orange-500" />
							Performance
						</CardTitle>
						<CardDescription>Monitoramento de performance dos agentes em tempo real</CardDescription>
					</CardHeader>
					<CardContent>
						<Button className="w-full" variant="outline" disabled>
							<Activity className="mr-2 h-4 w-4" />
							Em breve
						</Button>
					</CardContent>
				</Card>

				{/* Workflows */}
				<Card className="hover:shadow-lg transition-shadow">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Zap className="h-5 w-5 text-purple-500" />
							Workflows
						</CardTitle>
						<CardDescription>Configuração de fluxos de trabalho automatizados</CardDescription>
					</CardHeader>
					<CardContent>
						<Button className="w-full" variant="outline" disabled>
							<Zap className="mr-2 h-4 w-4" />
							Em breve
						</Button>
					</CardContent>
				</Card>

				{/* Training Data */}
				<Card className="hover:shadow-lg transition-shadow">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Database className="h-5 w-5 text-indigo-500" />
							Training Data
						</CardTitle>
						<CardDescription>Gestão de dados de treinamento para agentes</CardDescription>
					</CardHeader>
					<CardContent>
						<Button className="w-full" variant="outline" disabled>
							<Database className="mr-2 h-4 w-4" />
							Em breve
						</Button>
					</CardContent>
				</Card>

				{/* Analytics */}
				<Card className="hover:shadow-lg transition-shadow">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Brain className="h-5 w-5 text-pink-500" />
							Analytics
						</CardTitle>
						<CardDescription>Análises e insights sobre o desempenho dos agentes</CardDescription>
					</CardHeader>
					<CardContent>
						<Button className="w-full" variant="outline" disabled>
							<Brain className="mr-2 h-4 w-4" />
							Em breve
						</Button>
					</CardContent>
				</Card>
			</div>

			{/* Quick Stats */}
			<div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
				<Card>
					<CardContent className="pt-6">
						<div className="text-2xl font-bold">0</div>
						<p className="text-xs text-muted-foreground">Agentes Ativos</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-6">
						<div className="text-2xl font-bold">0</div>
						<p className="text-xs text-muted-foreground">Workflows</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-6">
						<div className="text-2xl font-bold">0</div>
						<p className="text-xs text-muted-foreground">Arquivos OAB</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-6">
						<div className="text-2xl font-bold">0%</div>
						<p className="text-xs text-muted-foreground">Uptime</p>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
