"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { WhatsAppTextEditor } from "../../shared/WhatsAppTextEditor";
import type { BodySectionProps } from "./types";

export const BodySection: React.FC<BodySectionProps> = ({
  message,
  onMessageUpdate,
  disabled = false,
  isFieldValid,
  validationLimits,
}) => {
  const handleBodyTextChange = React.useCallback(
    (text: string) => {
      onMessageUpdate({ body: { text } });
    },
    [onMessageUpdate]
  );

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Message Body *</CardTitle>
        <p className="text-sm text-muted-foreground">
          The main content of your message
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <WhatsAppTextEditor
            initialText={message.body.text}
            onChange={handleBodyTextChange}
            onSave={(text) => handleBodyTextChange(text)}
            placeholder="Enter your message content..."
            maxLength={validationLimits.BODY_TEXT_MAX_LENGTH}
            inline={true}
            showPreview={false}
            accountId="mtf-diamante"
            className={cn(
              !isFieldValid("body.text") && "border-destructive"
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
};
