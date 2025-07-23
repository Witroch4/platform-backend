// app/dashboard/automacao/components/WIT-EQ/PostSelection.tsx

import type { InstagramMediaItem } from "../../guiado-facil/page";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";

interface PostSelectionProps {
  anyMediaSelected: boolean;
  setAnyMediaSelected: (value: boolean) => void;
  selectedPost: InstagramMediaItem | null;
  setSelectedPost: (p: InstagramMediaItem | null) => void;
  instagramMedia: InstagramMediaItem[];
  openDialog: boolean;
  setOpenDialog: (open: boolean) => void;
  onSelectPost?: () => void;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export default function PostSelection({
  anyMediaSelected,
  setAnyMediaSelected,
  selectedPost,
  setSelectedPost,
  instagramMedia,
  openDialog,
  setOpenDialog,
  onSelectPost,
  disabled = false,
  className = "",
  children,
}: PostSelectionProps) {
  // Log para depuração
  console.log("PostSelection - selectedPost:", selectedPost);
  console.log("PostSelection - anyMediaSelected:", anyMediaSelected);

  const params = useParams<{ accountid: string }>();
  const providerAccountId = params?.accountid;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogPosts, setDialogPosts] = useState<InstagramMediaItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Função para carregar mais publicações no dialog
  const loadMorePosts = useCallback(async () => {
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

      // Se não tiver token de paginação, é a primeira carga
      if (!nextPageToken) {
        setDialogPosts(data.media || []);
      } else {
        // Se tiver token, concatena com os posts existentes
        setDialogPosts(prev => [...prev, ...(data.media || [])]);
      }

      setNextPageToken(data.paging?.cursors?.after || null);
      setHasMore(!!data.paging?.next);
    } catch (err: any) {
      console.error("Erro ao carregar mais publicações:", err);
      setError(err.message || "Erro ao carregar mais publicações.");
    } finally {
      setLoadingMore(false);
    }
  }, [providerAccountId, nextPageToken, loadingMore, hasMore]);

  // Configurar o Intersection Observer para o dialog
  useEffect(() => {
    if (!openDialog || !hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMorePosts();
        }
      },
      { threshold: 0.5 }
    );

    const target = observerTarget.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [openDialog, hasMore, loadingMore, loadMorePosts]);

  // Carregar dados iniciais quando o dialog é aberto
  useEffect(() => {
    if (openDialog) {
      // Reseta o estado antes de carregar novos posts
      setDialogPosts([]);
      setHasMore(true);
      setNextPageToken(null);
      loadMorePosts();
    }
  }, [openDialog]);

  // Efeito para garantir que o post selecionado seja exibido na visualização principal
  useEffect(() => {
    // Log para depuração
    console.log("PostSelection - selectedPost atualizado:", selectedPost);
  }, [selectedPost]);

  // Verifica se é Reels
  const isReel = (post: InstagramMediaItem) => {
    return post.media_type === "VIDEO" && post.media_product_type === "REELS";
  };

  // Ao selecionar um post específico
  const handleSelectPost = (post: InstagramMediaItem) => {
    if (disabled) return;
    setSelectedPost(post);
    setAnyMediaSelected(false);
    onSelectPost?.();
  };

  // Pegar apenas as 4 últimas postagens para o preview
  const ultimasPostagens = instagramMedia.slice(0, 4);

  // Verificar se o post selecionado está entre as 4 últimas postagens
  const selectedPostInPreview = selectedPost ? ultimasPostagens.some(post => post.id === selectedPost.id) : false;

  // Se o post selecionado não estiver entre as 4 últimas, substituir o primeiro post pelo selecionado
  const postagensParaExibir = selectedPost && !selectedPostInPreview && !anyMediaSelected
    ? [selectedPost, ...ultimasPostagens.slice(0, 3)]
    : ultimasPostagens;

  // Renderiza cards de posts (pequenos)
  const renderPostCard = (post: InstagramMediaItem) => (
    <div
      key={post.id}
      style={{
        width: "70px",
        height: "95px",
        border: selectedPost?.id === post.id ? "3px solid #2563eb" : "1px solid #333",
        borderRadius: "5px",
        overflow: "hidden",
        cursor: disabled ? "not-allowed" : "pointer",
        flexShrink: 0,
        position: "relative",
      }}
      onClick={() => handleSelectPost(post)}
    >
      {post.media_url ? (
        isReel(post) && post.thumbnail_url ? (
          <>
            <img
              src={post.thumbnail_url}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              alt={post.caption || "Reels thumbnail"}
            />
            <div
              style={{
                position: "absolute",
                bottom: "2px",
                right: "2px",
                background: "rgba(0,0,0,0.6)",
                color: "#fff",
                padding: "2px 4px",
                borderRadius: "3px",
                fontSize: "10px",
              }}
            >
              Reels
            </div>
          </>
        ) : (
          <img
            src={post.media_url}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            alt={post.caption || "post"}
          />
        )
      ) : (
        <Skeleton className="h-[95px] w-[70px] rounded" />
      )}

      {/* Indicador de seleção */}
      {selectedPost?.id === post.id && (
        <div
          style={{
            position: "absolute",
            top: "4px",
            right: "4px",
            background: "#2563eb",
            color: "white",
            width: "18px",
            height: "18px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "bold",
            fontSize: "10px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          }}
        >
          ✓
        </div>
      )}
    </div>
  );

  // Renderiza cards de posts dentro do Dialog (grid maior)
  const renderPostDialogCard = (post: InstagramMediaItem) => (
    <div
      key={post.id}
      style={{
        width: "205px",
        height: "265px",
        border: selectedPost?.id === post.id ? "3px solid #2563eb" : "1px solid #333",
        borderRadius: "5px",
        overflow: "hidden",
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative",
      }}
      onClick={() => {
        if (disabled) return;

        // Selecionar o post e fechar o diálogo
        setSelectedPost(post);
        setAnyMediaSelected(false);
        setOpenDialog(false);

        // Chamar o callback onSelectPost se existir
        if (onSelectPost) {
          onSelectPost();
        }
      }}
    >
      {post.media_url ? (
        isReel(post) && post.thumbnail_url ? (
          <>
            <img
              src={post.thumbnail_url}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              alt={post.caption || "Reels thumbnail"}
            />
            <div
              style={{
                position: "absolute",
                bottom: "2px",
                right: "2px",
                background: "rgba(0,0,0,0.6)",
                color: "#fff",
                padding: "2px 4px",
                borderRadius: "3px",
                fontSize: "12px",
              }}
            >
              Reel
            </div>
          </>
        ) : (
          <img
            src={post.media_url}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            alt={post.caption || "post"}
          />
        )
      ) : (
        <Skeleton className="h-[265px] w-[205px] rounded" />
      )}

      {/* Indicador de seleção */}
      {selectedPost?.id === post.id && (
        <div
          style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            background: "#2563eb",
            color: "white",
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "bold",
            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          }}
        >
          ✓
        </div>
      )}
    </div>
  );

  return (
    <div className={className} style={{ opacity: disabled ? 0.6 : 1 }}>
      <h2 style={{ marginBottom: "10px" }}>Quando Alguém faz um Comentário</h2>
      <RadioGroup
        value={anyMediaSelected ? "qualquer" : "especifico"}
        onValueChange={(v) => {
          if (disabled) return;
          const isAnyMedia = v === "qualquer";
          setAnyMediaSelected(isAnyMedia);
          if (isAnyMedia) {
            setSelectedPost(null);
            onSelectPost?.();
          }
        }}
        style={{ marginBottom: "20px" }}
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="especifico" id="especifico" disabled={disabled} />
          <Label htmlFor="especifico">Uma Publicação ou Reels Específico</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="qualquer" id="qualquer" disabled={disabled} />
          <Label htmlFor="qualquer">Qualquer Publicação ou Reels</Label>
        </div>
      </RadioGroup>

      {!anyMediaSelected && (
        <div style={{ marginBottom: "20px" }}>
          {instagramMedia.length > 0 ? (
            <>
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  gap: "10px",
                  overflowX: "auto",
                }}
              >
                {postagensParaExibir.map(renderPostCard)}
              </div>
              <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    disabled={disabled}
                  >
                    Ver Mais Publicações
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[800px]">
                  <DialogHeader>
                    <DialogTitle>Selecione uma Publicação</DialogTitle>
                    <DialogDescription>
                      Escolha a publicação que você deseja monitorar
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-3 gap-4 py-4 max-h-[500px] overflow-y-auto">
                    {dialogPosts.map(renderPostDialogCard)}
                    {loadingMore && (
                      <div className="col-span-3 text-center py-4">
                        <span className="text-sm text-muted-foreground">
                          Carregando mais publicações...
                        </span>
                      </div>
                    )}
                    {hasMore && <div ref={observerTarget} className="col-span-3 h-10" />}
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Fechar</Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          ) : (
            <div className="flex gap-2">
              <Skeleton className="h-[95px] w-[70px] rounded" />
              <Skeleton className="h-[95px] w-[70px] rounded" />
              <Skeleton className="h-[95px] w-[70px] rounded" />
              <Skeleton className="h-[95px] w-[70px] rounded" />
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
