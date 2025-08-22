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

  // Instagram template type determination
  const instagramTemplate = React.useMemo(() => {
    const bodyText = message.body?.text || "";
    const hasImage = message.header?.type === "image" && !!message.header?.content;
    return getInstagramTemplateType(bodyText, hasImage, validationLimits);
  }, [message.body?.text, message.header, validationLimits]);

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
          Add up to {validationLimits.BUTTON_MAX_COUNT} interactive buttons
        </p>
        {channelType === 'Channel::Instagram' && (
          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <Info className="h-4 w-4 text-blue-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900">Instagram Template:</p>
              <p className="text-blue-700">{instagramTemplate.reason}</p>
              {instagramTemplate.isOverLimit && (
                <Badge variant="destructive" className="mt-1">
                  Exceeds Instagram Limit
                </Badge>
              )}
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
          maxButtons={validationLimits.BUTTON_MAX_COUNT}
          disabled={disabled}
          idPrefix={channelType === 'Channel::Instagram' ? 'ig_' : ''}
        />
      </CardContent>
    </Card>
  );
};
