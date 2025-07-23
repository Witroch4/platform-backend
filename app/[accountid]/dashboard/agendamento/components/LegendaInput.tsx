// components/agendamento/LegendaInput.tsx
"use client";

import type React from "react";
import { useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker from "./EmojiPicker";

interface LegendaInputProps {
  legenda: string;
  setLegenda: (value: string) => void;
}

const LegendaInput: React.FC<LegendaInputProps> = ({ legenda, setLegenda }) => {
  const legendaRef = useRef<HTMLTextAreaElement>(null);
  const [openEmojiSelector, setOpenEmojiSelector] = useState(false);

  const insertEmoji = (emoji: string) => {
    if (legendaRef.current) {
      const textarea = legendaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = legenda;
      const before = text.substring(0, start);
      const after = text.substring(end, text.length);
      const newText = before + emoji + after;
      setLegenda(newText);
      // Move cursor após o emoji
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
        textarea.focus();
      }, 0);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-foreground">Legenda da Postagem</label>
      <div className="flex items-center mb-2">
        <Textarea
          ref={legendaRef}
          placeholder="Digite a legenda da sua postagem aqui."
          value={legenda}
          onChange={(e) => setLegenda(e.target.value)}
          className="resize-none h-24 flex-1 border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring"
        />
        <Popover open={openEmojiSelector} onOpenChange={setOpenEmojiSelector}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="ml-2 flex items-center justify-center border-border hover:bg-accent"
              aria-label="Adicionar Emoji"
            >
              <DotLottieReact
                src="/animations/smile.lottie"
                autoplay
                loop={true}
                style={{
                  width: "24px",
                  height: "24px",
                }}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-2 bg-popover border-border" align="start">
            <EmojiPicker onSelect={insertEmoji} />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

export default LegendaInput;
