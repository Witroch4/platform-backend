'use client'

import useSWR from 'swr'
import { useCallback } from 'react'
import { toast } from 'sonner'

interface ButtonReaction {
  id: string
  buttonId: string
  actionType: string
  actionPayload: {
    emoji?: string
    textReaction?: string
    action?: string
  }
  description?: string
  inboxId: string
  createdAt: string
  updatedAt: string
}

interface UseInboxButtonReactionsOptions {
  inboxId: string | null
  paused?: boolean
}

export function useInboxButtonReactions({ inboxId, paused = false }: UseInboxButtonReactionsOptions) {
  // SWR key - null when paused or no inboxId
  // Use the unified API with reactionsOnly=true to get only reactions in the same format
  const key = !paused && inboxId ? `/api/admin/mtf-diamante/messages-with-reactions?inboxId=${inboxId}&reactionsOnly=true` : null
  
  // Debug logs (desenvolvimento apenas)
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 [useInboxButtonReactions] Hook called:', { inboxId, paused, key })
  }

  const { data, error, mutate, isLoading } = useSWR(
    key,
    async (url: string) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('🌐 [useInboxButtonReactions] Fetching from:', url)
      }
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Erro ao carregar reações: ${response.status}`)
      }
      const result = await response.json()
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ [useInboxButtonReactions] Fetched data:', result)
      }
      
      // Return the reactions directly from the unified API response
      return result.reactions || []
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: 0, // Don't auto-refresh
      errorRetryCount: 3,
      errorRetryInterval: 2000,
    }
  )

  // Add button reaction
  const addButtonReaction = useCallback(async (reactionData: Omit<ButtonReaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!inboxId) throw new Error('Inbox ID é obrigatório')

    try {
      // Note: For now, use the old endpoint for CRUD operations
      // TODO: Create a dedicated endpoint for reaction-only operations or extend messages-with-reactions
      const response = await fetch('/api/admin/mtf-diamante/button-reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...reactionData,
          inboxId
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Erro ao adicionar reação')
      }

      const result = await response.json()
      
      // Optimistic update
      await mutate()
      
      toast.success('Reação adicionada com sucesso!')
      return result.reaction
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar reação')
      throw error
    }
  }, [inboxId, mutate])

  // Update button reaction
  const updateButtonReaction = useCallback(async (reactionId: string, updates: Partial<ButtonReaction>) => {
    try {
      // Note: For now, use the old endpoint for CRUD operations
      // TODO: Create a dedicated endpoint for reaction-only operations or extend messages-with-reactions
      const response = await fetch(`/api/admin/mtf-diamante/button-reactions/${reactionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Erro ao atualizar reação')
      }

      const result = await response.json()
      
      // Optimistic update
      await mutate()
      
      toast.success('Reação atualizada com sucesso!')
      return result.reaction
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar reação')
      throw error
    }
  }, [mutate])

  // Delete button reaction
  const deleteButtonReaction = useCallback(async (reactionId: string) => {
    try {
      // Note: For now, use the old endpoint for CRUD operations
      // TODO: Create a dedicated endpoint for reaction-only operations or extend messages-with-reactions
      const response = await fetch(`/api/admin/mtf-diamante/button-reactions/${reactionId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Erro ao excluir reação')
      }

      // Optimistic update
      await mutate()
      
      toast.success('Reação excluída com sucesso!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir reação')
      throw error
    }
  }, [mutate])

  return {
    reactions: data || [],
    isLoading,
    error,
    mutate,
    addButtonReaction,
    updateButtonReaction,
    deleteButtonReaction
  }
}
