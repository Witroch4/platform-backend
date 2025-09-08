"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { isInstagramChannel } from "@/types/interactive-messages";
import { getInstagramTemplateType } from "./utils";
import type { FooterSectionProps } from "./types";

export const FooterSection: React.FC<FooterSectionProps> = ({
  message,
  onMessageUpdate,
  disabled = false,
  isFieldValid,
  validationLimits,
  channelType = 'Channel::WhatsApp',
}) => {
  const isInstagram = isInstagramChannel(channelType);
  
  // Verificar se é Instagram Button Template
  const instagramTemplate = React.useMemo(() => {
    if (!isInstagram) return null;
    const bodyText = message.body?.text || '';
    const hasImage = message.header?.type === 'image';
    const selectedType = message.type === 'button' ? 'button_template' : message.type;
    return getInstagramTemplateType(bodyText, hasImage, selectedType);
  }, [isInstagram, message.body?.text, message.header?.type, message.type]);

  const handleFooterTextChange = React.useCallback(
    (text: string) => {
      onMessageUpdate({ footer: { text } });
    },
    [onMessageUpdate]
  );

  // Ocultar completamente se for Instagram Button Template
  if (isInstagram && instagramTemplate?.type === 'button_template') {
    return null;
  }

  const getFooterDescription = () => {
    if (isInstagram) {
      return "No Instagram, o footer é usado como subtítulo em templates genéricos (carrossel)";
    }
    return "Add a footer with additional information";
  };

  const getFooterPlaceholder = () => {
    if (isInstagram) {
      return "Digite o subtítulo do template (máx 80 caracteres)...";
    }
    return "Enter footer text...";
  };

  const getMaxLength = () => {
    if (isInstagram) {
      return 80; // Instagram Generic Template subtitle limit
    }
    return validationLimits.FOOTER_TEXT_MAX_LENGTH;
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          {isInstagram && instagramTemplate?.type === 'generic' ? 'Subtítulo do Carrossel (Opcional)' : 
           isInstagram ? 'Subtítulo (Opcional)' : 'Footer (Optional)'}
          {isInstagram && instagramTemplate?.type === 'generic' && (
            <Badge variant="outline" className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
              Carrossel
            </Badge>
          )}
        </CardTitle>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {isInstagram && instagramTemplate?.type === 'generic'
              ? 'Subtítulo de cada elemento do carrossel (máx 80 caracteres)'
              : isInstagram 
                ? 'Adicione um subtítulo para complementar sua mensagem' 
                : 'Add a footer with additional information'
            }
          </p>
          
          {isInstagram && instagramTemplate?.type === 'generic' && (
            <div className="flex items-start gap-2 p-3 bg-purple-50 dark:bg-purple-950/50 rounded-lg border border-purple-200 dark:border-purple-800">
              <Info className="h-4 w-4 text-purple-600 dark:text-purple-400 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-purple-900 dark:text-purple-100">Carrossel Instagram</p>
                <p className="text-purple-700 dark:text-purple-300">Subtítulo de até 80 caracteres por elemento</p>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="footer-text">
            {isInstagram && instagramTemplate?.type === 'generic' ? 'Subtítulo do Carrossel' :
             isInstagram ? 'Subtítulo' : 'Footer Text'}
          </Label>
          <Input
            id="footer-text"
            value={message.footer?.text || ""}
            onChange={(e) => handleFooterTextChange(e.target.value)}
            placeholder={getFooterPlaceholder()}
            disabled={disabled}
            maxLength={getMaxLength()}
            className={cn(
              !isFieldValid("footer.text") &&
                "border-destructive focus-visible:ring-destructive"
            )}
          />
          {isInstagram && (
            <div className="text-xs text-muted-foreground">
              {(message.footer?.text || '').length}/{getMaxLength()} caracteres
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
