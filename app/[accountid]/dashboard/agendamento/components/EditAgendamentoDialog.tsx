"use client";

import type React from "react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "./date-time-picker";
import LegendaInput from "./LegendaInput";
import FileUpload, { type UploadedFile } from "@/components/custom/FileUpload";
import PostTypeSelector from "./PostTypeSelector";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Agendamento } from "@/types/agendamento";

// Estende o tipo Agendamento para incluir informações de grupo
interface AgendamentoExtendido extends Agendamento {
  isGrupo?: boolean;
  totalNoGrupo?: number;
  idsNoGrupo?: string[];
}

interface EditAgendamentoDialogProps {
  agendamento: AgendamentoExtendido;
  isOpen: boolean;
  onClose: () => void;
  refetch: () => void;
  accountid: string;
}

const EditAgendamentoDialog: React.FC<EditAgendamentoDialogProps> = ({
  agendamento,
  isOpen,
  onClose,
  refetch,
  accountid,
}) => {

  // Estado para data/hora
  const [date, setDate] = useState<Date>(new Date(agendamento.Data));

  // Função wrapper para setDate
  const handleDateChange = (newDate: Date | undefined) => {
    if (newDate) {
      setDate(newDate);
    }
  };

  // Verifica se a postagem diária está ativada
  const [tipoPostagem, setTipoPostagem] = useState<string[]>(getTipoPostagemFromAgendamento(agendamento));
  const isPostagemDiaria = tipoPostagem.includes("Diario");

  const [legenda, setLegenda] = useState<string>(agendamento.Descricao || "");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>(
    agendamento.midias?.map((m) => ({
      id: m.id,
      name: m.id,
      original_name: m.url.split("/").pop() || m.id,
      progress: 100, // Mídias existentes já estão uploadadas
      url: m.url,
      thumbnail_url: m.thumbnail_url,
      mime_type: m.mime_type,
      is_image: m.mime_type?.startsWith("image/") || false,
      uploaded_at: m.createdAt,
    })) || []
  );
  const [uploading, setUploading] = useState<boolean>(false);

  function getTipoPostagemFromAgendamento(agendamento: Agendamento): string[] {
    const tipos: string[] = [];
    if (agendamento.Randomizar) tipos.push("Aleatório");
    if (agendamento.Diario) tipos.push("Diario");
    if (agendamento.Semanal) tipos.push("Semanal");
    if (agendamento.PostNormal) tipos.push("Post Normal");
    if (agendamento.Reels) tipos.push("Reels");
    if (agendamento.Stories) tipos.push("Stories");
    return tipos;
  }

  const handleEditar = async () => {
    if (!date) {
      toast("Edição Incompleta", { description: "Por favor, preencha todos os campos obrigatórios." });
      return;
    }

    setUploading(true);

    try {
      const midias = uploadedFiles.map((file) => ({
        id: file.name,
        url: file.url,
        mime_type: file.mime_type,
        thumbnail_url: file.thumbnail_url,
      })).filter(m => m.url && m.mime_type);

      if (midias.length === 0) {
        toast("Mídia Não Enviada", { description: "Por favor, selecione pelo menos uma mídia para enviar." });
        setUploading(false);
        return;
      }

      const tipos = {
        "Post Normal": tipoPostagem.includes("Post Normal"),
        Reels: tipoPostagem.includes("Reels"),
        Stories: tipoPostagem.includes("Stories"),
        Diario: tipoPostagem.includes("Diario"),
        Semanal: tipoPostagem.includes("Semanal"),
        Aleatorio: tipoPostagem.includes("Aleatório"),
      };

      const isoDate = date.toISOString();

      const updatedRow = {
        Data: isoDate,
        Descricao: legenda,
        midias,
        midia: midias,
        Instagram: true,
        Stories: tipos.Stories,
        Reels: tipos.Reels,
        PostNormal: tipos["Post Normal"],
        Diario: tipos.Diario,
        Semanal: tipos.Semanal,
        Randomizar: tipos.Aleatorio,
        userId: agendamento.userId,
        accountId: agendamento.accountId,
      };

      // Se for um grupo, atualiza todos os agendamentos do grupo
      if (agendamento.isGrupo && agendamento.id) {
        const response = await axios.patch(
          `/api/${accountid}/agendar/update-grupo/${agendamento.id}`,
          updatedRow,
          {
            headers: { "Content-Type": "application/json" },
          }
        );

        setUploading(false);

        if (response.status === 200) {
          toast("Grupo de Agendamentos Atualizado com Sucesso!", {
            description: `Foram atualizados ${response.data.count} agendamentos.`,
          });
          refetch();
          onClose();
        } else {
          throw new Error("Erro ao atualizar grupo de agendamentos");
        }
      } else {
        // Atualiza um único agendamento
        const response = await axios.patch(
          `/api/${accountid}/agendar/update/${agendamento.id}`,
          updatedRow,
          {
            headers: { "Content-Type": "application/json" },
          }
        );

        setUploading(false);

        if (response.status === 200) {
          toast("Agendamento Atualizado com Sucesso!", { description: `Data: ${format(date, "dd/MM/yyyy HH:mm")}` });
          refetch();
          onClose();
        } else {
          throw new Error("Erro ao atualizar agendamento");
        }
      }
    } catch (error: any) {
      setUploading(false);
      console.error("Erro ao atualizar o agendamento:", error);
      toast("Erro ao Atualizar Agendamento", { description: error.response?.data?.error || "Ocorreu um erro ao atualizar o agendamento."  });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full sm:w-full max-w-lg sm:max-w-[600px] max-h-[calc(100vh-100px)] p-4 md:p-6">
        <DialogHeader>
          <DialogTitle>Editar Agendamento</DialogTitle>
          <DialogDescription>
            Faça as alterações necessárias no agendamento.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(100vh-250px)]">
          <div className="flex flex-col space-y-4 pr-4">
            {/* Use o wrapper handleDateChange */}
            <DateTimePicker
              date={date}
              setDate={handleDateChange}
              isPostagemDiaria={isPostagemDiaria}
            />
            <LegendaInput legenda={legenda} setLegenda={setLegenda} />
            <FileUpload uploadedFiles={uploadedFiles} setUploadedFiles={setUploadedFiles} />
            <PostTypeSelector tipoPostagem={tipoPostagem} setTipoPostagem={setTipoPostagem} />
          </div>
        </ScrollArea>
        <DialogFooter className="mt-4">
          <Button onClick={handleEditar} disabled={uploading}>
            {uploading ? "Concluindo..." : "Concluir"}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditAgendamentoDialog;
