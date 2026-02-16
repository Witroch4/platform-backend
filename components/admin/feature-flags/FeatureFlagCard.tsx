"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Settings, Users, BarChart3, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface FeatureFlag {
	id: string;
	name: string;
	description: string;
	category: string;
	enabled: boolean;
	rolloutPercentage: number;
	userSpecific: boolean;
	systemCritical: boolean;
	metadata: Record<string, any>;
	createdAt: string;
	updatedAt: string;
	metrics?: any[];
	userOverrides?: any[];
}

interface FeatureFlagCardProps {
	flag: FeatureFlag;
	onToggle: (flagId: string, enabled: boolean) => Promise<void>;
	onDelete?: (flagId: string) => Promise<void>;
	onUserOverrides?: (flagId: string) => void;
	onMetrics?: (flagId: string) => void;
	updating?: boolean;
}

export function FeatureFlagCard({
	flag,
	onToggle,
	onDelete,
	onUserOverrides,
	onMetrics,
	updating = false,
}: FeatureFlagCardProps) {
	const [localUpdating, setLocalUpdating] = useState(false);

	const handleToggle = async (enabled: boolean) => {
		try {
			setLocalUpdating(true);
			await onToggle(flag.id, enabled);
		} catch (error) {
			console.error("Error toggling flag:", error);
			toast.error("Erro ao atualizar feature flag");
		} finally {
			setLocalUpdating(false);
		}
	};

	const handleDelete = async () => {
		if (!onDelete) return;

		if (flag.systemCritical) {
			toast.error("Não é possível deletar feature flags críticas do sistema");
			return;
		}

		if (confirm(`Tem certeza que deseja deletar a feature flag "${flag.name}"?`)) {
			try {
				await onDelete(flag.id);
				toast.success("Feature flag deletada com sucesso");
			} catch (error) {
				console.error("Error deleting flag:", error);
				toast.error("Erro ao deletar feature flag");
			}
		}
	};

	const isUpdating = updating || localUpdating;

	return (
		<Card className="relative">
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between">
					<div className="flex-1">
						<CardTitle className="text-lg flex items-center gap-2">
							{flag.name}
							<div className="flex gap-1">
								<Badge variant={flag.enabled ? "default" : "secondary"}>{flag.enabled ? "Ativa" : "Inativa"}</Badge>
								{flag.systemCritical && <Badge variant="destructive">Crítica</Badge>}
								{flag.userSpecific && <Badge variant="outline">Por Usuário</Badge>}
							</div>
						</CardTitle>
						<CardDescription className="mt-1">{flag.description}</CardDescription>
					</div>

					<div className="flex items-center gap-2 ml-4">
						{isUpdating && <Loader2 className="h-4 w-4 animate-spin" />}
						<Switch checked={flag.enabled} onCheckedChange={handleToggle} disabled={isUpdating} />
					</div>
				</div>
			</CardHeader>

			<CardContent className="pt-0">
				<div className="space-y-3">
					{/* Rollout Percentage */}
					{flag.rolloutPercentage < 100 && (
						<div className="flex items-center justify-between text-sm">
							<span className="text-muted-foreground">Rollout:</span>
							<Badge variant="outline">{flag.rolloutPercentage}%</Badge>
						</div>
					)}

					{/* User Overrides Count */}
					{flag.userOverrides && flag.userOverrides.length > 0 && (
						<div className="flex items-center justify-between text-sm">
							<span className="text-muted-foreground">Overrides de usuário:</span>
							<Badge variant="outline">{flag.userOverrides.length}</Badge>
						</div>
					)}

					{/* Metadata */}
					{Object.keys(flag.metadata || {}).length > 0 && (
						<div className="text-sm">
							<span className="text-muted-foreground">Metadados:</span>
							<div className="mt-1 text-xs bg-muted p-2 rounded">
								<pre>{JSON.stringify(flag.metadata, null, 2)}</pre>
							</div>
						</div>
					)}

					{/* Action Buttons */}
					<div className="flex items-center gap-2 pt-2 border-t">
						{flag.userSpecific && onUserOverrides && (
							<Button variant="outline" onClick={() => onUserOverrides(flag.id)} className="flex items-center gap-1">
								<Users className="h-3 w-3" />
								Usuários
							</Button>
						)}

						{onMetrics && (
							<Button variant="outline" onClick={() => onMetrics(flag.id)} className="flex items-center gap-1">
								<BarChart3 className="h-3 w-3" />
								Métricas
							</Button>
						)}

						<div className="flex-1" />

						{!flag.systemCritical && onDelete && (
							<Button
								variant="outline"
								onClick={handleDelete}
								className="flex items-center gap-1 text-destructive hover:text-destructive"
							>
								<Trash2 className="h-3 w-3" />
								Deletar
							</Button>
						)}
					</div>

					{/* Timestamps */}
					<div className="text-xs text-muted-foreground pt-2 border-t">
						<div>Criada: {new Date(flag.createdAt).toLocaleString("pt-BR")}</div>
						<div>Atualizada: {new Date(flag.updatedAt).toLocaleString("pt-BR")}</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
