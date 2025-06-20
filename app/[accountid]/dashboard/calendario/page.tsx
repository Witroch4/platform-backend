"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import useAgendamentos from "@/hooks/useAgendamentos";
import { toast } from "sonner";
import axios from "axios";
import { useRouter, useParams } from "next/navigation";

interface Agendamento {
  id: string;
  Data: string;
  Descricao: string;
  // Outros campos se necessário…
}

interface CalendarParams {
  accountid: string;
  [key: string]: string | string[];
}

export default function CalendarioPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const params = useParams() as CalendarParams;

  // Pega userID da sessão
  const userID = session?.user?.id;
  
  // Use o accountid do parâmetro da URL como providerAccountId
  const igUserId = params.accountid;

  // Carrega agendamentos usando o hook
  const { agendamentos, loading, error, refetch } = useAgendamentos(userID);

  // Estado para o dia selecionado e para controlar o diálogo
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Filtra os agendamentos do dia selecionado
  const appointmentsForSelectedDay = selectedDay
    ? agendamentos.filter((ag) =>
        isSameDay(new Date(ag.Data), selectedDay)
      )
    : [];

  // Cria um conjunto de strings (no formato "yyyy-MM-dd") para os dias que possuem agendamento
  const appointmentDays = new Set(
    agendamentos.map((ag) => format(new Date(ag.Data), "yyyy-MM-dd"))
  );

  // Quando o usuário seleciona um dia, atualiza o estado e abre o diálogo
  const handleDaySelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDay(date);
    setDialogOpen(true);
  };

  // Função para excluir um agendamento
  const handleDelete = async (agendamentoId: string) => {
    try {
      const response = await axios.delete(`/api/agendar/${agendamentoId}`);
      if (response.status === 200) {
        toast("Agendamento Excluído", { description: "O agendamento foi excluído com sucesso."  });
        refetch();
      }
    } catch (err: any) {
      toast("Erro ao Excluir", { description: err.response?.data?.message ||
          "Ocorreu um erro ao excluir o agendamento."  });
    }
  };

  // Função para editar um agendamento (navega para a página de edição)
  const handleEditarAgendamento = (agendamentoId: string) => {
    if (!params.accountid) return;
    router.push(`/${params.accountid}/dashboard/agendamento/editar/${agendamentoId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="p-4 sm:p-10 space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Calendário de Agendamentos</h1>

        {/* Exibe loading enquanto busca */}
        {loading && (
          <div className="flex justify-center items-center">
            <DotLottieReact
              src="/animations/loading.lottie"
              autoplay
              loop
              style={{ width: 150, height: 150 }}
              aria-label="Carregando agendamentos"
            />
          </div>
        )}

        {error && <p className="text-destructive">{error}</p>}

        {/* Se não estiver loading, renderiza o componente de calendário */}
        {!loading && (
          <div className="bg-card border border-border rounded-lg p-6">
            <Calendar
              mode="single"
              selected={selectedDay || undefined}
              onSelect={handleDaySelect}
              locale={ptBR}
              className="bg-card text-card-foreground"
              /*
                Utilizando os modificadores para marcar (ex.: sublinhar) os dias
                que possuem algum agendamento.
                Essa funcionalidade depende da implementação
                do seu componente Calendar (baseado em react-day-picker, por exemplo).
              */
              modifiers={{
                hasAppointments: (date: Date) =>
                  appointmentDays.has(format(date, "yyyy-MM-dd")),
              }}
              modifiersClassNames={{
                hasAppointments: "underline font-semibold text-primary",
              }}
            />
          </div>
        )}

        {/* Diálogo que exibe os agendamentos do dia selecionado */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md bg-background border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                Agendamentos para{" "}
                {selectedDay ? format(selectedDay, "dd/MM/yyyy") : ""}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {appointmentsForSelectedDay.length > 0
                  ? "Clique em editar ou excluir para gerenciar o agendamento."
                  : "Nenhum agendamento para este dia."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 my-4">
              {appointmentsForSelectedDay.map((ag) => (
                <div
                  key={ag.id}
                  className="flex items-center justify-between p-3 border border-border rounded bg-card"
                >
                  <div>
                    <p className="font-semibold text-card-foreground">
                      {format(new Date(ag.Data), "HH:mm:ss")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {ag.Descricao}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleEditarAgendamento(ag.id)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(ag.id)}
                    >
                      Excluir
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={() => setDialogOpen(false)}>Concluir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
