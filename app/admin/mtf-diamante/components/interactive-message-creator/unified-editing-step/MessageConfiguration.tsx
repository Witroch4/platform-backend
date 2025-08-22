"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageConfigurationProps } from "./types";

export const MessageConfiguration: React.FC<MessageConfigurationProps> = ({
  message,
  onMessageUpdate,
  disabled = false,
  isFieldValid,
  validateField,
  handleValidationError,
}) => {
  const handleNameChange = React.useCallback(
    (name: string) => {
      try {
        onMessageUpdate({ name });
        // Validate field immediately
        validateField("name", name, { ...message, name });
      } catch (error) {
        handleValidationError(error);
      }
    },
    [onMessageUpdate, validateField, message, handleValidationError]
  );

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Message Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Input
            id="message-name"
            value={message.name || ""}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Enter a descriptive name for this message"
            disabled={disabled}
            className={cn(
              !isFieldValid("name") &&
                "border-destructive focus-visible:ring-destructive"
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
};
