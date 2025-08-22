"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLink } from "lucide-react";
import type { CtaUrlSectionProps } from "./types";

export const CtaUrlSection: React.FC<CtaUrlSectionProps> = ({
  message,
  isCtaUrl,
  currentCtaDisplay,
  currentCtaUrl,
  onCtaDisplayChange,
  onCtaUrlChange,
  disabled = false,
}) => {
  if (!isCtaUrl) return null;

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <ExternalLink className="h-4 w-4" />
          Call-to-Action URL
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure the button text and destination URL
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cta-display">Button Text</Label>
          <Input
            id="cta-display"
            value={currentCtaDisplay}
            onChange={(e) => onCtaDisplayChange(e.target.value)}
            placeholder="Enter button text..."
            disabled={disabled}
            maxLength={20}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cta-url">URL</Label>
          <Input
            id="cta-url"
            type="url"
            value={currentCtaUrl}
            onChange={(e) => onCtaUrlChange(e.target.value)}
            placeholder="https://example.com"
            disabled={disabled}
          />
        </div>
      </CardContent>
    </Card>
  );
};
