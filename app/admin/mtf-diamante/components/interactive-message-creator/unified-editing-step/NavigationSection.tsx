"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import type { NavigationSectionProps } from "./types";

export const NavigationSection: React.FC<NavigationSectionProps> = ({
	onBack,
	onNext,
	disabled = false,
	hasErrors,
	errorMessages = [],
}) => {
	return (
		<>
			<div className="border-t" />
			<div className="flex items-center justify-between">
				<Button variant="outline" onClick={onBack} disabled={disabled} className="flex items-center gap-2">
					<ChevronLeft className="h-4 w-4" />
					Voltar à Seleção de Tipo
				</Button>

				<div className="flex items-center gap-4">
					{hasErrors && errorMessages.length > 0 && (
						<div className="flex flex-col gap-1 text-sm text-destructive max-w-md">
							<div className="flex items-center gap-2 font-medium">
								<AlertCircle className="h-4 w-4 flex-shrink-0" />
								Erros de validação:
							</div>
							<ul className="pl-6 space-y-1">
								{errorMessages.slice(0, 3).map((error: string, index: number) => (
									<li key={index} className="text-xs">
										• {error}
									</li>
								))}
								{errorMessages.length > 3 && (
									<li className="text-xs italic">+{errorMessages.length - 3} erro(s) adicional(is)</li>
								)}
							</ul>
						</div>
					)}

					{hasErrors && errorMessages.length === 0 && (
						<div className="flex items-center gap-2 text-sm text-destructive">
							<AlertCircle className="h-4 w-4" />
							Por favor, corrija os erros de validação
						</div>
					)}

					<Button onClick={onNext} disabled={disabled || hasErrors} className="flex items-center gap-2">
						Continuar para Revisão
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			</div>
		</>
	);
};
