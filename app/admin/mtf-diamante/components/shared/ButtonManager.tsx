'use client';

import React, { useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableItem } from './dnd/SortableItem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, MessageSquare, ExternalLink, Phone, Zap, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Types based on the design specification
export interface InteractiveButton {
  id: string;
  text: string;
  type: 'reply' | 'url' | 'phone_number';
  url?: string;
  phone_number?: string;
}

export interface ButtonReaction {
  buttonId: string;
  reaction?: {
    type: 'emoji' | 'text';
    value: string;
  };
}

interface ButtonManagerProps {
  buttons: InteractiveButton[];
  reactions?: ButtonReaction[];
  onChange: (buttons: InteractiveButton[]) => void;
  onReactionChange?: (reactions: ButtonReaction[]) => void;
  maxButtons?: number;
  disabled?: boolean;
  className?: string;
  showReactionConfig?: boolean;
  idPrefix?: string; // optional prefix for generated ids (e.g., ig_)
}

// Button type configurations
const BUTTON_TYPES = {
  reply: {
    label: 'Quick Reply',
    icon: MessageSquare,
    description: 'Simple response button',
    maxLength: 20,
    supportsReactions: true
  },
  url: {
    label: 'URL Button',
    icon: ExternalLink,
    description: 'Button that opens a link',
    maxLength: 20,
    supportsReactions: false
  },
  phone_number: {
    label: 'Phone Button',
    icon: Phone,
    description: 'Button that makes a call',
    maxLength: 20,
    supportsReactions: false
  }
} as const;

// Validation functions
const validateButtonText = (text: string, type: InteractiveButton['type']): string[] => {
  const errors: string[] = [];
  
  if (!text.trim()) {
    errors.push('Button text is required');
  }
  
  if (text.length > BUTTON_TYPES[type].maxLength) {
    errors.push(`Text exceeds maximum length of ${BUTTON_TYPES[type].maxLength} characters`);
  }
  
  return errors;
};

const validateUrl = (url: string): string[] => {
  const errors: string[] = [];
  
  if (!url.trim()) {
    errors.push('URL is required for URL buttons');
    return errors;
  }
  
  try {
    new URL(url);
  } catch {
    errors.push('Please enter a valid URL (e.g., https://example.com)');
  }
  
  return errors;
};

const validatePhoneNumber = (phone: string): string[] => {
  const errors: string[] = [];
  
  if (!phone.trim()) {
    errors.push('Phone number is required for phone buttons');
    return errors;
  }
  
  // Basic phone number validation - should start with + and contain only digits
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  if (!phoneRegex.test(phone)) {
    errors.push('Please enter a valid phone number (e.g., +5511999999999)');
  }
  
  return errors;
};

export const ButtonManager: React.FC<ButtonManagerProps> = ({
  buttons,
  reactions = [],
  onChange,
  onReactionChange,
  maxButtons = 3,
  disabled = false,
  className,
  showReactionConfig = true,
  idPrefix,
}) => {
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Generate unique ID for new buttons
  const generateButtonId = (): string => {
    const base = `btn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return `${idPrefix ?? ''}${base}`;
  };

  // Add new button
  const addButton = (type: InteractiveButton['type'] = 'reply') => {
    if (buttons.length >= maxButtons) return;
    
    const newButton: InteractiveButton = {
      id: generateButtonId(),
      text: '',
      type
    };
    
    onChange([...buttons, newButton]);
  };

  // Remove button
  const removeButton = (buttonId: string) => {
    const newButtons = buttons.filter(button => button.id !== buttonId);
    onChange(newButtons);
    
    // Remove associated reaction
    if (onReactionChange) {
      const newReactions = reactions.filter(reaction => reaction.buttonId !== buttonId);
      onReactionChange(newReactions);
    }
    
    // Clear validation errors for removed button
    const newErrors = { ...validationErrors };
    delete newErrors[buttonId];
    setValidationErrors(newErrors);
  };

  // Drag end -> reorder
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = buttons.findIndex((b) => b.id === active.id);
    const newIndex = buttons.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(buttons, oldIndex, newIndex);
    onChange(newOrder);
  };

  // Update button
  const updateButton = (buttonId: string, updates: Partial<InteractiveButton>) => {
    const newButtons = buttons.map(button => {
      if (button.id === buttonId) {
        const updatedButton = { ...button, ...updates };
        
        // Clear type-specific fields when changing type
        if (updates.type && updates.type !== button.type) {
          if (updates.type !== 'url') updatedButton.url = undefined;
          if (updates.type !== 'phone_number') updatedButton.phone_number = undefined;
          
          // Remove reaction if new type doesn't support reactions
          if (!BUTTON_TYPES[updates.type].supportsReactions && onReactionChange) {
            const newReactions = reactions.filter(reaction => reaction.buttonId !== buttonId);
            onReactionChange(newReactions);
          }
        }
        
        return updatedButton;
      }
      return button;
    });
    
    onChange(newButtons);
    
    // Validate updated button
    validateButton(buttonId, newButtons.find(b => b.id === buttonId)!);
  };

  // Validate individual button
  const validateButton = (buttonId: string, button: InteractiveButton) => {
    const errors: string[] = [];
    
    // Validate text
    errors.push(...validateButtonText(button.text, button.type));
    
    // Validate type-specific fields
    if (button.type === 'url' && button.url !== undefined) {
      errors.push(...validateUrl(button.url));
    }
    
    if (button.type === 'phone_number' && button.phone_number !== undefined) {
      errors.push(...validatePhoneNumber(button.phone_number));
    }
    
    setValidationErrors(prev => ({
      ...prev,
      [buttonId]: errors
    }));
    
    return errors.length === 0;
  };

  // Get button icon
  const getButtonIcon = (type: InteractiveButton['type']) => {
    const IconComponent = BUTTON_TYPES[type].icon;
    return <IconComponent className="h-4 w-4" />;
  };

  // Check if button has reaction configured
  const hasReaction = (buttonId: string): boolean => {
    return reactions.some(reaction => 
      reaction.buttonId === buttonId && reaction.reaction
    );
  };

  // Get reaction for button
  const getReaction = (buttonId: string): ButtonReaction | undefined => {
    return reactions.find(reaction => reaction.buttonId === buttonId);
  };

  // Handle reaction configuration (placeholder for integration with ReactionConfigManager)
  const handleReactionConfig = (buttonId: string) => {
    // This will be integrated with the ReactionConfigManager component
    console.log('Configure reaction for button:', buttonId);
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label className="text-sm font-medium">
            Buttons ({buttons.length}/{maxButtons})
          </Label>
          <p className="text-xs text-muted-foreground">
            Add interactive buttons to your message
          </p>
        </div>
        
        {buttons.length < maxButtons && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                className="h-8"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Button
                <ChevronDown className="h-3 w-3 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => addButton('reply')}>
                <MessageSquare className="h-3 w-3 mr-2" /> Quick Reply
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addButton('url')}>
                <ExternalLink className="h-3 w-3 mr-2" /> URL Button
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addButton('phone_number')}>
                <Phone className="h-3 w-3 mr-2" /> Phone Button
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={buttons.map(b => b.id)} strategy={verticalListSortingStrategy}>
      <div className="space-y-3">
        {buttons.map((button, index) => (
          <SortableItem key={button.id} id={button.id}>
          <Card className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    Button {index + 1}
                  </Badge>
                  {getButtonIcon(button.type)}
                  <span className="text-sm font-medium">
                    {BUTTON_TYPES[button.type].label}
                  </span>
                  {hasReaction(button.id) && (
                    <Badge variant="secondary" className="text-xs">
                      <Zap className="h-3 w-3 mr-1" />
                      Reaction
                    </Badge>
                  )}
                </div>
                
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeButton(button.id)}
                  disabled={disabled}
                  className="h-8 w-8"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Button Type Selection */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Button Type
                </Label>
                <Select
                  value={button.type}
                  onValueChange={(value: InteractiveButton['type']) => 
                    updateButton(button.id, { type: value })
                  }
                  disabled={disabled}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(BUTTON_TYPES).map(([type, config]) => (
                      <SelectItem key={type} value={type}>
                        <div className="flex items-center gap-2">
                          {getButtonIcon(type as InteractiveButton['type'])}
                          <span>{config.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {BUTTON_TYPES[button.type].description}
                </p>
              </div>

              {/* Button Text */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Button Text (max {BUTTON_TYPES[button.type].maxLength} chars)
                </Label>
                <Input
                  value={button.text}
                  onChange={(e) => updateButton(button.id, { text: e.target.value })}
                  placeholder="Enter button text..."
                  disabled={disabled}
                  maxLength={BUTTON_TYPES[button.type].maxLength}
                  className={cn(
                    validationErrors[button.id]?.some(error => error.includes('text')) && 
                    "border-destructive focus-visible:ring-destructive"
                  )}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{button.text.length}/{BUTTON_TYPES[button.type].maxLength}</span>
                </div>
              </div>

              {/* URL Field for URL buttons */}
              {button.type === 'url' && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    URL
                  </Label>
                  <Input
                    value={button.url || ''}
                    onChange={(e) => updateButton(button.id, { url: e.target.value })}
                    placeholder="https://example.com"
                    disabled={disabled}
                    className={cn(
                      validationErrors[button.id]?.some(error => error.includes('URL')) && 
                      "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                </div>
              )}

              {/* Phone Number Field for phone buttons */}
              {button.type === 'phone_number' && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Phone Number
                  </Label>
                  <Input
                    value={button.phone_number || ''}
                    onChange={(e) => updateButton(button.id, { phone_number: e.target.value })}
                    placeholder="+5511999999999"
                    disabled={disabled}
                    className={cn(
                      validationErrors[button.id]?.some(error => error.includes('phone')) && 
                      "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    Include country code (e.g., +55 for Brazil)
                  </p>
                </div>
              )}

              {/* Reaction Configuration for Quick Reply buttons */}
              {button.type === 'reply' && showReactionConfig && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Automatic Reaction
                  </Label>
                  <Button
                    type="button"
                    variant={hasReaction(button.id) ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleReactionConfig(button.id)}
                    disabled={disabled}
                    className="w-full justify-start"
                  >
                    <Zap className="h-3 w-3 mr-2" />
                    {hasReaction(button.id) ? (
                      <span>
                        Reaction: {getReaction(button.id)?.reaction?.type === 'emoji' 
                          ? getReaction(button.id)?.reaction?.value 
                          : `"${getReaction(button.id)?.reaction?.value}"`
                        }
                      </span>
                    ) : (
                      'Add Automatic Reaction'
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Configure how the system responds when this button is clicked
                  </p>
                </div>
              )}

              {/* Validation Errors */}
              {validationErrors[button.id] && validationErrors[button.id].length > 0 && (
                <div className="space-y-1">
                  {validationErrors[button.id].map((error, errorIndex) => (
                    <p key={errorIndex} className="text-xs text-destructive">
                      {error}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          </SortableItem>
        ))}

        {buttons.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <Plus className="h-8 w-8 mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-1">No buttons added yet</p>
              <p className="text-xs text-muted-foreground">
                Click "Add Button" to create your first interactive button
              </p>
            </CardContent>
          </Card>
        )}
      </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default ButtonManager;