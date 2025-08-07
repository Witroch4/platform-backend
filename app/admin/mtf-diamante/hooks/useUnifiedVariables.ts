import { useState, useEffect, useCallback } from 'react';

export interface UnifiedVariable {
  id: string;
  chave: string;
  valor: string;
  valorRaw?: string;
  tipo: 'normal' | 'lote';
  descricao: string;
  displayName: string;
  isActive?: boolean;
  loteData?: {
    id: string;
    numero: number;
    nome: string;
    valor: string;
    dataInicio: string;
    dataFim: string;
  } | null;
}

interface UseUnifiedVariablesReturn {
  variables: UnifiedVariable[];
  loading: boolean;
  error: string | null;
  refreshVariables: () => Promise<void>;
  insertVariable: (chave: string, position?: number) => void;
}

export const useUnifiedVariables = (
  accountId: string,
  onInsert?: (text: string, position?: number) => void
): UseUnifiedVariablesReturn => {
  const [variables, setVariables] = useState<UnifiedVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVariables = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/admin/mtf-diamante/variaveis`);
      
      if (!response.ok) {
        throw new Error('Erro ao carregar variáveis');
      }

      const data = await response.json();
      
      if (data.success && Array.isArray(data.variaveis)) {
        // Incluir tanto variáveis normais quanto o lote ativo
        setVariables(data.variaveis);
      } else {
        throw new Error('Formato de resposta inválido');
      }
    } catch (err) {
      console.error('Erro ao buscar variáveis:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  const insertVariable = useCallback((chave: string, position?: number) => {
    const variable = variables.find(v => v.chave === chave);
    if (variable && onInsert) {
      // Para lotes, usar o valor humanizado
      const textToInsert = variable.tipo === 'lote' 
        ? `{{${chave}}}` // Placeholder que será substituído pelo worker
        : `{{${chave}}}`;
      
      onInsert(textToInsert, position);
    }
  }, [variables, onInsert]);

  const refreshVariables = useCallback(async () => {
    await fetchVariables();
  }, [fetchVariables]);

  useEffect(() => {
    fetchVariables();
  }, [fetchVariables]);

  return {
    variables,
    loading,
    error,
    refreshVariables,
    insertVariable
  };
};