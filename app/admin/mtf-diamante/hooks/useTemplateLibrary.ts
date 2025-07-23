import { useState, useEffect, useCallback } from 'react';
import type { TemplateLibraryWithCreator, CreateTemplateLibraryData } from '@/app/lib/template-library-service';

export interface UseTemplateLibraryOptions {
  type?: 'template' | 'interactive_message';
  scope?: 'global' | 'account_specific';
  category?: string;
  search?: string;
  autoFetch?: boolean;
}

export interface TemplateLibraryHook {
  templates: TemplateLibraryWithCreator[];
  loading: boolean;
  error: string | null;
  fetchTemplates: () => Promise<void>;
  createTemplate: (data: Omit<CreateTemplateLibraryData, 'createdById'>) => Promise<void>;
  updateTemplate: (id: string, updates: Partial<CreateTemplateLibraryData>) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  requestApproval: (templateId: string, requestMessage?: string, customVariables?: Record<string, string>) => Promise<void>;
  useInteractiveMessage: (messageId: string, variables: Record<string, string>) => Promise<any>;
}

export function useTemplateLibrary(options: UseTemplateLibraryOptions = {}): TemplateLibraryHook {
  const [templates, setTemplates] = useState<TemplateLibraryWithCreator[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      
      if (options.type) params.append('type', options.type);
      if (options.scope) params.append('scope', options.scope);
      if (options.category) params.append('category', options.category);
      if (options.search) params.append('search', options.search);

      const response = await fetch(`/api/admin/mtf-diamante/template-library?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }

      const data = await response.json();
      setTemplates(data.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [options.type, options.scope, options.category, options.search]);

  const createTemplate = useCallback(async (data: Omit<CreateTemplateLibraryData, 'createdById'>) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/mtf-diamante/template-library', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create template');
      }

      // Refresh templates after creation
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchTemplates]);

  const updateTemplate = useCallback(async (id: string, updates: Partial<CreateTemplateLibraryData>) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/mtf-diamante/template-library/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update template');
      }

      // Refresh templates after update
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchTemplates]);

  const deleteTemplate = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/mtf-diamante/template-library/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete template');
      }

      // Refresh templates after deletion
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchTemplates]);

  const requestApproval = useCallback(async (
    templateId: string, 
    requestMessage?: string, 
    customVariables?: Record<string, string>
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/mtf-diamante/template-library/approval', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateId,
          requestMessage,
          customVariables,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to request approval');
      }

      // Refresh templates to update approval status
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchTemplates]);

  const useInteractiveMessage = useCallback(async (
    messageId: string, 
    variables: Record<string, string>
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/mtf-diamante/template-library/use-interactive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId,
          variables,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to use interactive message');
      }

      const result = await response.json();
      
      // Refresh templates to update usage count
      await fetchTemplates();
      
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchTemplates]);

  // Auto-fetch on mount and when options change
  useEffect(() => {
    if (options.autoFetch !== false) {
      fetchTemplates();
    }
  }, [fetchTemplates, options.autoFetch]);

  return {
    templates,
    loading,
    error,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    requestApproval,
    useInteractiveMessage,
  };
}