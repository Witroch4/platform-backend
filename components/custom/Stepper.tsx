"use client";

import React from "react";
import { cn } from "@/lib/utils";

type StepperProps = {
  steps: string[];
  currentStep: number;
  className?: string;
  onStepClick?: (index: number) => void;
};

export function Stepper({ steps, currentStep, className, onStepClick }: StepperProps) {
  return (
    <div className={cn("flex items-center w-full", className)}>
      {steps.map((label, index) => {
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;
        const clickable = typeof onStepClick === "function";
        return (
          <div key={`${index}-${label}`} className="flex items-center w-full">
            <div className={cn("flex items-center", clickable && "cursor-pointer")}
                 onClick={clickable ? () => onStepClick(index) : undefined}
                 role={clickable ? "button" : undefined}
                 tabIndex={clickable ? 0 : -1}
                 onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStepClick(index); } } : undefined}
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border text-sm font-medium",
                  isCompleted && "bg-green-600 text-white border-green-600",
                  isActive && !isCompleted && "bg-blue-600 text-white border-blue-600",
                  !isActive && !isCompleted && "bg-gray-200 text-gray-700 border-gray-300"
                )}
              >
                {index + 1}
              </div>
              <span className={cn("ml-2 text-sm", isActive ? "font-semibold" : "text-gray-500")}>{label}</span>
            </div>
            {index < steps.length - 1 && (
              <div className={cn("mx-2 h-[2px] flex-1", isCompleted ? "bg-green-600" : "bg-gray-300")} />
            )}
          </div>
        );
      })}
    </div>
  );
}


