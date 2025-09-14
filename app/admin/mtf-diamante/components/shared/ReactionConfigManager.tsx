'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from '@/components/ui/dialog'
import { 
  Smile, 
  MessageSquare, 
  X, 
  Save, 
  Trash2, 
  Zap,
  AlertCircle 
} from 'lucide-react'
import { EmojiPicker } from './EmojiPicker'
import { WhatsAppTextEditor } from './WhatsAppTextEditor'
import { toast } from 'sonner'

// Types based on the design document
type ReactionType = 'emoji' | 'text'

interface Reaction {
  type: ReactionType
  value: string
}

interface ButtonReaction {
  buttonId: string
  reaction?: Reaction
}

interface ReactionConfigManagerProps {
  buttonId: string
  buttonText: string
  currentReaction?: ButtonReaction
  onReactionChange: (reaction: ButtonReaction) => void
  onReactionRemove: () => void
  isOpen: boolean
  onClose: () => void
}

export function ReactionConfigManager({
  buttonId,
  buttonText,
  currentReaction,
  onReactionChange,
  onReactionRemove,
  isOpen,
  onClose
}: ReactionConfigManagerProps) {
  const [selectedType, setSelectedType] = useState<ReactionType | null>(null)
  const [reactionValue, setReactionValue] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showTextEditor, setShowTextEditor] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  // Initialize state from current reaction
  useEffect(() => {
    if (isOpen) {
      console.log('🔍 [ReactionConfigManager] Inicializando estado:', {
        currentReaction,
        hasReaction: !!currentReaction?.reaction,
        reactionType: currentReaction?.reaction?.type,
        reactionValue: currentReaction?.reaction?.value,
        isOpen
      });

      if (currentReaction?.reaction) {
        setSelectedType(currentReaction.reaction.type)
        setReactionValue(currentReaction.reaction.value || '')
      } else {
        setSelectedType(null)
        setReactionValue('')
      }
      setErrors([])
    }
  }, [currentReaction, isOpen])

  // Validation
  const validateReaction = (): boolean => {
    const newErrors: string[] = []

    if (selectedType && !reactionValue.trim()) {
      newErrors.push('Reaction value is required')
    }

    if (selectedType === 'emoji' && reactionValue.length > 2) {
      newErrors.push('Please select a single emoji')
    }

    if (selectedType === 'text' && reactionValue.length > 1000) {
      newErrors.push('Text reaction cannot exceed 1000 characters')
    }

    setErrors(newErrors)
    return newErrors.length === 0
  }

  // Handle reaction type selection
  const handleTypeSelection = (type: ReactionType) => {
    setSelectedType(type)
    setErrors([])

    if (type === 'emoji') {
      setReactionValue('')
      setShowEmojiPicker(true)
    } else if (type === 'text') {
      // Manter valor existente se já houver uma reação de texto
      if (!(currentReaction?.reaction?.type === 'text' && reactionValue)) {
        setReactionValue('')
      }
      setShowTextEditor(true)
    }
  }

  // Handle emoji selection
  const handleEmojiSelect = (emoji: string) => {
    if (emoji === 'TEXT_RESPONSE') {
      // User clicked "Responder com Texto" button in emoji picker
      setSelectedType('text')
      setReactionValue('')
      setShowEmojiPicker(false)
      setShowTextEditor(true)
    } else {
      setReactionValue(emoji)
      setShowEmojiPicker(false)
    }
  }

  // Handle text editor save
  const handleTextSave = (text: string) => {
    console.log('💾 [ReactionConfigManager] Salvando texto:', {
      text,
      currentReactionValue: reactionValue,
      selectedType
    });
    setReactionValue(text)
    setShowTextEditor(false)
  }

  // Save reaction
  const handleSave = () => {
    if (!validateReaction()) {
      return
    }

    if (selectedType && reactionValue.trim()) {
      const reaction: ButtonReaction = {
        buttonId,
        reaction: {
          type: selectedType,
          value: reactionValue.trim()
        }
      }
      onReactionChange(reaction)
      toast.success('Reaction configured successfully!')
    }
    
    onClose()
  }

  // Remove reaction
  const handleRemove = () => {
    onReactionRemove()
    setSelectedType(null)
    setReactionValue('')
    setErrors([])
    toast.success('Reaction removed successfully!')
    onClose()
  }

  // Reset to initial state
  const handleReset = () => {
    if (currentReaction?.reaction) {
      setSelectedType(currentReaction.reaction.type)
      setReactionValue(currentReaction.reaction.value)
    } else {
      setSelectedType(null)
      setReactionValue('')
    }
    setErrors([])
  }

  const hasReaction = currentReaction?.reaction !== undefined
  const hasChanges = selectedType !== (currentReaction?.reaction?.type || null) || 
                   reactionValue !== (currentReaction?.reaction?.value || '')

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Configure Automatic Reaction
            </DialogTitle>
            <DialogDescription>
              Set up automatic reactions that will be sent when users click this button
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Button Info */}
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Badge variant="outline">{buttonText}</Badge>
              <span className="text-sm text-muted-foreground">
                Configure what happens when users click this button
              </span>
            </div>

            {/* Current Reaction Display */}
            {hasReaction && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    Current Reaction
                    <Badge variant="secondary" className="text-xs">
                      {currentReaction.reaction?.type}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    {currentReaction.reaction?.type === 'emoji' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{currentReaction.reaction.value}</span>
                        <span className="text-sm text-muted-foreground">
                          Will react with this emoji
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-blue-500" />
                        <span className="text-sm">
                          "{currentReaction.reaction?.value}"
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reaction Type Selection */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Choose Reaction Type</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={selectedType === 'emoji' ? 'default' : 'outline'}
                  className="h-auto p-4 flex flex-col items-center gap-2"
                  onClick={() => handleTypeSelection('emoji')}
                >
                  <Smile className="h-6 w-6" />
                  <div className="text-center">
                    <div className="font-medium">React with Emoji</div>
                    <div className="text-xs text-muted-foreground">
                      Send an emoji reaction
                    </div>
                  </div>
                </Button>

                <Button
                  variant={selectedType === 'text' ? 'default' : 'outline'}
                  className="h-auto p-4 flex flex-col items-center gap-2"
                  onClick={() => handleTypeSelection('text')}
                >
                  <MessageSquare className="h-6 w-6" />
                  <div className="text-center">
                    <div className="font-medium">React with Text</div>
                    <div className="text-xs text-muted-foreground">
                      Send a text message
                    </div>
                  </div>
                </Button>
              </div>
            </div>

            {/* Selected Reaction Preview */}
            {selectedType && reactionValue && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Reaction Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="text-sm text-green-800 dark:text-green-200">
                      <strong>When users click "{buttonText}":</strong>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {selectedType === 'emoji' ? (
                        <>
                          <span className="text-xl">{reactionValue}</span>
                          <span className="text-sm text-green-700 dark:text-green-300">
                            Emoji reaction will be sent
                          </span>
                        </>
                      ) : (
                        <>
                          <MessageSquare className="h-4 w-4 text-green-600" />
                          <span className="text-sm text-green-700 dark:text-green-300">
                            Text message: "{reactionValue}"
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Validation Errors */}
            {errors.length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                <div className="text-sm text-red-800 dark:text-red-200">
                  {errors.map((error, index) => (
                    <div key={index}>{error}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between">
            <div className="flex gap-2">
              {hasReaction && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRemove}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove Reaction
                </Button>
              )}
              {hasChanges && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                >
                  Reset
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                onClick={handleSave}
                disabled={!selectedType || !reactionValue.trim() || errors.length > 0}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Save Reaction
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Emoji Picker Modal */}
      {showEmojiPicker && (
        <EmojiPicker
          isOpen={true}
          onEmojiSelect={handleEmojiSelect}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}

      {/* Text Editor Modal */}
      {showTextEditor && (
        <WhatsAppTextEditor
          onSave={handleTextSave}
          onClose={() => setShowTextEditor(false)}
          initialText={reactionValue}
          placeholder="Enter your automatic text response..."
          maxLength={1000}
          showPreview={true}
          key={`text-editor-${reactionValue}-${Date.now()}`} // Force re-render
        />
      )}
    </>
  )
}