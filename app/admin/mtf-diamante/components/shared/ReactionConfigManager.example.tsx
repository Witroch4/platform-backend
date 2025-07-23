'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Zap, Settings } from 'lucide-react'
import { ReactionConfigManager } from './ReactionConfigManager'

// Example usage of ReactionConfigManager component
export function ReactionConfigManagerExample() {
  const [isOpen, setIsOpen] = useState(false)
  const [reactions, setReactions] = useState<Record<string, any>>({})

  // Example buttons
  const buttons = [
    { id: 'btn-1', text: 'Yes, I agree' },
    { id: 'btn-2', text: 'No, thanks' },
    { id: 'btn-3', text: 'Tell me more' }
  ]

  const [selectedButton, setSelectedButton] = useState<{ id: string; text: string } | null>(null)

  const handleReactionChange = (reaction: any) => {
    setReactions(prev => ({
      ...prev,
      [reaction.buttonId]: reaction
    }))
  }

  const handleReactionRemove = () => {
    if (selectedButton) {
      setReactions(prev => {
        const updated = { ...prev }
        delete updated[selectedButton.id]
        return updated
      })
    }
  }

  const openReactionConfig = (button: { id: string; text: string }) => {
    setSelectedButton(button)
    setIsOpen(true)
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            ReactionConfigManager Example
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This example demonstrates how to use the ReactionConfigManager component 
            to configure automatic reactions for interactive message buttons.
          </p>

          <div className="space-y-3">
            <h3 className="font-medium">Interactive Message Buttons:</h3>
            {buttons.map((button) => {
              const hasReaction = reactions[button.id]
              return (
                <div key={button.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{button.text}</Badge>
                    {hasReaction && (
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-yellow-500" />
                        <span className="text-xs text-muted-foreground">
                          {hasReaction.reaction?.type === 'emoji' 
                            ? `Reacts with ${hasReaction.reaction.value}`
                            : `Sends: "${hasReaction.reaction?.value}"`
                          }
                        </span>
                      </div>
                    )}
                  </div>
                  <Button
                    variant={hasReaction ? "default" : "outline"}
                    size="sm"
                    onClick={() => openReactionConfig(button)}
                    className="flex items-center gap-2"
                  >
                    <Zap className="h-4 w-4" />
                    {hasReaction ? 'Edit Reaction' : 'Add Reaction'}
                  </Button>
                </div>
              )
            })}
          </div>

          {Object.keys(reactions).length > 0 && (
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Configured Reactions:</h4>
              <pre className="text-xs overflow-auto">
                {JSON.stringify(reactions, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ReactionConfigManager Modal */}
      {selectedButton && (
        <ReactionConfigManager
          buttonId={selectedButton.id}
          buttonText={selectedButton.text}
          currentReaction={reactions[selectedButton.id]}
          onReactionChange={handleReactionChange}
          onReactionRemove={handleReactionRemove}
          isOpen={isOpen}
          onClose={() => {
            setIsOpen(false)
            setSelectedButton(null)
          }}
        />
      )}
    </div>
  )
}