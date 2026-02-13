import { useCallback, useMemo, useRef } from 'react';

// Custom debounce hook
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout>(undefined);

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]) as T;
}

export function useOptimizedValidation(
  validateFunction: (value: any) => boolean,
  debounceMs: number = 300
) {
  
  // Debounced validation function
  const debouncedValidate = useDebouncedCallback(
    validateFunction,
    debounceMs
  );

  // Memoized validation checker
  const isValid = useCallback((value: any) => {
    // Quick validation for empty values
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return false;
    }
    
    return validateFunction(value);
  }, [validateFunction]);

  return {
    validate: debouncedValidate,
    isValid,
  };
}

export function useReactionsOptimization() {
  
  // Memoized empty check
  const hasReactions = useCallback((reactions: any[]) => {
    return reactions && reactions.length > 0;
  }, []);

  // Optimized reaction processor
  const processReactions = useCallback((reactions: any[]) => {
    if (!hasReactions(reactions)) {
      return [];
    }

    return reactions.filter(r => 
      r.emoji || 
      r.textResponse || 
      r.textReaction || 
      r.action
    );
  }, [hasReactions]);

  return {
    hasReactions,
    processReactions,
  };
}
