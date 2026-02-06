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
}

export const EditableText = ({
  value,
  onChange,
  placeholder,
  label,
  className,
  minRows = 1,
  readOnly = false,
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
          readOnly && "cursor-default select-none"
        )}
        style={{ minHeight: `${minRows * 20}px` }}
      />
      
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
              <DialogTitle>Editar {label}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Textarea
                value={internalValue}
                onChange={handleChange}
                placeholder={placeholder}
                className="min-h-[300px] resize-y"
              />
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
