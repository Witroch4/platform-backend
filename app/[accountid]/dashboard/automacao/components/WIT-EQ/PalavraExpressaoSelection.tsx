"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRef } from "react";

interface Props {
  anyword: boolean; // true significa "qualquer palavra", false significa "específica"
  setAnyword: (val: boolean) => void;
  inputPalavra: string;
  setInputPalavra: (val: string) => void;
  disabled?: boolean;
  className?: string;
}

export default function PalavraExpressaoSelection({
  anyword,
  setAnyword,
  inputPalavra,
  setInputPalavra,
  disabled = false,
  className = "",
}: Props) {
  // Referência para o campo de input, para focar após inserir uma palavra
  const inputRef = useRef<HTMLInputElement>(null);

  // Lista de exemplos
  const exemplos = ["Preço", "Link", "Comprar"];

  // Função para lidar com o clique em um exemplo
  const handleExemploClick = (exemplo: string) => {
    if (disabled) return;
    setInputPalavra(exemplo);
    inputRef.current?.focus();
  };

  return (
    <div
      className={className}
      style={{ pointerEvents: disabled ? "none" : "auto", opacity: disabled ? 0.6 : 1 }}
    >
      <h2 style={{ margin: "20px 0 10px" }}>Palavra ou Expressão</h2>

      {/*
          RadioGroup: se o valor for "qualquer-palavra", então anyword = true;
          se for "especifica", anyword = false.
      */}
      <RadioGroup
        value={anyword ? "qualquer-palavra" : "especifica"}
        onValueChange={(v) => {
          if (disabled) return;
          setAnyword(v === "qualquer-palavra");
        }}
        style={{ marginBottom: "10px" }}
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="especifica" id="especifica" disabled={disabled} />
          <Label htmlFor="especifica">Uma palavra ou expressão específica</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="qualquer-palavra" id="qualquer-palavra" disabled={disabled} />
          <Label htmlFor="qualquer-palavra">Qualquer palavra</Label>
        </div>
      </RadioGroup>

      {/* Exibe o input apenas se não for "qualquer palavra" (anyword === false) */}
      {!anyword && (
        <div style={{ marginBottom: "20px" }}>
          <Input
            ref={inputRef}
            type="text"
            placeholder="Digite a palavra ou expressão..."
            value={inputPalavra}
            onChange={(e) => {
              if (disabled) return;
              setInputPalavra(e.target.value);
            }}
            style={{ marginBottom: "10px", cursor: disabled ? "not-allowed" : "text" }}
            aria-label="Palavra ou Expressão específica"
            disabled={disabled}
          />
          <div style={{ display: "flex", gap: "10px" }}>
            {exemplos.map((exemplo, index) => (
              <Button
                key={index}
                variant="outline"
                
                onClick={() => handleExemploClick(exemplo)}
                style={{
                  textTransform: "capitalize",
                  cursor: disabled ? "not-allowed" : "pointer",
                  pointerEvents: disabled ? "none" : "auto",
                }}
                aria-label={`Inserir a palavra ${exemplo}`}
                disabled={disabled}
              >
                {exemplo}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
