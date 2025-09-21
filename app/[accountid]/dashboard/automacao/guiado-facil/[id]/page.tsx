//app\dashboard\automacao\guiado-facil\[id]\page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState, use } from "react";

import LoadingState from "../../components/WIT-EQ/LoadingState";
import UnauthenticatedState from "../../components/WIT-EQ/UnauthenticatedState";
import ErrorState from "../../components/WIT-EQ/ErrorState";
import PostSelection from "../../components/WIT-EQ/PostSelection";
import PalavraExpressaoSelection from "../../components/WIT-EQ/PalavraExpressaoSelection";
import PreviewPhoneMockup from "../../components/PreviewPhoneMockup";
import ToggleActions from "../../components/WIT-EQ/ToggleActions";

import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Tipagens para dados do Instagram
interface InstagramUserData {
  id: string;
  username: string;
  media_count: number;
  profile_picture_url?: string;
}

export interface InstagramMediaItem {
  id: string;
  caption?: string;
  media_url?: string;
  media_type?: string;
  thumbnail_url?: string;
  media_product_type?: string;
  like_count?: number;
  comments_count?: number;
}

// Atualize a tipagem para incluir o novo campo emailPrompt
interface AutomacaoDB {
  id: string;
  selectedMediaId: string | null;
  anyMediaSelected: boolean;
  anyword: boolean;
  palavrasChave: string | null;
  fraseBoasVindas: string | null;
  quickReplyTexto: string | null;
  mensagemEtapa3: string | null;
  linkEtapa3: string | null;
  legendaBotaoEtapa3: string | null;
  responderPublico: boolean;
  pedirEmailPro: boolean;
  emailPrompt: string | null;
  pedirParaSeguirPro: boolean;
  followPrompt: string | null;
  contatoSemClique: boolean;
  noClickPrompt: string | null;
  publicReply: string | null; // JSON string
  live: boolean;
  accountId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

interface PalavraExpressaoSelectionProps {
  anyword: boolean;
  setAnyword: (value: boolean) => void;
  inputPalavra: string;
  setInputPalavra: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

interface PageParams {
  id: string;
  accountid: string;
  [key: string]: string | string[]; // adiciona índice de assinatura necessário
}

interface PostSelectionProps {
  anyMediaSelected: boolean;
  setAnyMediaSelected: (value: boolean) => void;
  selectedPost: InstagramMediaItem | null;
  setSelectedPost: (post: InstagramMediaItem | null) => void;
  instagramMedia: InstagramMediaItem[];
  openDialog: boolean;
  setOpenDialog: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
  onSelectPost?: () => void;
  children?: React.ReactNode;
}

export default function EditPage() {
  const { data: session, status } = useSession();
  
  const router = useRouter();
  const params = useParams<PageParams>();
  const id = params?.id;
  const providerAccountId = params?.accountid;

  if (!id || !providerAccountId) {
    return <div>Parâmetros da rota não fornecidos</div>;
  }

  // Estados para dados do Instagram
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [instagramUser, setInstagramUser] = useState<InstagramUserData | null>(null);
  const [instagramMedia, setInstagramMedia] = useState<InstagramMediaItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Estados para dados da automação
  const [loadingAuto, setLoadingAuto] = useState(true);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const [automacaoData, setAutomacaoData] = useState<AutomacaoDB | null>(null);

  // Estados para seleção de postagem
  const [selectedPost, setSelectedPost] = useState<InstagramMediaItem | null>(null);
  const [anyMediaSelected, setAnyMediaSelected] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);

  // Estados para palavras-chave
  const [anyword, setAnyword] = useState(false);
  const [inputPalavra, setInputPalavra] = useState("");

  // Etapa 2: DM de Boas-Vindas
  const [dmWelcomeMessage, setDmWelcomeMessage] = useState("");
  const [dmQuickReply, setDmQuickReply] = useState("");

  // Etapa 3: DM com Link
  const [dmSecondMessage, setDmSecondMessage] = useState("");
  const [dmLink, setDmLink] = useState("");
  const [dmButtonLabel, setDmButtonLabel] = useState("");

  // Etapa 4: Outros recursos
  const [switchResponderComentario, setSwitchResponderComentario] = useState(false);
  const [publicReply1, setPublicReply1] = useState("Obrigado! ❤️ Por favor, veja DMs.");
  const [publicReply2, setPublicReply2] = useState("Te enviei uma mensagem ✅️  Verificar.");
  const [publicReply3, setPublicReply3] = useState("Que bom 👍 Verifica as tuas DMs.");

  // Switch para Pedir email PRO
  const [switchPedirEmail, setSwitchPedirEmail] = useState(false);
  const [emailPrompt, setEmailPrompt] = useState(
    "✨ Pronto! Antes de compartilhar o link, quero que você saiba que eu guardo o melhor conteúdo só para os meus inscritos! 🤗💖\n\nQuer receber as melhores novidades? 🥳💌 Adicione seu email abaixo e fique por dentro de tudo! Não perca essa chance! 🚀👇"
  );

  // Switch para Pedir para Seguir PRO
  const [switchPedirParaSeguir, setSwitchPedirParaSeguir] = useState(false);
  const [followPrompt, setFollowPrompt] = useState(
    "Você está quase lá! 🚀 Este link é exclusivo para meus seguidores ✨ Me segue agora e eu te envio o link para você aproveitar tudo! 🎉"
  );

  // Switch para Entrar em Contato caso não cliquem no link
  const [switchEntrarEmContato, setSwitchEntrarEmContato] = useState(false);
  const [noClickPrompt, setNoClickPrompt] = useState(
    "🔥 Quer saber mais? Então não esquece de clicar no link aqui embaixo! ⬇️✨ Tenho certeza de que você vai amar! ❤️😍🚀"
  );

  // Estado de Preview
  const [toggleValue, setToggleValue] = useState<"publicar" | "comentarios" | "dm">("publicar");
  const [commentContent, setCommentContent] = useState("");

  // Função para carregar mais publicações
  const loadMorePosts = async () => {
    if (loadingMore || !hasMore || !providerAccountId) return;

    try {
      setLoadingMore(true);
      const url = `/api/instagram/posts?providerAccountId=${providerAccountId}${nextPageToken ? `&after=${nextPageToken}` : ''}`;
      const res = await fetch(url);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Erro ao buscar dados do Instagram");
      }

      const data = await res.json();
      const newMedia = [...instagramMedia, ...(data.media || [])];
      setInstagramMedia(newMedia);
      setNextPageToken(data.paging?.cursors?.after || null);
      setHasMore(!!data.paging?.next);

      // Se estamos procurando por uma mídia específica, verificar se ela está nos novos posts
      if (automacaoData?.selectedMediaId) {
        const foundPost = data.media?.find((media: InstagramMediaItem) => media.id === automacaoData.selectedMediaId);
        if (foundPost) {
          setSelectedPost(foundPost);
          setCommentContent(foundPost.caption || "");
          setToggleValue("comentarios");
        }
      }
    } catch (err: any) {
      console.error("Erro ao carregar mais publicações:", err);
      toast("Erro", { description: "Não foi possível carregar mais publicações."  });
    } finally {
      setLoadingMore(false);
    }
  };

  // Carregar dados do Instagram
  useEffect(() => {
    const fetchInstagramData = async () => {
      if (status === "authenticated" && providerAccountId) {
        try {
          const res = await fetch(`/api/instagram/posts?providerAccountId=${providerAccountId}`);

          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || "Erro ao buscar dados do Instagram");
          }

          const data = await res.json();
          setInstagramUser(data.user);
          setInstagramMedia(data.media || []);
          setNextPageToken(data.paging?.cursors?.after || null);
          setHasMore(!!data.paging?.next);
          setLoading(false);
        } catch (err: any) {
          console.error("Erro ao conectar com o Instagram:", err);
          setError(err.message || "Erro ao conectar com o Instagram.");
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    fetchInstagramData();
  }, [status, providerAccountId]);

  // Configurar o Intersection Observer para paginação infinita
  useEffect(() => {
    if (!hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMorePosts();
        }
      },
      { threshold: 0.5 }
    );

    const loadMoreTrigger = document.getElementById('load-more-trigger');
    if (loadMoreTrigger) {
      observer.observe(loadMoreTrigger);
    }

    return () => {
      if (loadMoreTrigger) {
        observer.unobserve(loadMoreTrigger);
      }
    };
  }, [hasMore, loadingMore]);

  // Carregar dados da automação
  useEffect(() => {
    async function fetchAutomacao() {
      try {
        const res = await fetch(`/api/automacao/${id}`);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Erro ao carregar automação.");
        }
        const auto: AutomacaoDB = await res.json();
        setAutomacaoData(auto);

        // Atualizar estados com dados da automação
        setAnyMediaSelected(auto.anyMediaSelected);
        setIsLive(auto.live);

        // Etapa 1: Palavra/Expressão
        setAnyword(auto.anyword);
        setInputPalavra(auto.palavrasChave || "");

        // Etapa 2: DM de Boas-Vindas
        setDmWelcomeMessage(auto.fraseBoasVindas || "");
        setDmQuickReply(auto.quickReplyTexto || "");

        // Etapa 3: DM com Link
        setDmSecondMessage(auto.mensagemEtapa3 || "");
        setDmLink(auto.linkEtapa3 || "");
        setDmButtonLabel(auto.legendaBotaoEtapa3 || "");

        // Etapa 4: Outros Recursos
        setSwitchResponderComentario(auto.responderPublico);
        if (auto.publicReply) {
          const replies = JSON.parse(auto.publicReply);
          if (Array.isArray(replies) && replies.length >= 3) {
            setPublicReply1(replies[0]);
            setPublicReply2(replies[1]);
            setPublicReply3(replies[2]);
          }
        }

        // Recursos PRO
        setSwitchPedirEmail(auto.pedirEmailPro);
        setEmailPrompt(auto.emailPrompt || "");
        setSwitchPedirParaSeguir(auto.pedirParaSeguirPro);
        setFollowPrompt(auto.followPrompt || "");
        setSwitchEntrarEmContato(auto.contatoSemClique);
        setNoClickPrompt(auto.noClickPrompt || "");

      } catch (err: any) {
        setAutoError(err.message);
      } finally {
        setLoadingAuto(false);
      }
    }
    fetchAutomacao();
  }, [id, session]);

  // Efeito para definir o post selecionado após carregar os dados do Instagram e da automação
  useEffect(() => {
    if (automacaoData && instagramMedia.length > 0 && automacaoData.selectedMediaId) {
      console.log("Buscando mídia selecionada:", automacaoData.selectedMediaId);
      console.log("Mídias disponíveis:", instagramMedia.map(m => m.id));

      // Primeiro, procurar nas mídias já carregadas
      const foundPost = instagramMedia.find(media => media.id === automacaoData.selectedMediaId);
      console.log("Mídia encontrada:", foundPost);

      if (foundPost) {
        setSelectedPost(foundPost);
        // Se encontrou o post, também define o conteúdo do comentário para o preview
        setCommentContent(foundPost.caption || "");
        setToggleValue("comentarios");
        console.log("Post selecionado definido:", foundPost);
      } else {
        // Se não encontrou o post nas mídias carregadas, tentar carregar mais
        loadMorePosts();
      }
    }
  }, [automacaoData, instagramMedia]);

  if (status === "loading" || loadingAuto || loading) return <LoadingState />;
  if (status === "unauthenticated") return <UnauthenticatedState />;
  if (autoError) return <ErrorState error={autoError} />;
  if (error) return <ErrorState error={error} />;

  function validarEtapas(): boolean {
    if (!anyMediaSelected && !selectedPost) {
      toast("Erro", { description: "Selecione uma publicação específica ou escolha 'Qualquer Publicação'"  });
      return false;
    }
    if (!anyword && inputPalavra.trim() === "") {
      toast("Erro", { description: "Preencha as palavras-chave ou selecione 'qualquer'."  });
      return false;
    }
    if (dmWelcomeMessage.trim() === "" || dmQuickReply.trim() === "") {
      toast("Erro", { description: "Preencha a DM de boas-vindas e o Quick Reply."  });
      return false;
    }
    if (dmSecondMessage.trim() === "" || dmLink.trim() === "" || dmButtonLabel.trim() === "") {
      toast("Erro", { description: "Preencha a mensagem" });
      return false;
    }
    if (switchResponderComentario) {
      if (publicReply1.trim() === "" || publicReply2.trim() === "" || publicReply3.trim() === "") {
        toast("Erro", { description: "Preencha as 3 opções de respostas públicas antes de ativar." });
        return false;
      }
    }
    return true;
  }

  async function handleAtivarAutomacao() {
    if (!validarEtapas()) return;
    try {
      const publicReplyArray = [publicReply1, publicReply2, publicReply3];
      const publicReplyJson = switchResponderComentario ? JSON.stringify(publicReplyArray) : null;

      const payload = {
        // Etapa 1
        selectedMediaId: selectedPost?.id || null,
        anyMediaSelected: anyMediaSelected,
        palavrasChave: !anyword ? inputPalavra : null,
        // Etapa 2
        fraseBoasVindas: dmWelcomeMessage,
        quickReplyTexto: dmQuickReply,
        // Etapa 3
        mensagemEtapa3: dmSecondMessage,
        linkEtapa3: dmLink,
        legendaBotaoEtapa3: dmButtonLabel,
        // Etapa 4
        responderPublico: switchResponderComentario,
        pedirEmailPro: switchPedirEmail,
        emailPrompt: switchPedirEmail ? emailPrompt : null,
        pedirParaSeguirPro: switchPedirParaSeguir,
        followPrompt: switchPedirParaSeguir ? followPrompt : null,
        contatoSemClique: switchEntrarEmContato,
        noClickPrompt: switchEntrarEmContato ? noClickPrompt : null,
        publicReply: publicReplyJson,
        live: isLive,
      };

      const res = await fetch(`/api/automacao/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateAll", data: payload }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Erro ao atualizar automação.");
      }

      toast("Sucesso", { description: "Automação atualizada com sucesso!" });

      setIsEditing(false);
    } catch (error: any) {
      console.error("Erro ao atualizar automação:", error.message);
      toast("Falha", { description: "Erro ao atualizar automação: " + error.message });
    }
  }

  async function handleClickEdit() {
    if (isEditing) {
      // Se estamos cancelando a edição, restaurar os dados originais da automação
      if (automacaoData) {
        // Restaurar seleção de mídia
        setAnyMediaSelected(automacaoData.anyMediaSelected);

        // Restaurar post selecionado se houver um ID de mídia salvo
        if (automacaoData.selectedMediaId) {
          const foundPost = instagramMedia.find(media => media.id === automacaoData.selectedMediaId);
          if (foundPost) {
            setSelectedPost(foundPost);
            setCommentContent(foundPost.caption || "");
            setToggleValue("comentarios");
          } else {
            // Se não encontrou o post nas mídias carregadas, tentar carregar mais
            setSelectedPost(null);
            loadMorePosts();
          }
        } else {
          setSelectedPost(null);
        }

        // Restaurar outros campos
        setAnyword(automacaoData.anyword);
        setInputPalavra(automacaoData.palavrasChave || "");
        setDmWelcomeMessage(automacaoData.fraseBoasVindas || "");
        setDmQuickReply(automacaoData.quickReplyTexto || "");
        setDmSecondMessage(automacaoData.mensagemEtapa3 || "");
        setDmLink(automacaoData.linkEtapa3 || "");
        setDmButtonLabel(automacaoData.legendaBotaoEtapa3 || "");
        setSwitchResponderComentario(automacaoData.responderPublico);
        setSwitchPedirEmail(automacaoData.pedirEmailPro);
        setEmailPrompt(automacaoData.emailPrompt || "");
        setSwitchPedirParaSeguir(automacaoData.pedirParaSeguirPro);
        setFollowPrompt(automacaoData.followPrompt || "");
        setSwitchEntrarEmContato(automacaoData.contatoSemClique);
        setNoClickPrompt(automacaoData.noClickPrompt || "");
        setIsLive(automacaoData.live);

        // Restaurar respostas públicas se existirem
        if (automacaoData.publicReply) {
          try {
            const replies = JSON.parse(automacaoData.publicReply);
            if (Array.isArray(replies) && replies.length >= 3) {
              setPublicReply1(replies[0]);
              setPublicReply2(replies[1]);
              setPublicReply3(replies[2]);
            }
          } catch (e) {
            console.error("Erro ao analisar respostas públicas:", e);
          }
        }
      }
    }
    setIsEditing((prev) => !prev);
  }

  async function handleClickPauseOrSalvar() {
    if (isEditing) {
      await handleAtivarAutomacao();
      setIsEditing(false);
    } else {
      try {
        const newLiveStatus = !isLive;
        const res = await fetch(`/api/automacao/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "updateAll", data: { live: newLiveStatus } }),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Erro ao atualizar status.");
        }
        setIsLive(newLiveStatus);
        toast("Sucesso", {
          description: `Automação ${newLiveStatus ? "ativada" : "pausada"} com sucesso!`,
        });
      } catch (error: any) {
        console.error("Erro ao atualizar status:", error.message);
        toast("Falha", { description: "Erro ao atualizar status: " + error.message });
      }
    }
  }

  const editButtonLabel = isEditing ? "Cancelar" : "Editar";
  const pauseButtonLabel = isEditing ? "Salvar" : isLive ? "Pausar" : "Ativar";

  const ultimasPostagens = instagramMedia.slice(0, 4);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "20px",
        gap: "20px",
      }}
    >
      {/* COLUNA ESQUERDA – FORMULÁRIO */}
      <div
        style={{
          flex: 1,
          borderRight: "1px solid #333",
          paddingRight: "20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <PostSelection
          anyMediaSelected={anyMediaSelected}
          setAnyMediaSelected={setAnyMediaSelected}
          selectedPost={selectedPost}
          setSelectedPost={setSelectedPost}
          instagramMedia={instagramMedia}
          openDialog={openDialog}
          setOpenDialog={setOpenDialog}
          disabled={!isEditing}
          className={!isEditing ? "cursor-not-allowed" : ""}
          onSelectPost={() => {
            // Selecione manualmente um post
            if (selectedPost) {
              setCommentContent(selectedPost.caption || "");
              setToggleValue("comentarios");
            }
          }}
        >
          <div style={{ width: "100%", marginBottom: "10px" }}>
            {loadingMore && (
              <div className="text-center py-4">
                <span className="text-sm text-muted-foreground">Carregando mais publicações...</span>
              </div>
            )}
            {hasMore && <div id="load-more-trigger" className="h-10" />}
          </div>
        </PostSelection>

        <PalavraExpressaoSelection
          anyword={anyword}
          setAnyword={setAnyword}
          inputPalavra={inputPalavra}
          setInputPalavra={(val) => {
            setInputPalavra(val);
            setCommentContent(val);
            if (val.trim() !== "") setToggleValue("comentarios");
            else setToggleValue("publicar");
          }}
          disabled={!isEditing}
          className={!isEditing ? "cursor-not-allowed" : ""}
        />

        <Separator className="my-4 w-full" />

        {/* Etapa 2 */}
        <div style={{ width: "100%" }} className={!isEditing ? "opacity-70" : ""}>
          <h3 className="text-lg font-semibold">Etapa 2</h3>
          <p className="text-sm text-muted-foreground mb-2">(Inicialmente, eles receberão uma DM de boas-vindas)</p>
          <div className="mt-4">
            <label className="text-sm font-semibold" htmlFor="dmWelcomeMessage">
              Mensagem de boas-vindas
            </label>
            <Textarea
              id="dmWelcomeMessage"
              className={`mt-2 ${!isEditing ? "cursor-not-allowed bg-muted" : ""}`}
              value={dmWelcomeMessage}
              onChange={(e) => setDmWelcomeMessage(e.target.value)}
              onFocus={() => setToggleValue("dm")}
              readOnly={!isEditing}
            />
          </div>
          <div className="mt-4">
            <label className="text-sm font-semibold" htmlFor="dmQuickReply">
              Quick Reply (ex.: "Me envie o link")
            </label>
            <Input
              id="dmQuickReply"
              className={`mt-2 ${!isEditing ? "cursor-not-allowed bg-muted" : ""}`}
              value={dmQuickReply}
              onChange={(e) => setDmQuickReply(e.target.value)}
              onFocus={() => setToggleValue("dm")}
              disabled={!isEditing}
            />
          </div>
        </div>

        <Separator className="my-4 w-full" />

        {/* Etapa 3 */}
        <div style={{ width: "100%" }} className={!isEditing ? "opacity-70" : ""}>
          <h3 className="text-lg font-semibold">Etapa 3</h3>
          <p className="text-sm text-muted-foreground mb-2">(Logo depois, a DM com o link será enviada)</p>
          <div className="mt-4">
            <label className="text-sm font-semibold" htmlFor="dmSecondMessage">
              Escreva uma mensagem
            </label>
            <Textarea
              id="dmSecondMessage"
              className={`mt-2 ${!isEditing ? "cursor-not-allowed bg-muted" : ""}`}
              value={dmSecondMessage}
              onChange={(e) => setDmSecondMessage(e.target.value)}
              onFocus={() => setToggleValue("dm")}
              readOnly={!isEditing}
            />
          </div>
          <div className="mt-4">
            <label className="text-sm font-semibold" htmlFor="dmLink">
              Adicionar um link
            </label>
            <Input
              id="dmLink"
              className={`mt-2 ${!isEditing ? "cursor-not-allowed bg-muted" : ""}`}
              value={dmLink}
              onChange={(e) => setDmLink(e.target.value)}
              onFocus={() => setToggleValue("dm")}
              disabled={!isEditing}
            />
          </div>
          <div className="mt-4">
            <label className="text-sm font-semibold" htmlFor="dmButtonLabel">
              Adicione legenda ao botão
            </label>
            <Input
              id="dmButtonLabel"
              className={`mt-2 ${!isEditing ? "cursor-not-allowed bg-muted" : ""}`}
              value={dmButtonLabel}
              onChange={(e) => setDmButtonLabel(e.target.value)}
              onFocus={() => setToggleValue("dm")}
              disabled={!isEditing}
            />
          </div>
        </div>

        <Separator className="my-4 w-full" />

        {/* Etapa 4 */}
        <div style={{ width: "100%" }} className={!isEditing ? "opacity-70" : ""}>
          <h3 className="text-lg font-semibold">Etapa 4</h3>
          <p className="text-sm text-muted-foreground mb-4">(Outros recursos para automatizar)</p>
          <TooltipProvider>
            <div className="flex items-center space-x-2 mb-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="switchResponderComentario"
                      checked={switchResponderComentario}
                      onCheckedChange={(checked) => setSwitchResponderComentario(checked)}
                      disabled={!isEditing}
                      className={!isEditing ? "cursor-not-allowed" : ""}
                    />
                    <Label htmlFor="switchResponderComentario">
                      Responder ao comentário de forma pública
                    </Label>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Defina 3 respostas públicas que serão escolhidas aleatoriamente.</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
          {switchResponderComentario && (
            <div className="space-y-2 mb-4 mt-2">
              <Input
                value={publicReply1}
                onChange={(e) => setPublicReply1(e.target.value)}
                disabled={!isEditing}
                className={`${!isEditing ? "cursor-not-allowed bg-muted" : ""}`}
                placeholder="Resposta Pública 1"
              />
              <Input
                value={publicReply2}
                onChange={(e) => setPublicReply2(e.target.value)}
                disabled={!isEditing}
                className={`${!isEditing ? "cursor-not-allowed bg-muted" : ""}`}
                placeholder="Resposta Pública 2"
              />
              <Input
                value={publicReply3}
                onChange={(e) => setPublicReply3(e.target.value)}
                disabled={!isEditing}
                className={`${!isEditing ? "cursor-not-allowed bg-muted" : ""}`}
                placeholder="Resposta Pública 3"
              />
            </div>
          )}

          {/* Switch para Pedir email PRO */}
          <div className="flex items-center space-x-2 mb-2">
            <Switch
              id="switchPedirEmail"
              checked={switchPedirEmail}
              onCheckedChange={(checked) => setSwitchPedirEmail(checked)}
              disabled={!isEditing}
              className={!isEditing ? "cursor-not-allowed" : ""}
            />
            <Label htmlFor="switchPedirEmail" className="text-sm font-medium">
              Pedir email <span className="text-xs text-muted-foreground">PRO</span>
            </Label>
          </div>
          {switchPedirEmail && (
            <div className="mb-4">
              <Textarea
                id="emailPrompt"
                value={emailPrompt}
                onChange={(e) => setEmailPrompt(e.target.value)}
                placeholder="Digite sua mensagem para solicitação de email"
                className={`mt-2 ${!isEditing ? "cursor-not-allowed" : ""}`}
                disabled={!isEditing}
              />
            </div>
          )}

          {/* Switch para Pedir para Seguir PRO */}
          <div className="flex items-center space-x-2 mb-2">
            <Switch
              id="switchPedirParaSeguir"
              checked={switchPedirParaSeguir}
              onCheckedChange={(checked) => setSwitchPedirParaSeguir(checked)}
              disabled={!isEditing}
              className={!isEditing ? "cursor-not-allowed" : ""}
            />
            <Label htmlFor="switchPedirParaSeguir" className="text-sm font-medium">
              Pedir para seguir antes de enviar o link <span className="text-xs text-muted-foreground">PRO</span>
            </Label>
          </div>
          {switchPedirParaSeguir && (
            <div className="mb-4">
              <Textarea
                id="followPrompt"
                value={followPrompt}
                onChange={(e) => setFollowPrompt(e.target.value)}
                placeholder="Você está quase lá! 🚀 Este link é exclusivo para meus seguidores..."
                className={`mt-2 ${!isEditing ? "cursor-not-allowed" : ""}`}
                disabled={!isEditing}
              />
            </div>
          )}

          {/* Switch para Entrar em Contato caso não cliquem no link */}
          <div className="flex items-center space-x-2 mb-2">
            <Switch
              id="switchEntrarEmContato"
              checked={switchEntrarEmContato}
              onCheckedChange={(checked) => setSwitchEntrarEmContato(checked)}
              disabled={!isEditing}
              className={!isEditing ? "cursor-not-allowed" : ""}
            />
            <Label htmlFor="switchEntrarEmContato" className="text-sm font-medium">
              Entrar em contato caso não cliquem no link
            </Label>
          </div>
          {switchEntrarEmContato && (
            <div className="mb-4">
              <Textarea
                id="noClickPrompt"
                value={noClickPrompt}
                onChange={(e) => setNoClickPrompt(e.target.value)}
                placeholder="🔥 Quer saber mais? Então não esquece de clicar no link aqui embaixo! ⬇️✨ Tenho certeza de que você vai amar! ❤️😍🚀"
                className={`mt-2 ${!isEditing ? "cursor-not-allowed" : ""}`}
                disabled={!isEditing}
              />
            </div>
          )}

          {/* Switch para controlar o status live */}
          <div className="flex items-center space-x-2 mb-4 mt-4">
            <Switch
              id="switchLive"
              checked={isLive}
              onCheckedChange={(checked) => setIsLive(checked)}
              disabled={!isEditing}
              className={!isEditing ? "cursor-not-allowed" : ""}
            />
            <Label htmlFor="switchLive">
              {isLive ? "Automação Ativa" : "Automação Pausada"}
            </Label>
          </div>
        </div>

        {/* Botões Editar/Pausar ou Cancelar/Salvar */}
        <div style={{ marginTop: "20px", width: "100%" }}>
          <Button variant="outline"  onClick={handleClickEdit} style={{ marginRight: "10px" }}>
            {isEditing ? "Cancelar" : "Editar"}
          </Button>
          <Button variant="outline"  onClick={handleClickPauseOrSalvar}>
            {isEditing ? "Salvar" : isLive ? "Pausar" : "Ativar"}
          </Button>
        </div>
      </div>

      {/* COLUNA DIREITA – PREVIEW */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: "100%", marginBottom: "10px" }}>
          <span style={{ fontWeight: "bold", fontSize: "16px" }}>Preview</span>
        </div>
        <PreviewPhoneMockup
          selectedPost={selectedPost}
          instagramUser={instagramUser}
          toggleValue={toggleValue}
          commentContent={commentContent}
          dmWelcomeMessage={dmWelcomeMessage}
          dmQuickReply={dmQuickReply}
          dmSecondMessage={dmSecondMessage}
          dmLink={dmLink}
          dmButtonLabel={dmButtonLabel}
          responderPublico={switchResponderComentario}
          publicReply1={publicReply1}
        />
        <ToggleActions toggleValue={toggleValue} setToggleValue={setToggleValue} />
      </div>
    </div>
  );
}
