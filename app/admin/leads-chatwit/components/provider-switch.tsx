"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type AiProviderType = "OPENAI" | "GEMINI";
export type LinkedColumnType = "PROVA_CELL" | "ESPELHO_CELL" | "ANALISE_CELL" | "RECURSO_CELL";

interface ProviderSwitchProps {
  column: LinkedColumnType;
  defaultProvider?: AiProviderType;
  onProviderChange?: (column: LinkedColumnType, provider: AiProviderType) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const STORAGE_KEY_PREFIX = "chatwit_ai_provider_";

/**
 * Switch visual para alternar entre provedores de IA (OpenAI/Gemini)
 * Layout: [Logo GPT] [Switch] [Logo Gemini]
 * O logo do provedor ativo fica realçado
 */
export function ProviderSwitch({
  column,
  defaultProvider = "GEMINI",
  onProviderChange,
  size = "md",
  className,
}: ProviderSwitchProps) {
  const [provider, setProvider] = useState<AiProviderType>(defaultProvider);

  // Carregar preferência do localStorage ao montar
  useEffect(() => {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${column}`);
    if (stored === "OPENAI" || stored === "GEMINI") {
      setProvider(stored);
    }
  }, [column]);

  const handleToggle = () => {
    const newProvider: AiProviderType = provider === "OPENAI" ? "GEMINI" : "OPENAI";
    setProvider(newProvider);
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${column}`, newProvider);
    onProviderChange?.(column, newProvider);
  };

  // Tamanhos responsivos
  const sizes = {
    sm: { icon: 18, switch: "h-5 w-9", toggle: "h-4 w-4", translate: "translate-x-4" },
    md: { icon: 22, switch: "h-6 w-11", toggle: "h-5 w-5", translate: "translate-x-5" },
    lg: { icon: 26, switch: "h-7 w-14", toggle: "h-6 w-6", translate: "translate-x-7" },
  };

  const s = sizes[size];
  const isGemini = provider === "GEMINI";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "inline-flex items-center gap-1.5 cursor-pointer select-none",
              className
            )}
            onClick={handleToggle}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleToggle();
              }
            }}
            aria-label={`Alternar provedor de IA: ${isGemini ? "Gemini" : "GPT"}`}
          >
            {/* Logo GPT - Esquerda */}
            <div
              className={cn(
                "flex items-center justify-center rounded-md p-0.5 transition-all duration-200",
                !isGemini
                  ? "bg-emerald-500/20 ring-2 ring-emerald-500/50 scale-110"
                  : "opacity-40 hover:opacity-60"
              )}
            >
              <Image
                src="/assets/ChatGPT_logo.svg"
                alt="GPT"
                width={s.icon}
                height={s.icon}
                className={cn(
                  "transition-all duration-200",
                  !isGemini ? "drop-shadow-sm" : "grayscale"
                )}
              />
            </div>

            {/* Switch Central */}
            <div
              className={cn(
                "relative inline-flex items-center rounded-full transition-colors duration-200",
                s.switch,
                isGemini
                  ? "bg-blue-500/30"
                  : "bg-emerald-500/30"
              )}
            >
              {/* Toggle indicator */}
              <span
                className={cn(
                  "absolute inline-flex items-center justify-center rounded-full transition-all duration-200 shadow-md",
                  s.toggle,
                  isGemini
                    ? `${s.translate} bg-blue-500`
                    : "translate-x-0.5 bg-emerald-500"
                )}
              />
            </div>

            {/* Logo Gemini - Direita */}
            <div
              className={cn(
                "flex items-center justify-center rounded-md p-0.5 transition-all duration-200",
                isGemini
                  ? "bg-blue-500/20 ring-2 ring-blue-500/50 scale-110"
                  : "opacity-40 hover:opacity-60"
              )}
            >
              <Image
                src="/assets/Google-gemini-icon.svg"
                alt="Gemini"
                width={s.icon}
                height={s.icon}
                className={cn(
                  "transition-all duration-200",
                  isGemini ? "drop-shadow-sm" : "grayscale"
                )}
              />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <p>
            <strong>{isGemini ? "Gemini 3 Flash" : "GPT-4.1"}</strong>
          </p>
          <p className="text-muted-foreground">
            Clique para usar {isGemini ? "GPT" : "Gemini"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Versão compacta para uso em headers de tabela
 * Layout vertical: [Switch com logos] acima do nome da coluna
 */
export function ProviderSwitchHeader({
  column,
  label,
  defaultProvider = "GEMINI",
  onProviderChange,
}: {
  column: LinkedColumnType;
  label: string;
  defaultProvider?: AiProviderType;
  onProviderChange?: (column: LinkedColumnType, provider: AiProviderType) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <ProviderSwitch
        column={column}
        defaultProvider={defaultProvider}
        onProviderChange={onProviderChange}
        size="sm"
      />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

/**
 * Hook para obter o provedor atual de uma coluna
 */
export function useColumnProvider(column: LinkedColumnType, defaultProvider: AiProviderType = "GEMINI"): AiProviderType {
  const [provider, setProvider] = useState<AiProviderType>(defaultProvider);

  useEffect(() => {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${column}`);
    if (stored === "OPENAI" || stored === "GEMINI") {
      setProvider(stored);
    }

    // Escutar mudanças no localStorage (para sincronizar entre componentes)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === `${STORAGE_KEY_PREFIX}${column}` && e.newValue) {
        if (e.newValue === "OPENAI" || e.newValue === "GEMINI") {
          setProvider(e.newValue);
        }
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [column, defaultProvider]);

  return provider;
}

/**
 * Obtém o provedor atual de uma coluna (sync, para uso fora de React)
 */
export function getColumnProvider(column: LinkedColumnType, defaultProvider: AiProviderType = "GEMINI"): AiProviderType {
  if (typeof window === "undefined") return defaultProvider;
  const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${column}`);
  if (stored === "OPENAI" || stored === "GEMINI") {
    return stored;
  }
  return defaultProvider;
}
