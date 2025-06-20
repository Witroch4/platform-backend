//app/[accountid]/dashboard/agendamento/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import axios from "axios";
import { useRouter, useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
} from "@/components/ui/drawer";

import AgendamentoForm from "@/app/[accountid]/dashboard/agendamento/components/AgendamentoForm";
import AgendamentosList from "@/app/[accountid]/dashboard/agendamento/components/AgendamentosList";

import { UploadedFile } from "@/components/custom/FileUpload";
import { toast } from "sonner";
import useAgendamentos from "@/hooks/useAgendamentos";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";

const AgendamentoDePostagens: React.FC = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const accountid = params?.accountid as string;

  // userID do usuário logado
  const userID = session?.user?.id;
  const IGtoken = session?.user?.instagramAccessToken;

  // Estado combinado para data e hora
  const [dateTime, setDateTime] = useState<Date | undefined>(new Date());
  const [tipoPostagem, setTipoPostagem] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [legenda, setLegenda] = useState<string>("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  // Estados para controle de tratamento de mídias
  const [tratarMidiasComoUnica, setTratarMidiasComoUnica] = useState(true);
  const [tratarMidiasComoIndividuais, setTratarMidiasComoIndividuais] = useState(false);

  // Estados que controlam os Popovers do Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Hook para buscar agendamentos (recebe apenas userID, accountid vem da URL)
  const { agendamentos, loading, error, refetch } = useAgendamentos(userID);

  // Função para lidar com o agendamento
  const handleAgendar = async () => {
    if (!dateTime) {
      toast("Agendamento Incompleto", { description: "Por favor, preencha todos os campos obrigatórios." });
      return;
    }

    if (!userID) {
      toast("Usuário Não Autenticado", { description: "Por favor, faça login para continuar." });
      return;
    }

    if (!IGtoken) {
      toast("Token do Instagram Não Disponível", { description: "Não foi possível obter o token do Instagram."  });
      return;
    }

    setUploading(true);

    try {
      const midiaNames = uploadedFiles
        .map((file) => file.name)
        .filter(Boolean) as string[];

      if (midiaNames.length === 0) {
        toast("Mídia Não Enviada", { description: "Por favor, selecione pelo menos uma mídia para enviar." });
        setUploading(false);
        return;
      }

      console.log(`[Agendamento] Processando ${midiaNames.length} mídias:`, midiaNames);

      const tipos = {
        "Post Normal": tipoPostagem.includes("Post Normal"),
        Reels: tipoPostagem.includes("Reels"),
        Stories: tipoPostagem.includes("Stories"),
        Diario: tipoPostagem.includes("Diario"),
        Semanal: tipoPostagem.includes("Semanal"),
        Aleatorio: tipoPostagem.includes("Aleatório"),
      };

      // Verifica se pelo menos um tipo de postagem foi selecionado
      if (!tipos["Post Normal"] && !tipos.Reels && !tipos.Stories) {
        toast("Tipo de Postagem Não Selecionado", { description: "Por favor, selecione um tipo de postagem." });
        setUploading(false);
        return;
      }

      const isoDate = dateTime.toISOString();

      // Gera um AgendamentoID único para todas as postagens deste agendamento
      const agendamentoID = `ag-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      console.log(`[Agendamento] Criado AgendamentoID: ${agendamentoID}`);

      // Determina se deve tratar cada mídia como postagem individual
      const isPostagemIndividual = tipos.Aleatorio && tratarMidiasComoIndividuais;
      console.log(`[Agendamento] Tratando como postagem individual: ${isPostagemIndividual}`);

      // Mesmo quando for postagem individual, criamos apenas um agendamento com todas as mídias
      console.log(`[Agendamento] Criando um único agendamento com ${uploadedFiles.length} mídias`);

      const newRow = {
        Data: isoDate,
        Descrição: legenda,
        Facebook: false,
        midia: uploadedFiles.map((file) => ({
          name: file.name,
          url: file.url,
          thumbnail_url: file.thumbnail_url,
          mimeType: file.mime_type
        })),
        midias: uploadedFiles.map((file) => ({
          name: file.name,
          url: file.url,
          thumbnail_url: file.thumbnail_url,
          mime_type: file.mime_type
        })),
        Instagram: true,
        Stories: tipos.Stories,
        Reels: tipos.Reels,
        PostNormal: tipos["Post Normal"],
        Diario: tipos.Diario,
        Semanal: tipos.Semanal,
        Randomizar: tipos.Aleatorio,
        IGtoken: IGtoken,
        userID: userID,
        igUserId: accountid,
        TratarComoIndividual: isPostagemIndividual,
        TratarComoPostagensIndividuais: isPostagemIndividual,
        AgendamentoID: agendamentoID, // Usa o mesmo AgendamentoID para todas as mídias
      };

      try {
        const response = await axios.post(`/api/${accountid}/agendar`, newRow, {
          headers: {
            "Content-Type": "application/json",
          },
        });

        console.log(`[Agendamento] Agendamento único criado com sucesso, ID: ${response.data.id}`);

        setUploading(false);

        if (response.status === 200 || response.status === 201) {
          toast("Agendamento Criado com Sucesso!", { description: `Data: ${format(dateTime, "dd/MM/yyyy")} às ${format(dateTime, "HH:mm:ss")}`,
            action: (
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  router.refresh();
                }}
              >
                Ver Agendamento
              </Button>
            ),
          });

          // Limpar o formulário após o sucesso
          setDateTime(new Date());
          setTipoPostagem([]);
          setLegenda("");
          setUploadedFiles([]);
          setDrawerOpen(false);

          refetch();
        } else {
          toast.error("Erro ao Agendar", { description: "Ocorreu um erro inesperado. Por favor, tente novamente." });
        }
      } catch (error: any) {
        console.error("[Agendamento] Erro ao criar agendamento único:", error);

        setUploading(false);

        toast("Erro ao Agendar", { description: error.response?.data?.error || "Ocorreu um erro ao agendar a postagem." });
      }
    } catch (error: any) {
      setUploading(false);
      console.error("Erro ao agendar a postagem:", error);
      const errorMsg =
        error.response?.data?.error ||
        error.response?.data?.details ||
        "Ocorreu um erro ao agendar a postagem.";
      toast("Erro ao Agendar", { description: errorMsg });
    }
  };

  // Função que adapta o setter para aceitar SetStateAction completo
  const handleSetDateTime: React.Dispatch<React.SetStateAction<Date | undefined>> =
    (value) => {
      if (typeof value === "function") {
        setDateTime(value);
      } else if (value !== undefined) {
        setDateTime(value);
      }
    };

  // Redirecionamento ou alerta se não estiver autenticado
  useEffect(() => {
    if (status === "loading") return; // Não faça nada enquanto estiver carregando
    if (!session) {
      console.warn("Usuário não autenticado.");
      // Implementar redirecionamento se necessário
    }
  }, [session, status]);

  return (
    <div className="min-h-screen bg-background">
      <main className="p-4 sm:p-10 space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Agendamento de Postagens</h1>

        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerTrigger asChild>
            <Button variant="outline" className="border-border hover:bg-accent">Novo Agendamento</Button>
          </DrawerTrigger>
          {/* Ajuste no overflow */}
          <DrawerContent className="fixed bottom-0 left-0 right-0 h-3/4 bg-background border-border rounded-t-xl shadow-lg overflow-visible">
            <AgendamentoForm
              dateTime={dateTime}
              setDateTime={handleSetDateTime}
              tipoPostagem={tipoPostagem}
              setTipoPostagem={setTipoPostagem}
              legenda={legenda}
              setLegenda={setLegenda}
              uploadedFiles={uploadedFiles}
              setUploadedFiles={setUploadedFiles}
              handleAgendar={handleAgendar}
              uploading={uploading}
              setDrawerOpen={setDrawerOpen}
              tratarMidiasComoUnica={tratarMidiasComoUnica}
              setTratarMidiasComoUnica={setTratarMidiasComoUnica}
              tratarMidiasComoIndividuais={tratarMidiasComoIndividuais}
              setTratarMidiasComoIndividuais={setTratarMidiasComoIndividuais}
            />
          </DrawerContent>
        </Drawer>

        {/* Listagem de Agendamentos */}
        <section>
          <h2 className="text-xl font-semibold mb-4 text-foreground">Seus Agendamentos</h2>
          {status === "loading" && <p className="text-muted-foreground">Carregando sessão...</p>}
          {!session && <p className="text-muted-foreground">Você precisa estar logado para ver os agendamentos.</p>}

          {session && (
            <>
              {loading && (
                <div className="flex justify-center items-center">
                  <DotLottieReact
                    src="/animations/loading.lottie"
                    autoplay
                    loop={true}
                    style={{ width: 150, height: 150 }}
                    aria-label="Carregando agendamentos"
                  />
                </div>
              )}
              {error && <p className="text-destructive">{error}</p>}
              {!loading && agendamentos.length === 0 && (
                <p className="text-muted-foreground">Nenhum agendamento encontrado.</p>
              )}
              {!loading && agendamentos.length > 0 && (
                <AgendamentosList
                  agendamentos={agendamentos}
                  refetch={refetch}
                  accountid={accountid}
                />
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
};

export default AgendamentoDePostagens;
