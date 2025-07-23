'use client'

import type React from 'react'
import { useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  ChevronLeft, 
  ChevronRight, 
  Settings, 
  Type, 
  FileText, 
  Image, 
  Video, 
  AlertCircle,
  AlertTriangle,
  Info
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// Import existing components
import { InteractivePreview } from '../shared/InteractivePreview'
import { WhatsAppTextEditor } from '../shared/WhatsAppTextEditor'
import { ButtonManager } from '../shared/ButtonManager'
import { ReactionConfigManager } from '../shared/ReactionConfigManager'
import { MediaUploadComponent } from '../shared/MediaUploadComponent'

// Import validation and error handling
import { useInteractiveMessageValidation } from '../../hooks/useInteractiveMessageValidation'
import { errorHandler } from '@/lib/error-handling/interactive-message-errors'

// Import types
import type { 
  InteractiveMessage, 
  InteractiveMessageType,
  MessageHeader,
  HeaderType,
  QuickReplyButton,
  ButtonReaction
} from '@/types/interactive-messages'

interface UnifiedEditingStepProps {
  message: InteractiveMessage
  reactions: ButtonReaction[]
  onMessageUpdate: (updates: Partial<InteractiveMessage>) => void
  onReactionUpdate: (buttonId: string, reaction: Partial<ButtonReaction>) => void
  onNext: () => void
  onBack: () => void
  disabled?: boolean
  className?: string
}

interface ValidationErrors {
  name?: string[]
  header?: string[]
  body?: string[]
  footer?: string[]
  buttons?: string[]
  general?: string[]
}

// Validation constants
const VALIDATION_LIMITS = {
  NAME_MAX_LENGTH: 100,
  HEADER_TEXT_MAX_LENGTH: 60,
  BODY_TEXT_MAX_LENGTH: 1024,
  FOOTER_TEXT_MAX_LENGTH: 60,
  BUTTON_MAX_COUNT: 3,
} as const

export const UnifiedEditingStep: React.FC<UnifiedEditingStepProps> = ({
  message,
  reactions,
  onMessageUpdate,
  onReactionUpdate,
  onNext,
  onBack,
  disabled = false,
  className
}) => {
  const [reactionConfigButton, setReactionConfigButton] = useState<string | null>(null)
  const [showTextEditor, setShowTextEditor] = useState<'body' | 'footer' | null>(null)

  // Use the new validation hook
  const {
    validationState,
    validateField,
    isFieldValid,
    getFieldErrors,
    getFieldWarnings,
    canProceed,
    handleValidationError
  } = useInteractiveMessageValidation(message, reactions, {
    enableRealTimeValidation: true,
    debounceMs: 300,
    validateOnMount: false
  })

  // Extract buttons from message action
  const buttons = useMemo(() => {
    if (message.action?.type === 'button') {
      return message.action.buttons || []
    }
    return []
  }, [message.action])

  // Helper function to get error messages from validation errors
  const getErrorMessages = useCallback((fieldName: string): string[] => {
    const errors = getFieldErrors(fieldName)
    return errors.map(error => error.message)
  }, [getFieldErrors])

  // Helper function to get warning messages from validation errors
  const getWarningMessages = useCallback((fieldName: string): string[] => {
    const warnings = getFieldWarnings(fieldName)
    return warnings.map(warning => warning.message)
  }, [getFieldWarnings])

  // Handle field updates with validation
  const handleNameChange = useCallback((name: string) => {
    try {
      onMessageUpdate({ name })
      // Validate field immediately
      validateField('name', name, { ...message, name })
    } catch (error) {
      handleValidationError(error)
    }
  }, [onMessageUpdate, validateField, message, handleValidationError])

  const handleHeaderTypeChange = useCallback((type: HeaderType) => {
    try {
      const newHeader: MessageHeader = {
        type,
        content: type === 'text' ? (message.header?.content || '') : ''
      }
      onMessageUpdate({ header: newHeader })
    } catch (error) {
      handleValidationError(error)
    }
  }, [onMessageUpdate, message.header, handleValidationError])

  const handleHeaderContentChange = useCallback((content: string) => {
    try {
      if (!message.header) return
      
      const updatedHeader: MessageHeader = {
        ...message.header,
        content,
        ...(message.header.type !== 'text' && { mediaUrl: content })
      }
      onMessageUpdate({ header: updatedHeader })
      
      // Validate header content immediately
      validateField('header.content', content, { ...message, header: updatedHeader })
    } catch (error) {
      handleValidationError(error)
    }
  }, [onMessageUpdate, message.header, validateField, message, handleValidationError])

  const handleBodyTextChange = useCallback((text: string) => {
    try {
      onMessageUpdate({ body: { text } })
      // Validate body immediately
      validateField('body.text', text, { ...message, body: { text } })
    } catch (error) {
      handleValidationError(error)
    }
  }, [onMessageUpdate, validateField, message, handleValidationError])

  const handleFooterTextChange = useCallback((text: string) => {
    try {
      onMessageUpdate({ footer: { text } })
      // Validate footer immediately
      validateField('footer.text', text, { ...message, footer: { text } })
    } catch (error) {
      handleValidationError(error)
    }
  }, [onMessageUpdate, validateField, message, handleValidationError])

  const handleButtonsChange = useCallback((newButtons: QuickReplyButton[]) => {
    try {
      onMessageUpdate({
        action: {
          type: 'button',
          buttons: newButtons
        }
      })
      // Validate buttons immediately
      validateField('action.buttons', newButtons, { 
        ...message, 
        action: { type: 'button', buttons: newButtons } 
      })
    } catch (error) {
      handleValidationError(error)
    }
  }, [onMessageUpdate, validateField, message, handleValidationError])

  const handleReactionChange = useCallback((buttonId: string, reaction: ButtonReaction) => {
    onReactionUpdate(buttonId, reaction)
  }, [onReactionUpdate])

  const handleReactionRemove = useCallback((buttonId: string) => {
    onReactionUpdate(buttonId, { buttonId })
  }, [onReactionUpdate])

  // Handle next step
  const handleNext = useCallback(() => {
    if (canProceed()) {
      onNext()
    } else {
      toast.error('Please fix validation errors before proceeding')
    }
  }, [canProceed, onNext])

  // Get header type icon
  const getHeaderTypeIcon = (type: HeaderType) => {
    switch (type) {
      case 'text':
        return Type
      case 'image':
        return Image
      case 'video':
        return Video
      case 'document':
        return FileText
      default:
        return Type
    }
  }

  // Check if form has errors
  const hasErrors = validationState.hasErrors || !canProceed()

  return (
    <div className={cn("space-y-6", className)}>
      {/* Step Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Edit Message Content</h2>
          <p className="text-sm text-muted-foreground">
            Configure your message content and see a real-time preview
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Step 2 of 3
        </Badge>
      </div>

      {/* Main Content - Dual Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Panel - Configuration (60%) */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Message Name Section */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Message Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="message-name" className="text-sm font-medium">
                  Message Name *
                </Label>
                <Input
                  id="message-name"
                  value={message.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Enter a descriptive name for this message"
                  disabled={disabled}
                  className={cn(
                    !isFieldValid('name') && "border-destructive focus-visible:ring-destructive"
                  )}
                />
                <div className="flex justify-between items-center text-xs">
                  <div className="text-muted-foreground">
                    Used for internal organization and tracking
                  </div>
                  <Badge variant={message.name.length > VALIDATION_LIMITS.NAME_MAX_LENGTH * 0.8 ? "destructive" : "outline"}>
                    {message.name.length}/{VALIDATION_LIMITS.NAME_MAX_LENGTH}
                  </Badge>
                </div>
                {!isFieldValid('name') && (
                  <div className="flex items-center gap-1 text-sm text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>{getErrorMessages('name')[0]}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Header Section */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Header (Optional)</CardTitle>
              <p className="text-sm text-muted-foreground">
                Add a header to make your message more engaging
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Header Type</Label>
                <Select
                  value={message.header?.type || 'text'}
                  onValueChange={(value: HeaderType) => handleHeaderTypeChange(value)}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">
                      <div className="flex items-center gap-2">
                        <Type className="h-4 w-4" />
                        Text Header
                      </div>
                    </SelectItem>
                    <SelectItem value="image">
                      <div className="flex items-center gap-2">
                        <Image className="h-4 w-4" />
                        Image Header
                      </div>
                    </SelectItem>
                    <SelectItem value="video">
                      <div className="flex items-center gap-2">
                        <Video className="h-4 w-4" />
                        Video Header
                      </div>
                    </SelectItem>
                    <SelectItem value="document">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Document Header
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {message.header?.type === 'text' ? (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Header Text</Label>
                  <Input
                    value={message.header.content}
                    onChange={(e) => handleHeaderContentChange(e.target.value)}
                    placeholder="Enter header text..."
                    disabled={disabled}
                    maxLength={VALIDATION_LIMITS.HEADER_TEXT_MAX_LENGTH}
                    className={cn(
                      !isFieldValid('header.content') && "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  <div className="flex justify-between items-center text-xs">
                    <div className="text-muted-foreground">
                      Keep it short and impactful
                    </div>
                    <Badge variant={message.header.content.length > VALIDATION_LIMITS.HEADER_TEXT_MAX_LENGTH * 0.8 ? "destructive" : "outline"}>
                      {message.header.content.length}/{VALIDATION_LIMITS.HEADER_TEXT_MAX_LENGTH}
                    </Badge>
                  </div>
                  {!isFieldValid('header.content') && (
                    <div className="flex items-center gap-1 text-sm text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      <span>{getErrorMessages('header.content')[0]}</span>
                    </div>
                  )}
                </div>
              ) : (
                <MediaUploadComponent
                  value={message.header?.content || ''}
                  onChange={handleHeaderContentChange}
                  mediaType={message.header?.type as 'image' | 'video' | 'document'}
                  label={`${message.header?.type} URL`}
                  description={`Upload or enter URL for ${message.header?.type} header`}
                  disabled={disabled}
                />
              )}
            </CardContent>
          </Card>

          {/* Body Section */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Message Body *</CardTitle>
              <p className="text-sm text-muted-foreground">
                The main content of your message
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Body Text</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTextEditor('body')}
                    disabled={disabled}
                  >
                    <Type className="h-3 w-3 mr-1" />
                    Rich Editor
                  </Button>
                </div>
                
                <WhatsAppTextEditor
                  initialText={message.body.text}
                  onChange={handleBodyTextChange}
                  onSave={(text) => handleBodyTextChange(text)}
                  placeholder="Enter your message content..."
                  maxLength={VALIDATION_LIMITS.BODY_TEXT_MAX_LENGTH}
                  inline={true}
                  className={cn(
                    !isFieldValid('body.text') && "border-destructive"
                  )}
                />
                
                {!isFieldValid('body.text') && (
                  <div className="flex items-center gap-1 text-sm text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>{getErrorMessages('body.text')[0]}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Footer Section */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Footer (Optional)</CardTitle>
              <p className="text-sm text-muted-foreground">
                Add additional context or information
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Footer Text</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTextEditor('footer')}
                    disabled={disabled}
                  >
                    <Type className="h-3 w-3 mr-1" />
                    Rich Editor
                  </Button>
                </div>
                
                <Input
                  value={message.footer?.text || ''}
                  onChange={(e) => handleFooterTextChange(e.target.value)}
                  placeholder="Enter footer text..."
                  disabled={disabled}
                  maxLength={VALIDATION_LIMITS.FOOTER_TEXT_MAX_LENGTH}
                  className={cn(
                    !isFieldValid('footer.text') && "border-destructive focus-visible:ring-destructive"
                  )}
                />
                
                <div className="flex justify-between items-center text-xs">
                  <div className="text-muted-foreground">
                    Usually used for disclaimers or additional info
                  </div>
                  <Badge variant={(message.footer?.text?.length || 0) > VALIDATION_LIMITS.FOOTER_TEXT_MAX_LENGTH * 0.8 ? "destructive" : "outline"}>
                    {message.footer?.text?.length || 0}/{VALIDATION_LIMITS.FOOTER_TEXT_MAX_LENGTH}
                  </Badge>
                </div>
                
                {!isFieldValid('footer.text') && (
                  <div className="flex items-center gap-1 text-sm text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>{getErrorMessages('footer.text')[0]}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Buttons Section - Only for button type messages */}
          {message.type === 'button' && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Interactive Buttons</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Add buttons for user interaction
                </p>
              </CardHeader>
              <CardContent>
                <ButtonManager
                  buttons={buttons}
                  reactions={reactions}
                  onChange={handleButtonsChange}
                  onReactionChange={(reactions) => {
                    reactions.forEach(reaction => {
                      handleReactionChange(reaction.buttonId, reaction)
                    })
                  }}
                  maxButtons={VALIDATION_LIMITS.BUTTON_MAX_COUNT}
                  disabled={disabled}
                  showReactionConfig={false} // We'll handle this separately
                />
                
                {!isFieldValid('action.buttons') && (
                  <div className="flex items-center gap-1 text-sm text-destructive mt-2">
                    <AlertCircle className="h-3 w-3" />
                    <span>{getErrorMessages('action.buttons')[0]}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Panel - Preview (40%) */}
        <div className="lg:col-span-2">
          <div className="sticky top-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Live Preview</CardTitle>
                <p className="text-sm text-muted-foreground">
                  See how your message will appear to recipients
                </p>
              </CardHeader>
              <CardContent>
                <InteractivePreview
                  message={message}
                  reactions={reactions}
                  showReactionIndicators={true}
                  debounceMs={300}
                  className="min-h-[400px]"
                />
                
                {/* Preview Info */}
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-blue-700 dark:text-blue-300">
                      <p className="font-medium mb-1">Preview Notes:</p>
                      <ul className="space-y-1">
                        <li>• Changes update in real-time</li>
                        <li>• ⚡️ icon indicates buttons with reactions</li>
                        <li>• Preview shows WhatsApp-style formatting</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="border-t" />

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={disabled}
          className="flex items-center gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Type Selection
        </Button>

        <div className="flex items-center gap-4">
          {hasErrors && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>Please fix errors before continuing</span>
            </div>
          )}
          
          <Button
            onClick={handleNext}
            disabled={disabled || hasErrors}
            className="flex items-center gap-2"
          >
            Continue to Review
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Text Editor Modals */}
      {showTextEditor === 'body' && (
        <WhatsAppTextEditor
          initialText={message.body.text}
          onSave={(text) => {
            handleBodyTextChange(text)
            setShowTextEditor(null)
          }}
          onClose={() => setShowTextEditor(null)}
          placeholder="Enter your message content..."
          maxLength={VALIDATION_LIMITS.BODY_TEXT_MAX_LENGTH}
          showPreview={true}
        />
      )}

      {showTextEditor === 'footer' && (
        <WhatsAppTextEditor
          initialText={message.footer?.text || ''}
          onSave={(text) => {
            handleFooterTextChange(text)
            setShowTextEditor(null)
          }}
          onClose={() => setShowTextEditor(null)}
          placeholder="Enter footer text..."
          maxLength={VALIDATION_LIMITS.FOOTER_TEXT_MAX_LENGTH}
          showPreview={true}
        />
      )}

      {/* Reaction Configuration Modal */}
      {reactionConfigButton && (
        <ReactionConfigManager
          buttonId={reactionConfigButton}
          buttonText={buttons.find(b => b.id === reactionConfigButton)?.title || ''}
          currentReaction={reactions.find(r => r.buttonId === reactionConfigButton)}
          onReactionChange={handleReactionChange}
          onReactionRemove={() => handleReactionRemove(reactionConfigButton)}
          isOpen={true}
          onClose={() => setReactionConfigButton(null)}
        />
      )}
    </div>
  )
}

export default UnifiedEditingStep