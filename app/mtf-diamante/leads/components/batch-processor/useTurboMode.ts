/**
 * TURBO Mode Hook - SIMPLIFICADO PARA CORRIGIR ERROS
 *
 * NOVA FILOSOFIA: Modo Turbo é funcionalidade core sempre disponível.
 * Este hook verifica apenas se o usuário tem ACESSO.
 */

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

function parsePositiveInteger(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface TurboModeConfig {
	maxParallelLeads: number;
	resourceThreshold: number;
	fallbackOnError: boolean;
}

export interface TurboModeMetrics {
	totalLeads: number;
	parallelProcessed: number;
	sequentialProcessed: number;
	timeSaved: number;
	errorRate: number;
	averageProcessingTime: number;
}

export interface UseTurboModeReturn {
	turboModeEnabled: boolean;
	turboModeAvailable: boolean;
	hasAccess: boolean;
	turboModeConfig: TurboModeConfig;
	turboModeMetrics: TurboModeMetrics | null;
	checkTurboModeAccess: () => Promise<void>;
	checkAccess: () => Promise<void>;
	startTurboSession: (leadIds: string[]) => Promise<string | null>;
	endTurboSession: (sessionId: string, metrics?: TurboModeMetrics) => Promise<void>;
	updateMetrics: (metrics: Partial<TurboModeMetrics>) => Promise<void>;
	isLoading: boolean;
	error: string | null;
}

export function useTurboMode(): UseTurboModeReturn {
	const { data: session } = useSession();
	const [turboModeEnabled, setTurboModeEnabled] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const turboModeConfig: TurboModeConfig = {
		maxParallelLeads: parsePositiveInteger(process.env.NEXT_PUBLIC_OAB_EVAL_BATCH_DISPATCH_CONCURRENCY, 10),
		resourceThreshold: 80,
		fallbackOnError: true,
	};

	const checkTurboModeAccess = async () => {
		if (!session?.user?.id) return;

		setIsLoading(true);
		try {
			const response = await fetch(`/api/admin/users/${session.user.id}`);
			if (response.ok) {
				const data = await response.json();
				setTurboModeEnabled(data.user?.turboModeEnabled || false);
			}
		} catch (err) {
			setError("Erro ao verificar acesso");
		} finally {
			setIsLoading(false);
		}
	};

	const startTurboSession = async (leadIds: string[]): Promise<string | null> => {
		// Implementação simplificada
		return "session-" + Date.now();
	};

	const endTurboSession = async (sessionId: string, metrics?: TurboModeMetrics): Promise<void> => {
		// Implementação simplificada
	};

	const updateMetrics = async (metrics: Partial<TurboModeMetrics>): Promise<void> => {
		// Implementação simplificada
	};

	useEffect(() => {
		if (session?.user?.id) {
			checkTurboModeAccess();
		}
	}, [session?.user?.id]);

	return {
		turboModeEnabled,
		turboModeAvailable: true, // Sempre disponível
		hasAccess: turboModeEnabled,
		turboModeConfig,
		turboModeMetrics: null,
		checkTurboModeAccess,
		checkAccess: checkTurboModeAccess,
		startTurboSession,
		endTurboSession,
		updateMetrics,
		isLoading,
		error,
	};
}
