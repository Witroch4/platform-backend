'use client'

import React, { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Smile, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'
import { EmojiPicker } from './EmojiPicker'
import { WhatsAppTextEditor } from './WhatsAppTextEditor'
import { toast } from 'sonner'

interface ButtonReaction {
  buttonId: string
  emoji?: string
  textReaction?: string
}

interface InteractiveButton {
  id: string
  text: string
  type?: string
}

interface InteractivePreviewProps {
  title?: string
  headerText?: string
  headerMedia?: {
    type: 'image' | 'video' | 'document'
    url: string
    filename?: string
  }
  bodyText: string
  footerText?: string
  buttons: InteractiveButton[]
  reactions?: ButtonReaction[]
  onButtonReactionChange?: (buttonId: string, reaction: { emoji?: string; textReaction?: string }) => void
  showReactionConfig?: boolean
  className?: string
}

export function InteractivePreview({
  title,
  headerText,
  headerMedia,
  bodyText,
  footerText,
  buttons,
  reactions = [],
  onButtonReactionChange,
  showReactionConfig = false,
  className = ""
}: InteractivePreviewProps) {
  const { theme } = useTheme()
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null)
  const [showTextEditor, setShowTextEditor] = useState<string | null>(null)
  const [configMode, setConfigMode] = useState(false)

  // Get WhatsApp background based on theme
  const getWhatsAppBackground = () => {
    return theme === 'dark' ? '/fundo_whatsapp_black.jpg' : '/fundo_whatsapp.jpg'
  }

  // Get reaction for a button
  const getButtonReaction = (buttonId: string) => {
    return reactions.find(r => r.buttonId === buttonId)
  }

  // Handle button click in preview mode
  const handleButtonClick = (button: InteractiveButton) => {
    if (!showReactionConfig) {
      // Normal preview mode - just show what would happen
      const reaction = getButtonReaction(button.id)
      if (reaction?.emoji) {
        toast.success(`Reação configurada: ${reaction.emoji}`, {
          description: `Será enviada quando "${button.text}" for clicado`
        })
      } else if (reaction?.textReaction) {
        toast.success(`Mensagem configurada: "${reaction.textReaction}"`, {
          description: `Será enviada quando "${button.text}" for clicado`
        })
      } else {
        toast.info(`Botão "${button.text}" clicado`, {
          description: 'Nenhuma reação configurada para este botão'
        })
      }
      return
    }

    // Config mode - open emoji picker
    if (configMode) {
      setShowEmojiPicker(button.id)
    }
  }

  // Handle emoji selection
  const handleEmojiSelect = (buttonId: string, emoji: string) => {
    if (emoji === 'TEXT_RESPONSE') {
      // Abrir editor de texto
      setShowEmojiPicker(null)
      setShowTextEditor(buttonId)
    } else {
      // Configurar emoji
      onButtonReactionChange?.(buttonId, { emoji, textReaction: '' })
      setShowEmojiPicker(null)
      toast.success(`Emoji ${emoji} configurado para o botão`)
    }
  }

  // Handle text response save
  const handleTextResponseSave = (buttonId: string, text: string) => {
    onButtonReactionChange?.(buttonId, { emoji: '', textReaction: text })
    setShowTextEditor(null)
    toast.success('Resposta de texto configurada para o botão')
  }

  // Remove reaction
  const removeReaction = (buttonId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onButtonReactionChange?.(buttonId, { emoji: '', textReaction: '' })
    toast.success('Reação removida')
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with title and config toggle */}
      {(title || showReactionConfig) && (
        <div className="flex items-center justify-between">
          {title && <h3 className="text-lg font-semibold">{title}</h3>}
          {showReactionConfig && (
            <div className="flex items-center gap-2">
              <Button
                variant={configMode ? "default" : "outline"}
                size="sm"
                onClick={() => setConfigMode(!configMode)}
                className="text-xs"
              >
                <Settings className="h-3 w-3 mr-1" />
                {configMode ? 'Sair do Config' : 'Configurar Reações'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* WhatsApp-style preview */}
      <div className="flex justify-center">
        <div 
          className={cn(
            "whatsapp-preview rounded-lg p-4 max-w-sm w-full",
            "bg-cover bg-center bg-no-repeat min-h-[300px]",
            "relative"
          )}
          style={{
            backgroundImage: `url('${getWhatsAppBackground()}')`
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-md border border-gray-200 dark:border-gray-700">
            
            {/* Header */}
            {headerText && (
              <div className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-100">
                {headerText}
              </div>
            )}

            {/* Header Media */}
            {headerMedia && (
              <div className="mb-2">
                {headerMedia.type === 'image' && (
                  <img 
                    src={headerMedia.url} 
                    alt="Header media" 
                    className="max-w-full h-auto rounded-lg max-h-48 object-cover"
                  />
                )}
                {headerMedia.type === 'video' && (
                  <video 
                    src={headerMedia.url} 
                    controls 
                    className="max-w-full h-auto rounded-lg max-h-48"
                  />
                )}
                {headerMedia.type === 'document' && (
                  <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded">
                    <div className="text-blue-600 dark:text-blue-400">📄</div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {headerMedia.filename || 'Document'}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Body */}
            <div className="text-sm mb-2 text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
              {bodyText}
            </div>

            {/* Footer */}
            {footerText && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                {footerText}
              </div>
            )}

            {/* Buttons */}
            {buttons.length > 0 && (
              <div className="mt-3 space-y-1">
                {buttons.map((button) => {
                  const reaction = getButtonReaction(button.id)
                  const hasReaction = reaction?.emoji || reaction?.textReaction
                  
                  return (
                    <div key={button.id} className="relative">
                      <button
                        onClick={() => handleButtonClick(button)}
                        className={cn(
                          "w-full p-2 text-sm border rounded transition-colors text-left",
                          "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
                          "hover:bg-blue-50 dark:hover:bg-blue-900/20",
                          configMode && showReactionConfig && "ring-2 ring-blue-300 dark:ring-blue-600",
                          hasReaction && "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span>{button.text}</span>
                          <div className="flex items-center gap-1">
                            {reaction?.emoji && (
                              <span className="text-lg">{reaction.emoji}</span>
                            )}
                            {hasReaction && (
                              <Badge variant="secondary" className="text-xs">
                                {reaction?.emoji ? 'Emoji' : 'Texto'}
                              </Badge>
                            )}
                            {configMode && showReactionConfig && (
                              <Smile className="h-3 w-3 opacity-50" />
                            )}
                          </div>
                        </div>
                        {reaction?.textReaction && (
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                            "{reaction.textReaction}"
                          </div>
                        )}
                      </button>

                      {/* Remove reaction button */}
                      {hasReaction && configMode && (
                        <button
                          onClick={(e) => removeReaction(button.id, e)}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Config mode instructions */}
            {configMode && showReactionConfig && (
              <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-700 dark:text-blue-300">
                <Smile className="h-3 w-3 inline mr-1" />
                Clique nos botões para configurar reações com emoji
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <EmojiPicker
          isOpen={true}
          onEmojiSelect={(emoji) => handleEmojiSelect(showEmojiPicker, emoji)}
          onClose={() => setShowEmojiPicker(null)}
        />
      )}

      {/* WhatsApp Text Editor */}
      {showTextEditor && (
        <WhatsAppTextEditor
          onSave={(text) => handleTextResponseSave(showTextEditor, text)}
          onClose={() => setShowTextEditor(null)}
          placeholder="Digite a resposta que será enviada quando este botão for clicado..."
        />
      )}
    </div>
  )
}