"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SafeBoundaryState {
	hasError: boolean;
	error?: Error;
}

interface SafeBoundaryProps {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}

class SafeBoundary extends React.Component<SafeBoundaryProps, SafeBoundaryState> {
	constructor(props: SafeBoundaryProps) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError(error: Error): SafeBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		console.error("🔥 [SafeBoundary] Erro capturado:", error, errorInfo);
	}

	handleRetry = () => {
		this.setState({ hasError: false, error: undefined });
	};

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<div className="flex items-center justify-center min-h-[400px] p-6">
					<Card className="w-full max-w-md">
						<CardHeader className="text-center">
							<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
								<AlertTriangle className="h-6 w-6 text-red-600" />
							</div>
							<CardTitle className="text-lg">Ops! Algo deu errado</CardTitle>
							<CardDescription>
								Ocorreu um erro inesperado. Tente recarregar a página ou entre em contato com o suporte.
							</CardDescription>
						</CardHeader>
						<CardContent className="text-center space-y-4">
							{process.env.NODE_ENV === "development" && this.state.error && (
								<div className="text-xs text-muted-foreground bg-muted p-2 rounded text-left">
									<strong>Erro (dev):</strong> {this.state.error.message}
								</div>
							)}
							<Button onClick={this.handleRetry} className="w-full">
								<RefreshCw className="mr-2 h-4 w-4" />
								Tentar Novamente
							</Button>
						</CardContent>
					</Card>
				</div>
			);
		}

		return this.props.children;
	}
}

export default SafeBoundary;
