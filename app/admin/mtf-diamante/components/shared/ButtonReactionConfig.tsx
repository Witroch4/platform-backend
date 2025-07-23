'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Smile, X, Settings, Save, Trash2 } from 'lucide-react'
import { EmojiPicker } from './EmojiPicker'
import { toast } from 'sonner'

interface ButtonReaction {
  buttonId: string
  buttonText: string
  emoji?: string
  textReaction?: string
}

interface ButtonReactionConfigProps {
  buttons: Array<{
    id: string
    text: string
  }>
  messageId?: string
  onSave: (reactions: ButtonReaction[]) => Promise<void>
  existingReactions?: ButtonReaction[]
}

export function ButtonReactionConfig({ 
  buttons, 
  messageId, 
  onSave, 
  existingReactions = [] 
}: ButtonReactionConfigProps) {
  const [reactions, setReactions] = useState<ButtonReaction[]>([])
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    // Inicializar reações com botões existentes
    const initialReactions = buttons.map(button => {
      const existing = existingReactions.find(r => r.buttonId === button.id)
      return {
        buttonId: button.id,
        buttonText: button.text,
        emoji: existing?.emoji,
        textReaction: existing?.textReaction
      }
    })
    setReactions(initialReactions)
  }, [buttons, existingReactions])

  const handleEmojiSelect = (buttonId: string, emoji: string) => {
    setReactions(prev => prev.map(reaction => 
      reaction.buttonId === buttonId 
        ? { ...reaction, emoji, textReaction: undefined }
        : reaction
    ))
    setShowEmojiPicker(null)
  }

  const handleTextReactionChange = (buttonId: string, textReaction: string) => {
    setReactions(prev => prev.map(reaction => 
      reaction.buttonId === buttonId 
        ? { ...reaction, textReaction, emoji: undefined }
        : reaction
    ))
  }

  const removeReaction = (buttonId: string) => {
    setReactions(prev => prev.map(reaction => 
      reaction.buttonId === buttonId 
        ? { ...reaction, emoji: undefined, textReaction: undefined }
        : reaction
    ))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const reactionsToSave = reactions.filter(r => r.emoji || r.textReaction)
      await onSave(reactionsToSave)
      toast.success('Reações salvas com sucesso!')
    } catch (error) {
      toast.error('Erro ao salvar reações')
      console.error('Erro ao salvar reações:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const hasReactions = reactions.some(r => r.emoji || r.textReaction)
  const hasChanges = JSON.stringify(reactions) !== JSON.stringify(existingReactions)

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings size={20} />
            Configurar Reações dos Botões
            {hasReactions && (
              <Badge variant="secondary" className="ml-2">
                {reactions.filter(r => r.emoji || r.textReaction).length} configuradas
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Recolher' : 'Expandir'}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          <div className="text-sm text-gray-600 mb-4">
            Configure como o sistema deve reagir quando cada botão for clicado pelos usuários.
          </div>

          {reactions.map((reaction) => (
            <div key={reaction.buttonId} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{reaction.buttonText}</Badge>
                  <span className="text-sm text-gray-500">ID: {reaction.buttonId}</span>
                </div>
                {(reaction.emoji || reaction.textReaction) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeReaction(reaction.buttonId)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 size={16} />
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Botão para selecionar emoji */}
                <Button
                  variant={reaction.emoji ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowEmojiPicker(reaction.buttonId)}
                  className="flex items-center gap-2"
                >
                  <Smile size={16} />
                  {reaction.emoji ? (
                    <>
                      <span className="text-lg">{reaction.emoji}</span>
                      Emoji
                    </>
                  ) : (
                    'Selecionar Emoji'
                  )}
                </Button>

                {/* Input para reação de texto */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Ou digite uma reação de texto..."
                    value={reaction.textReaction || ''}
                    onChange={(e) => handleTextReactionChange(reaction.buttonId, e.target.value)}
                    className="px-3 py-1 border rounded text-sm min-w-[200px]"
                    disabled={!!reaction.emoji}
                  />
                  {reaction.textReaction && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTextReactionChange(reaction.buttonId, '')}
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
              </div>

              {/* Preview da reação */}
              {(reaction.emoji || reaction.textReaction) && (
                <div className="bg-gray-50 p-2 rounded text-sm">
                  <strong>Preview:</strong> Quando clicarem em "{reaction.buttonText}", 
                  o sistema reagirá com: {reaction.emoji || `"${reaction.textReaction}"`}
                </div>
              )}
            </div>
          ))}

          {/* Botões de ação */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setReactions(buttons.map(button => ({
                  buttonId: button.id,
                  buttonText: button.text
                })))
              }}
            >
              Limpar Tudo
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="flex items-center gap-2"
            >
              <Save size={16} />
              {isSaving ? 'Salvando...' : 'Salvar Reações'}
            </Button>
          </div>

          {/* Emoji Picker */}
          {showEmojiPicker && (
            <EmojiPicker
              isOpen={true}
              onEmojiSelect={(emoji) => handleEmojiSelect(showEmojiPicker, emoji)}
              onClose={() => setShowEmojiPicker(null)}
            />
          )}
        </CardContent>
      )}
    </Card>
  )
}