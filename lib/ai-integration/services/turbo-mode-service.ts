/**
 * ❌ ARQUIVO DEPRECIADO - DUPLICAÇÃO DESNECESSÁRIA
 *
 * MOTIVO: TURBO Mode é funcionalidade core do sistema, não feature flag.
 * O controle de acesso é feito diretamente via lib/turbo-mode/user-access-service.ts
 *
 * MIGRAÇÃO: Use TurboModeAccessService em vez desta classe.
 *
 * NOVA FILOSOFIA:
 * ❌ Antes: FeatureFlag Global → UserOverride → Funcionalidade
 * ✅ Agora: Controle de Acesso → Funcionalidade (sempre disponível)
 */

import { TurboModeAccessService } from "@/lib/turbo-mode/user-access-service";

console.warn("❌ ARQUIVO DEPRECIADO: lib/ai-integration/services/turbo-mode-service.ts");
console.warn("🔄 USE: lib/turbo-mode/user-access-service.ts");

// Interfaces mantidas para compatibilidade temporária
export interface TurboModeConfig {
	enabled: boolean;
	maxParallelLeads: number;
	fallbackOnError: boolean;
	resourceThreshold: number;
	userId?: string;
	accountId: number;
}

export interface TurboModeEligibility {
	eligible: boolean;
	reason: string;
	config?: TurboModeConfig;
}

export interface TurboModeMetrics {
	totalLeads: number;
	parallelProcessed: number;
	sequentialProcessed: number;
	timeSaved: number;
	errorRate: number;
	averageProcessingTime: number;
}

/**
 * @deprecated Use TurboModeAccessService from lib/turbo-mode/user-access-service.ts
 */
export class TurboModeService {
	constructor() {
		console.warn("❌ TurboModeService depreciado. Use TurboModeAccessService.");
	}

	/**
	 * @deprecated Use TurboModeAccessService.hasAccess()
	 */
	async isEnabled(userId: string): Promise<boolean> {
		return TurboModeAccessService.hasAccess(userId);
	}

	/**
	 * @deprecated Use TurboModeAccessService.getConfig()
	 */
	getConfig(): TurboModeConfig {
		const config = TurboModeAccessService.getConfig();
		return {
			enabled: true, // Sempre ativo no sistema
			accountId: 0, // Não usado mais
			...config,
		};
	}
}
