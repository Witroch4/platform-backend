//app/dashboard/automacao/components/PreviewPhoneMockup.tsx
"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Film } from "lucide-react";
import type { InstagramMediaItem, InstagramUserData } from "../guiado-facil/page"; // Ajuste o caminho se necessário
import CommentsDrawer from "./WIT-EQ/CommentsDrawer";

interface Props {
  selectedPost: InstagramMediaItem | null;
  instagramUser: InstagramUserData | null;
  toggleValue: "publicar" | "comentarios" | "dm";
  commentContent: string;

  // Props para as DMs (Etapas 2 e 3)
  dmWelcomeMessage: string;
  dmQuickReply: string;
  dmSecondMessage: string;
  dmLink: string;
  dmButtonLabel: string;

  // Props da Etapa 4 (resposta pública)
  responderPublico?: boolean;
  publicReply1?: string;
}

// Função auxiliar para truncar texto
const truncateText = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
};

// Função para determinar se a postagem é um Reel
const isReel = (post: InstagramMediaItem) => {
  return post.media_type === "VIDEO" && post.media_product_type === "REELS";
};

export default function PreviewPhoneMockup({
  selectedPost,
  instagramUser,
  toggleValue,
  commentContent,

  dmWelcomeMessage,
  dmQuickReply,
  dmSecondMessage,
  dmLink,
  dmButtonLabel,

  // ADICIONE essas duas linhas:
  responderPublico,
  publicReply1,
}: Props) {
  // Log para depuração
  console.log("PreviewPhoneMockup - selectedPost:", selectedPost);

  return (
    <div
      style={{
        width: "325px",
        height: "655px",
        position: "relative",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Imagem de Fundo Preto do Smartphone */}
      <img
        src="/smartphonefundopreto.png"
        alt="Fundo Preto do Smartphone"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "325px",
          height: "655px",
          objectFit: "cover",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />

      {/* Container de Conteúdo (tela do celular) */}
      <div
        style={{
          width: "285px",
          height: "615px",
          position: "relative",
          zIndex: 1,
          background: "transparent",
          borderRadius: "10px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ======================== PREVIEW PARA PUBLICAR ======================== */}
        {toggleValue === "publicar" && (
          selectedPost ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                height: "100%",
                paddingTop: "50px",
                paddingBottom: "60px",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  flex: "1",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  padding: "10px",
                }}
              >
                {/* Header do Post */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  {instagramUser?.profile_picture_url ? (
                    <img
                      src={instagramUser.profile_picture_url}
                      alt={instagramUser.username}
                      style={{
                        width: "30px",
                        height: "30px",
                        borderRadius: "50%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <Skeleton className="h-[30px] w-[30px] rounded-full" />
                  )}
                  {instagramUser?.username ? (
                    <span
                      style={{
                        fontWeight: "bold",
                        fontSize: "14px",
                        color: "#fff",
                      }}
                    >
                      {instagramUser.username}
                    </span>
                  ) : (
                    <Skeleton className="h-4 w-[100px] rounded" />
                  )}
                </div>

                {/* Imagem ou Vídeo do Post */}
                {selectedPost.media_url ? (
                  isReel(selectedPost) ? (
                    selectedPost.thumbnail_url ? (
                      <div style={{ position: "relative" }}>
                        <img
                          src={selectedPost.thumbnail_url}
                          alt={selectedPost.caption || "Reels thumbnail"}
                          style={{
                            width: "100%",
                            borderRadius: "8px",
                            objectFit: "cover",
                          }}
                        />
                        {/* Indicador de Reel com Ícone de Vídeo */}
                        <div
                          style={{
                            position: "absolute",
                            top: "8px",
                            left: "8px",
                            display: "flex",
                            alignItems: "center",
                            background: "rgba(0,0,0,0.6)",
                            padding: "4px 8px",
                            borderRadius: "5px",
                          }}
                        >
                          <Film
                            style={{
                              width: "32px",
                              height: "32px",
                              color: "#fff",
                            }}
                            aria-label="Reels Video Icon"
                          />
                        </div>
                      </div>
                    ) : (
                      <video
                        src={selectedPost.media_url}
                        style={{
                          width: "100%",
                          borderRadius: "8px",
                          objectFit: "cover",
                        }}
                        controls
                      />
                    )
                  ) : selectedPost.media_type === "VIDEO" ? (
                    <video
                      src={selectedPost.media_url}
                      style={{
                        width: "100%",
                        borderRadius: "8px",
                        objectFit: "cover",
                      }}
                      controls
                    />
                  ) : (
                    <img
                      src={selectedPost.media_url}
                      alt={selectedPost.caption || "post"}
                      style={{
                        width: "100%",
                        borderRadius: "8px",
                        objectFit: "cover",
                      }}
                    />
                  )
                ) : (
                  <Skeleton className="h-[200px] w-full rounded" />
                )}

                {/* Ações */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {/* Like Icon */}
                    <svg width="24" height="24" style={{ fill: "#FAFAFA" }}>
                      <path
                        d="M11.951 21.003c-.26 0-.52-.06-.74-.23-2.66-1.94-5.43-4.08-7.48-7.02-.72-1.04-1.69-2.65-1.73-4.69-.05-2.45 1.34-4.7 3.46-5.62 2.13-.92 4.66-.38 6.45 1.38l.08.08c.08-.08.16-.16.24-.23 2-1.82 4.79-2.18 6.92-.9 2.21 1.33 3.29 4.07 2.65 6.68-.57 2.29-1.97 4.03-3.27 5.44-1.78 1.92-3.86 3.52-5.66 4.83-.22.16-.57.29-.93.29l.01-.01Z"
                        fill="#FAFAFA"
                      />
                      <path
                        d="M12.577 20.318a1.14 1.14 0 0 1-.49.185h-.136a.686.686 0 0 1-.434-.126l-.011-.008c-2.659-1.94-5.366-4.037-7.364-6.902-.706-1.02-1.604-2.527-1.64-4.414C2.454 6.79 3.74 4.734 5.66 3.9c1.924-.83 4.24-.354 5.9 1.277l.078.078.353.354.354-.354c.082-.082.15-.15.216-.207l.007-.007c1.856-1.688 4.406-1.994 6.325-.841 2.01 1.21 3.014 3.72 2.423 6.132-.538 2.162-1.864 3.824-3.152 5.22-1.745 1.883-3.792 3.46-5.587 4.765Z"
                        stroke="#FAFAFA"
                      />
                    </svg>
                    {typeof selectedPost.like_count !== "undefined" ? (
                      <span style={{ fontSize: "14px", color: "#fff" }}>
                        {selectedPost.like_count}
                      </span>
                    ) : (
                      <Skeleton className="h-4 w-[20px]" />
                    )}

                    {/* Comment Icon */}
                    <svg width="24" height="24" style={{ fill: "#FAFAFA" }}>
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M12 5a7 7 0 1 0 3.589 13.012 1 1 0 0 1 .772-.108l2.113.566-.567-2.115a1 1 0 0 1 .108-.772A7 7 0 0 0 12 5Zm-9 7a9 9 0 1 1 16.945 4.232l.91 3.393a1 1 0 0 1-1.226 1.225l-3.39-.909A9 9 0 0 1 3 12Z"
                      />
                    </svg>

                    {/* Share Icon */}
                    <svg width="24" height="24" style={{ fill: "#FAFAFA" }}>
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M2.324 5.095C1.64 4.338 2.1 3 3.244 3H21a1 1 0 0 1 .872 1.488l-8.877 15.874c-.55.982-1.97.782-2.277-.257l-2.513-8.507-5.88-6.503Zm7.954 6.462 1.85 6.259 6.176-11.044-8.026 4.785ZM17.37 5H4.935l4.356 4.818L17.371 5Z"
                      />
                    </svg>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {/* Save Icon */}
                    <svg width="24" height="24" style={{ fill: "#FAFAFA" }}>
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="m12 15.111 7.271 6.06c.29.241.729.035.729-.342V2.223H4v18.606c0 .377.44.583.729.342L12 15.11Zm-6 2.397 4.72-3.933a2 2 0 0 1 2.56 0L18 17.508V4.223H6v13.285Z"
                      />
                    </svg>
                  </div>
                </div>

                {/* Legenda */}
                <div>
                  {selectedPost.caption ? (
                    <div style={{ fontSize: "14px", lineHeight: "18px", color: "#fff" }}>
                      <strong>{instagramUser?.username}</strong>{" "}
                      {truncateText(selectedPost.caption, 290)}
                    </div>
                  ) : (
                    <Skeleton className="h-4 w-[200px]" />
                  )}
                </div>
              </div>

              {/* Navbar inferior do Mockup */}
              <div
                style={{
                  position: "absolute",
                  bottom: "4px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  display: "flex",
                  justifyContent: "space-around",
                  alignItems: "center",
                  padding: "0.5rem",
                  borderTop: "1px solid #333",
                  background: "#000",
                  width: "100%",
                  boxSizing: "border-box",
                  zIndex: 3,
                }}
              >
                <svg width="25" height="24" style={{ fill: "#FAFAFA" }}>
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M13.19 2.276a1 1 0 0 0-1.38 0l-9 8.582a1 1 0 0 0-.31.724V21a1 1 0 0 0 1 1h6v-5c0-1.105.5-3 3-3s3 1.895 3 3v5h6a1 1 0 0 0 1-1v-9.418a1 1 0 0 0-.31-.724l-9-8.582Z"
                  />
                </svg>
                <svg width="25" height="24" style={{ fill: "#FAFAFA" }}>
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M16.262 17.176a8.5 8.5 0 1 1 1.414-1.414l4.48 4.48a1 1 0 0 1-1.413 1.415l-4.481-4.481ZM17.5 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"
                  />
                </svg>
                <svg width="25" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M12.5 6a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2h-4v4a1 1 0 1 1-2 0v-4h-4a1 1 0 1 1 0-2h4V7a1 1 0 0 1 1-1Z"
                    fill="#FAFAFA"
                  />
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M11.505 2c-1.386 0-2.488 0-3.377.074-.91.075-1.685.234-2.394.602a6 6 0 0 0-2.558 2.558c-.368.709-.527 1.484-.602 2.394-.074.89-.074 1.991-.074 3.377v1.99c0 1.386 0 2.488.074 3.377.075.91.234 1.686.602 2.394a6 6 0 0 0 2.558 2.559c.709.367 1.484.526 2.394.601.89.074 1.992.074 3.377.074h1.99c1.386 0 2.488 0 3.377-.074.91-.075 1.686-.233 2.394-.601a6 6 0 0 0 2.558-2.56c.709-.707 1.068-1.483 1.068-2.393.074-.89.074-1.992.074-3.377v-1.99c0-1.385 0-2.488-.074-3.377-.075-.91-.233-1.685-.601-2.394a6 6 0 0 0-2.56-2.558c-.707-.368-1.483-.527-2.393-.602C15.982 2 14.88 2 13.495 2h-1.99ZM6.656 4.45c.375-.195.854-.318 1.638-.383C9.09 4 10.11 4 11.55 4h1.9c1.44 0 2.46 0 3.256.067.785.065 1.263.188 1.638.383a4 4 0 0 1 1.706 1.706c.195.375.318.854.383 1.638.066.796.067 1.815.067 3.256v1.9c0 1.44 0 2.46-.067 3.256-.065.785-.188 1.263-.383 1.638a4 4 0 0 1-1.706 1.706c-.375.195-.854.318-1.638.383C15.91 20 14.89 20 13.45 20h-1.9c-1.44 0-2.46 0-3.256-.067-.784-.065-1.263-.188-1.638-.383a4 4 0 0 1-1.706-1.706c-.195-.375-.318-.854-.383-1.638C4.5 15.41 4.5 14.39 4.5 12.95v-1.9c0-1.44 0-2.46.067-3.256.065-.784.188-1.263.383-1.638A4 4 0 0 1 6.656 4.45Z"
                    fill="#FAFAFA"
                  />
                </svg>
                <svg width="25" height="24" style={{ fill: "#FAFAFA" }}>
                  <path d="M15.3 14.132a.438.438 0 0 1 0 .736l-4.2 2.574c-.267.164-.6-.04-.6-.367v-5.15c0-.327.333-.53.6-.368l4.2 2.575Z" />
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M8.5 2a6 6 0 0 0-6 6v8a6 6 0 0 0 6 6h8a6 6 0 0 0 6-6V8a6 6 0 0 0-6-6h-8Zm8 2h-1.234l1.8 3h3.308A4.002 4.002 0 0 0 16.5 4Zm4 5h-16v7a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4V9ZM4.626 7h4.108L7.088 4.256A4.009 4.009 0 0 0 4.626 7Zm6.44 0h3.668l-1.8-3H9.266l1.8 3Z"
                  />
                </svg>
                {instagramUser?.profile_picture_url ? (
                  <img
                    src={instagramUser.profile_picture_url}
                    alt="Perfil"
                    style={{
                      borderRadius: "50%",
                      width: "18px",
                      height: "18px",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <Skeleton className="h-[18px] w-[18px] rounded-full" />
                )}
              </div>
            </div>
          ) : (
            <div
              style={{
                color: "#999",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: "100%",
                paddingTop: "50px",
                paddingBottom: "60px",
                boxSizing: "border-box",
              }}
            >
              <Skeleton className="h-[200px] w-[200px] rounded-xl" />
              <Skeleton className="h-4 w-[150px] mt-4" />
            </div>
          )
        )}

        {/* ======================== PREVIEW PARA COMENTÁRIOS ======================== */}
                 {toggleValue === "comentarios" && (
                  <CommentsDrawer
                    open={true}
                    commentContent={commentContent}
                    instagramUser={instagramUser}
                    responderPublico={responderPublico}
                    publicReply1={publicReply1}
                  />
                )}

 {/* ======================== PREVIEW PARA DM ======================== */}
 {toggleValue === "dm" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start", // Alinha as mensagens à esquerda
              width: "100%",
              height: "100%",
              paddingTop: "40px",
              paddingLeft: "10px",
              paddingRight: "10px",
              boxSizing: "border-box",
              backgroundColor: "#000", // Simulação do fundo do chat
              overflow: "hidden", // Remove a rolagem interna
            }}
          >
            {/* Mensagem de Boas-Vindas com Botão (Etapa 2) */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                marginBottom: "10px",
                maxWidth: "80%", // Limita a largura do balão
              }}
            >
              {/* Imagem do Usuário (Bot) */}
              <img
                src={instagramUser?.profile_picture_url || "/default_profile.png"} // Use uma imagem padrão se não houver
                alt="Perfil Bot"
                style={{
                  borderRadius: "50%",
                  width: "30px",
                  height: "30px",
                  objectFit: "cover",
                  marginRight: "10px",
                }}
              />

              {/* Balão da Mensagem */}
              <div
                style={{
                  backgroundColor: "#262626",
                  padding: "10px",
                  borderRadius: "10px",
                  color: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  maxWidth: "100%", // Garante que o balão não exceda o container
                  wordBreak: "break-word", // Quebra palavras longas
                }}
              >
                {/* Texto da Mensagem */}
                {dmWelcomeMessage.split("\n").map((line, index) => (
                  <p key={index} style={{ margin: 0, marginBottom: "4px", fontSize: "14px" }}>
                    {line}
                  </p>
                ))}

                {/* Botão Simulado dentro da Mensagem */}
                <div
                  style={{
                    backgroundColor: "#808080",
                    padding: "6px 10px",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "14px",
                    display: "inline-block",
                    marginTop: "8px",
                    maxWidth: "100%", // Garante que o botão não exceda o balão
                    wordBreak: "break-word",
                  }}
                >
                  {dmQuickReply}
                </div>
              </div>
            </div>

            {/* Balão Azul Representando a Resposta do Usuário */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "flex-start",
                marginBottom: "10px",
                maxWidth: "80%", // Limita a largura do balão
                alignSelf: "flex-end", // Alinha à direita
              }}
            >
              {/* Balão da Mensagem */}
              <div
                style={{
                  backgroundColor: "#3B82F6", // Tom de azul
                  color: "#fff",
                  borderRadius: "10px",
                  padding: "10px",
                  maxWidth: "100%", // Garante que o balão não exceda o container
                  wordBreak: "break-word", // Quebra palavras longas
                }}
              >
                {dmQuickReply}
              </div>
            </div>

            {/* Mensagem com Link e Botão (Etapa 3) */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                marginBottom: "10px",
                maxWidth: "80%", // Limita a largura do balão
              }}
            >
              {/* Imagem do Usuário (Bot) */}
              <img
                src={instagramUser?.profile_picture_url || "/default_profile.png"} // Use uma imagem padrão se não houver
                alt="Perfil Bot"
                style={{
                  borderRadius: "50%",
                  width: "30px",
                  height: "30px",
                  objectFit: "cover",
                  marginRight: "10px",
                }}
              />

              {/* Balão da Mensagem */}
              <div
                style={{
                  backgroundColor: "#262626",
                  padding: "10px",
                  borderRadius: "10px",
                  color: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  maxWidth: "100%", // Garante que o balão não exceda o container
                  wordBreak: "break-word", // Quebra palavras longas
                }}
              >
                {/* Texto da Mensagem */}
                <p style={{ margin: 0, marginBottom: "4px", fontSize: "14px" }}>{dmSecondMessage}</p>

                {/* Balão Menor com o "Botão" */}
                <div
                  style={{
                    backgroundColor: "#808080",
                    padding: "6px 10px",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "14px",
                    display: "inline-block",
                    marginTop: "8px",
                    maxWidth: "100%", // Garante que o botão não exceda o balão
                    wordBreak: "break-word",
                  }}
                >
                  {dmButtonLabel}
                </div>

                {/* Exibição do Link */}
                <p
                  style={{
                    margin: 0,
                    marginTop: "4px",
                    fontSize: "12px",
                    color: "#999",
                    wordBreak: "break-word", // Quebra palavras longas
                  }}
                >
                  {dmLink}
                </p>
              </div>
            </div>

            {/* Espaço para "rolagem" ou placeholder */}
            <div style={{ flex: 1 }} />
          </div>
        )}
      </div>

      {/* Mockup do Celular (imagem por cima) */}
      <img
        src="/smartphone.png"
        alt="Mockup de Celular"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "325px",
          height: "655px",
          objectFit: "cover",
          zIndex: 2,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}