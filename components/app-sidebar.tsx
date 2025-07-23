"use client";

import { useSession } from "next-auth/react";
import { Skeleton } from "@/components/ui/skeleton";
import LoginBadge from "@/components/auth/login-badge";
import {
  ChevronDown,
  CircleUser,
  User2,
  Instagram,
  Users,
  Zap,
  Calendar,
  MessageCircle,
  HelpCircle,
  Atom,
  Plus,
  Check,
  Shield,
  Bell,
  LayoutDashboard,
  Headphones,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { useTheme } from "next-themes";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

interface InstagramAccount {
  id: string;
  provider: string;
  name: string;
  providerAccountId: string;
  connected: boolean;
  isMain?: boolean;
}

export function AppSidebar() {
  const { data: session, status } = useSession();
  const { state } = useSidebar(); // Hook para saber se a sidebar está "collapsed" ou "open"
  const { toggleSidebar } = useSidebar();
  const [connectedAccounts, setConnectedAccounts] = useState<InstagramAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  const isLoading = status === "loading";

  // URL de autorização com enable_fb_login=0 e force_authentication=1
  const redirectUri = process.env.NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI!;
  
  // Depuração do redirectUri
  useEffect(() => {
    console.log(`redirectUri no app-sidebar: ${redirectUri}`);
  }, [redirectUri]);
  
  const instagramAuthUrl = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish`;

  const isInstagramConnected = !!session?.user?.instagramAccessToken;
  const { theme } = useTheme();
  const instagramAnimationSrc =
    theme === "dark"
      ? "/animations/logodarckInstagram.lottie"
      : "/animations/logolightInstagram.lottie";

  // Efeito para detectar a conta ativa com base na URL
  useEffect(() => {
    if (pathname) {
      const match = pathname.match(/\/([^\/]+)\/dashboard/);
      if (match && match[1]) {
        setActiveAccountId(match[1]);
      } else {
        setActiveAccountId(null);
      }
    }
  }, [pathname]);

  // Efeito para carregar contas conectadas
  useEffect(() => {
    if (session?.user?.id) {
      const fetchAccounts = async () => {
        try {
          console.log("Buscando contas do Instagram...");
          const response = await fetch("/api/auth/instagram/accounts", {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache"
            }
          });

          if (response.ok) {
            const data = await response.json();
            console.log("Contas do Instagram encontradas:", data);
            if (data.accounts && Array.isArray(data.accounts)) {
              setConnectedAccounts(
                data.accounts.map((account: any) => ({
                  id: account.id,
                  provider: "instagram",
                  name: account.igUsername || "Instagram",
                  providerAccountId: account.providerAccountId,
                  connected: true,
                  isMain: account.isMain,
                }))
              );
            } else {
              console.warn("Resposta da API não contém contas válidas:", data);
              setFallbackAccount();
            }
          } else {
            console.error("Erro ao buscar contas conectadas:", response.status, response.statusText);
            setFallbackAccount();
          }
        } catch (error) {
          console.error("Erro ao buscar contas do Instagram:", error);
          setFallbackAccount();
        }
      };

      // Função para definir uma conta fallback quando ocorrem erros
      const setFallbackAccount = () => {
        if (session?.user?.instagramAccessToken && session?.user?.providerAccountId) {
          console.log("Usando conta fallback do Instagram");
          setConnectedAccounts([
            {
              id: session.user.providerAccountId,
              provider: "instagram",
              name: "Instagram Principal",
              providerAccountId: session.user.providerAccountId,
              connected: true,
              isMain: true,
            },
          ]);
        } else {
          console.warn("Não foi possível encontrar informações de conta no session");
          // Tenta criar uma conta fictícia para garantir que a sidebar seja renderizada
          setConnectedAccounts([
            {
              id: "fallback",
              provider: "instagram",
              name: "Instagram",
              providerAccountId: "fallback",
              connected: true,
              isMain: true,
            },
          ]);
        }
      };

      fetchAccounts();
    }
  }, [session]);

  // Função para navegar para o dashboard de uma conta específica
  function navigateToAccount(accountId: string, providerAccountId: string) {
    router.push(`/${providerAccountId}/dashboard`);
  }

  // Função para desconectar uma conta específica do Instagram
  async function handleDisconnectAccount(accountId: string, providerAccountId: string) {
    try {
      const res = await fetch("/api/auth/instagram/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountId: providerAccountId }),
      });

      if (res.ok) {
        setConnectedAccounts((prevAccounts) =>
          prevAccounts.filter((account) => account.providerAccountId !== providerAccountId)
        );

        if (activeAccountId === providerAccountId) {
          // Buscar outra conta para redirecionar
          const otherAccount = connectedAccounts.find(acc => acc.providerAccountId !== providerAccountId);
          if (otherAccount) {
            router.push(`/${otherAccount.providerAccountId}/dashboard`);
          } else {
            // Se não houver outras contas, redirecionar para a página de registro
            router.push("/registro/redesocial");
          }
        }
      } else {
        const errorData = await res.json();
        console.error("Falha ao desconectar conta:", errorData);
        alert("Falha ao desconectar conta. Tente novamente mais tarde.");
      }
    } catch (error) {
      console.error("Erro ao desconectar conta:", error);
      alert("Ocorreu um erro ao tentar desconectar a conta.");
    }
  }

  // Função para desconectar o Instagram (mantida para compatibilidade)
  async function handleInstagramLogout() {
    try {
      const res = await fetch("/api/auth/instagram/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (res.ok) {
        window.location.reload();
      } else {
        const errorData = await res.json();
        console.error("Falha ao desconectar do Instagram:", errorData);
        alert("Falha ao desconectar do Instagram.");
      }
    } catch (error) {
      console.error("Erro ao desconectar do Instagram:", error);
      alert("Ocorreu um erro ao tentar desconectar do Instagram.");
    }
  }

  if (isLoading) {
    return (
      <Sidebar collapsible="icon" side="left" variant="sidebar" className="bg-background z-50 border-r">
        <SidebarContent className="bg-background">
          <div className="p-4 space-y-6">
            <Skeleton className="h-[125px] w-full rounded-xl" />
            <div className="space-y-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="space-y-6">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <div className="p-4">
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </SidebarFooter>
      </Sidebar>
    );
  }

  const activeAccount = connectedAccounts.find((account) => account.id === activeAccountId);

  return (
    <Sidebar collapsible="icon" side="left" variant="sidebar" className="bg-background z-50 border-r">
      <SidebarContent className="bg-background">
        {/* Cabeçalho com informações do usuário */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {session?.user?.image ? (
                <Avatar className="h-8 w-8">
                  <AvatarImage src={session.user.image} />
                  <AvatarFallback>
                    <CircleUser className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
              ) : (
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    <User2 className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
              )}
              {state !== "collapsed" && (
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{session?.user?.name ?? "Usuário"}</span>
                </div>
              )}
            </div>
            {state !== "collapsed" && (
              <DropdownMenu>
                <DropdownMenuTrigger className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent">
                  <ChevronDown className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 p-0">
                  <LoginBadge user={session?.user} />
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Seletor de Contas */}
        <div className="p-4">
          {activeAccount ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full">
                <div className="flex items-center justify-between p-2 bg-accent/50 rounded-md hover:bg-accent transition-colors">
                  <div className="flex items-center gap-2">
                    <DotLottieReact
                      src={instagramAnimationSrc}
                      autoplay
                      loop={false}
                      style={{ width: "24px", height: "24px" }}
                      aria-label="Instagram conectado"
                    />
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium truncate max-w-[150px]">
                        {activeAccount.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {activeAccount.isMain
                          ? "Conta Principal"
                          : "Conta Conectada"}
                      </span>
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[250px]">
                {/* Link para o dashboard principal */}
                <DropdownMenuItem
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() => {
                    // Buscar a conta principal ou a primeira conta
                    const mainAccount = connectedAccounts.find(acc => acc.isMain) || connectedAccounts[0];
                    if (mainAccount) {
                      router.push(`/${mainAccount.providerAccountId}/dashboard`);
                    } else {
                      router.push("/registro/redesocial");
                    }
                  }}
                >
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                    <User2 className="h-3 w-3" />
                  </div>
                  <span>Minha Conta</span>
                </DropdownMenuItem>

                {connectedAccounts.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1 text-xs text-muted-foreground">
                      Contas Conectadas
                    </div>

                    {connectedAccounts.map((account) => (
                      <DropdownMenuItem
                        key={account.id}
                        className={`flex items-center gap-2 cursor-pointer rounded-md p-2 transition-colors ${
                          activeAccountId === account.providerAccountId ? "bg-accent" : ""
                        }`}
                        onClick={() => {
                          setActiveAccountId(account.providerAccountId);
                          navigateToAccount(account.id, account.providerAccountId);
                        }}
                      >
                        <DotLottieReact
                          src={instagramAnimationSrc}
                          autoplay
                          loop={false}
                          style={{ width: "24px", height: "24px" }}
                          aria-label="Instagram animação"
                        />
                        <div className="flex flex-col">
                          <span className="text-sm">{account.name}</span>
                          {account.isMain && (
                            <Badge variant="outline" className="text-[10px] py-0 h-4">
                              Principal
                            </Badge>
                          )}
                        </div>
                        {activeAccountId === account.providerAccountId && (
                          <Check className="ml-auto h-4 w-4" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="flex items-center gap-2 cursor-pointer text-primary hover-effect-9"
                  onClick={() => router.push("/registro/redesocial")}
                >
                  <span className="hover-span relative flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    <span>Adicionar nova conta</span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="h-10">{/* Espaço reservado quando não há conta ativa */}</div>
          )}
        </div>

        {/* Grupo Social Login */}
        <Collapsible defaultOpen={false} className="group/collapsible">
          <SidebarGroup>
            <div
              className={`flex items-center justify-center p-2 relative ${
                state === "collapsed" ? "flex-col space-y-1" : "flex-row"
              }`}
            >
              <CollapsibleTrigger className="flex items-center justify-center cursor-pointer">
                <Image
                  src="/W.svg"
                  alt="Logo Social Login"
                  width={state === "collapsed" ? 30 : 20}
                  height={state === "collapsed" ? 30 : 20}
                  className={`transition-all duration-300 ${
                    state === "collapsed" ? "mx-auto" : "mr-2"
                  }`}
                />
                {state !== "collapsed" && (
                  <span className="ml-2">Social Login</span>
                )}
                {isInstagramConnected && state !== "collapsed" && (
                  <DotLottieReact
                    src={instagramAnimationSrc}
                    autoplay
                    loop={false}
                    style={{
                      width: "16px",
                      height: "16px",
                      marginLeft: "0.5rem",
                    }}
                    aria-label="Instagram conectado"
                  />
                )}
                <ChevronDown
                  className={`ml-auto transition-transform duration-300 ${
                    state === "collapsed" ? "hidden" : "inline-block"
                  } group-data-[state=open]/collapsible:rotate-180`}
                />
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent>
              <SidebarGroupContent className="bg-background">
                <div className="p-4">
                  {connectedAccounts.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium">Contas conectadas</h3>
                        <Link href="/registro/redesocial" className="text-xs text-primary hover:underline">
                          Gerenciar
                        </Link>
                      </div>
                      <div className="space-y-2">
                        {connectedAccounts.map((account) => (
                          <div
                            key={account.id}
                            className={`flex items-center justify-between p-2 rounded-md transition-colors cursor-pointer ${
                              activeAccountId === account.providerAccountId
                                ? "bg-accent"
                                : "hover:bg-accent/50"
                            }`}
                            onClick={() => {
                              setActiveAccountId(account.providerAccountId);
                              navigateToAccount(account.id, account.providerAccountId);
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <DotLottieReact
                                src={instagramAnimationSrc}
                                autoplay
                                loop={false}
                                style={{ width: "24px", height: "24px" }}
                                aria-label="Instagram animação"
                              />
                              <div className="flex flex-col">
                                <span className="text-sm truncate max-w-[120px]">{account.name}</span>
                                {account.isMain && (
                                  <Badge variant="outline" className="text-[10px] py-0 h-4">
                                    Principal
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDisconnectAccount(account.id, account.providerAccountId);
                              }}
                              className="text-xs text-red-500 hover:text-red-600"
                              aria-label="Desconectar conta"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="lucide lucide-log-out"
                              >
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                <polyline points="16 17 21 12 16 7"></polyline>
                                <line x1="21" y1="12" x2="9" y2="12"></line>
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link
                          href="/registro/redesocial"
                          className="flex items-center gap-2 text-primary hover-effect-9"
                        >
                          <span className="hover-span relative flex items-center gap-2">
                            <Plus className="w-4 h-4" />
                            <span>Adicionar nova conta</span>
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>

                  {!isInstagramConnected && (
                    <>
                      <p className="text-lg font-bold mb-2 mt-4">
                        Para continuar, faça login com sua rede social e
                        autorize o acesso.
                      </p>
                      <SidebarMenu>
                        <SidebarMenuItem>
                          <SidebarMenuButton asChild>
                            <a
                              href={instagramAuthUrl}
                              className="flex items-center gap-2"
                            >
                              <Instagram
                                className={`mr-2 ${
                                  isInstagramConnected
                                    ? "text-pink-500"
                                    : "text-current"
                                }`}
                              />
                              <span>Login com Instagram</span>
                            </a>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </SidebarMenu>
                    </>
                  )}
                </div>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        {/* Grupo: Admin (visível para usuários ADMIN e SUPERADMIN) */}
        {(session?.user?.role === "ADMIN" || session?.user?.role === "SUPERADMIN") && (
          <Collapsible defaultOpen={false} className="group/collapsible">
            <SidebarGroup>
              <div
                className={`flex items-center justify-center p-2 relative ${
                  state === "collapsed" ? "flex-col space-y-1" : "flex-row"
                }`}
              >
                <CollapsibleTrigger className="flex items-center justify-center cursor-pointer">
                  <Shield
                    className={`transition-all duration-300 ${
                      state === "collapsed" ? "mx-auto" : "mr-2"
                    }`}
                  />
                  {state !== "collapsed" && (
                    <span className="ml-2 font-bold">Administração</span>
                  )}
                  <ChevronDown
                    className={`ml-auto transition-transform duration-300 ${
                      state === "collapsed" ? "hidden" : "inline-block"
                    } group-data-[state=open]/collapsible:rotate-180`}
                  />
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent>
                <SidebarGroupContent className="bg-background">
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link
                          href="/admin"
                          className={`flex items-center hover-effect-9 ${
                            state === "collapsed" ? "justify-center" : "justify-start"
                          }`}
                        >
                          <span className="hover-span relative flex items-center">
                            <LayoutDashboard className="mr-2" />
                            {state !== "collapsed" && <span>Dashboard Admin</span>}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link
                          href="/admin/users"
                          className={`flex items-center hover-effect-9 ${
                            state === "collapsed" ? "justify-center" : "justify-start"
                          }`}
                        >
                          <span className="hover-span relative flex items-center">
                            <Users className="mr-2" />
                            {state !== "collapsed" && <span>Gerenciar Usuários</span>}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link
                          href="/admin/notifications"
                          className={`flex items-center hover-effect-9 ${
                            state === "collapsed" ? "justify-center" : "justify-start"
                          }`}
                        >
                          <span className="hover-span relative flex items-center">
                            <Bell className="mr-2" />
                            {state !== "collapsed" && <span>Sistema de Notificações</span>}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link
                          href="/admin/leads-chatwit"
                          className={`flex items-center hover-effect-9 ${
                            state === "collapsed" ? "justify-center" : "justify-start"
                          }`}
                        >
                          <span className="hover-span relative flex items-center">
                            <MessageCircle className="mr-2" />
                            {state !== "collapsed" && <span>Leads Chatwit</span>}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link
                          href="/admin/mtf-diamante"
                          className={`flex items-center hover-effect-9 ${
                            state === "collapsed" ? "justify-center" : "justify-start"
                          }`}
                        >
                          <span className="hover-span relative flex items-center">
                            <Headphones className="mr-2" />
                            {state !== "collapsed" && <span>MTF Diamante</span>}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link
                          href="/admin/disparo-oab"
                          className={`flex items-center hover-effect-9 ${
                            state === "collapsed" ? "justify-center" : "justify-start"
                          }`}
                        >
                          <span className="hover-span relative flex items-center">
                            <Users className="mr-2" />
                            {state !== "collapsed" && <span>Disparo OAB</span>}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link
                          href="/admin/templates"
                          className={`flex items-center hover-effect-9 ${
                            state === "collapsed" ? "justify-center" : "justify-start"
                          }`}
                        >
                          <span className="hover-span relative flex items-center">
                            <HelpCircle className="mr-2" />
                            {state !== "collapsed" && <span>Templates WhatsApp</span>}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link
                          href="/admin/disparo-em-massa"
                          className={`flex items-center hover-effect-9 ${
                            state === "collapsed" ? "justify-center" : "justify-start"
                          }`}
                        >
                          <span className="hover-span relative flex items-center">
                            <Zap className="mr-2" />
                            {state !== "collapsed" && <span>Disparo em Massa</span>}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link
                          href="/admin/queue"
                          className={`flex items-center hover-effect-9 ${
                            state === "collapsed" ? "justify-center" : "justify-start"
                          }`}
                        >
                          <span className="hover-span relative flex items-center">
                            <Calendar className="mr-2" />
                            {state !== "collapsed" && <span>Fila de Processamento</span>}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link
                          href="/api/auth/get-token"
                          className={`flex items-center hover-effect-9 ${
                            state === "collapsed" ? "justify-center" : "justify-start"
                          }`}
                        >
                          <span className="hover-span relative flex items-center">
                            <MessageCircle className="mr-2" />
                            {state !== "collapsed" && <span>API Auth Token</span>}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link
                          href="/auth/users"
                          className={`flex items-center hover-effect-9 ${
                            state === "collapsed" ? "justify-center" : "justify-start"
                          }`}
                        >
                          <span className="hover-span relative flex items-center">
                            <User2 className="mr-2" />
                            {state !== "collapsed" && <span>Auth Users</span>}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* Contatos */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link
                    href="/contatos"
                    className={`flex items-center hover-effect-9 ${
                      state === "collapsed" ? "justify-center" : "justify-start"
                    }`}
                  >
                    <span className="hover-span relative flex items-center">
                      <Users className="mr-2" />
                      {state !== "collapsed" && <span>Contatos</span>}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Agendamento */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link
                    href={activeAccountId ? `/${activeAccountId}/dashboard/agendamento` : "/dashboard/agendamento"}
                    className={`flex items-center hover-effect-9 ${
                      state === "collapsed" ? "justify-center" : "justify-start"
                    }`}
                  >
                    <span className="hover-span relative flex items-center">
                      <Zap className="mr-2" />
                      {state !== "collapsed" && <span>Agendamento de Postagens</span>}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Calendário */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link
                    href={activeAccountId ? `/${activeAccountId}/dashboard/calendario` : "/dashboard/calendario"}
                    className={`flex items-center hover-effect-9 ${
                      state === "collapsed" ? "justify-center" : "justify-start"
                    }`}
                  >
                    <span className="hover-span relative flex items-center">
                      <Calendar className="mr-2" />
                      {state !== "collapsed" && <span>Calendários</span>}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Automação */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link
                    href={activeAccountId ? `/${activeAccountId}/dashboard/automacao` : "/dashboard/automacao"}
                    className={`flex items-center hover-effect-9 ${
                      state === "collapsed" ? "justify-center" : "justify-start"
                    }`}
                  >
                    <span className="hover-span relative flex items-center">
                      <Atom className="mr-2" />
                      {state !== "collapsed" && <span>Automação</span>}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Chat ao Vivo */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link
                    href="/chatwitia"
                    className={`flex items-center hover-effect-9 ${
                      state === "collapsed" ? "justify-center" : "justify-start"
                    }`}
                  >
                    <span className="hover-span relative flex items-center">
                      <Atom className="mr-2" />
                      {state !== "collapsed" && <span>ChatwitIA</span>}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Ajuda (Docs) */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link
                    href="/docs"
                    className={`flex items-center hover-effect-9 ${
                      state === "collapsed" ? "justify-center" : "justify-start"
                    }`}
                  >
                    <span className="hover-span relative flex items-center">
                      <HelpCircle className="mr-2" />
                      {state !== "collapsed" && <span>Ajuda (Docs)</span>}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex items-center w-full px-2 py-1 hover:bg-accent rounded ${
                  session?.user && state === "collapsed"
                    ? "justify-center"
                    : "justify-start pl-2"
                }`}
              >
                {session?.user?.image ? (
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={session.user.image} />
                    <AvatarFallback>
                      <CircleUser className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <User2 className="h-6 w-6" />
                )}
                {state !== "collapsed" && (
                  <span className="ml-2">
                    {session?.user?.name ?? "Minha Conta"}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              className="w-[--radix-popper-anchor-width]"
            >
              <LoginBadge user={session?.user} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
