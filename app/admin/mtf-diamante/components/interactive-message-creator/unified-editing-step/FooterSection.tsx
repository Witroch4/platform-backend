"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { FooterSectionProps } from "./types";

export const FooterSection: React.FC<FooterSectionProps> = ({
  message,
  onMessageUpdate,
  disabled = false,
  isFieldValid,
  validationLimits,
}) => {
  const handleFooterTextChange = React.useCallback(
    (text: string) => {
      onMessageUpdate({ footer: { text } });
    },
    [onMessageUpdate]
  );

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Footer (Optional)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Add a footer with additional information
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="footer-text">Footer Text</Label>
          <Input
            id="footer-text"
            value={message.footer?.text || ""}
            onChange={(e) => handleFooterTextChange(e.target.value)}
            placeholder="Enter footer text..."
            disabled={disabled}
            maxLength={validationLimits.FOOTER_TEXT_MAX_LENGTH}
            className={cn(
              !isFieldValid("footer.text") &&
                "border-destructive focus-visible:ring-destructive"
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
};
