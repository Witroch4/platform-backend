"use client";

import { useState, useEffect } from "react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save, X } from "lucide-react";

interface ModeloRecursoDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ModeloRecursoDrawer({ isOpen, onClose }: ModeloRecursoDrawerProps) {
  const [modeloTexto, setModeloTexto] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchModeloRecurso();
    }
  }, [isOpen]);

  const fetchModeloRecurso = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/leads-chatwit/modelo-recurso");
      const data = await response.json();
      
      if (response.ok) {
        setModeloTexto(data.modelo || "");
      } else {
        throw new Error(data.error || "Erro ao buscar modelo de recurso");
      }
    } catch (error: any) {
      console.error("Erro ao buscar modelo de recurso:", error);
      toast.error("Erro", {
        description: error.message || "Não foi possível carregar o modelo de recurso",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/leads-chatwit/modelo-recurso", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ modelo: modeloTexto }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Sucesso", {
          description: "Modelo de recurso salvo com sucesso!",
        });
        onClose();
      } else {
        throw new Error(data.error || "Erro ao salvar modelo de recurso");
      }
    } catch (error: any) {
      console.error("Erro ao salvar modelo de recurso:", error);
      toast.error("Erro", {
        description: error.message || "Não foi possível salvar o modelo de recurso",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="max-w-4xl mx-auto">
        <DrawerHeader>
          <DrawerTitle>Modelo de Recurso</DrawerTitle>
          <DrawerDescription>
            Edite o modelo de recurso que será usado como base para os recursos dos leads.
          </DrawerDescription>
        </DrawerHeader>
        
        <div className="px-4 pb-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Texto do Modelo de Recurso
              </label>
              <Textarea
                value={modeloTexto}
                onChange={(e) => setModeloTexto(e.target.value)}
                placeholder="Digite o modelo de recurso aqui..."
                className="min-h-[400px] resize-none border-border bg-background text-foreground"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Este modelo será usado como base para criar recursos para os leads.
              </p>
            </div>
          </div>
        </div>

        <DrawerFooter className="flex flex-row justify-end gap-2">
          <DrawerClose asChild>
            <Button variant="outline" disabled={isSaving}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
          </DrawerClose>
          
          <Button 
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="min-w-[120px]"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Salvando..." : "Salvar"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
} 