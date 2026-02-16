/**
 * Serviço de Controle de Acesso ao Modo Turbo
 *
 * CONCEITO: Modo Turbo é funcionalidade core do sistema.
 * Este serviço controla apenas QUEM tem acesso, não se a funcionalidade existe.
 */

import { getPrismaInstance } from "@/lib/connections";

const prisma = getPrismaInstance();

export interface TurboModeConfig {
	maxParallelLeads: number;
	resourceThreshold: number;
	fallbackOnError: boolean;
}

export class TurboModeAccessService {
	private static readonly DEFAULT_CONFIG: TurboModeConfig = {
		maxParallelLeads: 10,
		resourceThreshold: 80,
		fallbackOnError: true,
	};

	/**
	 * Verifica se o usuário tem acesso ao Modo Turbo
	 */
	static async hasAccess(userId: string): Promise<boolean> {
		try {
			// Verifica o campo direto no modelo User
			const user = await prisma.user.findUnique({
				where: { id: userId },
				select: { turboModeEnabled: true },
			});

			return user?.turboModeEnabled ?? false;
		} catch (error) {
			console.error("[TurboModeAccessService] Erro ao verificar acesso:", error);
			return false;
		}
	}

	/**
	 * Concede acesso ao Modo Turbo para um usuário
	 */
	static async grantAccess(userId: string, grantedBy: string): Promise<void> {
		try {
			// Atualiza o campo direto no modelo User
			await prisma.user.update({
				where: { id: userId },
				data: { turboModeEnabled: true },
			});
		} catch (error) {
			console.error("[TurboModeAccessService] Erro ao conceder acesso:", error);
			throw new Error("Falha ao conceder acesso ao Modo Turbo");
		}
	}

	/**
	 * Remove acesso ao Modo Turbo para um usuário
	 */
	static async revokeAccess(userId: string): Promise<void> {
		try {
			// Atualiza o campo direto no modelo User
			await prisma.user.update({
				where: { id: userId },
				data: { turboModeEnabled: false },
			});
		} catch (error) {
			console.error("[TurboModeAccessService] Erro ao revogar acesso:", error);
			throw new Error("Falha ao revogar acesso ao Modo Turbo");
		}
	}

	/**
	 * Retorna configuração do Modo Turbo
	 * Sempre retorna a configuração padrão, já que é funcionalidade core
	 */
	static getConfig(): TurboModeConfig {
		return { ...this.DEFAULT_CONFIG };
	}

	/**
	 * Retorna se o Modo Turbo está disponível no sistema
	 * Sempre retorna true, pois é funcionalidade core
	 */
	static isSystemAvailable(): boolean {
		return true;
	}
}
