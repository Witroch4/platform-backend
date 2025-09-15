'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Smile, Trash2, Save, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { ButtonReactionPicker } from './ButtonReactionPicker'

interface ButtonReaction {
  buttonId: string
  buttonText: string
  emoji?: string
  textReaction?: string
}

interface ButtonEmojiMapperProps {
  messageId?: string
  inboxId?: string
  buttons: Array<{
    id: string
    text: string
    type?: string
  }>
  onReactionsChange?: (reactions: ButtonReaction[]) => void
  showSaveButton?: boolean
  className?: string
}

export function ButtonEmojiMapper({
  messageId,
  inboxId,
  buttons,
  onReactionsChange,
  showSaveButton = true,
  className = ""
}: ButtonEmojiMapperProps) {
  const [reactions, setReactions] = useState<ButtonReaction[]>([])
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Carregar reações existentes
  useEffect(() => {
    if (messageId) {
      loadExistingReactions()
    } else {
      // Inicializar com botões vazios
      initializeReactions()
    }
  }, [messageId, buttons])

  const loadExistingReactions = async () => {
    if (!messageId) return
    
    try {
      setLoading(true)
      const response = await fetch(`/api/admin/mtf-diamante/button-reactions?messageId=${messageId}`)
      
      if (response.ok) {
        const data = await response.json()
        const existingReactions = data.reactions || []
        
        // Combinar com botões atuais
        const combinedReactions = buttons.map(button => {
          const existing = existingReactions.find((r: any) => r.buttonId === button.id)
          return {
            buttonId: button.id,
            buttonText: button.text,
            emoji: existing?.emoji || '',
            textReaction: existing?.textReaction || ''
          }
        })
        
        setReactions(combinedReactions)
        onReactionsChange?.(combinedReactions)
      }
    } catch (error) {
      console.error('Erro ao carregar reações:', error)
    } finally {
      setLoading(false)
    }
  }

  const initializeReactions = () => {
    const initialReactions = buttons.map(button => ({
      buttonId: button.id,
      buttonText: button.text,
      emoji: '',
      textReaction: ''
    }))
    setReactions(initialReactions)
    onReactionsChange?.(initialReactions)
  }

  const updateReaction = (buttonId: string, updates: Partial<ButtonReaction>) => {
    const updatedReactions = reactions.map(reaction => 
      reaction.buttonId === buttonId 
        ? { ...reaction, ...updates }
        : reaction
    )
    setReactions(updatedReactions)
    onReactionsChange?.(updatedReactions)
  }

  const removeReaction = (buttonId: string) => {
    updateReaction(buttonId, { emoji: '', textReaction: '' })
  }

  const handleEmojiSelect = (buttonId: string, emoji: string) => {
    updateReaction(buttonId, { emoji, textReaction: '' })
    setShowEmojiPicker(null)
  }

  const saveReactions = async () => {
    if (!messageId) {
      toast.error('ID da mensagem é necessário para salvar')
      return
    }

    try {
      setSaving(true)
      
      // Filtrar apenas reações que têm emoji ou texto
      const validReactions = reactions.filter(r => r.emoji || r.textReaction)
      
      const response = await fetch('/api/admin/mtf-diamante/button-reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          reactions: validReactions
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Erro ao salvar reações')
      }

      toast.success('Reações configuradas com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar reações:', error)
      toast.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center">Carregando configurações...</div>
        </CardContent>
      </Card>
    )
  }

  if (buttons.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <Smile className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhum botão disponível para configurar reações</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smile className="h-5 w-5" />
          Configurar Reações dos Botões
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure emojis ou mensagens de texto que serão enviadas quando cada botão for clicado
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {reactions.map((reaction, index) => (
          <div key={reaction.buttonId} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  Botão {index + 1}
                </Badge>
                <span className="font-medium">{reaction.buttonText}</span>
              </div>
              {(reaction.emoji || reaction.textReaction) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeReaction(reaction.buttonId)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-4">
              {/* Configuração de Emoji */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Reação com Emoji</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowEmojiPicker(reaction.buttonId)}
                    className="min-w-[100px] justify-start"
                  >
                    {reaction.emoji ? (
                      <span className="text-lg mr-2">{reaction.emoji}</span>
                    ) : (
                      <Smile className="h-4 w-4 mr-2" />
                    )}
                    {reaction.emoji ? 'Alterar' : 'Escolher'} Emoji
                  </Button>
                  {reaction.emoji && (
                    <span className="text-2xl">{reaction.emoji}</span>
                  )}
                </div>
              </div>

              {/* Configuração de Texto */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Reação com Texto</Label>
                <Input
                  placeholder="Ex: Obrigado pela escolha!"
                  value={reaction.textReaction || ''}
                  onChange={(e) => updateReaction(reaction.buttonId, { 
                    textReaction: e.target.value,
                    emoji: e.target.value ? '' : reaction.emoji // Limpar emoji se texto for definido
                  })}
                  disabled={!!reaction.emoji}
                />
                {reaction.emoji && (
                  <p className="text-xs text-muted-foreground">
                    Desative o emoji para usar reação de texto
                  </p>
                )}
              </div>
            </div>

            {index < reactions.length - 1 && <Separator />}
          </div>
        ))}

        {showSaveButton && messageId && (
          <div className="flex justify-end pt-4 border-t">
            <Button 
              onClick={saveReactions}
              disabled={saving}
              className="min-w-[120px]"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Reações
                </>
              )}
            </Button>
          </div>
        )}

        {/* Emoji Picker */}
        {showEmojiPicker && (
          <ButtonReactionPicker
            isOpen={true}
            onEmojiSelect={(emoji) => handleEmojiSelect(showEmojiPicker, emoji)}
            onClose={() => setShowEmojiPicker(null)}
            inboxId={inboxId}
          />
        )}
      </CardContent>
    </Card>
  )
}