'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrashIcon, Plus, Phone, ExternalLink, Copy } from 'lucide-react';
import { EnhancedTextArea } from '../EnhancedTextArea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface ButtonConfig {
  id?: string;
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE';
  text: string;
  url?: string;
  phoneNumber?: string;
  copyCode?: string;
}

interface MtfDiamanteVariavel {
  id?: string;
  chave: string;
  valor: string;
}

interface ButtonManagerProps {
  buttons: ButtonConfig[];
  onChange: (buttons: ButtonConfig[]) => void;
  variables: MtfDiamanteVariavel[];
  maxButtons?: number;
  allowedTypes?: ButtonConfig['type'][];
  disabled?: boolean;
  className?: string;
  label?: string;
  description?: string;
}

const BUTTON_TYPES = {
  QUICK_REPLY: {
    label: 'Quick Reply',
    icon: Plus,
    description: 'Simple response button',
    maxLength: 20
  },
  URL: {
    label: 'URL Button',
    icon: ExternalLink,
    description: 'Button that opens a link',
    maxLength: 20
  },
  PHONE_NUMBER: {
    label: 'Phone Button',
    icon: Phone,
    description: 'Button that makes a call',
    maxLength: 20
  },
  COPY_CODE: {
    label: 'Copy Code',
    icon: Copy,
    description: 'Button that copies text to clipboard',
    maxLength: 15 // Special limit for copy code values
  }
};

export const ButtonManager: React.FC<ButtonManagerProps> = ({
  buttons,
  onChange,
  variables,
  maxButtons = 3,
  allowedTypes = ['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'COPY_CODE'],
  disabled = false,
  className,
  label = 'Buttons',
  description
}) => {
  const addButton = () => {
    if (buttons.length >= maxButtons) return;
    
    const newButton: ButtonConfig = {
      type: 'QUICK_REPLY',
      text: ''
    };
    
    onChange([...buttons, newButton]);
  };

  const removeButton = (index: number) => {
    if (buttons.length <= 1) return;
    const newButtons = buttons.filter((_, i) => i !== index);
    onChange(newButtons);
  };

  const updateButton = (index: number, updates: Partial<ButtonConfig>) => {
    const newButtons = buttons.map((button, i) => 
      i === index ? { ...button, ...updates } : button
    );
    onChange(newButtons);
  };

  const validateButtonValue = (type: ButtonConfig['type'], value: string): boolean => {
    const buttonType = BUTTON_TYPES[type];
    if (value.length > buttonType.maxLength) {
      return false;
    }
    
    // Special validation for copy code - must be exactly the value, no variables
    if (type === 'COPY_CODE' && value.length > 15) {
      return false;
    }
    
    return true;
  };

  const getButtonIcon = (type: ButtonConfig['type']) => {
    const IconComponent = BUTTON_TYPES[type].icon;
    return <IconComponent className="h-4 w-4" />;
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium leading-none">
            {label} ({buttons.length}/{maxButtons})
          </label>
          {buttons.length < maxButtons && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addButton}
              disabled={disabled}
              className="h-8"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Button
            </Button>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      <div className="space-y-4">
        {buttons.map((button, index) => (
          <div key={index} className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Button {index + 1}
                </Badge>
                {getButtonIcon(button.type)}
                <span className="text-sm font-medium">
                  {BUTTON_TYPES[button.type].label}
                </span>
              </div>
              {buttons.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeButton(index)}
                  disabled={disabled}
                  className="h-8 w-8"
                >
                  <TrashIcon className="h-3 w-3" />
                </Button>
              )}
            </div>

            {/* Button Type Selection */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Button Type
              </label>
              <Select
                value={button.type}
                onValueChange={(value: ButtonConfig['type']) => 
                  updateButton(index, { 
                    type: value,
                    // Clear type-specific fields when changing type
                    url: undefined,
                    phoneNumber: undefined,
                    copyCode: undefined
                  })
                }
                disabled={disabled}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowedTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-2">
                        {getButtonIcon(type)}
                        <span>{BUTTON_TYPES[type].label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Button Text */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Button Text (max {BUTTON_TYPES[button.type].maxLength} chars)
              </label>
              <EnhancedTextArea
                value={button.text}
                onChange={(value) => updateButton(index, { text: value })}
                variables={variables}
                placeholder="Button text..."
                multiline={false}
                disabled={disabled}
                maxLength={BUTTON_TYPES[button.type].maxLength}
              />
            </div>

            {/* Type-specific fields */}
            {button.type === 'URL' && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  URL
                </label>
                <EnhancedTextArea
                  value={button.url || ''}
                  onChange={(value) => updateButton(index, { url: value })}
                  variables={variables}
                  placeholder="https://example.com"
                  multiline={false}
                  disabled={disabled}
                />
              </div>
            )}

            {button.type === 'PHONE_NUMBER' && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Phone Number
                </label>
                <EnhancedTextArea
                  value={button.phoneNumber || ''}
                  onChange={(value) => updateButton(index, { phoneNumber: value })}
                  variables={variables}
                  placeholder="+5511999999999"
                  multiline={false}
                  disabled={disabled}
                />
              </div>
            )}

            {button.type === 'COPY_CODE' && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Code to Copy (max 15 chars, no variables)
                </label>
                <Input
                  value={button.copyCode || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.length <= 15) {
                      updateButton(index, { copyCode: value });
                    }
                  }}
                  placeholder="CODE123"
                  disabled={disabled}
                  maxLength={15}
                />
                <p className="text-xs text-muted-foreground">
                  Copy code buttons cannot use variables and are limited to 15 characters
                </p>
              </div>
            )}

            {/* Validation feedback */}
            {button.text && !validateButtonValue(button.type, button.text) && (
              <p className="text-xs text-destructive">
                Text exceeds maximum length of {BUTTON_TYPES[button.type].maxLength} characters
              </p>
            )}
          </div>
        ))}

        {buttons.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Plus className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No buttons added yet</p>
            <p className="text-xs">Click "Add Button" to create your first button</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ButtonManager;