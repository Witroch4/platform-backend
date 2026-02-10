'use client';

import { useState, useEffect, useRef, forwardRef } from 'react';
import { Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string; // Used for Dialog Title
  className?: string;
  minRows?: number;
  maxRows?: number;
  readOnly?: boolean;
  /** Limite máximo de caracteres (exibe contador visual) */
  maxLength?: number;
  /** Mostrar contador mesmo sem limite */
  showCounter?: boolean;
}

/**
 * Componente de texto editável com contador de caracteres
 *
 * Features:
 * - Contador visual de caracteres (X/Y)
 * - Indicador de excesso (vermelho quando ultrapassa limite)
 * - Modal de edição expandida
 * - Suporte a multilinhas com auto-resize
 */
export const EditableText = ({
  value,
  onChange,
  placeholder,
  label,
  className,
  minRows = 1,
  readOnly = false,
  maxLength,
  showCounter = false,
}: EditableTextProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [internalValue, setInternalValue] = useState(value);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Sync internal state if prop changes (external update)
  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  // Auto-resize logic
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      // Set height allowing it to grow
      textarea.style.height = `${textarea.scrollHeight + 2}px`;
    }
  }, [internalValue]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setInternalValue(newVal);
    onChange(newVal);
  };

  // Prevent drag propagation
  const stopPropagation = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    e.stopPropagation();
  };

  // Calcula status do contador
  const currentLength = internalValue?.length || 0;
  const hasLimit = typeof maxLength === 'number' && maxLength > 0;
  const isOverLimit = hasLimit && currentLength > maxLength;
  const isNearLimit = hasLimit && currentLength >= maxLength * 0.9;
  const shouldShowCounter = hasLimit || showCounter;

  // Porcentagem do limite usada (para barra de progresso visual)
  const limitPercentage = hasLimit ? Math.min((currentLength / maxLength) * 100, 100) : 0;

  return (
    <div
      className={cn("relative group w-full", className)}
      onDoubleClick={stopPropagation} // Stop double click from opening Node Settings
      onPointerDown={stopPropagation} // Stop drag start
    >
      <textarea
        ref={textareaRef}
        value={internalValue}
        onChange={handleChange}
        placeholder={placeholder}
        readOnly={readOnly}
        rows={minRows}
        className={cn(
          // 'nodrag' is CRITICAL for React Flow to allow text selection inside node
          "nodrag w-full resize-none overflow-hidden bg-transparent border-none p-0 text-sm focus:outline-none focus:ring-0 placeholder:text-muted-foreground/50",
          readOnly && "cursor-default select-none",
          isOverLimit && "text-red-600 dark:text-red-400"
        )}
        style={{ minHeight: `${minRows * 20}px` }}
      />

      {/* Contador de caracteres */}
      {shouldShowCounter && !readOnly && (
        <div className="flex items-center justify-between mt-1 gap-2">
          {/* Barra de progresso visual */}
          {hasLimit && (
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-200 rounded-full",
                  isOverLimit
                    ? "bg-red-500"
                    : isNearLimit
                      ? "bg-amber-500"
                      : "bg-blue-500"
                )}
                style={{ width: `${limitPercentage}%` }}
              />
            </div>
          )}

          {/* Contador numérico */}
          <span
            className={cn(
              "text-[10px] font-medium tabular-nums whitespace-nowrap",
              isOverLimit
                ? "text-red-500 dark:text-red-400 font-bold"
                : isNearLimit
                  ? "text-amber-500 dark:text-amber-400"
                  : "text-muted-foreground/60"
            )}
          >
            {hasLimit ? (
              <>
                {currentLength}/{maxLength}
                {isOverLimit && (
                  <span className="ml-1">
                    (+{currentLength - maxLength})
                  </span>
                )}
              </>
            ) : (
              currentLength
            )}
          </span>
        </div>
      )}

      {!readOnly && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-background border shadow-sm rounded-full nodrag"
              onClick={(e) => {
                e.stopPropagation();
                // setIsDialogOpen(true); // Handled by Trigger
              }}
              title="Expandir editor"
            >
              <Maximize2 className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl" onPointerDownOutside={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>Editar {label}</span>
                {hasLimit && (
                  <span
                    className={cn(
                      "text-sm font-normal",
                      isOverLimit
                        ? "text-red-500"
                        : isNearLimit
                          ? "text-amber-500"
                          : "text-muted-foreground"
                    )}
                  >
                    {currentLength}/{maxLength} caracteres
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Textarea
                value={internalValue}
                onChange={handleChange}
                placeholder={placeholder}
                className={cn(
                  "min-h-[300px] resize-y",
                  isOverLimit && "border-red-500 focus-visible:ring-red-500"
                )}
              />
              {/* Barra de progresso no dialog */}
              {hasLimit && (
                <div className="mt-2 space-y-1">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all duration-200 rounded-full",
                        isOverLimit
                          ? "bg-red-500"
                          : isNearLimit
                            ? "bg-amber-500"
                            : "bg-blue-500"
                      )}
                      style={{ width: `${limitPercentage}%` }}
                    />
                  </div>
                  {isOverLimit && (
                    <p className="text-xs text-red-500">
                      Excedeu o limite em {currentLength - maxLength} caracteres
                    </p>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setIsDialogOpen(false)}>Concluir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
