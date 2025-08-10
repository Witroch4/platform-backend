"use client";

import React, { useState, useEffect } from "react";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { MessagesSquare, Send, Sparkles, CheckCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Componente Progress personalizado com cor verde
const GreenProgress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-3 w-full overflow-hidden rounded-full bg-muted/50",
      className
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 transition-all"
      style={{ 
        transform: `translateX(-${100 - (value || 0)}%)`,
        backgroundColor: "#10b981" 
      }}
    />
  </ProgressPrimitive.Root>
));
GreenProgress.displayName = "GreenProgress";

interface SendProgressDialogProps {
  isOpen: boolean;
  onClose: () => void;
  numContacts: number;
  templateName: string;
  onComplete?: () => void;
  isComplete?: boolean;
}

export function SendProgressDialog({
  isOpen,
  onClose,
  numContacts,
  templateName,
  onComplete,
  isComplete: propIsComplete = false
}: SendProgressDialogProps) {
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [magicEffect, setMagicEffect] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  
  // Título e subtítulo
  const title = "✨📱 Enviando mensagens mágicas! 📱✨";
  const subtitle = `📲 Enviando template "${templateName}" para ${numContacts} contatos. A magia já começou! ✨`;
  
  // Mensagens para o processo de envio
  const messages = [
    "⏳ Preparando o envio das mensagens...",
    "📲 Conectando com a API do WhatsApp...",
    "🚀 Lançando as primeiras mensagens para o espaço digital...",
    "📬 Continuamos enviando as mensagens com carinho...",
    "📡 Transmitindo os sinais mágicos do WhatsApp...",
    "✨ A magia está em 75%, mensagens fluindo pelo ar...",
    "🏁 Concluindo o envio das últimas mensagens...",
    "✅ Todas as mensagens foram enviadas com sucesso! 🎉"
  ];

  // Ativar efeito mágico a cada mudança de mensagem
  useEffect(() => {
    if (isOpen && messageIndex > 0) {
      setMagicEffect(true);
      const timer = setTimeout(() => {
        setMagicEffect(false);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [messageIndex, isOpen]);
  
  // Efeito para simular o progresso
  useEffect(() => {
    // Só simular quando aberto e ainda não completo
    if (!(isOpen && !isComplete && !propIsComplete)) return;

    setMessageIndex(0);

    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;
    const totalTime = Math.min(25000, 5000 + numContacts * 500);
    const interval = 200;
    const totalSteps = totalTime / interval;
    let currentStep = 0;

    const updateProgress = () => {
      if (cancelled) return;
      currentStep++;
      const progressPercent = Math.min(99, Math.floor((currentStep / totalSteps) * 100));
      setSentCount(Math.floor((progressPercent / 100) * numContacts));
      setProgress(progressPercent);
      const messageIdx = Math.min(messages.length - 2, Math.floor((progressPercent / 100) * (messages.length - 1)));
      setMessageIndex(messageIdx);
      if (progressPercent < 99) {
        timer = setTimeout(updateProgress, interval);
      }
    };

    timer = setTimeout(updateProgress, interval);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isOpen, numContacts, isComplete, propIsComplete]);
  
  // Efeito para finalizar o progresso quando isComplete for true
  useEffect(() => {
    if (isComplete) {
      // Atualizar imediatamente para 100%
      setProgress(100);
      setSentCount(numContacts);
      setMessageIndex(messages.length - 1); // Última mensagem

      // Fechar o diálogo automaticamente após 1.5s
      const timer = setTimeout(() => {
        try { onComplete && onComplete(); } catch {}
        try { onClose && onClose(); } catch {}
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [isComplete, messages.length, numContacts, onComplete, onClose]);
  
  // Detectar quando o envio é concluído externamente
  useEffect(() => {
    if (propIsComplete && !isComplete) {
      // Sinal externo de conclusão: finalize imediatamente UI
      setIsComplete(true);
      setProgress(100);
      setSentCount(numContacts);
      setMessageIndex(messages.length - 1);
    }
  }, [propIsComplete, isComplete, numContacts, messages.length]);
  
  // Obter a mensagem atual
  const getCurrentMessage = () => {
    if (isComplete) {
      return messages[messages.length - 1]; // Mensagem final
    }
    
    // Mensagem normal do processo
    return messages[messageIndex];
  };
  
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md backdrop-blur-xl bg-background/95 shadow-xl border-primary/20 overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-r from-green-500/5 via-blue-500/5 to-green-500/5 pointer-events-none ${magicEffect ? 'opacity-30' : 'opacity-0'} transition-opacity duration-1000`}></div>
        
        {/* Partículas de magia */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 12 }).map((_, i) => (
            <div 
              key={i}
              className="absolute w-2 h-2 rounded-full bg-green-500/30"
              style={{
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
                animation: `float-particle ${5 + Math.random() * 5}s linear infinite`,
                animationDelay: `${Math.random() * 5}s`,
                opacity: 0.7,
              }}
            />
          ))}
        </div>
        
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <MessagesSquare className="h-5 w-5 text-green-500" />
            Enviando Mensagens WhatsApp
          </DialogTitle>
          <DialogDescription>
            Acompanhe o progresso do envio das mensagens para os contatos selecionados
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-6">
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <div className={`relative z-10 ${magicEffect ? 'animate-bounce' : ''} duration-300`}>
                {isComplete ? (
                  <CheckCircle className="h-16 w-16 text-green-500" />
                ) : (
                  <Send className="h-16 w-16 text-green-500 animate-pulse" />
                )}
              </div>
              <div className="absolute -inset-4 bg-green-500/10 rounded-full blur-xl animate-pulse"></div>
              <Sparkles className={`absolute -right-2 -top-2 h-8 w-8 text-yellow-500 ${magicEffect ? 'animate-spin' : ''} transition-transform duration-500`} />
            </div>
          </div>
          
          <div className={`text-center mb-8 transition-all duration-500 ${magicEffect ? 'scale-105' : 'scale-100'}`}>
            <p className="text-lg mb-2 font-medium">{title}</p>
            <p className="text-sm mb-4 text-muted-foreground">{subtitle}</p>
            <div className="min-h-[3rem] flex items-center justify-center">
              <p className={`text-base transition-opacity duration-300 ${magicEffect ? 'opacity-80' : 'opacity-100'}`}>{getCurrentMessage()}</p>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="relative">
              <GreenProgress value={progress} />
              <div className={`absolute inset-0 bg-gradient-to-r from-green-500/0 via-green-500/30 to-green-500/0 blur-md ${magicEffect ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}></div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <p>Enviadas: {sentCount} / {numContacts}</p>
              <p>{Math.round(progress)}%</p>
            </div>
          </div>
        </div>
        
        <style jsx global>{`
          @keyframes float-particle {
            0% {
              transform: translateY(0) translateX(0);
              opacity: 0;
            }
            50% {
              opacity: 0.8;
            }
            100% {
              transform: translateY(-${100 + Math.random() * 150}px) translateX(${-50 + Math.random() * 100}px);
              opacity: 0;
            }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
} 