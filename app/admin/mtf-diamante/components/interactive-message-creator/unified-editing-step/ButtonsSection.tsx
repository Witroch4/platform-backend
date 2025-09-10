"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";
import { ButtonManager } from "../../shared/ButtonManager";
import { getInstagramTemplateType } from "./utils";
import type { ButtonsSectionProps } from "./types";

export const ButtonsSection: React.FC<ButtonsSectionProps> = ({
  message,
  buttons,
  reactions,
  onButtonsChange,
  onReactionChange,
  disabled = false,
  channelType,
  validationLimits,
}) => {
  const [reactionConfigButton, setReactionConfigButton] = React.useState<string | null>(null);

  // Instagram/Facebook (Meta) template type determination
  const instagramTemplate = React.useMemo(() => {
    const bodyText = message.body?.text || "";
    const hasImage = message.header?.type === "image" && !!message.header?.content;
    // Para Instagram/Facebook, mapear 'button' para 'button_template'
    const selectedType = message.type === 'button' ? 'button_template' : message.type;
    return getInstagramTemplateType(bodyText, hasImage, selectedType);
  }, [message.body?.text, message.header, message.type]);

  // Meta channels detection (Instagram or FacebookPage)
  const isMetaChannel = React.useMemo(() => {
    return channelType === 'Channel::Instagram' || channelType === 'Channel::FacebookPage';
  }, [channelType]);

  // Check if this is Meta Button Template
  const isInstagramButtonTemplate = React.useMemo(() => {
    return isMetaChannel && instagramTemplate.type === 'button_template';
  }, [isMetaChannel, instagramTemplate.type]);

  // Check if this is Meta Quick Replies
  const isInstagramQuickReplies = React.useMemo(() => {
    return isMetaChannel && (message.type === 'quick_replies' || instagramTemplate.type === 'quick_replies');
  }, [isMetaChannel, message.type, instagramTemplate.type]);

  // Get max buttons count based on Meta type
  const getMaxButtons = React.useMemo(() => {
    if (!isMetaChannel) {
      return validationLimits.BUTTON_MAX_COUNT;
    }
    
    if (isInstagramQuickReplies) {
      return 13; // Instagram Quick Replies limit
    }
    
    if (isInstagramButtonTemplate) {
      return 3; // Instagram Button Template limit
    }
    
    return 3; // Default Meta limit for other types
  }, [isMetaChannel, isInstagramQuickReplies, isInstagramButtonTemplate, validationLimits.BUTTON_MAX_COUNT]);

  // Instagram Button Template validation
  const instagramButtonValidation = React.useMemo(() => {
    if (!isInstagramButtonTemplate) return null;

    const bodyText = message.body?.text || "";
    const bodyLength = new TextEncoder().encode(bodyText).length;
    const hasHeader = message.header?.type && message.header?.type !== "text";
    const buttonCount = buttons.length;

    return {
      textWithinLimit: bodyLength <= 640,
      textLength: bodyLength,
      maxTextLength: 640,
      hasInvalidHeader: hasHeader,
      buttonCountValid: buttonCount >= 1 && buttonCount <= getMaxButtons,
      buttonCount,
      maxButtons: getMaxButtons
    };
  }, [isInstagramButtonTemplate, message.body?.text, message.header, buttons.length]);

  const handleReactionConfigOpen = (buttonId: string) => {
    setReactionConfigButton(buttonId);
  };

  const handleReactionConfigClose = () => {
    setReactionConfigButton(null);
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Interactive Buttons</CardTitle>
        <p className="text-sm text-muted-foreground">
          Add up to {getMaxButtons} interactive buttons
        </p>
        
        {/* Instagram/Facebook Template Information */}
        {isMetaChannel && isInstagramButtonTemplate && (
          <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/50 rounded-lg border border-blue-200 dark:border-blue-800">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100">Tipos de Botão Suportados (Instagram/Facebook):</p>
              <p className="text-blue-700 dark:text-blue-300">
                URL (links) e Respostas Rápidas. Pode usar uma mistura dos dois tipos.
              </p>
            </div>
          </div>
        )}

      </CardHeader>
      <CardContent className="space-y-4">
        <ButtonManager
          buttons={buttons}
          onChange={onButtonsChange}
          reactions={reactions}
          onReactionChange={(reactionsArray) => {
            // Convert array format to individual calls if needed
            reactionsArray.forEach(reaction => onReactionChange(reaction));
          }}
          maxButtons={getMaxButtons}
          disabled={disabled}
          idPrefix={channelType === 'Channel::Instagram' ? 'ig_' : channelType === 'Channel::FacebookPage' ? 'fb_' : ''}
          isInstagramQuickReplies={isInstagramQuickReplies}
        />
      </CardContent>
    </Card>
  );
};
