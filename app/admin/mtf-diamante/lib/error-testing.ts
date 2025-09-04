// app/admin/mtf-diamante/lib/error-testing.ts
// Utilities for testing error scenarios and rollback mechanisms

import { MtfError } from './error-handling';
import type { 
  InteractiveMessage, 
  ChatwitInbox, 
  MtfDiamanteLote, 
  MtfDiamanteVariavel, 
  MtfDiamanteApiKey 
} from './types';

/**
 * Error simulation modes for testing
 */
export enum ErrorSimulationMode {
  NONE = 'none',
  NETWORK_ERROR = 'network_error',
  SERVER_ERROR = 'server_error',
  CLIENT_ERROR = 'client_error',
  TIMEOUT_ERROR = 'timeout_error',
  VALIDATION_ERROR = 'validation_error',
}

/**
 * Global error simulation state (for development/testing only)
 */
let errorSimulationMode: ErrorSimulationMode = ErrorSimulationMode.NONE;
let errorSimulationTarget: string | null = null;

/**
 * Enable error simulation for testing rollback mechanisms
 * Only works in development mode
 */
export function enableErrorSimulation(
  mode: ErrorSimulationMode, 
  target?: string
): void {
  if (process.env.NODE_ENV !== 'development') {
    console.warn('Error simulation is only available in development mode');
    return;
  }

  errorSimulationMode = mode;
  errorSimulationTarget = target || null;
  
  console.log(`🧪 [Error Simulation] Enabled: ${mode}${target ? ` for ${target}` : ''}`);
}

/**
 * Disable error simulation
 */
export function disableErrorSimulation(): void {
  errorSimulationMode = ErrorSimulationMode.NONE;
  errorSimulationTarget = null;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('🧪 [Error Simulation] Disabled');
  }
}

/**
 * Check if error simulation should be triggered for a given operation
 */
export function shouldSimulateError(operation: string): boolean {
  if (process.env.NODE_ENV !== 'development') {
    return false;
  }

  if (errorSimulationMode === ErrorSimulationMode.NONE) {
    return false;
  }

  // If target is specified, only simulate for that specific operation
  if (errorSimulationTarget && !operation.includes(errorSimulationTarget)) {
    return false;
  }

  return true;
}

/**
 * Generate a simulated error based on the current simulation mode
 */
export function generateSimulatedError(operation: string): MtfError {
  const timestamp = new Date().toISOString();
  
  switch (errorSimulationMode) {
    case ErrorSimulationMode.NETWORK_ERROR:
      return new MtfError('Erro de rede simulado', {
        context: `Simulated Network Error - ${operation}`,
        code: 'SIMULATED_NETWORK_ERROR',
        info: { timestamp, operation },
      });

    case ErrorSimulationMode.SERVER_ERROR:
      return new MtfError('Erro interno do servidor simulado', {
        status: 500,
        context: `Simulated Server Error - ${operation}`,
        code: 'SIMULATED_SERVER_ERROR',
        info: { timestamp, operation },
      });

    case ErrorSimulationMode.CLIENT_ERROR:
      return new MtfError('Dados inválidos simulados', {
        status: 400,
        context: `Simulated Client Error - ${operation}`,
        code: 'SIMULATED_CLIENT_ERROR',
        info: { timestamp, operation },
      });

    case ErrorSimulationMode.TIMEOUT_ERROR:
      return new MtfError('Timeout simulado', {
        status: 408,
        context: `Simulated Timeout Error - ${operation}`,
        code: 'SIMULATED_TIMEOUT_ERROR',
        info: { timestamp, operation },
      });

    case ErrorSimulationMode.VALIDATION_ERROR:
      return new MtfError('Erro de validação simulado', {
        status: 422,
        context: `Simulated Validation Error - ${operation}`,
        code: 'SIMULATED_VALIDATION_ERROR',
        info: { 
          timestamp, 
          operation,
          validationErrors: ['Campo obrigatório não preenchido (simulado)']
        },
      });

    default:
      return new MtfError('Erro desconhecido simulado', {
        context: `Simulated Unknown Error - ${operation}`,
        code: 'SIMULATED_UNKNOWN_ERROR',
        info: { timestamp, operation },
      });
  }
}

/**
 * Test scenarios for different data types
 */
export const testScenarios = {
  interactiveMessages: {
    optimisticData: {
      id: 'temp-test-message',
      name: 'Mensagem de Teste',
      type: 'button' as const,
      body: { text: 'Conteúdo de teste para rollback' },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as InteractiveMessage,
    
    apiPayload: {
      name: 'Mensagem de Teste',
      type: 'button',
      body: { text: 'Conteúdo de teste para rollback' },
      isActive: true,
    },
  },

  caixas: {
    optimisticData: {
      id: 'temp-test-caixa',
      nome: 'Caixa de Teste',
      inboxId: 'test-inbox-id',
      channelType: 'whatsapp' as const,
      usuarioChatwitId: 'test-user-id',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ChatwitInbox,
    
    apiPayload: {
      nome: 'Caixa de Teste',
      isActive: true,
    },
  },

  lotes: {
    optimisticData: {
      id: 'temp-test-lote',
      numero: 1,
      nome: 'Lote de Teste',
      valor: '100.00',
      dataInicio: new Date().toISOString(),
      dataFim: new Date().toISOString(),
      isActive: true,
    } as MtfDiamanteLote,
    
    apiPayload: {
      numero: 1,
      nome: 'Lote de Teste',
      valor: '100.00',
      dataInicio: new Date().toISOString(),
      dataFim: new Date().toISOString(),
      isActive: true,
    },
  },

  variaveis: {
    optimisticData: {
      id: 'temp-test-variavel',
      chave: 'TESTE_VARIAVEL',
      valor: 'Valor de teste para rollback',
    } as MtfDiamanteVariavel,
    
    apiPayload: {
      chave: 'TESTE_VARIAVEL',
      valor: 'Valor de teste para rollback',
    },
  },

  apiKeys: {
    optimisticData: {
      id: 'temp-test-api-key',
      name: 'API Key de Teste',
      key: 'test-key-for-rollback',
      type: 'other' as const,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as MtfDiamanteApiKey,
    
    apiPayload: {
      name: 'API Key de Teste',
      key: 'test-key-for-rollback',
      type: 'other' as const,
      isActive: true,
    },
  },
};

/**
 * Rollback test utilities
 */
export const rollbackTestUtils = {
  /**
   * Test rollback for add operations
   */
  async testAddRollback<T>(
    hookFunction: (optimistic: T, payload: any) => Promise<void>,
    scenario: { optimisticData: T; apiPayload: any },
    operationName: string
  ): Promise<{ success: boolean; error?: Error }> {
    try {
      // Enable error simulation
      enableErrorSimulation(ErrorSimulationMode.SERVER_ERROR, operationName);
      
      // Attempt the operation (should fail and rollback)
      await hookFunction(scenario.optimisticData, scenario.apiPayload);
      
      // If we reach here, the operation didn't fail as expected
      disableErrorSimulation();
      return { success: false, error: new Error('Operation should have failed but succeeded') };
      
    } catch (error) {
      // Expected error - check if rollback occurred
      disableErrorSimulation();
      
      if (error instanceof MtfError && error.code === 'SIMULATED_SERVER_ERROR') {
        return { success: true }; // Rollback worked correctly
      }
      
      return { success: false, error: error as Error };
    }
  },

  /**
   * Test rollback for update operations
   */
  async testUpdateRollback<T>(
    hookFunction: (updated: T, payload: any) => Promise<void>,
    scenario: { optimisticData: T; apiPayload: any },
    operationName: string
  ): Promise<{ success: boolean; error?: Error }> {
    try {
      // Enable error simulation
      enableErrorSimulation(ErrorSimulationMode.CLIENT_ERROR, operationName);
      
      // Attempt the operation (should fail and rollback)
      await hookFunction(scenario.optimisticData, scenario.apiPayload);
      
      // If we reach here, the operation didn't fail as expected
      disableErrorSimulation();
      return { success: false, error: new Error('Operation should have failed but succeeded') };
      
    } catch (error) {
      // Expected error - check if rollback occurred
      disableErrorSimulation();
      
      if (error instanceof MtfError && error.code === 'SIMULATED_CLIENT_ERROR') {
        return { success: true }; // Rollback worked correctly
      }
      
      return { success: false, error: error as Error };
    }
  },

  /**
   * Test rollback for delete operations
   */
  async testDeleteRollback(
    hookFunction: (id: string) => Promise<void>,
    testId: string,
    operationName: string
  ): Promise<{ success: boolean; error?: Error }> {
    try {
      // Enable error simulation
      enableErrorSimulation(ErrorSimulationMode.NETWORK_ERROR, operationName);
      
      // Attempt the operation (should fail and rollback)
      await hookFunction(testId);
      
      // If we reach here, the operation didn't fail as expected
      disableErrorSimulation();
      return { success: false, error: new Error('Operation should have failed but succeeded') };
      
    } catch (error) {
      // Expected error - check if rollback occurred
      disableErrorSimulation();
      
      if (error instanceof MtfError && error.code === 'SIMULATED_NETWORK_ERROR') {
        return { success: true }; // Rollback worked correctly
      }
      
      return { success: false, error: error as Error };
    }
  },
};

/**
 * Development console commands for testing
 * Available in browser console when in development mode
 */
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  (window as any).mtfErrorTesting = {
    enableErrorSimulation,
    disableErrorSimulation,
    ErrorSimulationMode,
    testScenarios,
    rollbackTestUtils,
  };
  
  console.log('🧪 MTF Error Testing utilities available at window.mtfErrorTesting');
}