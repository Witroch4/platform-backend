"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save } from "lucide-react";

interface EspecialidadeSelectorProps {
  leadId: string;
  especialidadeAtual?: string;
  onEspecialidadeChange?: (especialidade: string) => void;
  disabled?: boolean;
}

const especialidades = [
  { value: 'ADMINISTRATIVO', label: 'Direito Administrativo' },
  { value: 'CIVIL', label: 'Direito Civil' },
  { value: 'CONSTITUCIONAL', label: 'Direito Constitucional' },
  { value: 'TRABALHO', label: 'Direito do Trabalho' },
  { value: 'EMPRESARIAL', label: 'Direito Empresarial' },
  { value: 'PENAL', label: 'Direito Penal' },
  { value: 'TRIBUTARIO', label: 'Direito Tributário' },
];

export function EspecialidadeSelector({
  leadId,
  especialidadeAtual,
  onEspecialidadeChange,
  disabled = false
}: EspecialidadeSelectorProps) {
  const [selectedEspecialidade, setSelectedEspecialidade] = useState<string>(
    especialidadeAtual || ""
  );
  const [isUpdating, setIsUpdating] = useState(false);

  const handleSaveEspecialidade = async (especialidade: string) => {
    try {
      setIsUpdating(true);
      
      const response = await fetch("/api/admin/leads-chatwit/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: leadId,
          especialidade: especialidade
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erro ao atualizar especialidade");
      }

      setSelectedEspecialidade(especialidade);
      
      if (onEspecialidadeChange) {
        onEspecialidadeChange(especialidade);
      }

      const especialidadeLabel = especialidades.find(e => e.value === especialidade)?.label;
      toast("Especialidade atualizada", {
        description: `Especialidade definida como ${especialidadeLabel}`,
      });
    } catch (error: any) {
      console.error("Erro ao atualizar especialidade:", error);
      toast("Erro", {
        description: error.message || "Não foi possível atualizar a especialidade",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const getEspecialidadeLabel = (value: string) => {
    return especialidades.find(e => e.value === value)?.label || value;
  };

  if (especialidadeAtual && !disabled) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="px-2 py-1">
          {getEspecialidadeLabel(especialidadeAtual)}
        </Badge>
        <Button
          variant="ghost"
          
          onClick={() => setSelectedEspecialidade("")}
          className="h-6 px-2 text-xs"
        >
          Alterar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 w-full max-w-xs">
      <Select
        value={selectedEspecialidade}
        onValueChange={setSelectedEspecialidade}
        disabled={disabled || isUpdating}
      >
        <SelectTrigger className="text-xs h-8">
          <SelectValue placeholder="Selecionar especialidade..." />
        </SelectTrigger>
        <SelectContent>
          {especialidades.map((especialidade) => (
            <SelectItem 
              key={especialidade.value} 
              value={especialidade.value}
              className="text-xs"
            >
              {especialidade.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {selectedEspecialidade && selectedEspecialidade !== especialidadeAtual && (
        <Button
          
          onClick={() => handleSaveEspecialidade(selectedEspecialidade)}
          disabled={isUpdating}
          className="h-8 px-2"
        >
          {isUpdating ? (
            "Salvando..."
          ) : (
            <Save className="h-3 w-3" />
          )}
        </Button>
      )}
    </div>
  );
} 