"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import type { NavigationSectionProps } from "./types";

export const NavigationSection: React.FC<NavigationSectionProps> = ({
  onBack,
  onNext,
  disabled = false,
  hasErrors,
}) => {
  return (
    <>
      <div className="border-t" />
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={disabled}
          className="flex items-center gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Type Selection
        </Button>

        <div className="flex items-center gap-4">
          {hasErrors && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              Please fix validation errors
            </div>
          )}

          <Button
            onClick={onNext}
            disabled={disabled || hasErrors}
            className="flex items-center gap-2"
          >
            Continue to Review
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
};
