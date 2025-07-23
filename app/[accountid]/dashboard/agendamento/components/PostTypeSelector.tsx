// components/agendamento/PostTypeSelector.tsx
"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { toast } from "sonner";

interface PostTypeSelectorProps {
  tipoPostagem: string[];
  setTipoPostagem: React.Dispatch<React.SetStateAction<string[]>>;
  tratarMidiasComoUnica?: boolean;
  setTratarMidiasComoUnica?: React.Dispatch<React.SetStateAction<boolean>>;
  tratarMidiasComoIndividuais?: boolean;
  setTratarMidiasComoIndividuais?: React.Dispatch<React.SetStateAction<boolean>>;
}

const postTypes = ["Post Normal", "Reels", "Stories"];

const PostTypeSelector: React.FC<PostTypeSelectorProps> = ({
  tipoPostagem,
  setTipoPostagem,
  tratarMidiasComoUnica = true,
  setTratarMidiasComoUnica,
  tratarMidiasComoIndividuais = false,
  setTratarMidiasComoIndividuais
}) => {
  
  const [isPostagemDiaria, setIsPostagemDiaria] = useState(false);
  const [isPostagemSemanal, setIsPostagemSemanal] = useState(false);
  const [isPostagemAleatoria, setIsPostagemAleatoria] = useState(false);
  const [localTratarMidiasComoUnica, setLocalTratarMidiasComoUnica] = useState(tratarMidiasComoUnica);
  const [localTratarMidiasComoIndividuais, setLocalTratarMidiasComoIndividuais] = useState(tratarMidiasComoIndividuais);

  // Sincroniza os estados dos switches com o array tipoPostagem
  useEffect(() => {
    setIsPostagemDiaria(tipoPostagem.includes("Diario"));
    setIsPostagemSemanal(tipoPostagem.includes("Semanal"));
    setIsPostagemAleatoria(tipoPostagem.includes("Aleatório"));
  }, [tipoPostagem]);

  // Sincroniza os estados locais com as props
  useEffect(() => {
    setLocalTratarMidiasComoUnica(tratarMidiasComoUnica);
    setLocalTratarMidiasComoIndividuais(tratarMidiasComoIndividuais);
  }, [tratarMidiasComoUnica, tratarMidiasComoIndividuais]);

  const handleCheckChange = (value: string) => {
    setTipoPostagem((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const handlePostagemDiariaChange = (checked: boolean) => {
    if (checked) {
      setTipoPostagem((prev) =>
        prev.includes("Diario") ? prev : [...prev, "Diario"]
      );
      toast("Postagem Diária Ativada", { description: "Esta postagem será publicada automaticamente todos os dias no horário selecionado."  });
    } else {
      setTipoPostagem((prev) => prev.filter((item) => item !== "Diario"));
    }
    setIsPostagemDiaria(checked);
  };

  const handlePostagemSemanalChange = (checked: boolean) => {
    if (checked) {
      setTipoPostagem((prev) =>
        prev.includes("Semanal") ? prev : [...prev, "Semanal"]
      );
      toast("Postagem Semanal Ativada", { description: "Esta postagem será publicada automaticamente todas as semanas no horário selecionado."  });
    } else {
      setTipoPostagem((prev) => prev.filter((item) => item !== "Semanal"));
    }
    setIsPostagemSemanal(checked);
  };

  const handlePostagemAleatoriaChange = (checked: boolean) => {
    if (checked) {
      setTipoPostagem((prev) =>
        prev.includes("Aleatório") ? prev : [...prev, "Aleatório"]
      );

      if (isPostagemDiaria) {
        toast("Postagem Diária + Aleatória Ativada", { description: "Esta postagem será publicada diariamente em um horário aleatório." });
      }
    } else {
      setTipoPostagem((prev) => prev.filter((item) => item !== "Aleatório"));

      // Atualiza os estados locais
      setLocalTratarMidiasComoUnica(true);
      setLocalTratarMidiasComoIndividuais(false);

      // Atualiza os estados do componente pai, se fornecidos
      if (setTratarMidiasComoUnica) setTratarMidiasComoUnica(true);
      if (setTratarMidiasComoIndividuais) setTratarMidiasComoIndividuais(false);
    }
    setIsPostagemAleatoria(checked);
  };

  const handleTratarMidiasComoUnicaChange = (checked: boolean) => {
    // Atualiza o estado local
    setLocalTratarMidiasComoUnica(checked);

    // Atualiza o estado do componente pai, se fornecido
    if (setTratarMidiasComoUnica) setTratarMidiasComoUnica(checked);

    if (checked) {
      // Atualiza o estado local
      setLocalTratarMidiasComoIndividuais(false);

      // Atualiza o estado do componente pai, se fornecido
      if (setTratarMidiasComoIndividuais) setTratarMidiasComoIndividuais(false);
    }
  };

  const handleTratarMidiasComoIndividuaisChange = (checked: boolean) => {
    // Atualiza o estado local
    setLocalTratarMidiasComoIndividuais(checked);

    // Atualiza o estado do componente pai, se fornecido
    if (setTratarMidiasComoIndividuais) setTratarMidiasComoIndividuais(checked);

    if (checked) {
      // Atualiza o estado local
      setLocalTratarMidiasComoUnica(false);

      // Atualiza o estado do componente pai, se fornecido
      if (setTratarMidiasComoUnica) setTratarMidiasComoUnica(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-3 text-foreground">Tipo de Postagem</label>
        <div className="space-y-2">
          {postTypes.map((type) => (
            <div key={type} className="flex items-center">
              <Checkbox
                id={type.toLowerCase().replace(/\s+/g, '-')}
                checked={tipoPostagem.includes(type)}
                onCheckedChange={() => handleCheckChange(type)}
                className="border-border"
              />
              <label htmlFor={type.toLowerCase().replace(/\s+/g, '-')} className="ml-2 text-sm text-foreground">
                {type}
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Switch
              id="postagem-diaria"
              checked={isPostagemDiaria}
              onCheckedChange={handlePostagemDiariaChange}
            />
            <Label htmlFor="postagem-diaria" className="text-foreground">Postagem Diária</Label>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Switch
              id="postagem-semanal"
              checked={isPostagemSemanal}
              onCheckedChange={handlePostagemSemanalChange}
            />
            <Label htmlFor="postagem-semanal" className="text-foreground">Postagem Semanal</Label>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Switch
              id="postagem-aleatoria"
              checked={isPostagemAleatoria}
              onCheckedChange={handlePostagemAleatoriaChange}
            />
            <Label htmlFor="postagem-aleatoria" className="text-foreground">Postagem Aleatória</Label>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-md p-4 text-sm bg-popover border-border text-popover-foreground">
                  <div className="space-y-2">
                    <p>Ativar essa opção permite modificar como o sistema trata múltiplas mídias ao criar uma postagem.</p>
                    <p className="font-semibold mt-2">Existem dois cenários para a Postagem Aleatória:</p>
                    <div>
                      <p className="font-semibold">1️⃣ Postar todas as mídias como uma única postagem.</p>
                      <p>- Se essa opção for ativada, todas as mídias carregadas serão postadas juntas como um único post.</p>
                      <p>- A descrição preenchida será usada para essa postagem única.</p>
                      <p>- Isso é útil para criar posts com várias imagens ou vídeos agrupados.</p>
                    </div>
                    <div>
                      <p className="font-semibold">2️⃣ Postar cada mídia como uma postagem separada.</p>
                      <p>- Se essa opção for ativada, cada mídia carregada será tratada como uma postagem individual.</p>
                      <p>- Caso uma descrição seja preenchida, ela será replicada para cada postagem gerada.</p>
                      <p>- Se a "Postagem Diária" ou "Postagem Semanal" estiver ativada, uma mídia será postada por período (dia/semana).</p>
                    </div>
                    <p className="font-semibold mt-2">Importante:</p>
                    <p>- Se a "Postagem Aleatória" estiver desativada, o comportamento padrão do sistema será postar todas as mídias como um único post.</p>
                    <p>- Se houver mais de uma postagem programada para a mesma hora e dia, o sistema escolherá aleatoriamente qual delas será publicada.</p>
                    <p>- Postagem Semanal: republica automaticamente a cada 7 dias no mesmo horário.</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {isPostagemAleatoria && (
          <div className="ml-6 space-y-2 border-l-2 pl-4 border-border">
            <div className="flex items-center">
              <Checkbox
                id="tratar-midias-como-unica"
                checked={localTratarMidiasComoUnica}
                onCheckedChange={(checked) => handleTratarMidiasComoUnicaChange(checked === true)}
                className="border-border"
              />
              <label htmlFor="tratar-midias-como-unica" className="ml-2 text-sm text-foreground">
                Tratar múltiplas mídias como uma única postagem
              </label>
            </div>
            <div className="flex items-center">
              <Checkbox
                id="tratar-midias-como-individuais"
                checked={localTratarMidiasComoIndividuais}
                onCheckedChange={(checked) => handleTratarMidiasComoIndividuaisChange(checked === true)}
                className="border-border"
              />
              <label htmlFor="tratar-midias-como-individuais" className="ml-2 text-sm text-foreground">
                Tratar cada mídia como uma postagem individual
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PostTypeSelector;
