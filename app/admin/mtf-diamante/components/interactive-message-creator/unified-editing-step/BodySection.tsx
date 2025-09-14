"use client";

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { WhatsAppTextEditor } from "../../shared/WhatsAppTextEditor";
import { isInstagramChannel, MESSAGE_LIMITS } from "@/types/interactive-messages";
import { getInstagramTemplateType } from "./utils";
import type { BodySectionProps } from "./types";

export const BodySection: React.FC<BodySectionProps> = ({
  message,
  onMessageUpdate,
  disabled = false,
  isFieldValid,
  validationLimits,
  channelType = 'Channel::WhatsApp',
}) => {
  const isInstagram = isInstagramChannel(channelType);
  
  // Instagram template type determination
  const instagramTemplate = useMemo(() => {
    if (!isInstagram) return null;
    const bodyText = message.body?.text || '';
    const hasImage = message.header?.type === 'image';
    // Use message type directly
    const selectedType = message.type;
    const result = getInstagramTemplateType(bodyText, hasImage, selectedType);
    
    // Log template detection apenas em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
      console.log('� [Instagram] Template detectado:', {
        tipo: result.type,
        motivo: result.reason,
        textoLength: bodyText.length,
        tipoMensagem: message.type,
        temImagem: hasImage,
        dentroLimite: !result.isOverLimit
      });
    }
    
    return result;
  }, [isInstagram, message.body?.text, message.header?.type, message.type]);

  const handleBodyTextChange = React.useCallback(
    (text: string) => {
      onMessageUpdate({ body: { text } });
    },
    [onMessageUpdate]
  );

  const getMaxLength = () => {
    if (!isInstagram) return validationLimits.BODY_TEXT_MAX_LENGTH;
    
    if (instagramTemplate?.type === 'quick_replies') {
      return MESSAGE_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_LENGTH;
    } else if (instagramTemplate?.type === 'button_template') {
      return MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_TEXT_MAX_LENGTH;
    } else if (instagramTemplate?.type === 'generic') {
      return MESSAGE_LIMITS.INSTAGRAM_GENERIC_TITLE_MAX_LENGTH; // 80 caracteres para título do carrossel
    }
    
    return validationLimits.BODY_TEXT_MAX_LENGTH;
  };

  const getTemplateDescription = () => {
    if (!isInstagram || !instagramTemplate) return null;
    
    const descriptions = {
      quick_replies: 'Será enviado como Quick Replies do Instagram',
      generic: 'Será enviado como Template Genérico (Carrossel) do Instagram',
      button_template: 'Será enviado como Template de Botões do Instagram'
    };
    
    return descriptions[instagramTemplate.type];
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          {isInstagram && instagramTemplate?.type === 'generic' ? 'Título do Carrossel *' : 'Message Body *'}
          {isInstagram && instagramTemplate && (
            <Badge variant="outline" className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
              {instagramTemplate.type === 'generic' ? 'Carrossel' : instagramTemplate.type.replace('_', ' ')}
            </Badge>
          )}
        </CardTitle>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {isInstagram && instagramTemplate?.type === 'generic'
              ? 'O título principal de cada elemento do carrossel (máx 80 caracteres)'
              : isInstagram 
                ? 'O conteúdo principal da sua mensagem Instagram' 
                : 'The main content of your message'
            }
          </p>
          
          {isInstagram && instagramTemplate && instagramTemplate.type === 'button_template' && (
            <div className="flex items-start gap-2 p-3 bg-purple-50 dark:bg-purple-950/50 rounded-lg border border-purple-200 dark:border-purple-800">
              <Info className="h-4 w-4 text-purple-600 dark:text-purple-400 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-purple-900 dark:text-purple-100">Template de Botões Instagram</p>
                <p className="text-purple-700 dark:text-purple-300">Corpo de até 640 caracteres</p>
                {instagramTemplate.isOverLimit && (
                  <p className="text-red-600 dark:text-red-400 font-medium mt-1">
                    ⚠️ Texto excede o limite do Instagram!
                  </p>
                )}
              </div>
            </div>
          )}
          
          {isInstagram && instagramTemplate && instagramTemplate.type === 'generic' && (
            <div className="flex items-start gap-2 p-3 bg-purple-50 dark:bg-purple-950/50 rounded-lg border border-purple-200 dark:border-purple-800">
              <Info className="h-4 w-4 text-purple-600 dark:text-purple-400 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-purple-900 dark:text-purple-100">Carrossel Instagram</p>
                <p className="text-purple-700 dark:text-purple-300">Título de até 80 caracteres por elemento</p>
              </div>
            </div>
          )}
          
          {isInstagram && instagramTemplate && instagramTemplate.type !== 'button_template' && instagramTemplate.type !== 'generic' && (
            <div className="flex items-start gap-2 p-3 bg-purple-50 dark:bg-purple-950/50 rounded-lg border border-purple-200 dark:border-purple-800">
              <Info className="h-4 w-4 text-purple-600 dark:text-purple-400 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-purple-900 dark:text-purple-100">Instagram Template:</p>
                <p className="text-purple-700 dark:text-purple-300">{instagramTemplate.reason}</p>
                {getTemplateDescription() && (
                  <p className="text-purple-600 dark:text-purple-400 mt-1">{getTemplateDescription()}</p>
                )}
                {instagramTemplate.isOverLimit && (
                  <p className="text-red-600 dark:text-red-400 font-medium mt-1">
                    ⚠️ Texto excede o limite do Instagram!
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <WhatsAppTextEditor
            initialText={message.body.text}
            onChange={handleBodyTextChange}
            onSave={(text) => handleBodyTextChange(text)}
            placeholder={
              isInstagram && instagramTemplate?.type === 'generic'
                ? "Digite o título do carrossel..."
                : isInstagram 
                  ? "Digite o conteúdo da sua mensagem Instagram..." 
                  : "Enter your message content..."
            }
            maxLength={getMaxLength()}
            inline={true}
            showPreview={false}
            accountId="mtf-diamante"
            className={cn(
              !isFieldValid("body.text") && "border-destructive",
              instagramTemplate?.isOverLimit && "border-red-500"
            )}
          />
          
          {/* Character counters */}
          {isInstagram && (
            <div className="flex justify-between items-center text-xs">
              <div className="text-muted-foreground">
                <span className="font-medium">
                  {message.body.text.length}/{
                    instagramTemplate?.type === 'quick_replies' ? MESSAGE_LIMITS.INSTAGRAM_QUICK_REPLIES_MAX_LENGTH :
                    instagramTemplate?.type === 'button_template' ? MESSAGE_LIMITS.INSTAGRAM_BUTTON_TEMPLATE_TEXT_MAX_LENGTH :
                    instagramTemplate?.type === 'generic' ? MESSAGE_LIMITS.INSTAGRAM_GENERIC_TITLE_MAX_LENGTH :
                    'N/A'
                  } caracteres
                </span>
              </div>
              {instagramTemplate?.isOverLimit && (
                <span className="text-red-600 font-medium">Excede limite!</span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
